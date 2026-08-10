import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

const TOKEN_VERSION = 2;
const TOKEN_TTL_MS = 15 * 60 * 1000;

export type PresenceTokenLevel = "zone" | "found";

interface PresenceTokenPayload {
  v: typeof TOKEN_VERSION;
  sub: string;
  spotId: string;
  level: PresenceTokenLevel;
  iat: number;
  exp: number;
  nonce: string;
}

export class PresenceTokenError extends Error {
  readonly reason: "invalid" | "expired" | "binding_mismatch";

  constructor(reason: "invalid" | "expired" | "binding_mismatch") {
    super(reason);
    this.name = "PresenceTokenError";
    this.reason = reason;
  }
}

function signature(input: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(input).digest();
}

function decodePayload(encoded: string): PresenceTokenPayload {
  try {
    const value = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Partial<PresenceTokenPayload>;
    if (
      value.v !== TOKEN_VERSION ||
      typeof value.sub !== "string" ||
      typeof value.spotId !== "string" ||
      (value.level !== "zone" && value.level !== "found") ||
      typeof value.iat !== "number" ||
      typeof value.exp !== "number" ||
      typeof value.nonce !== "string"
    ) {
      throw new Error("invalid payload");
    }
    return value as PresenceTokenPayload;
  } catch {
    throw new PresenceTokenError("invalid");
  }
}

export function issuePresenceToken(
  binding: { userId: string; spotId: string; level: PresenceTokenLevel },
  secret: string,
  now = Date.now(),
  nonce = randomUUID(),
): { token: string; expiresAt: string } {
  const payload: PresenceTokenPayload = {
    v: TOKEN_VERSION,
    sub: binding.userId,
    spotId: binding.spotId,
    level: binding.level,
    iat: now,
    exp: now + TOKEN_TTL_MS,
    nonce,
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const mac = signature(encoded, secret).toString("base64url");
  return { token: `${encoded}.${mac}`, expiresAt: new Date(payload.exp).toISOString() };
}

export function verifyPresenceToken(
  token: string,
  binding: { userId: string; spotId?: string; requireFound?: boolean },
  secret: string,
  now = Date.now(),
): { spotId: string; level: PresenceTokenLevel; expiresAt: string } {
  const [encoded, suppliedMac, extra] = token.split(".");
  if (!encoded || !suppliedMac || extra) throw new PresenceTokenError("invalid");

  let supplied: Buffer;
  try {
    supplied = Buffer.from(suppliedMac, "base64url");
  } catch {
    throw new PresenceTokenError("invalid");
  }
  const expected = signature(encoded, secret);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    throw new PresenceTokenError("invalid");
  }

  const payload = decodePayload(encoded);
  if (payload.exp <= now || payload.iat > now + 30_000 || payload.exp - payload.iat !== TOKEN_TTL_MS) {
    throw new PresenceTokenError("expired");
  }
  if (payload.sub !== binding.userId || (binding.spotId && payload.spotId !== binding.spotId)) {
    throw new PresenceTokenError("binding_mismatch");
  }
  if (binding.requireFound && payload.level !== "found") throw new PresenceTokenError("binding_mismatch");
  return { spotId: payload.spotId, level: payload.level, expiresAt: new Date(payload.exp).toISOString() };
}
