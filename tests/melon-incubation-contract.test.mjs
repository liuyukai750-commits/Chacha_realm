import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const lifecycle = readFileSync("src/domain/lifecycle.ts", "utf8");
const field = readFileSync("src/domain/field.ts", "utf8");
const repository = readFileSync("src/server/repositories/island-repository.ts", "utf8");
const migration = readFileSync("supabase/migrations/202608150008_three_minute_incubation.sql", "utf8");

test("故事瓜统一在服务端三分钟成熟，瓜田游戏瓜仍保持十二小时", () => {
  assert.match(lifecycle, /INCUBATION_MS\s*=\s*3\s*\*\s*MINUTE_MS/);
  assert.match(field, /FIELD_GROWTH_MS\s*=\s*12\s*\*\s*60\s*\*\s*60\s*\*\s*1000/);
  assert.match(migration, /create or replace function public\.create_melon_v4/);
  assert.match(migration, /created_at\s*\+\s*interval '3 minutes'/i);
  assert.match(migration, /update public\.melons[\s\S]*status = 'incubating'/i);
  assert.match(repository, /"create_melon_v4"/);
  assert.doesNotMatch(repository, /"create_melon_v3"/);
});

test("三分钟包装事务不分城市和埋瓜方式，并继续复用统一安全奖励事务", () => {
  assert.match(migration, /public\.create_melon_v3\(\s*p_actor_id/);
  assert.doesNotMatch(migration, /changsha|beijing|shanghai|guangzhou|shenzhen/);
  assert.doesNotMatch(migration, /public_spot|nearby_area/);
  assert.match(migration, /grant execute on function public\.create_melon_v4\([\s\S]*?to service_role/i);
  assert.doesNotMatch(migration, /grant execute on function public\.create_melon_v4\([^;]+to authenticated/i);
});
