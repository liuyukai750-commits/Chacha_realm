import "server-only";

import { createHash, randomBytes, randomUUID } from "node:crypto";

import type {
  AuthSessionProvider,
  ResolvedSession,
  ServerSession,
  SessionCredentials,
  SessionProfile,
  StoredSessionTokens,
} from "@/server/supabase/session";
import { unavailable } from "@/server/api";

const IDLE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
const ABSOLUTE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const ROTATE_AFTER_SECONDS = 24 * 60 * 60;
const ROTATION_REUSE_GRACE_SECONDS = 30;
const OPAQUE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export interface ConsumedLocalSession {
  profileId: string;
  accountStatus: "active" | "banned";
  rotated: boolean;
}

export interface LocalSessionRepository {
  consume(input: {
    tokenDigest: string;
    nextTokenDigest: string;
    allowRotation: boolean;
    now: Date;
    nextIdleExpiresAt: Date;
    rotateBefore: Date;
    rotationGraceAfter: Date;
  }): Promise<ConsumedLocalSession | null>;
  issue(input: {
    profileId: string;
    familyId: string;
    tokenDigest: string;
    now: Date;
    idleExpiresAt: Date;
    absoluteExpiresAt: Date;
  }): Promise<void>;
  revoke(tokenDigest: string, reason: "logout" | "password_change" | "recovery"): Promise<void>;
  profileFor(profileId: string): Promise<SessionProfile | null>;
}

function opaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

export function digestOpaqueToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function after(now: Date, seconds: number): Date {
  return new Date(now.getTime() + seconds * 1_000);
}

function credentials(token: string): SessionCredentials {
  return {
    accessToken: token,
    accessMaxAgeSeconds: ABSOLUTE_MAX_AGE_SECONDS,
  };
}

export async function issueLocalSession(
  repository: LocalSessionRepository,
  profileId: string,
  now = new Date(),
): Promise<{ session: ServerSession; credentials: SessionCredentials }> {
  const token = opaqueToken();
  await repository.issue({
    profileId,
    familyId: randomUUID(),
    tokenDigest: digestOpaqueToken(token),
    now,
    idleExpiresAt: after(now, IDLE_MAX_AGE_SECONDS),
    absoluteExpiresAt: after(now, ABSOLUTE_MAX_AGE_SECONDS),
  });
  return {
    session: { userId: profileId, accessToken: token, isAnonymous: false },
    credentials: credentials(token),
  };
}

export function createLocalAuthSessionProvider(
  repository: LocalSessionRepository,
  now: () => Date = () => new Date(),
): AuthSessionProvider {
  return {
    async current(tokens: StoredSessionTokens, allowRefresh: boolean): Promise<ResolvedSession | null> {
      const token = tokens.accessToken;
      if (!token || !OPAQUE_TOKEN_PATTERN.test(token)) return null;
      const currentTime = now();
      const nextToken = opaqueToken();
      const consumed = await repository.consume({
        tokenDigest: digestOpaqueToken(token),
        nextTokenDigest: digestOpaqueToken(nextToken),
        allowRotation: allowRefresh,
        now: currentTime,
        nextIdleExpiresAt: after(currentTime, IDLE_MAX_AGE_SECONDS),
        rotateBefore: after(currentTime, -ROTATE_AFTER_SECONDS),
        rotationGraceAfter: after(currentTime, -ROTATION_REUSE_GRACE_SECONDS),
      });
      if (!consumed) return null;
      const activeToken = consumed.rotated ? nextToken : token;
      return {
        session: {
          userId: consumed.profileId,
          accessToken: activeToken,
          isAnonymous: false,
        },
        ...(consumed.rotated ? { refreshed: credentials(activeToken) } : {}),
      };
    },
    async profileFor(session) {
      const profile = await repository.profileFor(session.userId);
      if (!profile) throw unavailable();
      return profile;
    },
  };
}
