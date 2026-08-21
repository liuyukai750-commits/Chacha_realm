import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../supabase/migrations/202608200005_deactivate_unverified_public_spots.sql", import.meta.url), "utf8");
const demo = await readFile(new URL("../src/components/demo-island-adapter.ts", import.meta.url), "utf8");

test("unverified arrival points are inactive in live data and demo data", () => {
  for (const id of [
    "40000000-0000-4000-8000-000000000004",
    "40000000-0000-4000-8000-000000000005",
    "50000000-0000-4000-8000-000000000002",
    "50000000-0000-4000-8000-000000000004",
    "50000000-0000-4000-8000-000000000005",
  ]) assert.match(migration, new RegExp(id));
  assert.match(migration, /set active = false/);
  assert.match(demo, /spot\.verification === "verified"/);
  assert.match(demo, /spot\.seekSafety\.status === "allowed"/);
});
