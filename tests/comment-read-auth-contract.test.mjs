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

test("评论 GET 将已验证会话的访问令牌传给 authenticated RPC", () => {
  assert.match(route, /const session = await requireSession\(\)/);
  assert.match(
    route,
    /getComments\([\s\S]*?session\.accessToken,[\s\S]*?\)/,
  );
  assert.match(
    repository,
    /export async function getComments\([\s\S]*?accessToken: string[\s\S]*?rpc<MelonComment\[]>\("get_melon_comments",[\s\S]*?\}, accessToken\)/,
  );
});

