import { Webhook } from "standardwebhooks";

const CHINESE_PHONE = /^\+861[3-9]\d{9}$/;
const SIX_DIGIT_OTP = /^\d{6}$/;

interface SupabaseSmsPayload {
  user?: {
    phone?: unknown;
  };
  sms?: {
    otp?: unknown;
  };
}

export interface VerifiedSmsRequest {
  phone: string;
  otp: string;
}

export class SmsHookVerificationError extends Error {
  constructor() {
    super("Invalid SMS hook request");
    this.name = "SmsHookVerificationError";
  }
}

export function normalizeHookSecret(secret: string): string {
  const normalized = secret.trim().replace(/^v1,/, "");
  if (!normalized) throw new SmsHookVerificationError();
  return normalized;
}

function parsePayload(value: unknown): VerifiedSmsRequest {
  const payload = value && typeof value === "object" ? (value as SupabaseSmsPayload) : {};
  const phone = payload.user?.phone;
  const otp = payload.sms?.otp;
  if (
    typeof phone !== "string" ||
    typeof otp !== "string" ||
    !CHINESE_PHONE.test(phone) ||
    !SIX_DIGIT_OTP.test(otp)
  ) {
    throw new SmsHookVerificationError();
  }
  return { phone, otp };
}

export function verifySupabaseSmsHook(
  rawPayload: string,
  headers: Headers,
  secret: string,
): VerifiedSmsRequest {
  try {
    const verifier = new Webhook(normalizeHookSecret(secret));
    const verified = verifier.verify(rawPayload, Object.fromEntries(headers.entries()));
    return parsePayload(verified);
  } catch {
    throw new SmsHookVerificationError();
  }
}
