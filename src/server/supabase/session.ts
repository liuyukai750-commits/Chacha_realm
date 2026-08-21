import "server-only";

import { cookies } from "next/headers";

import type { AnonymousSession } from "@/contracts";
import { ApiProblem, unavailable } from "@/server/api";
import { getBackendProvider } from "@/server/backend/provider";
import {
  createLocalAuthSessionProvider,
  digestOpaqueToken,
  issueLocalSession,
} from "@/server/auth/local-session";
import { postgresLocalSessionRepository } from "@/server/postgres/local-session-repository";
import { actorRpc, supabaseFetch } from "@/server/supabase/http";

const ACCESS_COOKIE = "chacha_at";
const REFRESH_COOKIE = "chacha_rt";
const REFRESH_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

interface AuthUser {
  id: string;
  is_anonymous?: boolean;
  phone?: string;
}

export interface AuthSessionResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: AuthUser;
}

export interface SessionProfile {
  alias: string;
  animal: string;
  authKind?: "anonymous" | "password" | "phone";
  displayName?: string | null;
  publicId?: string;
  identityBadge?: AnonymousSession["identityBadge"];
  maskedPhone?: string | null;
  onboardingComplete?: boolean;
  wallet: AnonymousSession["wallet"];
  experience: AnonymousSession["experience"];
  accountStatus?: "active" | "banned";
}

export interface ServerSession {
  userId: string;
  accessToken: string;
  isAnonymous: boolean;
}

export interface AnonymousSessionBundle {
  serverSession: ServerSession;
  publicSession: AnonymousSession;
}

export interface StoredSessionTokens {
  accessToken?: string;
  refreshToken?: string;
}

export interface SessionCredentials {
  accessToken: string;
  refreshToken?: string;
  accessMaxAgeSeconds: number;
  refreshMaxAgeSeconds?: number;
}

/** Browser persistence boundary for current or future opaque session tokens. */
export interface SessionStore {
  read(): Promise<StoredSessionTokens>;
  save(credentials: SessionCredentials): Promise<void>;
  clear(): Promise<void>;
}

export interface ResolvedSession {
  session: ServerSession;
  refreshed?: SessionCredentials;
}

/** Provider boundary for token validation, rotation and profile lookup. */
export interface AuthSessionProvider {
  current(tokens: StoredSessionTokens, allowRefresh: boolean): Promise<ResolvedSession | null>;
  profileFor(session: ServerSession): Promise<SessionProfile>;
}

/** Application-facing session semantics used by all existing routes. */
export interface SessionService {
  save(credentials: SessionCredentials): Promise<void>;
  clear(): Promise<void>;
  current(allowRefresh: boolean): Promise<ServerSession | null>;
  publicSessionFor(session: ServerSession): Promise<AnonymousSession>;
  require(): Promise<ServerSession>;
  requireActive(): Promise<ServerSession>;
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

export const cookieSessionStore: SessionStore = {
  async read() {
    const store = await cookies();
    return {
      accessToken: store.get(ACCESS_COOKIE)?.value,
      refreshToken: store.get(REFRESH_COOKIE)?.value,
    };
  },
  async save(credentials) {
    const store = await cookies();
    store.set(
      ACCESS_COOKIE,
      credentials.accessToken,
      cookieOptions(Math.max(60, credentials.accessMaxAgeSeconds)),
    );
    if (credentials.refreshToken) {
      store.set(
        REFRESH_COOKIE,
        credentials.refreshToken,
        cookieOptions(credentials.refreshMaxAgeSeconds ?? REFRESH_MAX_AGE_SECONDS),
      );
    } else {
      store.delete(REFRESH_COOKIE);
    }
  },
  async clear() {
    const store = await cookies();
    store.delete(ACCESS_COOKIE);
    store.delete(REFRESH_COOKIE);
  },
};

async function validateAccessToken(accessToken: string): Promise<AuthUser> {
  return supabaseFetch<AuthUser>("/auth/v1/user", { method: "GET" }, accessToken);
}

async function refreshSession(refreshToken: string): Promise<AuthSessionResponse> {
  return supabaseFetch<AuthSessionResponse>(
    "/auth/v1/token?grant_type=refresh_token",
    { method: "POST", body: JSON.stringify({ refresh_token: refreshToken }) },
  );
}

function serverSessionFor(user: AuthUser, accessToken: string): ServerSession {
  if (!user.id) throw new ApiProblem(401, "unauthorized", "登录状态无效。");
  return { userId: user.id, accessToken, isAnonymous: user.is_anonymous === true };
}

function credentialsFor(session: AuthSessionResponse): SessionCredentials {
  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    accessMaxAgeSeconds: session.expires_in,
    refreshMaxAgeSeconds: REFRESH_MAX_AGE_SECONDS,
  };
}

export const supabaseAuthSessionProvider: AuthSessionProvider = {
  async current(tokens, allowRefresh) {
    if (tokens.accessToken) {
      try {
        const user = await validateAccessToken(tokens.accessToken);
        return { session: serverSessionFor(user, tokens.accessToken) };
      } catch (error) {
        if (!(error instanceof ApiProblem) || error.status !== 401) throw error;
      }
    }
    if (allowRefresh && tokens.refreshToken) {
      try {
        const refreshed = await refreshSession(tokens.refreshToken);
        if (!refreshed.user?.id) {
          throw new ApiProblem(401, "SESSION_INVALID", "登录状态已失效，请重新登录");
        }
        return {
          session: serverSessionFor(refreshed.user, refreshed.access_token),
          refreshed: credentialsFor(refreshed),
        };
      } catch (error) {
        if (!(error instanceof ApiProblem) || error.status !== 401) throw error;
      }
    }
    return null;
  },
  async profileFor(session) {
    const profile = await actorRpc<SessionProfile | null>(
      "get_profile_for_actor",
      session.userId,
      { p_is_anonymous: session.isAnonymous },
    );
    if (!profile) throw unavailable();
    return profile;
  },
};

export function createSessionService(
  store: SessionStore,
  provider: AuthSessionProvider,
): SessionService {
  async function current(allowRefresh: boolean): Promise<ServerSession | null> {
    const resolved = await provider.current(await store.read(), allowRefresh);
    if (!resolved) return null;
    if (resolved.refreshed) await store.save(resolved.refreshed);
    return resolved.session;
  }

  async function publicSessionForSession(session: ServerSession): Promise<AnonymousSession> {
    const profile = await provider.profileFor(session);
    return {
      alias: profile.alias,
      animal: profile.animal,
      // The validated Auth user is the source of truth. A just-upgraded access
      // token can still carry a stale `is_anonymous` JWT claim briefly.
      authKind: session.isAnonymous ? "anonymous" : profile.authKind ?? "password",
      ...(profile.displayName ? { displayName: profile.displayName } : {}),
      ...(profile.publicId ? { publicId: profile.publicId } : {}),
      ...(profile.identityBadge ? { identityBadge: profile.identityBadge } : {}),
      ...(profile.maskedPhone ? { maskedPhone: profile.maskedPhone } : {}),
      onboardingComplete: profile.onboardingComplete ?? false,
      wallet: profile.wallet,
      experience: profile.experience,
      accountStatus: profile.accountStatus ?? "active",
    };
  }

  async function requireCurrent(): Promise<ServerSession> {
    const session = await current(true);
    if (!session) throw new ApiProblem(401, "unauthorized", "请先登录猹猹街。");
    return session;
  }

  return {
    save: (session) => store.save(session),
    clear: () => store.clear(),
    current,
    publicSessionFor: publicSessionForSession,
    require: requireCurrent,
    async requireActive() {
      const session = await requireCurrent();
      const profile = await provider.profileFor(session);
      if (profile.accountStatus === "banned") {
        throw new ApiProblem(403, "account_banned", "该匿名身份已被暂停写入。");
      }
      return session;
    },
  };
}

export const supabaseSessionService = createSessionService(
  cookieSessionStore,
  supabaseAuthSessionProvider,
);

export const localAuthSessionProvider = createLocalAuthSessionProvider(
  postgresLocalSessionRepository,
);

export const localSessionService = createSessionService(
  cookieSessionStore,
  localAuthSessionProvider,
);

// The same backend switch also selects DataTransport, so a deployment cannot
// accidentally combine local sessions with Supabase data authority.
const activeSessionService: SessionService = getBackendProvider() === "postgres"
  ? localSessionService
  : supabaseSessionService;

export async function createLocalPasswordSession(userId: string): Promise<ServerSession> {
  const issued = await issueLocalSession(postgresLocalSessionRepository, userId);
  await localSessionService.save(issued.credentials);
  return issued.session;
}

export async function revokeCurrentLocalSession(
  reason: "logout" | "password_change" | "recovery" = "logout",
): Promise<void> {
  const tokens = await cookieSessionStore.read();
  if (tokens.accessToken) {
    await postgresLocalSessionRepository.revoke(
      digestOpaqueToken(tokens.accessToken),
      reason,
    );
  }
}

export function saveAuthSession(session: AuthSessionResponse): Promise<void> {
  return activeSessionService.save(credentialsFor(session));
}

export function clearAuthSession(): Promise<void> {
  return activeSessionService.clear();
}

export function getOptionalSession(): Promise<ServerSession | null> {
  return activeSessionService.current(true);
}

export function requireSession(): Promise<ServerSession> {
  return activeSessionService.require();
}

export function publicSessionFor(session: ServerSession): Promise<AnonymousSession> {
  return activeSessionService.publicSessionFor(session);
}

export function requireActiveSession(): Promise<ServerSession> {
  return activeSessionService.requireActive();
}

/**
 * Compatibility export for the existing bootstrap route. It intentionally no
 * longer creates a new anonymous user; only an existing legacy session resumes.
 */
export async function createOrResumeAnonymousSessionBundle(): Promise<AnonymousSessionBundle> {
  const session = await requireSession();
  return { serverSession: session, publicSession: await publicSessionFor(session) };
}

export async function createOrResumeAnonymousSession(): Promise<AnonymousSession> {
  return (await createOrResumeAnonymousSessionBundle()).publicSession;
}
