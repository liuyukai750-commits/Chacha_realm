import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const migrationPath = "supabase/migrations/202608150003_precise_burial_anchors.sql";
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";
const repository = readFileSync("src/server/repositories/island-repository.ts", "utf8");
const createRoute = readFileSync("src/app/api/melons/route.ts", "utf8");
const presenceRoute = readFileSync("src/app/api/presence/verify/route.ts", "utf8");
const detailRoute = readFileSync("src/app/api/melons/[id]/route.ts", "utf8");
const commentsRoute = readFileSync("src/app/api/melons/[id]/comments/route.ts", "utf8");
const burySheet = readFileSync("src/components/bury-sheet-v1.tsx", "utf8");

test("nearby burial persists a private fixed point and uses an exact one-kilometre query", () => {
  assert.ok(migration, "precise burial migration must exist");
  assert.match(migration, /create table(?: if not exists)? public\.melon_location_anchors/i);
  assert.match(migration, /latitude double precision/i);
  assert.match(migration, /longitude double precision/i);
  assert.match(migration, /revoke all on public\.melon_location_anchors from public, anon, authenticated/i);
  assert.match(migration, /insert into public\.melon_location_anchors/i);
  assert.match(migration, /<=\s*1000(?:\.0+)?/i);
  assert.doesNotMatch(migration, /'latitude'|'longitude'|'nearbyCellId'/i);
});

test("public-zone melons are city-wide readable while nearby melons require a located visitor within one kilometre", () => {
  assert.match(migration, /m\.burial_kind = 'public_spot'[\s\S]*s\.city_id = p_city_id/i);
  assert.match(migration, /m\.burial_kind = 'nearby_area'[\s\S]*p_latitude is not null[\s\S]*<=\s*1000/i);
  assert.match(repository, /get_discovery_candidates_for_visitor_v2/);
  assert.doesNotMatch(repository, /nearbyCellIdForLocation\(activeCityId/);
});

test("public-zone publication validates city eligibility without persisting the publisher location", () => {
  const baseBlock = createRoute.match(/const base = \{[\s\S]*?\n\s*\};/)?.[0] ?? "";
  assert.match(createRoute, /const location = validateLocationProof\(body\.location\)/);
  assert.match(createRoute, /burialKind: "public_spot"[\s\S]*spotId:[^}]+location/);
  assert.doesNotMatch(baseBlock, /location:\s*validateLocationProof/);
  assert.match(repository, /resolveSupportedCityForBurial\(input\.location\)/);
  assert.match(repository, /p_latitude:\s*nearbyBurial \? input\.location!\.latitude : null/);
  assert.match(repository, /p_longitude:\s*nearbyBurial \? input\.location!\.longitude : null/);
  assert.doesNotMatch(repository, /requireSafeSeek\(input\.spotId, input\.location\)/);
  assert.match(burySheet, /公共地点[\s\S]*无需到场/);
});

test("comment presence uses one kilometre for both a private nearby anchor and a public-zone centre", () => {
  assert.match(migration, /create or replace function public\.get_melon_presence_target_v2/i);
  assert.match(migration, /'withinOneKm'/i);
  assert.match(presenceRoute, /target\.withinOneKm/);
  assert.doesNotMatch(presenceRoute, /nearbyCellIdForLocation|requireSafeSeek/);
});

test("nearby melon detail and comments cannot be reopened by id outside the one-kilometre gate", () => {
  assert.match(detailRoute, /burialKind === "nearby_area"[\s\S]*requirePresenceCredential/);
  assert.match(commentsRoute, /burialKind === "nearby_area"[\s\S]*requirePresenceCredential/);
  assert.match(migration, /revoke all on function public\.get_melon_comments[\s\S]*from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.get_melon_comments[\s\S]*to service_role/i);
});
