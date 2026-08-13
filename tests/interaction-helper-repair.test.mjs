import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL("../supabase/migrations/202608130003_interaction_helper_repair.sql", import.meta.url),
  "utf8",
);

test("interaction helper repair is self-contained and idempotent", () => {
  assert.match(migration, /add column if not exists legacy_reaction public\.reaction_type/i);
  assert.match(migration, /create or replace function public\.melon_like_count\(p_melon_id uuid\)/i);
  assert.match(migration, /create or replace function public\.actor_liked_melon\(p_actor_id uuid, p_melon_id uuid\)/i);
  assert.match(migration, /create or replace function public\.melon_squat_count\(p_melon_id uuid\)/i);
});

test("interaction helpers remain server-only", () => {
  assert.match(migration, /revoke all on function public\.melon_like_count\(uuid\) from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.melon_like_count\(uuid\) to service_role/i);
  assert.match(migration, /grant execute on function public\.melon_squat_count\(uuid\) to service_role/i);
});
