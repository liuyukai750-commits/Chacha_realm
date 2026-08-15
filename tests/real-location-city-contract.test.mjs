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

test("create melon route validates location only for nearby burial and never parses client cityId", async () => {
  const route = await source("src/app/api/melons/route.ts");
  const baseBlock = route.match(/const base = \{[\s\S]*?\n\s*\};/)?.[0] ?? "";

  assert.match(route, /kind === "nearby_area"[\s\S]*location:\s*validateLocationProof\(body\.location\)/);
  assert.doesNotMatch(baseBlock, /location:\s*validateLocationProof/);
  assert.doesNotMatch(route, /cityId\(body\.cityId\)/);
  assert.doesNotMatch(route, /parsedCityId|body\.cityId/);
});

test("repository resolves nearby city from real location and public spot city from configured spot", async () => {
  const repository = await source("src/server/repositories/island-repository.ts");

  assert.match(repository, /const resolvedCityId = resolveSupportedCityForBurial\(input\.location\)/);
  assert.match(repository, /p_city_id:\s*resolvedCityId/);
  assert.match(repository, /p_latitude:\s*input\.location\.latitude/);
  assert.match(repository, /p_longitude:\s*input\.location\.longitude/);
  assert.match(repository, /const spot = getPublicSpot\(input\.spotId\)/);
  assert.match(repository, /p_city_id:\s*spot\.cityId/);
  assert.match(repository, /return \{ \.\.\.result, cityId: resolvedCityId \}/);
  assert.match(repository, /return \{ \.\.\.result, cityId: spot\.cityId \}/);
  assert.doesNotMatch(repository, /p_city_id:\s*input\.cityId/);
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
  assert.match(resolver, /"nearby_city_unavailable", "当前生活圈尚未开放"/);
});

test("successful create refreshes discovery by real location instead of browsing city", async () => {
  const component = await source("src/components/chacha-island.tsx");

  assert.match(component, /islandAdapter\.discover\(\{ location \}\)/);
  assert.match(component, /已归入\$\{resultCityName\}/);
  assert.doesNotMatch(component, /islandAdapter\.discover\(\{ location, selectedCityId/);
});
