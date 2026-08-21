import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";

const source = readFileSync(new URL("./config.ts", import.meta.url), "utf8").replace('import "server-only";', "");
const { getSupabaseAdminConfig, getSupabaseConfig } = await import(
  `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString("base64")}`
);

const keys = [
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
];
const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

test.afterEach(() => {
  for (const key of keys) {
    const value = original[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test("returns null instead of pretending to connect when configuration is absent", () => {
  for (const key of keys) delete process.env[key];
  assert.equal(getSupabaseConfig(), null);
});

test("accepts HTTPS and local development URLs only", () => {
  process.env.SUPABASE_URL = "https://example.supabase.co/";
  process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
  assert.deepEqual(getSupabaseConfig(), { url: "https://example.supabase.co", publishableKey: "sb_publishable_test" });
  process.env.SUPABASE_URL = "http://not-local.example";
  assert.equal(getSupabaseConfig(), null);
});

test("prefers new Supabase publishable and secret keys over legacy names", () => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_new";
  process.env.SUPABASE_SECRET_KEY = "sb_secret_new";
  process.env.SUPABASE_ANON_KEY = "legacy-anon-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "legacy-service-role-key";
  assert.deepEqual(getSupabaseConfig(), { url: "https://example.supabase.co", publishableKey: "sb_publishable_new" });
  assert.deepEqual(getSupabaseAdminConfig(), {
    url: "https://example.supabase.co",
    publishableKey: "sb_publishable_new",
    secretKey: "sb_secret_new",
    secretKeySource: "secret",
  });
});

test("keeps legacy key names as fallback only", () => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "legacy-anon-key";
  delete process.env.SUPABASE_PUBLISHABLE_KEY;
  delete process.env.SUPABASE_SECRET_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  assert.equal(getSupabaseAdminConfig(), null);
  process.env.SUPABASE_SERVICE_ROLE_KEY = "legacy-service-role-key";
  assert.deepEqual(getSupabaseAdminConfig(), {
    url: "https://example.supabase.co",
    publishableKey: "legacy-anon-key",
    secretKey: "legacy-service-role-key",
    secretKeySource: "legacy_service_role",
  });
});
