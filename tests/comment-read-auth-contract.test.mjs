import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync(
  new URL("../src/app/api/melons/[id]/comments/route.ts", import.meta.url),
  "utf8",
);
const repository = readFileSync(
  new URL("../src/server/repositories/island-repository.ts", import.meta.url),
  "utf8",
);
const preciseLocationMigration = readFileSync(
  new URL("../supabase/migrations/202608150003_precise_burial_anchors.sql", import.meta.url),
  "utf8",
);

test("评论 GET 先校验会话和附近瓜凭证，再经 service role 读取", () => {
  assert.match(route, /const session = await requireSession\(\)/);
  assert.match(route, /getMelonReadPolicy\(id, session\.userId\)[\s\S]*burialKind === "nearby_area"[\s\S]*requirePresenceCredential/);
  assert.match(repository, /export async function getComments\([\s\S]*?serviceRpc<MelonComment\[]>\("get_melon_comments"/);
  assert.match(preciseLocationMigration, /revoke all on function public\.get_melon_comments[\s\S]*from public, anon, authenticated/i);
});
