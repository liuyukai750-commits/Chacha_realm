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
}

interface AuthSessionResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: AuthUser;
}

interface ProfileDto {
  alias: string;
  animal: string;
  wallet: AnonymousSession["wallet"];
  experience: AnonymousSession["experience"];
  accountStatus?: "active" | "banned";
}

export interface ServerSession {
  userId: string;
  accessToken: string;
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

async function saveSession(session: AuthSessionResponse): Promise<void> {
  const store = await cookies();
  store.set(ACCESS_COOKIE, session.access_token, cookieOptions(Math.max(60, session.expires_in)));
  store.set(REFRESH_COOKIE, session.refresh_token, cookieOptions(30 * 24 * 60 * 60));
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
      if (!user.id || user.is_anonymous === false) throw new ApiProblem(401, "unauthorized", "匿名会话无效。 ");
      return { userId: user.id, accessToken };
    } catch (error) {
      if (!(error instanceof ApiProblem) || error.status !== 401) throw error;
    }
  }
  if (allowRefresh && refreshToken) {
    try {
      const refreshed = await refreshSession(refreshToken);
      await saveSession(refreshed);
      return { userId: refreshed.user.id, accessToken: refreshed.access_token };
    } catch (error) {
      if (!(error instanceof ApiProblem) || error.status !== 401) throw error;
    }
  }
  return null;
}

export async function requireSession(): Promise<ServerSession> {
  const session = await currentSession(true);
  if (!session) throw new ApiProblem(401, "unauthorized", "请先建立匿名会话。 ");
  return session;
}

async function profileFor(session: ServerSession): Promise<ProfileDto> {
  const profile = await rpc<ProfileDto | null>("get_current_profile", {}, session.accessToken);
  if (!profile) throw unavailable();
  return profile;
}

export async function requireActiveSession(): Promise<ServerSession> {
  const session = await requireSession();
  const profile = await profileFor(session);
  if (profile.accountStatus === "banned") {
    throw new ApiProblem(403, "account_banned", "该匿名身份已被暂停写入；举报不会自动触发永久封禁。 ");
  }
  return session;
}

export async function createOrResumeAnonymousSession(): Promise<AnonymousSession> {
  let session = await currentSession(true);
  if (!session) {
    const created = await supabaseFetch<AuthSessionResponse>("/auth/v1/signup", {
      method: "POST",
      body: JSON.stringify({}),
    });
    if (!created.access_token || !created.refresh_token || !created.user?.id || created.user.is_anonymous === false) {
      throw unavailable();
    }
    await saveSession(created);
    session = { userId: created.user.id, accessToken: created.access_token };
  }
  const profile = await profileFor(session);
  return {
    alias: profile.alias,
    animal: profile.animal,
    wallet: profile.wallet,
    experience: profile.experience,
    accountStatus: profile.accountStatus ?? "active",
  };
}
