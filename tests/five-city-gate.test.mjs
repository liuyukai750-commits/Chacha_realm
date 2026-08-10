import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const cityIds = ["changsha", "beijing", "shanghai", "guangzhou", "shenzhen"];
const geography = readFileSync("src/data/geography.ts", "utf8");
const migration = readFileSync("supabase/migrations/202608100002_nearby_life_circle_burial.sql", "utf8");
const repository = readFileSync("src/server/repositories/island-repository.ts", "utf8");

test("five-city public spot matrix is complete and unique", () => {
  const ids = [...geography.matchAll(/\{\s*id:\s*"([^"]+)",\s*cityId:\s*"([^"]+)"/g)].map((match) => ({
    id: match[1],
    cityId: match[2],
  }));
  assert.equal(new Set(ids.map((spot) => spot.id)).size, ids.length, "spotId must be unique");
  for (const cityId of cityIds) {
    assert.equal(ids.filter((spot) => spot.cityId === cityId).length, 5, `${cityId} must have exactly 5 public spots`);
  }
});

test("nearby life-circle contract does not persist raw coordinates", () => {
  assert.match(migration, /burial_kind text not null default 'public_spot'/);
  assert.match(migration, /nearby_city_id text/);
  assert.match(migration, /nearby_cell_id text/);
  assert.match(migration, /create_nearby_melon/);
  assert.doesNotMatch(migration, /user_(latitude|longitude)|raw_(latitude|longitude)|location_history|movement_trace/i);
  assert.match(repository, /createHmac\("sha256"/);
  assert.match(repository, /p_nearby_cell_id:\s*nearbyCellIdForLocation/);
  assert.doesNotMatch(repository, /console\.(log|info|warn|error)\([^)]*location/i);
});
