import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL("../supabase/migrations/202608110002_service_role_secret_compat.sql", import.meta.url);
const migration = await readFile(migrationUrl, "utf8");

const serviceFunctions = [
  "create_nearby_melon",
  "create_melon",
  "complete_melon_read",
  "get_melon_detail_for_actor",
  "add_melon_comment",
];

test("new Supabase secret keys rely on service_role EXECUTE grants instead of legacy JWT claims", () => {
  assert.match(migration, /sb_secret_\*/);
  assert.match(migration, /pg_get_functiondef/);
  assert.match(migration, /regexp_replace\(definition, legacy_jwt_guard, '', 'i'\)/);
  assert.match(migration, /service_role_required/);

  for (const functionName of serviceFunctions) {
    assert.match(migration, new RegExp(`revoke all on function public\\.${functionName}\\(`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${functionName}\\([^;]+\\) to service_role;`));
  }

  assert.doesNotMatch(migration, /grant execute[^;]+to authenticated;/);
});

test("the compatibility migration fails closed when a required function or guard cannot be patched", () => {
  assert.match(migration, /if target is null then[\s\S]+required service function is missing/);
  assert.match(migration, /if position\('service_role_required' in definition\) > 0 then/);
  assert.match(migration, /could not remove legacy JWT guard/);
});
