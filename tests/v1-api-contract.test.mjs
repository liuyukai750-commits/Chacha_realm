import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = async (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("播种 API 只接受活动会话、同源写入、0..2 土地编号与 UUID operationId", async () => {
  const [route, validation] = await Promise.all([
    source("src/app/api/fields/me/plant/route.ts"),
    source("src/server/validation.ts"),
  ]);
  assert.match(route, /requireSameOrigin\(request\)/);
  assert.match(route, /requireActiveSession\(\)/);
  assert.match(route, /fieldPlotIndex\(body\.plotIndex\)/);
  assert.match(route, /operationId:\s*uuid\(body\.operationId, "operationId"\)/);
  assert.match(route, /plantField\(input\.plotIndex, input\.operationId, session\.accessToken\)/);
  assert.match(validation, /value !== 0 && value !== 1 && value !== 2/);
});

test("播种 repository 把客户端 operationId 原样传给事务 RPC，用于安全重试", async () => {
  const repository = await source("src/server/repositories/island-repository.ts");
  assert.match(repository, /plantField\([\s\S]*operationId:\s*string[\s\S]*rpc<PlantFieldResult>\([\s\S]*"plant_field_melon"[\s\S]*p_operation_id:\s*operationId/);
});

test("收获 API 只允许活动会话，并把事务交给数据库 RPC", async () => {
  const [route, repository] = await Promise.all([
    source("src/app/api/fields/me/harvest/route.ts"),
    source("src/server/repositories/island-repository.ts"),
  ]);
  assert.match(route, /requireSameOrigin\(request\)/);
  assert.match(route, /requireActiveSession\(\)/);
  assert.match(route, /harvestField\(session\.accessToken\)/);
  assert.match(repository, /rpc<HarvestFieldResult>\("harvest_field", \{\}, accessToken\)/);
});

test("本人瓜田与他人瓜田走同一服务端视图，但用 null/alias 明确区分私有字段", async () => {
  const [ownRoute, publicRoute] = await Promise.all([
    source("src/app/api/fields/me/route.ts"),
    source("src/app/api/fields/[alias]/route.ts"),
  ]);
  assert.match(ownRoute, /getField\(null, session\.accessToken\)/);
  assert.match(publicRoute, /getField\(alias, session\.accessToken\)/);
  assert.match(publicRoute, /text\(rawAlias, "alias", 40\)/);
});

test("完成吃瓜先验证 5 秒阅读凭证，再调用事务性完成 RPC", async () => {
  const route = await source("src/app/api/melons/[id]/complete/route.ts");
  const verifyPosition = route.indexOf("verifyReadToken");
  const completePosition = route.indexOf("return completeRead");
  assert.ok(verifyPosition >= 0 && completePosition > verifyPosition);
  assert.match(route, /requireActiveSession\(\)/);
  assert.match(route, /verifyReadToken\(readToken, session\.userId, id\)/);
});

test("原创奖励在统一 create_melon_v3 RPC 内完成，HTTP 层不自行修改钱包", async () => {
  const [route, repository] = await Promise.all([
    source("src/app/api/melons/route.ts"),
    source("src/server/repositories/island-repository.ts"),
  ]);
  assert.match(route, /return createMelon\(input, session\.userId\)/);
  assert.doesNotMatch(route, /trueSeedCount|smallSeedCount|seed_count/);
  assert.match(repository, /serviceRpc<Omit<CreateMelonResult, "cityId">>\(\s*"create_melon_v3"/);
  assert.match(repository, /return \{ \.\.\.result, cityId \}/);
});
