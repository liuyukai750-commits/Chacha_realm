import assert from "node:assert/strict";
import test from "node:test";
import { boundaryContainsPoint } from "./boundary";
import { distanceBandForMeters, haversineDistanceM } from "./distance";
import { isSeekTargetAllowed } from "./seek-safety";

test("Haversine returns zero for the same point and a known meridian distance", () => {
  assert.equal(haversineDistanceM({ latitude: 28, longitude: 113 }, { latitude: 28, longitude: 113 }), 0);
  const oneDegree = haversineDistanceM({ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 0 });
  assert.ok(Math.abs(oneDegree - 111_195) < 1);
});

test("Haversine rejects invalid coordinates", () => {
  assert.throws(
    () => haversineDistanceM({ latitude: 91, longitude: 0 }, { latitude: 0, longitude: 0 }),
    RangeError,
  );
});

test("distance bands include their upper thresholds", () => {
  assert.equal(distanceBandForMeters(1_000), "within_1km");
  assert.equal(distanceBandForMeters(1_000.01), "within_3km");
  assert.equal(distanceBandForMeters(3_000), "within_3km");
  assert.equal(distanceBandForMeters(8_000), "within_8km");
  assert.equal(distanceBandForMeters(20_000), "within_20km");
  assert.equal(distanceBandForMeters(20_000.01), "remote");
  assert.throws(() => distanceBandForMeters(-1), RangeError);
});

test("polygon edges count as inside while holes do not", () => {
  const boundary = {
    outer: [
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: 10 },
      { latitude: 10, longitude: 10 },
      { latitude: 10, longitude: 0 },
    ],
    holes: [[
      { latitude: 4, longitude: 4 },
      { latitude: 4, longitude: 6 },
      { latitude: 6, longitude: 6 },
      { latitude: 6, longitude: 4 },
    ]],
  } as const;

  assert.equal(boundaryContainsPoint(boundary, { latitude: 0, longitude: 5 }), true);
  assert.equal(boundaryContainsPoint(boundary, { latitude: 2, longitude: 2 }), true);
  assert.equal(boundaryContainsPoint(boundary, { latitude: 5, longitude: 5 }), false);
  assert.equal(boundaryContainsPoint(boundary, { latitude: 12, longitude: 5 }), false);
});

test("sensitive and private place categories can never become seek targets", () => {
  for (const category of ["hospital", "hotel", "company", "private_property"] as const) {
    assert.equal(
      isSeekTargetAllowed({ category, publicAccess: "open_public_space", status: "allowed" }),
      false,
      category,
    );
  }
  assert.equal(
    isSeekTargetAllowed({ category: "public_park", publicAccess: "restricted_or_private", status: "allowed" }),
    false,
  );
  assert.equal(
    isSeekTargetAllowed({ category: "public_square", publicAccess: "open_public_space", status: "allowed" }),
    true,
  );
});
