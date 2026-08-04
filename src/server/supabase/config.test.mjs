import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";

const source = readFileSync(new URL("./config.ts", import.meta.url), "utf8").replace('import "server-only";', "");
const { getSupabaseConfig } = await import(
  `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString("base64")}`
);

const keys = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"];
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
  process.env.SUPABASE_ANON_KEY = "anon-key";
  assert.deepEqual(getSupabaseConfig(), { url: "https://example.supabase.co", anonKey: "anon-key" });
  process.env.SUPABASE_URL = "http://not-local.example";
  assert.equal(getSupabaseConfig(), null);
});
