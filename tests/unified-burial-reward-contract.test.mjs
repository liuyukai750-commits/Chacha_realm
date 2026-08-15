import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/202608150005_unified_burial_rewards.sql", "utf8");
const repository = readFileSync("src/server/repositories/island-repository.ts", "utf8");

function functionBody(name) {
  const match = migration.match(new RegExp(`create or replace function public\\.${name}[\\s\\S]*?\\n\\$\\$;`, "i"));
  assert.ok(match, `${name} function must exist`);
  return match[0];
}

test("两种埋瓜方式统一进入同一个 service-role 事务", () => {
  const body = functionBody("create_melon_v3");
  assert.match(body, /p_burial_kind text/);
  assert.match(body, /p_burial_kind = 'public_spot'/);
  assert.match(body, /p_burial_kind = 'nearby_area'/);
  assert.match(body, /service_role_required/);
  assert.match(migration, /grant execute on function public\.create_melon_v3\([\s\S]*?\) to service_role/i);
  assert.doesNotMatch(migration, /grant execute on function public\.create_melon_v3\([^;]+to authenticated/i);
  assert.equal((repository.match(/"create_melon_v3"/g) ?? []).length, 1, "repository 只保留一个创建 RPC 入口");
  assert.doesNotMatch(repository, /"create_nearby_melon_v2"/);
});

test("主理人不受发布数量限制，普通账号仍保留防刷上限", () => {
  const body = functionBody("create_melon_v3");
  assert.match(body, /identity_badge/);
  assert.match(body, /profile_badge is distinct from 'steward'[\s\S]*count\(\*\)[\s\S]*>= 5[\s\S]*rate_limited/i);
});

test("每颗安全原创瓜奖励一次真籽，待审核和幂等重放不会多发", () => {
  const body = functionBody("create_melon_v3");
  const replayPosition = body.indexOf("where op.profile_id = actor and op.operation_id = p_operation_id");
  const rateLimitPosition = body.indexOf("rate_limited");
  const rewardPosition = body.indexOf("'share:melon:' || new_id::text");
  assert.ok(replayPosition >= 0 && replayPosition < rateLimitPosition, "重放必须先于限流判断返回");
  assert.ok(rewardPosition > rateLimitPosition, "奖励只发生在新瓜创建之后");
  assert.match(body, /if new_status = 'incubating' then[\s\S]*'true_seed_share'[\s\S]*'share:melon:' \|\| new_id::text/i);
  assert.match(body, /if inserted_count = 1 then[\s\S]*true_seed_count = true_seed_count \+ 1/i);
  assert.match(body, /insert into public\.melon_create_operations[\s\S]*true_seed_awarded/i);
});
