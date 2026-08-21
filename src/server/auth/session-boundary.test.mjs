import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const session = readFileSync(new URL("../supabase/session.ts", import.meta.url), "utf8");
const passwordService = readFileSync(new URL("./password-service.ts", import.meta.url), "utf8");

test("session persistence, provider behavior and route semantics have separate replacement seams", () => {
  assert.match(session, /export interface SessionStore/);
  assert.match(session, /save\(credentials: SessionCredentials\)/);
  assert.match(session, /export interface AuthSessionProvider/);
  assert.match(session, /export interface SessionService/);
  assert.match(session, /export function createSessionService/);
  assert.match(session, /export const supabaseAuthSessionProvider/);
  assert.match(session, /export const supabaseSessionService/);
  assert.match(session, /export const localSessionService/);
  assert.match(session, /getBackendProvider\(\) === "postgres"[\s\S]*localSessionService[\s\S]*supabaseSessionService/);
});

test("provider-specific GoTrue response fields are normalized before session storage", () => {
  const storeContract = session.slice(
    session.indexOf("export interface SessionStore"),
    session.indexOf("export interface ResolvedSession"),
  );
  assert.doesNotMatch(storeContract, /AuthSessionResponse|access_token|refresh_token|expires_in/);
  assert.match(session, /function credentialsFor\(session: AuthSessionResponse\): SessionCredentials/);
  assert.match(session, /return activeSessionService\.save\(credentialsFor\(session\)\)/);
});

test("session refresh rotates browser credentials through the store boundary", () => {
  const factory = session.slice(
    session.indexOf("export function createSessionService"),
    session.indexOf("export const supabaseSessionService"),
  );
  assert.match(factory, /provider\.current\(await store\.read\(\), allowRefresh\)/);
  assert.match(factory, /if \(resolved\.refreshed\) await store\.save\(resolved\.refreshed\)/);
  assert.doesNotMatch(factory, /cookies\(|auth\/v1|supabaseFetch|rpc</);
  assert.match(session, /if \(!refreshed\.user\?\.id\)[\s\S]*SESSION_INVALID/);
});

test("cookie adapter keeps security flags and removes stale renewal tokens", () => {
  assert.match(session, /httpOnly:\s*true/);
  assert.match(session, /secure:\s*process\.env\.NODE_ENV === "production"/);
  assert.match(session, /sameSite:\s*"lax"/);
  assert.match(session, /REFRESH_MAX_AGE_SECONDS = 30 \* 24 \* 60 \* 60/);
  assert.match(session, /if \(credentials\.refreshToken\)[\s\S]*else \{[\s\S]*store\.delete\(REFRESH_COOKIE\)/);
});

test("legacy password upgrade retains the authenticated UUID and recovery rollback", () => {
  assert.match(passwordService, /target\.userId !== existing\.userId/);
  assert.match(passwordService, /updatePasswordIdentity\(existing\.userId/);
  assert.match(passwordService, /existingDataPreserved:\s*true/);
  assert.match(passwordService, /catch \(error\)[\s\S]*set_account_recovery_secret/);
});
