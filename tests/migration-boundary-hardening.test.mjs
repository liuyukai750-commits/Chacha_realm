import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

function sqlFunctionBlock(sql, name) {
  const start = sql.search(new RegExp(`create or replace function (?:public|app_private)\\.${name}\\(`, "i"));
  assert.ok(start >= 0, `missing SQL function ${name}`);
  const end = sql.indexOf("$$;", start);
  assert.ok(end >= 0, `unterminated SQL function ${name}`);
  return sql.slice(start, end + 3);
}

test("forward migration snapshots supported hashes and blocks silent account loss", async () => {
  const sql = await read("../supabase/migrations/202608190001_migration_boundary_hardening.sql");

  assert.match(sql, /password_algorithm[\s\S]*argon2id/i);
  assert.match(sql, /local_auth_snapshot_audit\(\)/i);
  assert.match(sql, /emailMismatch/i);
  assert.match(sql, /unsupportedHash/i);
  assert.match(sql, /missingSnapshot/i);
  assert.match(sql, /staleSnapshot/i);
  assert.match(sql, /orphanSnapshot/i);
  assert.match(sql, /argon2id\[\$\]v=\[0-9\]\+/i);
  assert.match(sql, /raise exception[\s\S]*local_auth_snapshot_incomplete/i);
  const auditBody = sql.slice(
    sql.indexOf("create or replace function public.local_auth_snapshot_audit"),
    sql.indexOf("revoke all on function public.local_auth_snapshot_audit"),
  );
  assert.doesNotMatch(auditBody, /passwordDigest|password_digest'|loginEmail|login_email'|encryptedPassword|encrypted_password'/i);
});

test("profile JSON has one explicit-actor authority and a legacy wrapper", async () => {
  const sql = await read("../supabase/migrations/202608190001_migration_boundary_hardening.sql");

  assert.match(sql, /function public\.get_profile_for_actor\([\s\S]*p_actor_id uuid/i);
  assert.match(sql, /function public\.get_current_profile\(\)[\s\S]*get_profile_for_actor/i);
  assert.match(sql, /revoke all on function public\.get_profile_for_actor/i);
  assert.match(sql, /grant execute on function public\.get_profile_for_actor[\s\S]*service_role/i);
});

test("actor-bound RPCs use a transaction context that clients cannot execute", async () => {
  const [sql, repository] = await Promise.all([
    read("../supabase/migrations/202608190001_migration_boundary_hardening.sql"),
    read("../src/server/repositories/island-repository.ts"),
  ]);

  assert.match(sql, /function app_private\.set_actor_context\([\s\S]*set_config\('app\.actor_id'/i);
  assert.match(sql, /revoke all on function app_private\.set_actor_context[\s\S]*authenticated, service_role/i);
  for (const name of [
    "complete_profile_for_actor",
    "get_squat_shelf_for_actor",
    "mark_squat_alert_seen_for_actor",
    "get_field_view_for_actor",
    "plant_field_melon_for_actor",
    "harvest_field_for_actor",
    "create_content_report_for_actor",
  ]) {
    const block = sqlFunctionBlock(sql, name);
    assert.match(block, /security definer/i);
    assert.match(block, /app_private\.set_actor_context\(p_actor_id/i);
    assert.match(sql, new RegExp(`revoke all on function public\\.${name}\\([^;]+\\)\\s+from public, anon, authenticated, service_role;`, "i"));
    assert.match(sql, new RegExp(`grant execute on function public\\.${name}\\([^;]+\\) to service_role;`, "i"));
    if (name !== "complete_profile_for_actor") {
      assert.match(repository, new RegExp(`actorRpc[^;]+["']${name}["']`, "i"));
    }
  }

  const [authService, passwordService] = await Promise.all([
    read("../src/server/auth/service.ts"),
    read("../src/server/auth/password-service.ts"),
  ]);
  assert.match(authService, /actorRpc(?:<[^>]+>)?\(["']complete_profile_for_actor["'],\s*session\.userId/i);
  assert.match(passwordService, /actorRpc\(["']complete_profile_for_actor["'],\s*userId/i);
});

test("migrated routes preserve guards and pass only the verified server actor", async () => {
  const routes = [
    ["../src/app/api/bootstrap/route.ts", /getField\(null, serverSession\.userId\)[\s\S]*getSquatShelf\(serverSession\.userId\)/],
    ["../src/app/api/fields/[alias]/route.ts", /getField\(alias, session\.userId\)/],
    ["../src/app/api/fields/me/route.ts", /getField\(null, session\.userId\)/],
    ["../src/app/api/fields/me/plant/route.ts", /requireSameOrigin\(request\)[\s\S]*plantField\([^;]+session\.userId\)/],
    ["../src/app/api/fields/me/harvest/route.ts", /requireSameOrigin\(request\)[\s\S]*harvestField\(session\.userId\)/],
    ["../src/app/api/reports/route.ts", /requireSameOrigin\(request\)[\s\S]*createReport\([^;]+session\.userId\)/],
    ["../src/app/api/squats/route.ts", /getSquatShelf\(session\.userId\)/],
    ["../src/app/api/squats/[id]/seen/route.ts", /requireSameOrigin\(request\)[\s\S]*markSquatAlertSeen\(id, session\.userId\)/],
  ];

  for (const [path, expected] of routes) {
    const source = await read(path);
    assert.match(source, /require(?:Active)?Session|createOrResumeAnonymousSessionBundle/);
    assert.match(source, expected);
    if (!path.endsWith("bootstrap/route.ts")) {
      assert.doesNotMatch(source, /session\.accessToken|serverSession\.accessToken/);
    }
  }
});

test("Supabase transport and session provider are explicit replacement seams", async () => {
  const [http, session] = await Promise.all([
    read("../src/server/supabase/http.ts"),
    read("../src/server/supabase/session.ts"),
  ]);

  assert.match(http, /export interface DataTransport/);
  assert.match(http, /export const supabaseDataTransport/);
  assert.match(http, /return activeDataTransport\.rpc/);
  assert.match(http, /actorRpc<T>[\s\S]*\{ \.\.\.input, p_actor_id: actorId \}/);
  assert.doesNotMatch(http, /\{ p_actor_id: actorId, \.\.\.input \}/);
  assert.match(session, /export interface AuthSessionProvider/);
  assert.match(session, /export const supabaseAuthSessionProvider/);
  assert.match(session, /return activeSessionService\.current/);
});

test("migration integration strategy fixes the source branch and release gates", async () => {
  const strategy = await read("../docs/migration/INTEGRATION_STRATEGY.md");

  assert.match(strategy, /codex\/preview/);
  assert.match(strategy, /qa:smoke/);
  assert.match(strategy, /不直接合入正式分支/);
  assert.match(strategy, /回滚/i);
});
