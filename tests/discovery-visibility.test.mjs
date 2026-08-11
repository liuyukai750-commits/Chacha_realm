import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";

const source = stripTypeScriptTypes(
  readFileSync(new URL("../src/server/repositories/discovery-visibility.ts", import.meta.url), "utf8"),
);
const { isDiscoveryItemVisible } = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
);

const nearbyMelon = { burialKind: "nearby_area", distanceBand: "within_1km", spotId: "nearby-life-circle" };
const landmarkMelon = { burialKind: "public_spot", distanceBand: "within_1km", spotId: "spot-a" };

test("nearby 1 km only returns life-circle melons", () => {
  const context = { hasLocation: true, sceneKind: "nearby_area" };
  assert.equal(isDiscoveryItemVisible(context, nearbyMelon), true);
  assert.equal(isDiscoveryItemVisible(context, landmarkMelon), false);
  assert.equal(isDiscoveryItemVisible(context, { ...nearbyMelon, distanceBand: "within_3km" }), false);
});

test("public spot only returns melons from that exact landmark", () => {
  const context = { hasLocation: true, sceneKind: "public_spot", activeSpotId: "spot-a" };
  assert.equal(isDiscoveryItemVisible(context, landmarkMelon), true);
  assert.equal(isDiscoveryItemVisible(context, { ...landmarkMelon, spotId: "spot-b" }), false);
  assert.equal(isDiscoveryItemVisible(context, nearbyMelon), false);
});

test("city browsing without location keeps city and remote fallback candidates", () => {
  const context = { hasLocation: false, sceneKind: "city_overview" };
  assert.equal(isDiscoveryItemVisible(context, nearbyMelon), true);
  assert.equal(isDiscoveryItemVisible(context, { ...landmarkMelon, distanceBand: "remote" }), true);
});
