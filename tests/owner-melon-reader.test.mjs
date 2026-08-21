import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const component = await readFile(new URL("../src/components/chacha-island.tsx", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/202608110005_owner_melon_detail.sql", import.meta.url), "utf8");

test("瓜主的瓜卡片是可操作入口并打开独立管理视图", () => {
  assert.match(component, /className="field-melon-card"/);
  assert.match(component, /onClick=\{\(\) => void onOpen\(melon\)\}/);
  assert.match(component, /<OwnerMelonReader[\s\S]*opened=\{opened\}/);
  assert.match(component, /function OwnerMelonReader[\s\S]*title="我的瓜详情"/);
  assert.match(component, /吃瓜猹的评论/);
  assert.match(component, /作为作者留一条公开回复/);
});

test("孵化和复核中的瓜只显示瓜主原文，不提前请求公开评论", () => {
  assert.match(component, /if \(opened\.melon\.status !== "mature"\) return/);
  assert.match(component, /只有你能看到原文/);
  assert.match(component, /这颗瓜公开成熟后，吃瓜猹的评论会显示在这里/);
});

test("数据库只允许瓜主提前打开自己的瓜，其他人仍只能打开成熟瓜", () => {
  assert.match(migration, /m\.author_id\s*=\s*p_actor_id/i);
  assert.match(migration, /or public\.effective_melon_status\([^)]*\)\s*=\s*'mature'/i);
  assert.match(migration, /m\.status\s*<>\s*'removed'/i);
  assert.match(migration, /m\.burial_kind\s*=\s*'nearby_area'/i);
  assert.match(migration, /'name',\s*'附近生活圈'/i);
});

test("瓜详情只能经服务端身份边界调用", () => {
  assert.match(migration, /revoke all on function public\.get_melon_detail_for_actor\(uuid, uuid\) from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.get_melon_detail_for_actor\(uuid, uuid\) to service_role/i);
  assert.doesNotMatch(migration, /auth\.jwt/i);
});
