import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./http.ts", import.meta.url), "utf8");

test("publishable key is used only as apikey unless a user JWT is present", () => {
  assert.match(source, /headers:\s*requestHeaders\(config\.publishableKey,\s*init,\s*accessToken\)/);
  assert.match(source, /\.\.\.\(accessToken \? \{ Authorization: `Bearer \$\{accessToken\}` \} : \{\}\)/);
  assert.doesNotMatch(source, /Bearer \$\{accessToken \?\? config\.publishableKey\}/);
  assert.doesNotMatch(source, /Bearer \$\{accessToken \?\? config\.anonKey\}/);
});

test("new Supabase secret key is never sent as bearer", () => {
  assert.match(source, /apikey:\s*config\.secretKey/);
  assert.match(source, /secretKeySource === "legacy_service_role"/);
  assert.doesNotMatch(source, /secretKeySource === "secret"[\s\S]*Authorization:\s*`Bearer \$\{config\.secretKey\}`/);
});
