import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL("../supabase/migrations/202608100001_field_economy_v1.sql", import.meta.url);
const sql = await readFile(migrationUrl, "utf8");

test("V1 钱包迁移将旧 seed_count 一次性拆成真籽与小籽，且小籽保持 0..4", () => {
  assert.match(sql, /small_seed_count[\s\S]*check\s*\(small_seed_count between 0 and 4\)/i);
  assert.match(sql, /true_seed_count[\s\S]*check\s*\(true_seed_count >= 0\)/i);
  assert.match(sql, /true_seed_count\s*=\s*seed_count\s*\/\s*5/i);
  assert.match(sql, /small_seed_count\s*=\s*\(seed_count\s*%\s*5\)/i);
  assert.match(sql, /Legacy V0 value[\s\S]*V1 never writes it/i);
});

test("V1 田地固定为三片各三位，并由服务端时间计算 12 小时成熟", () => {
  assert.match(sql, /create table public\.field_plants/i);
  assert.match(sql, /plot_index[\s\S]*between 0 and 2/i);
  assert.match(sql, /slot_index[\s\S]*between 0 and 2/i);
  assert.match(sql, /matures_at timestamptz[\s\S]*interval '12 hours'/i);
  assert.match(sql, /check\s*\(matures_at\s*=\s*planted_at\s*\+\s*interval '12 hours'\)/i);
  assert.match(sql, /unique index field_plants_active_slot_idx[\s\S]*owner_id, plot_index, slot_index[\s\S]*harvested_at is null/i);
  assert.match(sql, /generate_series\(0, 2\)[\s\S]*field_plot_full/i);
});

test("吃瓜奖励使用北京时间日界、每日最多 5 次并在同一函数自动换籽", () => {
  const completeRead = functionBody("complete_melon_read");
  assert.match(completeRead, /Asia\/Shanghai/i);
  assert.match(completeRead, /rewarded_reads\s*<\s*5/i);
  assert.match(completeRead, /small_seed_count\s*=\s*0[\s\S]*true_seed_count\s*=\s*true_seed_count\s*\+\s*1/i);
  assert.match(completeRead, /melon_author\s*=\s*reader[\s\S]*'counted', false/i);
  assert.match(completeRead, /on conflict \(melon_id, reader_id\) do nothing/i);
  assert.match(completeRead, /'author_read_xp'[\s\S]*experience_from_reads\s*=\s*experience_from_reads\s*\+\s*1/i);
  assert.match(completeRead, /for update/i);
});

test("每日首颗安全原创真籽使用幂等流水，held 内容不会进入奖励分支", () => {
  const createMelon = functionBody("create_melon");
  assert.match(createMelon, /result\s*->>\s*'status'\s*=\s*'incubating'/i);
  assert.match(createMelon, /'true_seed_share'/i);
  assert.match(createMelon, /'share:'[\s\S]*china_day/i);
  assert.match(createMelon, /on conflict \(idempotency_key\) do nothing/i);
  assert.match(createMelon, /true_seed_count\s*=\s*true_seed_count\s*\+\s*1/i);
});

test("播种先锁用户，只有成功占位才扣真籽，并保留唯一活动槽位约束", () => {
  const plant = functionBody("plant_field_melon");
  const insertPosition = plant.search(/insert into public\.field_plants/i);
  const debitPosition = plant.search(/true_seed_count\s*=\s*true_seed_count\s*-\s*1/i);
  assert.notEqual(insertPosition, -1);
  assert.ok(debitPosition > insertPosition, "必须先成功占位，再扣除真瓜籽");
  assert.match(plant, /for update/i);
  assert.match(plant, /true_seed_count\s*>\s*0/i);
  assert.match(plant, /'true_seed_plant'[\s\S]*-1/i);
});

test("播种 operationId 是事务幂等键，重试先返回原结果且不会再次扣籽或占位", () => {
  const plant = functionBody("plant_field_melon");
  assert.match(plant, /p_operation_id uuid/i);
  assert.match(plant, /plant-operation:'\s*\|\|\s*actor::text\s*\|\|\s*':'\s*\|\|\s*p_operation_id::text/i);
  const replayLookup = plant.search(/where el\.idempotency_key\s*=\s*'plant-operation:/i);
  const insertPosition = plant.search(/insert into public\.field_plants/i);
  const debitPosition = plant.search(/true_seed_count\s*=\s*true_seed_count\s*-\s*1/i);
  assert.ok(replayLookup >= 0 && replayLookup < insertPosition && insertPosition < debitPosition, "必须先查 operationId，再占位，最后扣籽");
  assert.match(plant, /select fp\.\* into existing_plant[\s\S]*if found then[\s\S]*return jsonb_build_object/i);
});

test("收获严格要求 9 个活动瓜全部成熟，并发收获由事务锁收敛为一次 +9 XP", () => {
  const harvest = functionBody("harvest_field");
  assert.match(harvest, /pg_advisory_xact_lock/i);
  assert.match(harvest, /active_count\s*<>\s*9\s+or\s+mature_count\s*<>\s*9/i);
  assert.match(harvest, /experience\s*=\s*experience\s*\+\s*9/i);
  assert.match(harvest, /experience_from_harvests\s*=\s*experience_from_harvests\s*\+\s*9/i);
  assert.match(harvest, /'field_harvest_xp'[\s\S]*'experience'[\s\S]*9/i);
  assert.match(harvest, /where owner_id\s*=\s*actor and harvested_at is null/i);
});

test("公开瓜田 JSON 不混入钱包、经验或操作权限，只有本人分支追加私有字段", () => {
  const view = functionBody("field_view_for_profile");
  const privateBranch = view.indexOf("case when p_include_private");
  assert.ok(privateBranch > 0, "必须存在显式私有字段分支");
  const publicPart = view.slice(0, privateBranch);
  assert.doesNotMatch(publicPart, /'wallet'|'experience'|'canHarvest'/i);
  assert.match(view.slice(privateBranch), /'wallet'[\s\S]*'experience'[\s\S]*'canHarvest'/i);
});

test("公开田的游戏植株只返回 plotIndex / slotIndex / stage，隐藏 id 与成长时间", () => {
  const view = functionBody("field_view_for_profile");
  assert.match(view, /jsonb_build_object\(\s*'plotIndex',\s*ap\.plot_index,\s*'slotIndex',\s*ap\.slot_index,\s*'stage',\s*ap\.stage\s*\)\s*\|\|\s*case when p_include_private then jsonb_build_object\(\s*'id',\s*ap\.id,\s*'plantedAt',\s*ap\.planted_at,\s*'maturesAt',\s*ap\.matures_at/i);
  assert.match(view, /case when p_include_private then jsonb_build_object\([\s\S]*'nextMaturesAt'/i);
});

test("需要服务端阅读/定位校验的 RPC 撤销 authenticated 直连，仅授予 service_role", () => {
  assert.match(sql, /revoke all on function public\.create_melon\(uuid, uuid, public\.safe_topic, text, text, text\) from public, anon, authenticated/i);
  assert.match(sql, /revoke all on function public\.complete_melon_read\(uuid, uuid\) from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.create_melon\(uuid, uuid, public\.safe_topic, text, text, text\) to service_role/i);
  assert.match(sql, /grant execute on function public\.complete_melon_read\(uuid, uuid\) to service_role/i);
  assert.doesNotMatch(sql, /grant execute on function public\.create_melon\([^;]+to authenticated/i);
  assert.doesNotMatch(sql, /grant execute on function public\.complete_melon_read\([^;]+to authenticated/i);
});

test("经济流水具有全局幂等键且新表默认 RLS 拒绝直连", () => {
  assert.match(sql, /idempotency_key text not null unique/i);
  for (const table of ["field_harvests", "field_plants", "economy_ledger"]) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
  }
  assert.match(sql, /revoke all on public\.field_harvests, public\.field_plants, public\.economy_ledger[\s\S]*from anon, authenticated/i);
});

function functionBody(name) {
  const pattern = new RegExp(`create or replace function public\\.${name}\\([^]*?\\n\\$\\$;`, "i");
  const match = sql.match(pattern);
  assert.ok(match, `migration 必须定义 ${name}`);
  return match[0];
}
