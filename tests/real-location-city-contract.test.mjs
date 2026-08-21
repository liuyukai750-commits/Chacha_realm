import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = async (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("nearby burial payload cannot submit or override cityId from the active browsing city", async () => {
  const burySheet = await source("src/components/bury-sheet-v1.tsx");
  const nearbySubmit = burySheet.match(/\? \{ operationId, burialKind: "nearby_area"[\s\S]*?\}/)?.[0] ?? "";

  assert.match(nearbySubmit, /burialKind: "nearby_area"/);
  assert.doesNotMatch(nearbySubmit, /cityId/);
});

test("public spot burial payload submits only spotId; the server owns spot city attribution", async () => {
  const burySheet = await source("src/components/bury-sheet-v1.tsx");
const publicSubmit = burySheet.match(/: \{ operationId, burialKind: "public_spot"[\s\S]*?\}/)?.[0] ?? "";

  assert.match(publicSubmit, /burialKind: "public_spot"/);
  assert.match(publicSubmit, /spotId/);
  assert.doesNotMatch(publicSubmit, /cityId/);
});

test("create melon route requires one-time location for both burial modes and never parses client cityId", async () => {
  const route = await source("src/app/api/melons/route.ts");

  assert.match(route, /const location = validateLocationProof\(body\.location\)/);
  assert.match(route, /kind === "nearby_area"[\s\S]*burialKind: "nearby_area", location/);
  assert.match(route, /burialKind: "public_spot", spotId:[\s\S]*location/);
  assert.doesNotMatch(route, /cityId\(body\.cityId\)/);
  assert.doesNotMatch(route, /parsedCityId|body\.cityId/);
});

test("公共地点列表变化后不会提交失效的旧地点", async () => {
  const burySheet = await source("src/components/bury-sheet-v1.tsx");
  assert.match(burySheet, /spots\.find\(\(spot\) => spot\.id === spotId\) \?\? spots\[0\]/);
  assert.match(burySheet, /spotId: selectedSpot!\.id/);
  assert.match(burySheet, /buryMode === "public_spot" && !selectedSpot/);
});

test("repository resolves nearby city from real location and public spot city from the active database catalog", async () => {
  const repository = await source("src/server/repositories/island-repository.ts");

  assert.match(repository, /const locatedCityId = resolveSupportedCityForBurial\(input\.location\)/);
  assert.match(repository, /activePublicSpot\(input\.spotId\)/);
  assert.match(repository, /const catalog = await getCities\(\)/);
  assert.match(repository, /city\.spots\.find\(\(candidate\) => candidate\.id === spotId\)/);
  assert.match(repository, /p_city_id:\s*cityId/);
  assert.match(repository, /p_latitude:\s*nearbyBurial \? input\.location!\.latitude : null/);
  assert.match(repository, /p_longitude:\s*nearbyBurial \? input\.location!\.longitude : null/);
  assert.match(repository, /return \{ \.\.\.result, cityId \}/);
  assert.doesNotMatch(repository, /getPublicSpot\(input\.spotId\)/);
  assert.doesNotMatch(repository, /p_city_id:\s*input\.cityId/);
  assert.match(repository, /spot!\.city_id !== locatedCityId/);
  assert.match(repository, /public_spot_city_mismatch/);
  assert.match(repository, /p_latitude:\s*nearbyBurial \? input\.location!\.latitude : null/);
  assert.match(repository, /p_longitude:\s*nearbyBurial \? input\.location!\.longitude : null/);
});

test("nearby city resolver covers five configured city boundaries and blocks uncertain life circles", async () => {
  const resolver = await source("src/server/security/location-city.ts");
  const geography = await source("src/data/geography.ts");

  for (const cityId of ["changsha", "beijing", "shanghai", "guangzhou", "shenzhen"]) {
    assert.match(geography, new RegExp(`id: "${cityId}"[\\s\\S]*?boundaries`), `${cityId} must have configured boundaries`);
  }
  assert.match(resolver, /findCityForCoordinates\(point, cities\)/);
  assert.match(resolver, /MAX_CITY_BURIAL_ACCURACY_M = 100/);
  assert.match(resolver, /samples\.some\(\(point\) => cityAt\(point\) !== resolvedCityId\)/);
  assert.match(resolver, /"nearby_city_unavailable", "当前位置尚未开放埋瓜"/);
});

test("successful nearby create refreshes discovery by real location instead of browsing city", async () => {
  const component = await source("src/components/chacha-island.tsx");

  assert.match(component, /islandAdapter\.discover\(nearbyBurial \? \{ location \} : \{ selectedCityId: result\.cityId \}\)/);
  assert.match(component, /已归入\$\{resultCityName\}/);
  assert.doesNotMatch(component, /islandAdapter\.discover\(\{ location, selectedCityId/);
});

test("all burial modes request location, while public spot success stays in the city view", async () => {
  const component = await source("src/components/chacha-island.tsx");
  const burySheet = await source("src/components/bury-sheet-v1.tsx");

  assert.match(component, /const location = mode === "demo"[\s\S]*await requestLocationProof\(\)/);
  assert.match(component, /const nearbyBurial = input\.burialKind === "nearby_area"/);
  assert.match(component, /islandAdapter\.discover\(nearbyBurial \? \{ location \} : \{ selectedCityId: result\.cityId \}\)/);
  assert.match(burySheet, /公区瓜需要一次定位/);
  assert.match(burySheet, /只用于确认你在这座城市，不保存坐标/);
});
