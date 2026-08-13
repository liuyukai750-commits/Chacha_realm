import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/202608130002_service_secret_compat.sql", import.meta.url),
  "utf8",
);

test("新式 Supabase Secret Key 由数据库角色授权，不依赖旧 JWT role claim", () => {
  assert.doesNotMatch(migration, /auth\.jwt\(\)|service_role_required/i);
  assert.match(migration, /revoke all on function public\.set_melon_squat[\s\S]*authenticated/i);
  assert.match(migration, /grant execute on function public\.set_melon_squat[\s\S]*to service_role/i);
  assert.match(migration, /account_status = 'active'/i);
});

test("点赞、蹲瓜和评论三个服务端写入同时兼容新 Secret Key", () => {
  assert.match(migration, /create or replace function public\.set_melon_reaction/i);
  assert.match(migration, /create or replace function public\.set_melon_squat/i);
  assert.match(migration, /create or replace function public\.add_melon_comment/i);
  assert.match(migration, /effective_melon_status/i);
  assert.match(migration, /content_safety_flags/i);
});

