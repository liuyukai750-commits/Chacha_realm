import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = async (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("瓜篮排除已吃和主动隐藏的瓜，但不删除蹲瓜记录", async () => {
  const migration = await source("supabase/migrations/202608130004_melon_basket_cleanup.sql");
  assert.match(migration, /from public\.melon_completions c[\s\S]*where c\.reader_id = p_actor_id/);
  assert.match(migration, /from public\.melon_basket_dismissals d[\s\S]*where d\.user_id = p_actor_id/);
  assert.doesNotMatch(migration, /delete from public\.squats/i);
  assert.match(migration, /Per-user discovery dismissal only[\s\S]*never removes a squat/i);
});

test("瓜主删除使用软删除且必须匹配作者", async () => {
  const migration = await source("supabase/migrations/202608130004_melon_basket_cleanup.sql");
  assert.match(migration, /update public\.melons[\s\S]*set status = 'removed'[\s\S]*author_id = p_actor_id/);
  assert.doesNotMatch(migration, /delete from public\.melons/i);
  assert.match(migration, /grant execute on function public\.delete_own_melon\(uuid, uuid\) to service_role/);
});

test("发现接口以匿名身份过滤，两个删除接口都要求服务端身份", async () => {
  const [repository, discoveryRoute, deleteRoute, dismissRoute] = await Promise.all([
    source("src/server/repositories/island-repository.ts"),
    source("src/app/api/discovery/route.ts"),
    source("src/app/api/melons/[id]/route.ts"),
    source("src/app/api/melons/[id]/dismiss/route.ts"),
  ]);
  assert.match(repository, /get_melon_basket_exclusions[\s\S]*p_actor_id: actorId/);
  assert.match(discoveryRoute, /discover\(input, session\.accessToken, session\.userId\)/);
  assert.match(deleteRoute, /export async function DELETE[\s\S]*requireSameOrigin[\s\S]*deleteOwnMelon\(id, session\.userId\)/);
  assert.match(dismissRoute, /requireActiveSession[\s\S]*setMelonBasketDismissal\(id, body\.hidden, session\.userId\)/);
});

test("完成吃瓜只移出发现瓜篮，不修改蹲瓜架", async () => {
  const component = await source("src/components/chacha-island.tsx");
  const finishRead = component.slice(component.indexOf("const finishRead"), component.indexOf("const createMelon"));
  assert.match(finishRead, /items: current\.discovery\.items\.filter\(\(melon\) => melon\.id !== melonId\)/);
  assert.doesNotMatch(finishRead, /squatShelf|quickSquats|setSquat/);
  assert.match(component, /如果蹲过，这颗瓜仍会留在蹲瓜架/);
});
