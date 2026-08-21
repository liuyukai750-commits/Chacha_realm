import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("one backend switch selects PostgreSQL transport and local sessions atomically", async () => {
  const [backend, http, session, env] = await Promise.all([
    read("../src/server/backend/provider.ts"),
    read("../src/server/supabase/http.ts"),
    read("../src/server/supabase/session.ts"),
    read("../.env.example"),
  ]);

  assert.match(backend, /CHACHA_BACKEND_PROVIDER/);
  assert.match(backend, /"supabase"\s*\|\s*"postgres"/);
  assert.match(http, /getBackendProvider\(\)\s*===\s*"postgres"[\s\S]*postgresDataTransport/);
  assert.match(session, /getBackendProvider\(\)\s*===\s*"postgres"[\s\S]*localSessionService/);
  assert.doesNotMatch(`${http}\n${session}`, /SESSION_PROVIDER|DATA_PROVIDER/);
  assert.match(env, /CHACHA_BACKEND_PROVIDER=supabase/);
  assert.match(env, /DATABASE_URL=/);
});

test("PostgreSQL transport uses named parameters, a function allowlist and server actor authority", async () => {
  const transport = await read("../src/server/postgres/data-transport.ts");

  assert.match(transport, /ALLOWED_RPC_NAMES/);
  assert.match(transport, /NAMED_ARGUMENT_PATTERN/);
  assert.match(transport, /\.\.\.input,\s*p_actor_id:\s*actorId/);
  assert.doesNotMatch(transport, /p_actor_id:\s*actorId,\s*\.\.\.input/);
  assert.match(transport, /public_spots/);
  assert.match(transport, /URLSearchParams/);
  assert.doesNotMatch(transport, /\$\{[^}]*query[^}]*\}/);
  assert.match(
    transport,
    /serviceRpc<T>[\s\S]*invokeRpc<T>\(database, name, input, true\)/,
  );
  assert.match(
    transport,
    /with service_context as materialized[\s\S]*set_config\('request\.jwt\.claims', \$1, true\)[\s\S]*role: "service_role"/,
  );
});

test("opaque sessions store only SHA-256 digests and enforce rotation, expiry and reuse revocation", async () => {
  const [localSession, repository] = await Promise.all([
    read("../src/server/auth/local-session.ts"),
    read("../src/server/postgres/local-session-repository.ts"),
  ]);

  assert.match(localSession, /randomBytes\(32\)[\s\S]*base64url/);
  assert.match(localSession, /createHash\("sha256"\)/);
  assert.doesNotMatch(repository, /rawToken|accessToken\s*(?:,|\))/);
  assert.match(repository, /local_auth_sessions/);
  assert.match(repository, /for update/i);
  assert.match(repository, /suspected_reuse/);
  assert.match(repository, /revocation_reason\s*=\s*'rotation'/);
  assert.match(repository, /idle_expires_at/);
  assert.match(repository, /absolute_expires_at/);
  assert.match(localSession, /ROTATION_REUSE_GRACE_SECONDS\s*=\s*30/);
  assert.match(repository, /session\.last_seen_at\s*>=\s*input\.rotationGraceAfter/);
  assert.match(repository, /rotationGraceAfter[\s\S]*suspected_reuse/);
});

test("local password auth verifies migrated bcrypt hashes without exposing credential material", async () => {
  const [service, repository] = await Promise.all([
    read("../src/server/auth/local-password-service.ts"),
    read("../src/server/postgres/local-password-repository.ts"),
  ]);

  assert.match(service, /bcrypt\.compare/);
  assert.match(service, /bcrypt\.hash/);
  assert.match(service, /import\("@node-rs\/argon2"\)/);
  assert.doesNotMatch(service, /import\s+\{?\s*verify[\s\S]{0,80}from\s+["@']@node-rs\/argon2["@']/);
  assert.match(repository, /local_auth_credentials/);
  assert.match(repository, /password_digest/);
  assert.doesNotMatch(`${service}\n${repository}`, /console\.(?:log|warn|error)\([^)]*(?:password|digest|token)/i);
  assert.match(service, /invalid_credentials/);
});

test("standard PostgreSQL target keeps UUIDs and supplies local auth compatibility without GoTrue", async () => {
  const sql = await read("../deploy/postgres/standard-postgres-target.sql");

  assert.match(sql, /create schema if not exists auth/);
  assert.match(sql, /create or replace function auth\.uid\(\)/);
  assert.match(sql, /create or replace function auth\.jwt\(\)/);
  assert.match(sql, /local_auth_sessions/);
  assert.match(sql, /drop constraint if exists profiles_id_fkey/);
  assert.match(sql, /create or replace function public\.get_profile_for_actor/);
  assert.match(sql, /local_auth_credentials/);
  assert.doesNotMatch(sql, /disable row level security/i);
});
