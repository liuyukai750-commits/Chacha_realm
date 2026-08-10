import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sql = await readFile(new URL("./202608100001_field_economy_v1.sql", import.meta.url), "utf8");
const repository = await readFile(
  new URL("../../src/server/repositories/island-repository.ts", import.meta.url),
  "utf8",
);
const melonRoute = await readFile(new URL("../../src/app/api/melons/route.ts", import.meta.url), "utf8");
const completeRoute = await readFile(
  new URL("../../src/app/api/melons/[id]/complete/route.ts", import.meta.url),
  "utf8",
);

test("定位与五秒阅读边界只能经 Next 服务端进入 privileged RPC", () => {
  assert.match(sql, /revoke all on function public\.create_melon\(uuid, public\.safe_topic, text, text\) from public, anon, authenticated/i);
  assert.match(sql, /revoke all on function public\.create_melon\(uuid, public\.safe_topic, text, text, text\) from public, anon, authenticated/i);
  assert.match(sql, /revoke all on function public\.complete_melon_read\(uuid\) from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.create_melon\(uuid, uuid[^)]*\) to service_role/i);
  assert.match(sql, /grant execute on function public\.complete_melon_read\(uuid, uuid\) to service_role/i);
  assert.match(functionBody("create_melon"), /p_actor_id uuid[\s\S]*service_role_required[\s\S]*account_status = 'active'/i);
  assert.match(functionBody("complete_melon_read"), /p_actor_id uuid[\s\S]*service_role_required[\s\S]*account_status = 'active'/i);
  assert.match(repository, /serviceRpc<CreateMelonResult>\(\s*"create_melon"[\s\S]*p_actor_id: actorId/i);
  assert.match(repository, /serviceRpc<CompleteReadResult>\(\s*"complete_melon_read"[\s\S]*p_actor_id: actorId/i);
  assert.match(repository, /requireSafeSeek\(input\.spotId, input\.location\)[\s\S]*serviceRpc<CreateMelonResult>/i);
  assert.match(melonRoute, /validateLocationProof\(body\.location\)[\s\S]*createMelon\(input, session\.userId\)/i);
  assert.match(completeRoute, /verifyReadToken\(readToken, session\.userId, id\)[\s\S]*completeRead\(id, session\.userId\)/i);
});

test("旧 seed_count 只迁移未标记行，重复执行不会覆盖新钱包", () => {
  assert.match(sql, /add column if not exists wallet_migrated_at timestamptz/i);
  assert.match(sql, /set true_seed_count = seed_count \/ 5[\s\S]*wallet_migrated_at = statement_timestamp\(\)[\s\S]*where wallet_migrated_at is null/i);
  assert.match(sql, /alter column wallet_migrated_at set default now\(\)[\s\S]*set not null/i);
});

test("播种 operationId 在扣籽前命中旧流水并返回同一植株", () => {
  const plant = functionBody("plant_field_melon");
  const retryLookup = plant.search(/plant-operation:[\s\S]*existing_plant/i);
  const debit = plant.search(/true_seed_count\s*=\s*true_seed_count\s*-\s*1/i);
  assert.match(plant, /p_operation_id uuid/i);
  assert.ok(retryLookup >= 0 && retryLookup < debit, "重试查询必须发生在扣除真籽之前");
  assert.match(plant, /idempotency_key\s*=\s*'plant-operation:'[\s\S]*return jsonb_build_object/i);
  assert.match(plant, /'plant-operation:'\s*\|\|\s*actor::text\s*\|\|\s*':'\s*\|\|\s*p_operation_id::text/i);
});

test("公开瓜田只给阶段与槽位，本人分支才给植株 ID 和时间", () => {
  const view = functionBody("field_view_for_profile");
  assert.match(view, /'plotIndex'[\s\S]*'slotIndex'[\s\S]*'stage'[\s\S]*case when p_include_private then jsonb_build_object\([\s\S]*'id'[\s\S]*'plantedAt'[\s\S]*'maturesAt'/i);
  assert.doesNotMatch(sql, /user_(latitude|longitude)|location_history|movement_trace/i);
});

function functionBody(name) {
  const pattern = new RegExp(`create or replace function public\\.${name}\\([^]*?\\n\\$\\$;`, "i");
  const match = sql.match(pattern);
  assert.ok(match, `migration must define ${name}`);
  return match[0];
}
