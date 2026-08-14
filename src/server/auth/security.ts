import "server-only";

import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

import type { PhoneAuthFlow } from "@/contracts";
import { ApiProblem, unavailable } from "@/server/api";

const PENDING_COOKIE = "chacha_phone_pending";
const PENDING_TTL_SECONDS = 10 * 60;
const SWITCH_COOKIE = "chacha_phone_switch";
const SWITCH_TTL_SECONDS = 5 * 60;

interface PendingPhoneAuth {
  phoneDigest: string;
  flow: PhoneAuthFlow;
  userId?: string;
  conflictUserId?: string;
  expiresAt: number;
}

export interface PhoneSwitchAuthSession {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: {
    id: string;
    is_anonymous?: boolean;
  };
}

interface PhoneSwitchCandidate {
  sourceAnonymousUserId: string;
  targetSession: PhoneSwitchAuthSession;
  expiresAt: number;
}

function authSecret(): string {
  const secret = process.env.CHACHA_AUTH_HMAC_SECRET?.trim();
  if (!secret || secret.length < 32) throw unavailable();
  return secret;
}

function hmac(scope: string, value: string): string {
  return createHmac("sha256", authSecret()).update(scope).update("\0").update(value).digest("hex");
}

export function accountIdentityDigest(value: string): string {
  return hmac("account-identity", value);
}

export function recoverySecretDigest(publicId: string, normalizedCode: string): string {
  return hmac("account-recovery", `${publicId}\0${normalizedCode}`);
}

function switchEncryptionKey(): Buffer {
  return createHmac("sha256", authSecret()).update("phone-switch-cookie-key").digest();
}

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export function phoneDigest(phone: string): string {
  return hmac("phone", phone);
}

export function requestIpDigest(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
  return hmac("ip", address);
}

function encodePending(payload: PendingPhoneAuth): string {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${hmac("pending", encoded)}`;
}

function decodePending(token: string): PendingPhoneAuth {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) throw new ApiProblem(400, "phone_flow_expired", "验证码会话已过期，请重新获取。");
  const expected = Buffer.from(hmac("pending", encoded), "hex");
  const provided = Buffer.from(signature, "hex");
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    throw new ApiProblem(400, "phone_flow_expired", "验证码会话已过期，请重新获取。");
  }
  try {
    const value = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as PendingPhoneAuth;
    if (
      !/^[0-9a-f]{64}$/.test(value.phoneDigest)
      || (value.flow !== "sign_in" && value.flow !== "upgrade")
      || !Number.isFinite(value.expiresAt)
      || value.expiresAt < Date.now()
    ) {
      throw new Error("invalid pending phone auth");
    }
    return value;
  } catch {
    throw new ApiProblem(400, "phone_flow_expired", "验证码会话已过期，请重新获取。");
  }
}

export async function savePendingPhoneAuth(input: {
  phone: string;
  flow: PhoneAuthFlow;
  userId?: string;
  conflictUserId?: string;
}): Promise<void> {
  const store = await cookies();
  store.set(PENDING_COOKIE, encodePending({
    phoneDigest: phoneDigest(input.phone),
    flow: input.flow,
    userId: input.userId,
    conflictUserId: input.conflictUserId,
    expiresAt: Date.now() + PENDING_TTL_SECONDS * 1000,
  }), cookieOptions(PENDING_TTL_SECONDS));
}

export async function requirePendingPhoneAuth(phone: string): Promise<PendingPhoneAuth> {
  const token = (await cookies()).get(PENDING_COOKIE)?.value;
  if (!token) throw new ApiProblem(400, "phone_flow_expired", "验证码会话已过期，请重新获取。");
  const pending = decodePending(token);
  if (pending.phoneDigest !== phoneDigest(phone)) {
    throw new ApiProblem(400, "phone_mismatch", "手机号与获取验证码时不一致。");
  }
  return pending;
}

export async function clearPendingPhoneAuth(): Promise<void> {
  (await cookies()).delete(PENDING_COOKIE);
}

function encodeSwitchCandidate(payload: PhoneSwitchCandidate): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", switchEncryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".");
}

function decodeSwitchCandidate(token: string): PhoneSwitchCandidate {
  try {
    const [ivPart, tagPart, encryptedPart] = token.split(".");
    if (!ivPart || !tagPart || !encryptedPart) throw new Error("invalid switch token");
    const iv = Buffer.from(ivPart, "base64url");
    const tag = Buffer.from(tagPart, "base64url");
    const encrypted = Buffer.from(encryptedPart, "base64url");
    if (iv.length !== 12 || tag.length !== 16 || encrypted.length === 0) throw new Error("invalid switch token");
    const decipher = createDecipheriv("aes-256-gcm", switchEncryptionKey(), iv);
    decipher.setAuthTag(tag);
    const value = JSON.parse(Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString("utf8")) as PhoneSwitchCandidate;
    if (
      !value.sourceAnonymousUserId
      || !value.targetSession?.access_token
      || !value.targetSession.refresh_token
      || !value.targetSession.user?.id
      || value.targetSession.user.is_anonymous === true
      || !Number.isFinite(value.targetSession.expires_in)
      || value.targetSession.expires_in <= 0
      || !Number.isFinite(value.expiresAt)
      || value.expiresAt < Date.now()
    ) {
      throw new Error("invalid switch candidate");
    }
    return value;
  } catch {
    throw new ApiProblem(400, "phone_switch_expired", "账号切换确认已过期，请重新获取验证码。");
  }
}

export async function savePhoneSwitchCandidate(input: {
  sourceAnonymousUserId: string;
  targetSession: PhoneSwitchAuthSession;
}): Promise<void> {
  (await cookies()).set(SWITCH_COOKIE, encodeSwitchCandidate({
    sourceAnonymousUserId: input.sourceAnonymousUserId,
    targetSession: input.targetSession,
    expiresAt: Date.now() + SWITCH_TTL_SECONDS * 1000,
  }), cookieOptions(SWITCH_TTL_SECONDS));
}

export async function requirePhoneSwitchCandidate(): Promise<PhoneSwitchCandidate> {
  const token = (await cookies()).get(SWITCH_COOKIE)?.value;
  if (!token) throw new ApiProblem(400, "phone_switch_expired", "账号切换确认已过期，请重新获取验证码。");
  return decodeSwitchCandidate(token);
}

export async function clearPhoneSwitchCandidate(): Promise<void> {
  (await cookies()).delete(SWITCH_COOKIE);
}
