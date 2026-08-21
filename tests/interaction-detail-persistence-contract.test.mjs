import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL("../supabase/migrations/202608200004_interaction_detail_persistence.sql", import.meta.url),
  "utf8",
);

test("重新打开瓜详情会读回当前账号的点赞和蹲后续状态及全局计数", () => {
  assert.match(migration, /get_melon_detail_for_actor\s*\(/i);
  assert.match(migration, /'liked',\s*public\.actor_liked_melon\(p_actor_id,\s*p_melon_id\)/i);
  assert.match(migration, /'squatted',\s*exists\s*\([\s\S]*?q\.user_id\s*=\s*p_actor_id/i);
  assert.match(migration, /'squatCount',\s*public\.melon_squat_count\(p_melon_id\)/i);
  assert.match(migration, /'reactions',\s*jsonb_build_object\('like',\s*public\.melon_like_count\(p_melon_id\)\)/i);
  assert.match(migration, /grant execute on function public\.get_melon_detail_for_actor\(uuid, uuid\)[\s\S]*?service_role/i);
});
