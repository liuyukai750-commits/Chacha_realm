import assert from "node:assert/strict";
import test from "node:test";
import { cities, publicSpots, toPublicSpotSummary } from "./geography";

test("ships five cities and exactly five public spots per city", () => {
  assert.equal(cities.length, 5);
  assert.equal(publicSpots.length, 25);
  for (const city of cities) {
    assert.equal(publicSpots.filter((spot) => spot.cityId === city.id).length, 5, city.name);
  }
});

test("spot identifiers, coordinates and district ownership are internally valid", () => {
  assert.equal(new Set(publicSpots.map((spot) => spot.id)).size, publicSpots.length);
  for (const spot of publicSpots) {
    const city = cities.find((candidate) => candidate.id === spot.cityId);
    assert.ok(city, spot.id);
    assert.ok(city.districts.some((district) => district.id === spot.districtId), spot.id);
    assert.ok(spot.coordinates.latitude >= -90 && spot.coordinates.latitude <= 90, spot.id);
    assert.ok(spot.coordinates.longitude >= -180 && spot.coordinates.longitude <= 180, spot.id);
    assert.equal("accuracyM" in spot.coordinates, false, spot.id);
  }
});

test("public summaries cannot expose coordinates or verification metadata", () => {
  const summary = toPublicSpotSummary(publicSpots[0]);
  assert.deepEqual(Object.keys(summary).sort(), ["cityId", "districtId", "id", "name"]);
  assert.equal("coordinates" in summary, false);
  assert.equal("verification" in summary, false);
});
