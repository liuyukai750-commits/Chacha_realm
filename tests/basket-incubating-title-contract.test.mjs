import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const basketMigration = await readFile(new URL("../supabase/migrations/202608200002_basket_titles_and_owner_comments.sql", import.meta.url), "utf8");
const shelfMigration = await readFile(new URL("../supabase/migrations/202608200003_squat_shelf_title_stability.sql", import.meta.url), "utf8");

test("瓜篮列表对孵化瓜也返回用户填写的标题", () => {
  assert.match(basketMigration, /get_discovery_candidates_for_visitor_v2/);
  assert.match(basketMigration, /'title',\s*m\.title/i);
  assert.doesNotMatch(basketMigration, /'title',\s*case\s+when[\s\S]*?'mature'/i);
});

test("蹲瓜篮对孵化瓜保留原始标题，不退化为话题占位标题", () => {
  assert.match(shelfMigration, /get_squat_shelf/i);
  assert.match(shelfMigration, /'title',\s*r\.title/i);
  assert.doesNotMatch(shelfMigration, /'title',\s*case\s+when[\s\S]*?'mature'/i);
});
