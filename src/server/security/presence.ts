import "server-only";

import { ApiProblem, unavailable } from "@/server/api";
import {
  issuePresenceToken,
  PresenceTokenError,
  verifyPresenceToken,
} from "@/server/security/presence-token";

function secret(): string {
  const value = process.env.CHACHA_PRESENCE_TOKEN_SECRET?.trim();
  if (!value || value.length < 32) throw unavailable();
  return value;
}

export function createPresenceCredential(userId: string, spotId: string): { token: string; expiresAt: string } {
  return issuePresenceToken({ userId, spotId }, secret());
}

export function requirePresenceCredential(token: string, userId: string): { spotId: string; expiresAt: string } {
  try {
    return verifyPresenceToken(token, { userId }, secret());
  } catch (error) {
    if (error instanceof PresenceTokenError) {
      const code = error.reason === "expired" ? "presence_expired" : "invalid_presence_token";
      throw new ApiProblem(403, code, "现场评论凭证无效或已过期，请重新验证位置。 ");
    }
    throw error;
  }
}
