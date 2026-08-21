import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/202608210001_melon_visibility_window.sql",
  "utf8",
);
const productSpec = readFileSync("docs/PRODUCT_SPEC.md", "utf8");

test("普通瓜篮只保留发布未满 48 小时的候选", () => {
  assert.match(migration, /m\.created_at\s*>\s*statement_timestamp\(\)\s*-\s*interval '48 hours'/i);
  assert.match(productSpec, /发布未满 48 小时/);
});

test("每个公共地点和当前附近生活圈分别只取最新 25 颗", () => {
  assert.match(migration, /row_number\(\)\s+over[\s\S]*partition by[\s\S]*public_spot:[\s\S]*nearby_area/i);
  assert.match(migration, /order by m\.created_at desc, m\.id desc/i);
  assert.match(migration, /where location_rank <= 25/i);
});

test("48 小时退出普通发现不把瓜自动归档，保证蹲瓜篮和瓜主瓜田继续读取", () => {
  const effectiveStatusBody = migration.match(
    /create or replace function public\.effective_melon_status[\s\S]*?\$\$;/,
  )?.[0] ?? "";
  assert.match(effectiveStatusBody, /p_status in \('held', 'removed', 'archived'\)/i);
  assert.doesNotMatch(effectiveStatusBody, /24 hours|48 hours|p_reads\s*=\s*0/i);
  assert.match(productSpec, /已蹲用户仍可在蹲瓜篮查看/);
  assert.match(productSpec, /瓜主仍可在“我的瓜田”长期查看/);
});

test("发现查询权限仍只开放给 service role", () => {
  assert.match(migration, /revoke all on function public\.get_discovery_candidates_for_visitor_v2[\s\S]*from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.get_discovery_candidates_for_visitor_v2[\s\S]*to service_role/i);
});
