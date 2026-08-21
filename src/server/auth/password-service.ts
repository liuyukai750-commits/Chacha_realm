import "server-only";

import { randomBytes, randomUUID } from "node:crypto";

import type {
  AnimalIdentity,
  AnonymousSession,
  PasswordAccountProvisionResult,
} from "@/contracts";
import { ApiProblem, unavailable } from "@/server/api";
import { getBackendProvider } from "@/server/backend/provider";
import { localPasswordService } from "@/server/auth/local-password-service";
import {
  accountIdentityDigest,
  recoverySecretDigest,
  requestIpDigest,
} from "@/server/auth/security";
import { passwordAuthRepository } from "@/server/auth/password-repository";
import { getSupabaseAdminConfig, getSupabaseConfig } from "@/server/supabase/config";
import { actorRpc } from "@/server/supabase/http";
import {
  type AuthSessionResponse,
  getOptionalSession,
  publicSessionFor,
  requireActiveSession,
  saveAuthSession,
} from "@/server/supabase/session";

type AuthAction = "register" | "login" | "recover";

interface AdminUserResult {
  id?: string;
  user?: { id?: string };
}

interface AuthErrorBody {
  code?: string;
  error_code?: string;
  message?: string;
  msg?: string;
}

const RECOVERY_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const CAPTCHA_REQUIRED = process.env.CHACHA_CAPTCHA_REQUIRED?.trim().toLowerCase() === "true";

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text) as unknown; } catch { return null; }
}

function authError(status: number, body: unknown): ApiProblem {
  const error = (body && typeof body === "object" ? body : {}) as AuthErrorBody;
  const signal = `${error.code ?? ""} ${error.error_code ?? ""} ${error.message ?? ""} ${error.msg ?? ""}`;
  if (status === 429 || /rate/i.test(signal)) return new ApiProblem(429, "rate_limited", "操作太频繁，请稍后再试。" );
  if (status === 400 || status === 401 || /invalid.*credential|email.*password/i.test(signal)) {
    return new ApiProblem(401, "invalid_credentials", "猹号或密码不正确。" );
  }
  return unavailable();
}

async function authFetch<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const config = getSupabaseConfig();
  if (!config) throw unavailable();
  let response: Response;
  try {
    response = await fetch(`${config.url}${path}`, {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
      headers: { apikey: config.publishableKey, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch { throw unavailable(); }
  const payload = await readBody(response);
  if (!response.ok) throw authError(response.status, payload);
  return payload as T;
}

async function adminFetch<T>(path: string, method: "POST" | "PUT" | "DELETE", body?: Record<string, unknown>): Promise<T> {
  const config = getSupabaseAdminConfig();
  if (!config) throw unavailable();
  let response: Response;
  try {
    response = await fetch(`${config.url}${path}`, {
      method,
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
      headers: {
        apikey: config.secretKey,
        ...(config.secretKeySource === "legacy_service_role" ? { Authorization: `Bearer ${config.secretKey}` } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch { throw unavailable(); }
  const payload = await readBody(response);
  if (!response.ok) throw authError(response.status, payload);
  return payload as T;
}

function generateInternalEmail(): string {
  return `${randomUUID()}@accounts.chachajie.invalid`;
}

function generateRecoveryCode(): { display: string; normalized: string } {
  const bytes = randomBytes(16);
  let normalized = "";
  for (let index = 0; index < bytes.length; index += 1) {
    normalized += RECOVERY_ALPHABET[bytes[index] % RECOVERY_ALPHABET.length];
  }
  return {
    normalized,
    display: normalized.match(/.{1,4}/g)?.join("-") ?? normalized,
  };
}

async function verifyCaptcha(token: string | undefined, request: Request): Promise<void> {
  if (!CAPTCHA_REQUIRED) return;
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret || !token) throw new ApiProblem(400, "captcha_required", "请先完成安全验证。" );
  const form = new URLSearchParams({ secret, response: token });
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) form.set("remoteip", forwarded);
  let response: Response;
  try {
    response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
      body: form,
    });
  } catch { throw unavailable(); }
  const result = await readBody(response) as { success?: boolean } | null;
  if (!response.ok || result?.success !== true) {
    throw new ApiProblem(400, "captcha_invalid", "安全验证已失效，请重试。" );
  }
}

async function reserveAttempt(request: Request, identity: string, action: AuthAction): Promise<void> {
  await passwordAuthRepository.reserveAttempt({
    identityDigest: accountIdentityDigest(identity),
    ipDigest: requestIpDigest(request),
    action,
  });
}

async function signIn(loginEmail: string, password: string): Promise<AuthSessionResponse> {
  const session = await authFetch<AuthSessionResponse>("/auth/v1/token?grant_type=password", {
    email: loginEmail,
    password,
  });
  if (!session.user?.id || session.user.is_anonymous === true) throw unavailable();
  return session;
}

async function updatePasswordIdentity(userId: string, loginEmail: string, password: string): Promise<void> {
  await adminFetch(`/auth/v1/admin/users/${userId}`, "PUT", {
    email: loginEmail,
    password,
    email_confirm: true,
    app_metadata: { chacha_auth_kind: "password" },
  });
}

async function createPasswordUser(password: string): Promise<{ userId: string; loginEmail: string }> {
  const temporaryEmail = generateInternalEmail();
  const created = await adminFetch<AdminUserResult>("/auth/v1/admin/users", "POST", {
    email: temporaryEmail,
    password,
    email_confirm: true,
    app_metadata: { chacha_auth_kind: "password" },
  });
  const userId = created.id ?? created.user?.id;
  if (!userId) throw unavailable();
  return { userId, loginEmail: temporaryEmail };
}

async function deleteUserQuietly(userId: string): Promise<void> {
  try { await adminFetch(`/auth/v1/admin/users/${userId}`, "DELETE"); } catch { /* cleanup is best effort */ }
}

async function setRecovery(userId: string, publicId: string, normalizedCode: string): Promise<void> {
  await set_account_recovery_secret(
    userId,
    recoverySecretDigest(publicId, normalizedCode),
  );
}

// Keep the persistent operation named after the current database RPC while the
// repository adapter is introduced; callers do not depend on Supabase itself.
async function set_account_recovery_secret(userId: string, secretDigest: string): Promise<void> {
  await passwordAuthRepository.saveRecoverySecret(userId, secretDigest);
}

export async function registerPasswordAccount(input: {
  request: Request;
  password: string;
  animal: AnimalIdentity;
  displayName: string;
  captchaToken?: string;
}): Promise<PasswordAccountProvisionResult> {
  await verifyCaptcha(input.captchaToken, input.request);
  const existing = await getOptionalSession();
  if (existing && !existing.isAnonymous) {
    throw new ApiProblem(409, "already_authenticated", "当前猹号已经登录。" );
  }
  await reserveAttempt(input.request, existing?.userId ?? "new-account", "register");

  if (getBackendProvider() === "postgres") {
    const recovery = generateRecoveryCode();
    const session = await localPasswordService.register({
      password: input.password,
      animal: input.animal,
      displayName: input.displayName,
      recoveryCode: recovery.normalized,
    });
    return {
      session,
      recoveryCode: recovery.display,
      existingDataPreserved: false,
    };
  }

  let userId = existing?.userId;
  let loginEmail: string | undefined;
  let createdUser = false;
  if (!userId) {
    const created = await createPasswordUser(input.password);
    userId = created.userId;
    loginEmail = created.loginEmail;
    createdUser = true;
  }
  try {
    const target = await passwordAuthRepository.findTargetByUserId(userId);
    if (!target) throw unavailable();
    if (target.accountStatus !== "active") throw new ApiProblem(403, "account_banned", "该账号已被暂停使用。" );
    loginEmail = loginEmail ?? target.loginEmail ?? generateInternalEmail();
    await updatePasswordIdentity(userId, loginEmail, input.password);
    await passwordAuthRepository.saveLoginCredential(userId, loginEmail);
    const session = await signIn(loginEmail, input.password);
    await actorRpc("complete_profile_for_actor", userId, {
      p_display_name: input.displayName,
      p_animal: input.animal,
    });
    const recovery = generateRecoveryCode();
    await setRecovery(userId, target.publicId, recovery.normalized);
    await saveAuthSession(session);
    const publicSession = await publicSessionFor({ userId, accessToken: session.access_token, isAnonymous: false });
    return {
      session: publicSession,
      recoveryCode: recovery.display,
      existingDataPreserved: Boolean(existing),
    };
  } catch (error) {
    if (createdUser) await deleteUserQuietly(userId);
    throw error;
  }
}

export async function loginPasswordAccount(input: {
  request: Request;
  publicId: string;
  password: string;
  captchaToken?: string;
}): Promise<{ session: AnonymousSession }> {
  await verifyCaptcha(input.captchaToken, input.request);
  await reserveAttempt(input.request, input.publicId, "login");
  if (getBackendProvider() === "postgres") {
    return {
      session: await localPasswordService.login(input.publicId, input.password),
    };
  }
  const target = await passwordAuthRepository.findTargetByPublicId(input.publicId);
  if (!target) throw new ApiProblem(401, "invalid_credentials", "猹号或密码不正确。" );
  if (target.accountStatus !== "active") throw new ApiProblem(403, "account_banned", "该账号已被暂停使用。" );
  if (!target.loginEmail) throw new ApiProblem(401, "invalid_credentials", "猹号或密码不正确。" );
  const session = await signIn(target.loginEmail, input.password);
  await saveAuthSession(session);
  return { session: await publicSessionFor({ userId: target.userId, accessToken: session.access_token, isAnonymous: false }) };
}

export async function recoverPasswordAccount(input: {
  request: Request;
  publicId: string;
  recoveryCode: string;
  newPassword: string;
  captchaToken?: string;
}): Promise<PasswordAccountProvisionResult> {
  await verifyCaptcha(input.captchaToken, input.request);
  await reserveAttempt(input.request, input.publicId, "recover");
  const nextRecovery = generateRecoveryCode();
  if (getBackendProvider() === "postgres") {
    return {
      session: await localPasswordService.recover({
        publicId: input.publicId,
        currentRecoveryDigest: recoverySecretDigest(input.publicId, input.recoveryCode),
        nextRecoveryDigest: recoverySecretDigest(input.publicId, nextRecovery.normalized),
        newPassword: input.newPassword,
      }),
      recoveryCode: nextRecovery.display,
      existingDataPreserved: true,
    };
  }
  const rotated = await passwordAuthRepository.rotateRecoverySecret({
    p_public_id: input.publicId,
    p_current_digest: recoverySecretDigest(input.publicId, input.recoveryCode),
    p_new_digest: recoverySecretDigest(input.publicId, nextRecovery.normalized),
  });
  if (!rotated?.userId || !rotated.loginEmail) {
    throw new ApiProblem(401, "invalid_recovery_code", "猹号或恢复码不正确。" );
  }
  try {
    await updatePasswordIdentity(rotated.userId, rotated.loginEmail, input.newPassword);
    const session = await signIn(rotated.loginEmail, input.newPassword);
    await saveAuthSession(session);
    return {
      session: await publicSessionFor({ userId: rotated.userId, accessToken: session.access_token, isAnonymous: false }),
      recoveryCode: nextRecovery.display,
      existingDataPreserved: true,
    };
  } catch (error) {
    await set_account_recovery_secret(
      rotated.userId,
      recoverySecretDigest(input.publicId, input.recoveryCode),
    );
    throw error;
  }
}

/**
 * Converts an already authenticated legacy permanent account in place. The
 * Supabase user id remains unchanged, so every existing melon, field plant,
 * seed and interaction continues to belong to the same profile.
 */
export async function upgradeLegacyAccountToPassword(input: {
  request: Request;
  password: string;
  captchaToken?: string;
}): Promise<PasswordAccountProvisionResult> {
  await verifyCaptcha(input.captchaToken, input.request);
  const existing = await requireActiveSession();
  const target = await passwordAuthRepository.findTargetByUserId(existing.userId);
  if (!target || target.userId !== existing.userId) throw unavailable();
  if (target.accountStatus !== "active") {
    throw new ApiProblem(403, "account_banned", "该账号已被暂停使用。" );
  }
  if (target.loginEmail) {
    throw new ApiProblem(409, "password_already_set", "这个猹号已经设置过密码，请直接登录。" );
  }

  await reserveAttempt(input.request, existing.userId, "register");
  const loginEmail = generateInternalEmail();
  const recovery = generateRecoveryCode();

  if (getBackendProvider() === "postgres") {
    return {
      session: {
        ...await localPasswordService.upgrade({
          userId: existing.userId,
          publicId: target.publicId,
          password: input.password,
          recoveryCode: recovery.normalized,
        }),
        authKind: "password",
      },
      recoveryCode: recovery.display,
      existingDataPreserved: true,
    };
  }

  // `account_login_credentials` is the completion marker consumed by
  // get_current_profile(). Keep it as the final durable write so every failure
  // before that point remains retryable as a legacy account. No awaited work
  // may be added after the marker: once it exists, the recovery code must be
  // ready to return to the user in this response.
  await updatePasswordIdentity(existing.userId, loginEmail, input.password);
  const passwordSession = await signIn(loginEmail, input.password);
  await passwordAuthRepository.saveRecoverySecret(
    existing.userId,
    recoverySecretDigest(target.publicId, recovery.normalized),
  );
  await saveAuthSession(passwordSession);
  const session = await publicSessionFor({
    userId: existing.userId,
    accessToken: passwordSession.access_token,
    isAnonymous: false,
  });
  await passwordAuthRepository.saveLoginCredential(existing.userId, loginEmail);
  return {
    session: { ...session, authKind: "password" },
    recoveryCode: recovery.display,
    existingDataPreserved: true,
  };
}
