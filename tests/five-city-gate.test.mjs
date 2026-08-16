import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const cityIds = ["changsha", "beijing", "shanghai", "guangzhou", "shenzhen"];
const geography = readFileSync("src/data/geography.ts", "utf8");
const migration = readFileSync("supabase/migrations/202608100002_nearby_life_circle_burial.sql", "utf8");
const preciseMigration = readFileSync("supabase/migrations/202608150003_precise_burial_anchors.sql", "utf8");
const unifiedMigration = readFileSync("supabase/migrations/202608150005_unified_burial_rewards.sql", "utf8");
const incubationMigration = readFileSync("supabase/migrations/202608150008_three_minute_incubation.sql", "utf8");
const repository = readFileSync("src/server/repositories/island-repository.ts", "utf8");
const createRoute = readFileSync("src/app/api/melons/route.ts", "utf8");
const fixture = readFileSync("tests/e2e/fixtures/v0-api.mjs", "utf8");

function functionBody(name) {
  const match = migration.match(new RegExp(`create or replace function public\\.${name}[\\s\\S]*?\\n\\$\\$;`, "i"));
  assert.ok(match, `${name} function must exist`);
  return match[0];
}

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

test("nearby life-circle stores exact anchors only in a private service-side table", () => {
  assert.match(migration, /burial_kind text not null default 'public_spot'/);
  assert.match(migration, /nearby_city_id text/);
  assert.match(migration, /nearby_cell_id text/);
  assert.match(migration, /create_nearby_melon/);
  assert.match(preciseMigration, /create table if not exists public\.melon_location_anchors/);
  assert.match(preciseMigration, /revoke all on public\.melon_location_anchors from public, anon, authenticated/);
  assert.match(repository, /create_melon_v4/);
  assert.match(repository, /p_latitude:\s*nearbyBurial \? input\.location!\.latitude : null/);
  assert.doesNotMatch(repository, /console\.(log|info|warn|error)\([^)]*location/i);
});

test("nearby discovery is filtered by a service-role exact-distance RPC and exposes no anchors", () => {
  assert.match(preciseMigration, /create or replace function public\.get_discovery_candidates_for_visitor_v2/);
  assert.match(preciseMigration, /private_distance_meters[\s\S]*<= 1000/);
  assert.doesNotMatch(preciseMigration, /'nearbyCellId'|'latitude'|'longitude'/);
  assert.match(repository, /serviceRpc<DiscoveryCandidate\[\]>\(\s*"get_discovery_candidates_for_visitor_v2"/);
  assert.match(repository, /p_latitude:\s*usableLocation\?\.latitude \?\? null/);
  assert.doesNotMatch(repository, /candidate\.nearbyCellId/);
  assert.match(repository, /isDiscoveryItemVisible/);
  assert.match(repository, /hasLocation:\s*Boolean\(usableLocation\)/);
  assert.match(repository, /sceneKind:\s*sceneContext\.kind/);
});

test("melon create does not trust client cityId for public or nearby burial", () => {
  assert.doesNotMatch(createRoute, /cityId\(body\.cityId\)/);
  assert.doesNotMatch(createRoute, /invalid_city", "cityId is required/);
  assert.doesNotMatch(createRoute, /cityId\(body\.cityId\)\s*\?\?\s*"changsha"/);
  assert.match(createRoute, /operationId:\s*uuid\(body\.operationId, "operationId"\)/);
  assert.match(createRoute, /burialKind: "public_spot"[\s\S]*spotId: uuid\(body\.spotId, "spotId"\)/);
  assert.match(createRoute, /const location = validateLocationProof\(body\.location\)/);
  assert.match(repository, /const locatedCityId = resolveSupportedCityForBurial\(input\.location\)/);
  assert.match(repository, /activePublicSpot\(input\.spotId\)/);
  assert.match(repository, /select=id,city_id,district_id,name,latitude,longitude&id=eq\.\$\{encodeURIComponent\(spotId\)\}&active=eq\.true&limit=1/);
  assert.doesNotMatch(repository, /getPublicSpot\(input\.spotId\)/);
  assert.match(repository, /const cityId = nearbyBurial \? locatedCityId : spot!\.city_id/);
  assert.match(repository, /p_city_id:\s*cityId/);
  assert.match(repository, /p_operation_id:\s*input\.operationId/);
  assert.match(repository, /spot!\.city_id !== locatedCityId[\s\S]*public_spot_city_mismatch/);
});

test("current create path uses one RPC for public spots and nearby life circles", () => {
  assert.match(unifiedMigration, /create or replace function public\.create_melon_v3/);
  assert.match(incubationMigration, /create or replace function public\.create_melon_v4/);
  assert.equal((repository.match(/"create_melon_v4"/g) ?? []).length, 1);
  assert.doesNotMatch(repository, /"create_melon_v3"/);
  assert.doesNotMatch(repository, /"create_nearby_melon_v2"/);
});

test("nearby create uses V1 economy ledger, active profile, held moderation and service-role-only RPC", () => {
  const nearbyCreate = functionBody("create_nearby_melon");
  assert.match(nearbyCreate, /auth\.jwt\(\) ->> 'role'[\s\S]*service_role_required/i);
  assert.match(nearbyCreate, /account_status = 'active'[\s\S]*for update/i);
  assert.match(nearbyCreate, /content_safety_flags/i);
  assert.match(nearbyCreate, /case when cardinality\(flags\) > 0 then 'held'::public\.melon_status else 'incubating'::public\.melon_status end/i);
  assert.match(nearbyCreate, /if new_status = 'incubating' then[\s\S]*insert into public\.economy_ledger/i);
  assert.doesNotMatch(nearbyCreate, /seed_ledger/i);
  assert.match(migration, /grant execute on function public\.create_nearby_melon\(uuid, uuid, text, text, public\.safe_topic, text, text, text\) to service_role/i);
  assert.doesNotMatch(migration, /grant execute on function public\.create_nearby_melon\([^;]+to authenticated/i);
});

test("melon create operationId is DB idempotency source for public spot and nearby", () => {
  assert.match(migration, /create table if not exists public\.melon_create_operations/);
  assert.match(migration, /primary key \(profile_id, operation_id\)/);
  assert.match(functionBody("create_melon"), /p_operation_id uuid/);
  assert.match(functionBody("create_nearby_melon"), /p_operation_id uuid/);
  assert.match(functionBody("create_melon"), /where op\.profile_id = actor and op\.operation_id = p_operation_id/);
  assert.match(functionBody("create_nearby_melon"), /where op\.profile_id = actor and op\.operation_id = p_operation_id/);
  assert.match(functionBody("create_melon"), /insert into public\.melon_create_operations/);
  assert.match(functionBody("create_nearby_melon"), /insert into public\.melon_create_operations/);
});

test("five-city fixture exercises every city instead of Changsha-only paths", () => {
  for (const cityId of cityIds) {
    assert.match(fixture, new RegExp(`id: "${cityId}"`), `${cityId} fixture must exist`);
  }
  assert.match(fixture, /export const fiveCityMatrix/);
  assert.match(fixture, /export function primarySpotForCity/);
});
