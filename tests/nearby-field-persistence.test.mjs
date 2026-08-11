import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const migrationDirectory = new URL("../supabase/migrations/", import.meta.url);
const migrationFiles = (await readdir(migrationDirectory))
  .filter((name) => name.endsWith(".sql"))
  .sort();
const migrations = await Promise.all(
  migrationFiles.map(async (name) => ({ name, sql: await readFile(new URL(name, migrationDirectory), "utf8") })),
);

test("最终瓜田视图会返回 nearby_area 原创瓜，而不是被 public_spots 内连接过滤", () => {
  const definition = lastFunctionDefinition("field_view_for_profile");
  assert.match(definition, /m\.burial_kind\s*=\s*'nearby_area'/i);
  assert.match(definition, /m\.nearby_city_id/i);
  assert.match(definition, /'burialKind'\s*,\s*m\.burial_kind/i);
  assert.doesNotMatch(
    definition,
    /\n\s*join\s+public\.public_spots\s+s\s+on\s+s\.id\s*=\s*m\.spot_id/i,
    "nearby_area 的 spot_id 为 null，瓜田视图不能再使用 public_spots 内连接",
  );
});

test("瓜田响应给 nearby_area 使用模糊展示归属，绝不返回生活圈哈希或坐标", () => {
  const definition = lastFunctionDefinition("field_view_for_profile");
  assert.doesNotMatch(definition, /nearby_cell_id|latitude|longitude/i);
  assert.match(definition, /附近生活圈|nearby-area|nearby_area/i);
});

function lastFunctionDefinition(name) {
  const pattern = new RegExp(`create or replace function public\\.${name}\\([^]*?\\n\\$\\$;`, "ig");
  const definitions = migrations.flatMap(({ name: migrationName, sql }) =>
    [...sql.matchAll(pattern)].map((match) => ({ migrationName, body: match[0] })),
  );
  assert.ok(definitions.length > 0, `迁移必须定义 ${name}`);
  return definitions.at(-1).body;
}

