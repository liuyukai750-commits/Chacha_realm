import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";

const source = stripTypeScriptTypes(readFileSync(new URL("./discovery-scene.ts", import.meta.url), "utf8"));
const { isInsidePublicSpotScene } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

test("keeps the landmark scene when the full accuracy range is within 500m", () => {
  assert.equal(isInsidePublicSpotScene(480, 20), true);
});

test("uses the generic nearby scene when accuracy crosses the 500m boundary", () => {
  assert.equal(isInsidePublicSpotScene(481, 20), false);
  assert.equal(isInsidePublicSpotScene(501, 0), false);
});

test("rejects invalid measurements instead of claiming a landmark", () => {
  assert.equal(isInsidePublicSpotScene(Number.NaN, 10), false);
  assert.equal(isInsidePublicSpotScene(100, -1), false);
});
