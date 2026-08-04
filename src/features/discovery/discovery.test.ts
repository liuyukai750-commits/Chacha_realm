import assert from "node:assert/strict";
import test from "node:test";
import { publicSpots } from "../../data/geography";
import { evaluateBurialEligibility } from "./burial";
import { resolveVisitorLocation } from "./location";
import { fillDiscoveryPools, rankDiscoveryCandidates } from "./ranking";
import type { DiscoveryCandidate, LocationUnavailableReason } from "./types";

test("location refusal and browser capability failures stay explicit", () => {
  const reasons: LocationUnavailableReason[] = [
    "permission_denied",
    "position_unavailable",
    "timeout",
    "unsupported",
    "insecure_context",
  ];
  for (const reason of reasons) {
    assert.deepEqual(resolveVisitorLocation({ unavailableReason: reason }), {
      kind: "unavailable",
      visitorType: "location_unknown",
      reason,
    });
  }
});

test("low precision, city boundaries and outsiders have distinct results", () => {
  assert.deepEqual(resolveVisitorLocation({ location: { latitude: 28.2, longitude: 113, accuracyM: 101 } }), {
    kind: "unavailable",
    visitorType: "location_unknown",
    reason: "low_accuracy",
    accuracyM: 101,
  });
  assert.deepEqual(resolveVisitorLocation({ location: { latitude: 27.85, longitude: 110.88, accuracyM: 20 } }), {
    kind: "located",
    visitorType: "local",
    cityId: "changsha",
  });
  assert.deepEqual(resolveVisitorLocation({ location: { latitude: 30.5928, longitude: 114.3055, accuracyM: 20 } }), {
    kind: "outsider",
    visitorType: "outsider",
    reason: "outside_supported_cities",
  });
});

test("burial accepts a precise nearby fix and never requires local residency", () => {
  const spot = publicSpots[0];
  const result = evaluateBurialEligibility({
    spotId: spot.id,
    location: { ...spot.coordinates, accuracyM: 15 },
  });
  assert.equal(result.eligible, true);
  if (result.eligible) assert.equal(result.distanceM, 0);
});

test("burial rejects missing precision, low precision, uncertain boundary and unknown spots", () => {
  const spot = publicSpots[0];
  assert.deepEqual(
    evaluateBurialEligibility({ spotId: spot.id, location: spot.coordinates }),
    { eligible: false, reason: "low_accuracy", accuracyM: undefined },
  );
  assert.deepEqual(
    evaluateBurialEligibility({ spotId: spot.id, location: { ...spot.coordinates, accuracyM: 101 } }),
    { eligible: false, reason: "low_accuracy", accuracyM: 101 },
  );

  const uncertain = evaluateBurialEligibility({
    spotId: spot.id,
    location: {
      latitude: spot.coordinates.latitude + 440 / 111_195,
      longitude: spot.coordinates.longitude,
      accuracyM: 70,
    },
  });
  assert.equal(uncertain.eligible, false);
  if (!uncertain.eligible) assert.equal(uncertain.reason, "outside_500m");
  assert.deepEqual(evaluateBurialEligibility({ spotId: "missing", location: { ...spot.coordinates, accuracyM: 5 } }), {
    eligible: false,
    reason: "unknown_spot",
  });
});

test("ranking orders same district, same city, then remote without exposing coordinates", () => {
  const candidates: DiscoveryCandidate[] = [
    { id: "remote", cityId: "beijing", districtId: "bj-dongcheng", coordinates: { latitude: 39.9, longitude: 116.4 } },
    { id: "city", cityId: "changsha", districtId: "cs-furong", coordinates: { latitude: 28.2, longitude: 112.97 } },
    { id: "district", cityId: "changsha", districtId: "cs-yuelu", coordinates: { latitude: 28.19, longitude: 112.95 } },
  ];
  const ranked = rankDiscoveryCandidates({
    candidates,
    location: { latitude: 28.19, longitude: 112.95 },
    activeCityId: "changsha",
    districtId: "cs-yuelu",
  });

  assert.deepEqual(ranked.map((item) => item.id), ["district", "city", "remote"]);
  assert.deepEqual(ranked.map((item) => item.source), ["same_district", "same_city", "remote_city"]);
  assert.equal(ranked[2].distanceBand, "remote");
  for (const item of ranked) {
    assert.equal("coordinates" in item, false);
    assert.equal("distanceM" in item, false);
  }
});

test("pool fill deduplicates and falls back all the way to remote", () => {
  const filled = fillDiscoveryPools({
    sameDistrict: [{ id: "a" }],
    sameCity: [{ id: "a" }, { id: "b" }],
    remoteCity: [{ id: "c" }, { id: "d" }],
    limit: 3,
    visitorType: "local",
  });
  assert.deepEqual(filled.items.map((item) => item.id), ["a", "b", "c"]);
  assert.equal(filled.localEmpty, false);

  const remoteOnly = fillDiscoveryPools({
    sameDistrict: [],
    sameCity: [],
    remoteCity: [{ id: "remote" }],
    limit: 10,
    visitorType: "outsider",
  });
  assert.deepEqual(remoteOnly.items, [{ id: "remote" }]);
  assert.equal(remoteOnly.localEmpty, true);

  const empty = fillDiscoveryPools({
    sameDistrict: [], sameCity: [], remoteCity: [], limit: 10, visitorType: "location_unknown",
  });
  assert.deepEqual(empty.items, []);
  assert.equal(empty.localEmpty, true);
  assert.throws(
    () => fillDiscoveryPools({ sameDistrict: [], sameCity: [], remoteCity: [], limit: -1, visitorType: "local" }),
    RangeError,
  );
});
