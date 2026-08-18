import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  MIGRATED_TABLES,
  assertSafeExecutionEnvironment,
  buildManifestQuery,
  buildMigrationPlan,
  compareManifests,
  validateIdentitySample,
} from "../scripts/migration/catalog.mjs";

const digest = "a".repeat(64);
const manifest = () => ({
  version: 1,
  tables: MIGRATED_TABLES.map((table) => ({ table, count: table === "profiles" ? 2 : 0, digest })),
});

test("migration plan defaults to dry-run and recommends managed PostgreSQL", () => {
  const plan = buildMigrationPlan();
  assert.equal(plan.mode, "dry-run");
  assert.equal(plan.target, "managed");
  assert.equal(plan.recommendation, "recommended");
  assert.ok(plan.migratedTables.includes("local_auth_credentials"));
  assert.ok(plan.resetAtCutoverTables.includes("local_auth_sessions"));
});

test("Lighthouse target remains explicitly temporary", () => {
  const plan = buildMigrationPlan("lighthouse");
  assert.equal(plan.recommendation, "temporary-only");
});

test("execution guard rejects missing acknowledgement, same host, and production", () => {
  assert.throws(() => assertSafeExecutionEnvironment({}), /CHACHA_MIGRATION_STAGE/);
  const base = {
    CHACHA_MIGRATION_STAGE: "rehearsal",
    CHACHA_MIGRATION_ACK: "COPY_TWO_TEST_ACCOUNTS_ONLY",
    CHACHA_SOURCE_PGHOST: "source.example",
    CHACHA_TARGET_PGHOST: "target.example",
  };
  assert.equal(assertSafeExecutionEnvironment(base).safe, true);
  assert.throws(() => assertSafeExecutionEnvironment({ ...base, CHACHA_TARGET_PGHOST: "SOURCE.example" }), /must differ/);
  assert.throws(() => assertSafeExecutionEnvironment({ ...base, CHACHA_ALLOW_PRODUCTION: "true" }), /refuses production/);
});

test("manifest comparison catches count, digest, missing and unexpected tables", () => {
  assert.deepEqual(compareManifests(manifest(), manifest()), { ok: true, differences: [] });
  const changed = manifest();
  changed.tables.find((row) => row.table === "profiles").count = 1;
  assert.equal(compareManifests(manifest(), changed).ok, false);
  const missing = manifest();
  missing.tables.pop();
  assert.equal(compareManifests(manifest(), missing).ok, false);
  const unexpected = manifest();
  unexpected.tables.push({ table: "auth.users", count: 2, digest });
  assert.throws(() => compareManifests(manifest(), unexpected), /unexpected table/);
});

test("identity sample keeps UUID, public id and alias", () => {
  assert.equal(validateIdentitySample({
    id: "90b3505a-2f5b-46d1-a867-f5abf45f9801",
    publicId: "CC-2C19A479",
    alias: "狐狸15357",
  }), true);
  assert.equal(validateIdentitySample({ id: "bad", publicId: "CC-2C19A479", alias: "狐狸15357" }), false);
});

test("manifest SQL is read-only, complete and emits SHA-256 digests", () => {
  const sql = buildManifestQuery();
  assert.match(sql, /begin transaction read only/i);
  assert.match(sql, /rollback;/i);
  assert.match(sql, /'sha256'/i);
  assert.match(sql, /as "table"/i);
  for (const table of MIGRATED_TABLES) assert.match(sql, new RegExp(`public\\.${table}\\b`));
  assert.doesNotMatch(sql, /\b(insert|update|delete|truncate|drop)\b/i);
});

test("compatibility schema stores only hashes and keeps auth tables private", async () => {
  const sql = await readFile(
    new URL("../supabase/migrations/202608180001_standard_postgres_auth_compat.sql", import.meta.url),
    "utf8",
  );
  for (const table of ["local_auth_credentials", "local_auth_sessions", "local_auth_security_events"]) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
  }
  assert.match(sql, /token_digest text not null unique/i);
  assert.doesNotMatch(sql, /\bpassword\s+text\b/i);
  assert.doesNotMatch(sql, /\btoken\s+text\b/i);
});

test("password identity wins after an in-place phone account upgrade", async () => {
  const sql = await readFile(
    new URL("../supabase/migrations/202608180001_standard_postgres_auth_compat.sql", import.meta.url),
    "utf8",
  );
  const passwordPosition = sql.indexOf("exists (select 1 from public.account_login_credentials");
  const phonePosition = sql.indexOf("when u.phone is not null then 'phone'");
  assert.ok(passwordPosition > 0);
  assert.ok(phonePosition > passwordPosition);
  assert.doesNotMatch(sql, /when u\.raw_app_meta_data ->> 'chacha_auth_kind' = 'password'/i);
  assert.match(sql, /exists \(select 1 from public\.account_login_credentials/i);
  assert.match(sql, /exists \(select 1 from public\.local_auth_credentials/i);
});
