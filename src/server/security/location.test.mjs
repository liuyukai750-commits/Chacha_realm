import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";

let source = readFileSync(new URL("./location.ts", import.meta.url), "utf8");
source = source
  .replace('import { ApiProblem } from "@/server/api";', 'class ApiProblem extends Error { constructor(status, code, message) { super(message); this.status = status; this.code = code; } }')
  .replace('export { distanceMeters, toDistanceBand } from "@/server/security/location-math";', "");
const { validateLocationProof } = await import(
  `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString("base64")}`
);

test("accepts a fresh bounded location proof", () => {
  const now = Date.parse("2026-08-04T12:00:00.000Z");
  assert.deepEqual(
    validateLocationProof(
      { latitude: 28.19502, longitude: 112.97667, accuracyM: 15, capturedAt: "2026-08-04T11:59:30.000Z" },
      now,
    ),
    { latitude: 28.19502, longitude: 112.97667, accuracyM: 15, capturedAt: "2026-08-04T11:59:30.000Z" },
  );
});

test("rejects stale location proof", () => {
  const now = Date.parse("2026-08-04T12:10:00.000Z");
  assert.throws(
    () => validateLocationProof({ latitude: 28, longitude: 113, capturedAt: "2026-08-04T12:00:00.000Z" }, now),
    (error) => error.code === "stale_location" && error.status === 400,
  );
});

test("rejects coordinates and accuracy outside accepted bounds", () => {
  const now = Date.parse("2026-08-04T12:00:00.000Z");
  assert.throws(
    () => validateLocationProof({ latitude: 91, longitude: 113, capturedAt: "2026-08-04T12:00:00.000Z" }, now),
    (error) => error.code === "invalid_location",
  );
  assert.throws(
    () => validateLocationProof({ latitude: 28, longitude: 113, accuracyM: 1001, capturedAt: "2026-08-04T12:00:00.000Z" }, now),
    (error) => error.code === "location_too_imprecise",
  );
});
