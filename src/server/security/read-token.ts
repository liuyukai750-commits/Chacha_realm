import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { ApiProblem, unavailable } from "@/server/api";

interface ReadTokenPayload {
  userId: string;
  melonId: string;
  issuedAt: number;
  completableAt: number;
  expiresAt: number;
}

function tokenSecret(): string {
  const secret = process.env.CHACHA_READ_TOKEN_SECRET?.trim();
  if (!secret || secret.length < 32) throw unavailable();
  return secret;
}

function signature(encodedPayload: string): string {
  return createHmac("sha256", tokenSecret()).update(encodedPayload).digest("base64url");
}

export function issueReadToken(userId: string, melonId: string, now = Date.now()): { token: string; completableAt: string } {
  const payload: ReadTokenPayload = {
    userId,
    melonId,
    issuedAt: now,
    completableAt: now + 5_000,
    expiresAt: now + 10 * 60 * 1000,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return { token: `${encodedPayload}.${signature(encodedPayload)}`, completableAt: new Date(payload.completableAt).toISOString() };
}

export function verifyReadToken(token: string, userId: string, melonId: string, now = Date.now()): ReadTokenPayload {
  const [encodedPayload, providedSignature, extra] = token.split(".");
  if (!encodedPayload || !providedSignature || extra) {
    throw new ApiProblem(400, "invalid_read_token", "阅读凭证无效。 ");
  }
  const expected = Buffer.from(signature(encodedPayload));
  const provided = Buffer.from(providedSignature);
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    throw new ApiProblem(400, "invalid_read_token", "阅读凭证无效。 ");
  }
  let payload: ReadTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as ReadTokenPayload;
  } catch {
    throw new ApiProblem(400, "invalid_read_token", "阅读凭证无效。 ");
  }
  if (payload.userId !== userId || payload.melonId !== melonId || payload.expiresAt < now) {
    throw new ApiProblem(400, "invalid_read_token", "阅读凭证无效或已过期。 ");
  }
  if (payload.completableAt > now) {
    throw new ApiProblem(409, "read_too_short", "请至少阅读 5 秒后再完成吃瓜。 ");
  }
  return payload;
}
