import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/migrations/202608130001_interaction_presence_fix.sql", import.meta.url), "utf8");
const presenceRoute = readFileSync(new URL("../src/app/api/presence/verify/route.ts", import.meta.url), "utf8");
const commentsRoute = readFileSync(new URL("../src/app/api/melons/[id]/comments/route.ts", import.meta.url), "utf8");
const repository = readFileSync(new URL("../src/server/repositories/island-repository.ts", import.meta.url), "utf8");

test("点赞和蹲后续只允许服务端按显式匿名身份写入", () => {
  assert.match(migration, /set_melon_reaction\([\s\S]*p_actor_id uuid/i);
  assert.match(migration, /set_melon_squat\([\s\S]*p_actor_id uuid/i);
  assert.match(migration, /revoke all on function public\.set_melon_reaction[\s\S]*authenticated/i);
  assert.match(repository, /serviceRpc\("set_melon_reaction"[\s\S]*p_actor_id: actorId/i);
  assert.match(repository, /serviceRpc\("set_melon_squat"[\s\S]*p_actor_id: actorId/i);
});

test("现场评论凭证绑定瓜，并由服务端按固定锚点的一公里范围验证", () => {
  assert.match(presenceRoute, /uuid\(body\.melonId, "melonId"\)/);
  assert.match(presenceRoute, /getMelonPresenceTarget\(melonId, session\.userId, location\)/);
  assert.match(presenceRoute, /target\.withinOneKm/);
  assert.doesNotMatch(presenceRoute, /nearbyCellIdForLocation|requireSafeSeek/);
  assert.doesNotMatch(presenceRoute, /latitude[^\n]*log|longitude[^\n]*log/i);
  assert.match(commentsRoute, /requirePresenceCredential\(presenceToken, session\.userId, \{ spotId: id \}\)/);
  assert.match(migration, /get_melon_presence_target/);
});
