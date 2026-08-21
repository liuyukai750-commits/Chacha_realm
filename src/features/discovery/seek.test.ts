import assert from "node:assert/strict";
import test from "node:test";
import type { LocationProof } from "../../contracts";
import { publicSpots } from "../../data/geography";
import { EARTH_RADIUS_M } from "../../lib/geo";
import { evaluateSeekState } from "./seek";

const NOW = "2026-08-09T12:00:00.000Z";
const spot = publicSpots.find((candidate) => candidate.id === "cs-wuyi-square")!;

function locationNorthOfSpot(distanceM: number, accuracyM: number, capturedAt = NOW): LocationProof {
  return {
    latitude: spot.coordinates.latitude + (distanceM / EARTH_RADIUS_M) * (180 / Math.PI),
    longitude: spot.coordinates.longitude,
    accuracyM,
    capturedAt,
  };
}

function seekAt(distanceM: number, accuracyM: number) {
  return evaluateSeekState({
    spotId: spot.id,
    location: locationNorthOfSpot(distanceM, accuracyM),
    now: NOW,
  });
}

test("classifies exact inclusive 500m, 1km and 3km thresholds", () => {
  assert.deepEqual(seekAt(500, 0), { ok: true, spotId: spot.id, seekState: "found" });
  assert.deepEqual(seekAt(500.01, 0), { ok: true, spotId: spot.id, seekState: "inside_zone" });
  assert.deepEqual(seekAt(1_000, 0), { ok: true, spotId: spot.id, seekState: "inside_zone" });
  assert.deepEqual(seekAt(1_000.01, 0), { ok: true, spotId: spot.id, seekState: "near" });
  assert.deepEqual(seekAt(3_000, 0), { ok: true, spotId: spot.id, seekState: "near" });
  assert.deepEqual(seekAt(3_000.01, 0), { ok: true, spotId: spot.id, seekState: "outside" });
});

test("handles representative iOS, Android and HarmonyOS accuracy without leaking coordinates", () => {
  const platformCases = [
    { platform: "iOS", distanceM: 480, accuracyM: 5, seekState: "found" },
    { platform: "Android", distanceM: 950, accuracyM: 25, seekState: "inside_zone" },
    { platform: "HarmonyOS", distanceM: 2_000, accuracyM: 50, seekState: "near" },
    { platform: "HarmonyOS outside", distanceM: 3_100, accuracyM: 50, seekState: "outside" },
  ] as const;

  for (const platformCase of platformCases) {
    const result = seekAt(platformCase.distanceM, platformCase.accuracyM);
    assert.deepEqual(
      result,
      { ok: true, spotId: spot.id, seekState: platformCase.seekState },
      platformCase.platform,
    );
    const serialized = JSON.stringify(result);
    assert.equal(serialized.includes("latitude"), false);
    assert.equal(serialized.includes("longitude"), false);
    assert.equal(serialized.includes("capturedAt"), false);
  }
});

test("returns boundary_uncertain whenever the accuracy interval crosses a state boundary", () => {
  for (const [distanceM, accuracyM] of [
    [490, 20],
    [510, 20],
    [990, 20],
    [1_010, 20],
    [2_990, 20],
    [3_010, 20],
  ] as const) {
    assert.deepEqual(seekAt(distanceM, accuracyM), {
      ok: false,
      reason: "boundary_uncertain",
      accuracyM,
    });
  }
});

test("rejects low-accuracy, missing-accuracy, stale and implausibly future proofs explicitly", () => {
  assert.deepEqual(seekAt(100, 101), { ok: false, reason: "low_accuracy", accuracyM: 101 });
  assert.deepEqual(
    evaluateSeekState({
      spotId: spot.id,
      location: { ...locationNorthOfSpot(100, 10), accuracyM: undefined },
      now: NOW,
    }),
    { ok: false, reason: "low_accuracy", accuracyM: undefined },
  );
  assert.deepEqual(
    evaluateSeekState({
      spotId: spot.id,
      location: locationNorthOfSpot(100, 10, "2026-08-09T11:54:59.999Z"),
      now: NOW,
    }),
    { ok: false, reason: "stale_location" },
  );
  assert.deepEqual(
    evaluateSeekState({
      spotId: spot.id,
      location: locationNorthOfSpot(100, 10, "2026-08-09T12:00:30.001Z"),
      now: NOW,
    }),
    { ok: false, reason: "future_location" },
  );
});

test("only configured and reviewed public spots can be evaluated", () => {
  assert.deepEqual(
    evaluateSeekState({ spotId: "missing", location: locationNorthOfSpot(100, 10), now: NOW }),
    { ok: false, reason: "unknown_spot" },
  );
  const pendingSpot = publicSpots.find((candidate) => candidate.seekSafety.status === "review_required")!;
  assert.deepEqual(
    evaluateSeekState({
      spotId: pendingSpot.id,
      location: {
        ...pendingSpot.coordinates,
        accuracyM: 10,
        capturedAt: NOW,
      },
      now: NOW,
    }),
    { ok: false, reason: "seek_target_review_required" },
  );
});
