import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = async (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("reaction contract only accepts V1 like writes with explicit target active state", async () => {
  const [contracts, validation, route, repository] = await Promise.all([
    source("src/contracts/index.ts"),
    source("src/server/validation.ts"),
    source("src/app/api/melons/[id]/reactions/route.ts"),
    source("src/server/repositories/island-repository.ts"),
  ]);

  assert.match(contracts, /export type ReactionType = "like"/);
  assert.match(validation, /new Set<ReactionType>\(\["like"\]\)/);
  assert.match(route, /typeof body\.active !== "boolean"/);
  assert.match(route, /setReaction\(id, reaction\(body\.reaction\), body\.active, session\.userId\)/);
  assert.match(repository, /"set_melon_reaction"[\s\S]*p_active:\s*active/);
});

test("like migration preserves old reaction meaning without unsafe enum reuse", async () => {
  const [enumMigration, interactionMigration] = await Promise.all([
    source("supabase/migrations/202608120002_like_reaction_enum.sql"),
    source("supabase/migrations/202608120003_like_squat_interactions.sql"),
  ]);

  assert.match(enumMigration, /alter type public\.reaction_type add value if not exists 'like'/i);
  assert.doesNotMatch(enumMigration, /update public\.reactions|create or replace function/i);
  assert.match(interactionMigration, /legacy_reaction public\.reaction_type/i);
  assert.match(interactionMigration, /where coalesce\(r\.legacy_reaction, r\.reaction\) = 'follow_up'/i);
  assert.match(interactionMigration, /update public\.reactions\s+set reaction = 'like'/i);
  assert.match(interactionMigration, /drop function if exists public\.set_melon_reaction\(uuid, public\.reaction_type\)/i);
});

test("database RPCs return aggregate counts and idempotent active flags", async () => {
  const migration = await source("supabase/migrations/202608120003_like_squat_interactions.sql");

  assert.match(migration, /create or replace function public\.set_melon_reaction\(\s*p_melon_id uuid,\s*p_reaction public\.reaction_type,\s*p_active boolean\s*\)/i);
  assert.match(migration, /return jsonb_build_object\(\s*'active', public\.actor_liked_melon\(actor, p_melon_id\),\s*'reactions', counts\s*\)/i);
  assert.match(migration, /return jsonb_build_object\('active', p_active, 'squatCount', public\.melon_squat_count\(p_melon_id\)\)/i);
  assert.match(migration, /'squatCount', public\.melon_squat_count\(m\.id\)/i);
  assert.match(migration, /'liked', public\.actor_liked_melon\(p_actor_id, m\.id\)/i);
  assert.match(migration, /'reactions', jsonb_build_object\('like', public\.melon_like_count\(m\.id\)\)/i);
});
