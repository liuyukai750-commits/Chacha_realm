import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";

const source = stripTypeScriptTypes(readFileSync(new URL("./location-math.ts", import.meta.url), "utf8"));
const { distanceMeters, toDistanceBand } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

test("computes zero distance for the same point", () => {
  assert.equal(distanceMeters({ latitude: 28.19502, longitude: 112.97667 }, { latitude: 28.19502, longitude: 112.97667 }), 0);
});

test("maps distance boundaries to the public contract bands", () => {
  assert.equal(toDistanceBand(1_000), "within_1km");
  assert.equal(toDistanceBand(1_001), "within_3km");
  assert.equal(toDistanceBand(3_001), "within_8km");
  assert.equal(toDistanceBand(8_001), "within_20km");
  assert.equal(toDistanceBand(20_001), "remote");
});

test("produces a plausible distance for one degree of longitude near the equator", () => {
  const distance = distanceMeters({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 });
  assert.ok(distance > 111_000 && distance < 112_000);
});
