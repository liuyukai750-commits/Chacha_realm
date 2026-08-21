import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = async (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("蹲瓜写入不重复读取账号状态，并记录无敏感信息的阶段日志", async () => {
  const route = await source("src/app/api/melons/[id]/squat/route.ts");
  assert.match(route, /requireSession\(\)/);
  assert.doesNotMatch(route, /requireActiveSession\(\)/);
  assert.match(route, /\[api\/melons\/squat\] started/);
  assert.match(route, /\[api\/melons\/squat\] completed/);
});

test("浏览器请求超时会恢复为可重试错误，而不是永久等待", async () => {
  const adapter = await source("src/components/http-island-adapter.ts");
  assert.match(adapter, /new AbortController\(\)/);
  assert.match(adapter, /controller\.abort\(\), 12_000/);
  assert.match(adapter, /request_timeout/);
  assert.match(adapter, /本次操作没有确认成功，请重试/);
});

test("蹲瓜写入成功立即结束忙碌态，瓜篮只在后台校准", async () => {
  const component = await source("src/components/chacha-island.tsx");
  assert.match(component, /await islandAdapter\.setSquat\(id, active\)[\s\S]*finally \{[\s\S]*setSquatBusyIds/);
  assert.match(component, /void islandAdapter\.squatShelf\(\)\.then/);
  assert.match(component, /items: \[\{ melon, squattedAt: new Date\(\)\.toISOString\(\)/);
  assert.match(component, /onSquatChanged\(opened\.melon\.id, result\.active\)/);
});
