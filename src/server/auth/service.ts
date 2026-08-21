import "server-only";

import type {
  AnonymousSession,
  AnimalIdentity,
  PhoneAuthFlow,
  PhoneOtpRequestResult,
  PhoneOtpVerifyResult,
} from "@/contracts";
import { ApiProblem, unavailable } from "@/server/api";
import { getBackendProvider } from "@/server/backend/provider";
import {
  clearPendingPhoneAuth,
  clearPhoneSwitchCandidate,
  phoneDigest,
  requestIpDigest,
  requirePendingPhoneAuth,
  requirePhoneSwitchCandidate,
  savePendingPhoneAuth,
  savePhoneSwitchCandidate,
} from "@/server/auth/security";
import { getSupabaseAdminConfig, getSupabaseConfig } from "@/server/supabase/config";
import { postgresLocalPasswordRepository } from "@/server/postgres/local-password-repository";
import { actorRpc, serviceRpc } from "@/server/supabase/http";
import {
  type AuthSessionResponse,
  clearAuthSession,
  getOptionalSession,
  publicSessionFor,
  revokeCurrentLocalSession,
  requireSession,
  saveAuthSession,
} from "@/server/supabase/session";

interface AuthErrorBody {
  code?: string;
  error_code?: string;
  message?: string;
  msg?: string;
}

const CAPTCHA_REQUIRED = process.env.CHACHA_CAPTCHA_REQUIRED?.trim().toLowerCase() === "true";

function requirePhoneAuthProvider(): void {
  if (getBackendProvider() === "postgres") {
    throw new ApiProblem(
      409,
      "phone_auth_unavailable",
      "手机号登录迁移期间暂不可用，请使用猹号和密码登录。",
    );
  }
}

interface VerifyResponse extends Partial<AuthSessionResponse> {
  user?: AuthSessionResponse["user"];
}

async function readBody(response: Response): Promise<unknown> {
  const value = await response.text();
  if (!value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function authProblem(status: number, body: unknown): ApiProblem {
  const error = (body && typeof body === "object" ? body : {}) as AuthErrorBody;
  const signal = `${error.code ?? ""} ${error.error_code ?? ""} ${error.message ?? ""} ${error.msg ?? ""}`;
  if (/already.*registered|phone.*exists|user_already_exists/i.test(signal)) {
    return new ApiProblem(409, "phone_already_registered", "该手机号已有瓜田，请使用验证码进入原账号。");
  }
  if (/captcha/i.test(signal)) return new ApiProblem(400, "captcha_required", "请先完成人机验证。");
  if (/otp|token.*expired|token.*invalid/i.test(signal)) {
    return new ApiProblem(400, "invalid_otp", "验证码错误或已过期，请重新输入。");
  }
  if (status === 429 || /rate/i.test(signal)) {
    return new ApiProblem(429, "rate_limited", "操作太频繁，请稍后再试。");
  }
  if (status === 401 || status === 403) return new ApiProblem(401, "unauthorized", "登录状态无效或已过期。");
  return unavailable();
}

async function authFetch<T>(path: string, init: RequestInit, accessToken?: string): Promise<T> {
  const config = getSupabaseConfig();
  if (!config) throw unavailable();
  let response: Response;
  try {
    response = await fetch(`${config.url}${path}`, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
      headers: {
        apikey: config.publishableKey,
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
    });
  } catch {
    throw unavailable();
  }
  const body = await readBody(response);
  if (!response.ok) {
    console.warn("[auth] Supabase request rejected", {
      scope: path,
      status: response.status,
      code: (body as AuthErrorBody | null)?.code ?? (body as AuthErrorBody | null)?.error_code ?? "unknown",
    });
    throw authProblem(response.status, body);
  }
  return body as T;
}

async function reserveAttempt(request: Request, phone: string, action: "request" | "verify"): Promise<void> {
  await serviceRpc("reserve_phone_auth_attempt", {
    p_phone_digest: phoneDigest(phone),
    p_ip_digest: requestIpDigest(request),
    p_action: action,
  });
}

async function sendSignInOtp(phone: string, captchaToken?: string): Promise<void> {
  await authFetch("/auth/v1/otp", {
    method: "POST",
    body: JSON.stringify({
      phone,
      create_user: true,
      ...(captchaToken ? { gotrue_meta_security: { captcha_token: captchaToken } } : {}),
    }),
  });
}

async function sendUpgradeOtp(phone: string, accessToken: string): Promise<void> {
  await authFetch("/auth/v1/user", {
    method: "PUT",
    body: JSON.stringify({ phone }),
  }, accessToken);
}

export async function requestPhoneOtp(
  request: Request,
  phone: string,
  captchaToken?: string,
): Promise<PhoneOtpRequestResult> {
  requirePhoneAuthProvider();
  if (CAPTCHA_REQUIRED && !captchaToken) {
    throw new ApiProblem(400, "captcha_required", "请先完成人机验证。");
  }
  const session = await getOptionalSession();
  if (session && !session.isAnonymous) {
    throw new ApiProblem(409, "already_authenticated", "当前账号已经登录。");
  }
  await clearPhoneSwitchCandidate();
  await reserveAttempt(request, phone, "request");

  const publicFlow: PhoneAuthFlow = session?.isAnonymous ? "upgrade" : "sign_in";
  let flow = publicFlow;
  let accountConflict = false;
  if (flow === "upgrade" && session) {
    try {
      await sendUpgradeOtp(phone, session.accessToken);
    } catch (error) {
      if (!(error instanceof ApiProblem) || error.code !== "phone_already_registered") throw error;
      // Keep the anonymous cookies untouched until the existing account's OTP
      // is successfully verified. No data is merged or overwritten.
      await sendSignInOtp(phone, captchaToken);
      flow = "sign_in";
      accountConflict = true;
    }
  } else {
    await sendSignInOtp(phone, captchaToken);
  }

  await savePendingPhoneAuth({
    phone,
    flow,
    ...(flow === "upgrade" && session ? { userId: session.userId } : {}),
    ...(accountConflict && session ? { conflictUserId: session.userId } : {}),
  });
  // Do not reveal whether a phone is already registered before OTP proof.
  // The actual conflict flow remains in the signed HttpOnly pending cookie.
  return { sent: true, retryAfterSeconds: 60, flow: publicFlow };
}

function isFullSession(value: VerifyResponse): value is AuthSessionResponse {
  return Boolean(value.access_token && value.refresh_token && value.expires_in && value.user?.id);
}

export async function verifyPhoneOtp(
  request: Request,
  phone: string,
  code: string,
): Promise<PhoneOtpVerifyResult> {
  requirePhoneAuthProvider();
  const pending = await requirePendingPhoneAuth(phone);
  await reserveAttempt(request, phone, "verify");
  let verified: VerifyResponse;

  if (pending.flow === "upgrade") {
    const existing = await requireSession();
    if (!existing.isAnonymous || existing.userId !== pending.userId) {
      throw new ApiProblem(409, "phone_flow_changed", "当前瓜田已发生变化，请重新获取验证码。");
    }
    verified = await authFetch<VerifyResponse>("/auth/v1/verify", {
      method: "POST",
      body: JSON.stringify({ phone, token: code, type: "phone_change" }),
    }, existing.accessToken);
    if (verified.user?.id !== existing.userId) throw unavailable();
    if (isFullSession(verified)) await saveAuthSession(verified);
  } else {
    verified = await authFetch<AuthSessionResponse>("/auth/v1/verify", {
      method: "POST",
      body: JSON.stringify({ phone, token: code, type: "sms" }),
    });
    if (!isFullSession(verified)) throw unavailable();
    if (pending.conflictUserId) {
      const current = await requireSession();
      if (!current.isAnonymous || current.userId !== pending.conflictUserId) {
        throw new ApiProblem(409, "phone_flow_changed", "当前瓜田已发生变化，请重新获取验证码。");
      }
      if (verified.user.id === current.userId || verified.user.is_anonymous === true) throw unavailable();
      const targetSession = {
        userId: verified.user.id,
        accessToken: verified.access_token,
        isAnonymous: false,
      };
      const [currentPublicSession, targetPublicSession] = await Promise.all([
        publicSessionFor(current),
        publicSessionFor(targetSession),
      ]);
      await savePhoneSwitchCandidate({
        sourceAnonymousUserId: current.userId,
        targetSession: verified,
      });
      await clearPendingPhoneAuth();
      return {
        session: currentPublicSession,
        needsProfile: false,
        requiresAccountSwitchConfirmation: true,
        switchProfile: {
          animal: targetPublicSession.animal,
          ...(targetPublicSession.displayName ? { displayName: targetPublicSession.displayName } : {}),
          ...(targetPublicSession.publicId ? { publicId: targetPublicSession.publicId } : {}),
        },
      };
    }
    await saveAuthSession(verified);
  }

  await clearPendingPhoneAuth();
  const session = await requireSession();
  const publicSession = await publicSessionFor(session);
  return { session: publicSession, needsProfile: !publicSession.onboardingComplete };
}

export async function confirmPhoneAccountSwitch(confirm: boolean): Promise<{
  switched: boolean;
  session: AnonymousSession;
  needsProfile: boolean;
}> {
  requirePhoneAuthProvider();
  const current = await requireSession();
  if (!confirm) {
    await clearPhoneSwitchCandidate();
    const publicSession = await publicSessionFor(current);
    return { switched: false, session: publicSession, needsProfile: !publicSession.onboardingComplete };
  }

  let candidate;
  try {
    candidate = await requirePhoneSwitchCandidate();
  } catch (error) {
    await clearPhoneSwitchCandidate();
    throw error;
  }
  if (!current.isAnonymous || current.userId !== candidate.sourceAnonymousUserId) {
    await clearPhoneSwitchCandidate();
    throw new ApiProblem(409, "phone_flow_changed", "当前瓜田已发生变化，请重新获取验证码。");
  }
  const target = {
    userId: candidate.targetSession.user.id,
    accessToken: candidate.targetSession.access_token,
    isAnonymous: false,
  };
  const publicSession = await publicSessionFor(target);
  await saveAuthSession(candidate.targetSession);
  await clearPhoneSwitchCandidate();
  return { switched: true, session: publicSession, needsProfile: !publicSession.onboardingComplete };
}

export async function completeProfile(displayName: string, animal: AnimalIdentity): Promise<AnonymousSession> {
  const session = await requireSession();
  if (session.isAnonymous) {
    throw new ApiProblem(409, "phone_required", "请先绑定手机号，再创建公开身份。");
  }
  await actorRpc<AnonymousSession>("complete_profile_for_actor", session.userId, {
    p_display_name: displayName,
    p_animal: animal,
  });
  return publicSessionFor(session);
}

export async function logout(): Promise<void> {
  if (getBackendProvider() === "postgres") {
    try {
      await revokeCurrentLocalSession("logout");
    } finally {
      await Promise.all([clearAuthSession(), clearPendingPhoneAuth(), clearPhoneSwitchCandidate()]);
    }
    return;
  }
  const session = await getOptionalSession();
  if (session) {
    try {
      await authFetch("/auth/v1/logout", { method: "POST" }, session.accessToken);
    } catch {
      // Local logout must remain available during an Auth outage. Removing the
      // HttpOnly refresh cookie prevents this browser from resuming the token.
    }
  }
  await Promise.all([clearAuthSession(), clearPendingPhoneAuth(), clearPhoneSwitchCandidate()]);
}

export async function deleteCurrentAccount(): Promise<void> {
  const session = await requireSession();
  if (getBackendProvider() === "postgres") {
    await postgresLocalPasswordRepository.deleteAccount(session.userId);
    await Promise.all([clearAuthSession(), clearPendingPhoneAuth(), clearPhoneSwitchCandidate()]);
    return;
  }
  const config = getSupabaseAdminConfig();
  if (!config) throw unavailable();
  let response: Response;
  try {
    response = await fetch(`${config.url}/auth/v1/admin/users/${session.userId}`, {
      method: "DELETE",
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
      headers: {
        apikey: config.secretKey,
        ...(config.secretKeySource === "legacy_service_role"
          ? { Authorization: `Bearer ${config.secretKey}` }
          : {}),
      },
    });
  } catch {
    throw unavailable();
  }
  const body = await readBody(response);
  if (!response.ok) {
    console.warn("[auth] account deletion rejected", {
      status: response.status,
      code: (body as AuthErrorBody | null)?.code ?? (body as AuthErrorBody | null)?.error_code ?? "unknown",
    });
    throw authProblem(response.status, body);
  }
  await Promise.all([clearAuthSession(), clearPendingPhoneAuth(), clearPhoneSwitchCandidate()]);
}
