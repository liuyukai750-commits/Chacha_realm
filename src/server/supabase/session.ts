import "server-only";

import { cookies } from "next/headers";

import type { AnonymousSession } from "@/contracts";
import { ApiProblem, unavailable } from "@/server/api";
import { rpc, supabaseFetch } from "@/server/supabase/http";

const ACCESS_COOKIE = "chacha_at";
const REFRESH_COOKIE = "chacha_rt";

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

interface ProfileDto {
  alias: string;
  animal: string;
  authKind?: "anonymous" | "phone";
  displayName?: string | null;
  publicId?: string;
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

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export async function saveAuthSession(session: AuthSessionResponse): Promise<void> {
  const store = await cookies();
  store.set(ACCESS_COOKIE, session.access_token, cookieOptions(Math.max(60, session.expires_in)));
  store.set(REFRESH_COOKIE, session.refresh_token, cookieOptions(30 * 24 * 60 * 60));
}

export async function clearAuthSession(): Promise<void> {
  const store = await cookies();
  store.delete(ACCESS_COOKIE);
  store.delete(REFRESH_COOKIE);
}

async function validateAccessToken(accessToken: string): Promise<AuthUser> {
  return supabaseFetch<AuthUser>("/auth/v1/user", { method: "GET" }, accessToken);
}

async function refreshSession(refreshToken: string): Promise<AuthSessionResponse> {
  return supabaseFetch<AuthSessionResponse>(
    "/auth/v1/token?grant_type=refresh_token",
    { method: "POST", body: JSON.stringify({ refresh_token: refreshToken }) },
  );
}

async function currentSession(allowRefresh: boolean): Promise<ServerSession | null> {
  const store = await cookies();
  const accessToken = store.get(ACCESS_COOKIE)?.value;
  const refreshToken = store.get(REFRESH_COOKIE)?.value;
  if (accessToken) {
    try {
      const user = await validateAccessToken(accessToken);
      if (!user.id) throw new ApiProblem(401, "unauthorized", "登录状态无效。");
      return { userId: user.id, accessToken, isAnonymous: user.is_anonymous === true };
    } catch (error) {
      if (!(error instanceof ApiProblem) || error.status !== 401) throw error;
    }
  }
  if (allowRefresh && refreshToken) {
    try {
      const refreshed = await refreshSession(refreshToken);
      if (!refreshed.user?.id) throw new ApiProblem(401, "unauthorized", "登录状态无效。");
      await saveAuthSession(refreshed);
      return {
        userId: refreshed.user.id,
        accessToken: refreshed.access_token,
        isAnonymous: refreshed.user.is_anonymous === true,
      };
    } catch (error) {
      if (!(error instanceof ApiProblem) || error.status !== 401) throw error;
    }
  }
  return null;
}

export function getOptionalSession(): Promise<ServerSession | null> {
  return currentSession(true);
}

export async function requireSession(): Promise<ServerSession> {
  const session = await currentSession(true);
  if (!session) throw new ApiProblem(401, "unauthorized", "请先登录猹猹街。");
  return session;
}

async function profileFor(session: ServerSession): Promise<ProfileDto> {
  const profile = await rpc<ProfileDto | null>("get_current_profile", {}, session.accessToken);
  if (!profile) throw unavailable();
  return profile;
}

export async function publicSessionFor(session: ServerSession): Promise<AnonymousSession> {
  const profile = await profileFor(session);
  return {
    alias: profile.alias,
    animal: profile.animal,
    // The validated Auth user is the source of truth. A just-upgraded access
    // token can still carry a stale `is_anonymous` JWT claim briefly.
    authKind: session.isAnonymous ? "anonymous" : "phone",
    ...(profile.displayName ? { displayName: profile.displayName } : {}),
    ...(profile.publicId ? { publicId: profile.publicId } : {}),
    ...(profile.maskedPhone ? { maskedPhone: profile.maskedPhone } : {}),
    onboardingComplete: profile.onboardingComplete ?? false,
    wallet: profile.wallet,
    experience: profile.experience,
    accountStatus: profile.accountStatus ?? "active",
  };
}

export async function requireActiveSession(): Promise<ServerSession> {
  const session = await requireSession();
  const profile = await profileFor(session);
  if (profile.accountStatus === "banned") {
    throw new ApiProblem(403, "account_banned", "该匿名身份已被暂停写入。");
  }
  return session;
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
