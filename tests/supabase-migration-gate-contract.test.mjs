import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const gateSource = await readFile(
  new URL("../scripts/check-supabase-migrations.mjs", import.meta.url),
  "utf8",
);

test("Supabase 发布门禁使用只读 dry-run 并拒绝待执行迁移", () => {
  assert.match(gateSource, /db push --linked --dry-run/);
  assert.match(gateSource, /!payload\.upToDate \|\| migrations\.length/);
  assert.doesNotMatch(gateSource, /migration list --linked/);
});
