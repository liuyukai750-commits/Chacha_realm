import type { Coordinates, DistanceBand } from "../../contracts";

export const EARTH_RADIUS_M = 6_371_008.8;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function isValidCoordinates(value: Coordinates): boolean {
  return (
    Number.isFinite(value.latitude) &&
    Number.isFinite(value.longitude) &&
    value.latitude >= -90 &&
    value.latitude <= 90 &&
    value.longitude >= -180 &&
    value.longitude <= 180
  );
}

export function haversineDistanceM(from: Coordinates, to: Coordinates): number {
  if (!isValidCoordinates(from) || !isValidCoordinates(to)) {
    throw new RangeError("Coordinates must contain finite WGS84 latitude and longitude values.");
  }

  const fromLatitude = toRadians(from.latitude);
  const toLatitude = toRadians(to.latitude);
  const latitudeDelta = toLatitude - fromLatitude;
  const longitudeDelta = toRadians(to.longitude - from.longitude);
  const sinLatitude = Math.sin(latitudeDelta / 2);
  const sinLongitude = Math.sin(longitudeDelta / 2);
  const haversine =
    sinLatitude * sinLatitude +
    Math.cos(fromLatitude) * Math.cos(toLatitude) * sinLongitude * sinLongitude;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(haversine)));
}

export function distanceBandForMeters(distanceM: number): DistanceBand {
  if (!Number.isFinite(distanceM) || distanceM < 0) {
    throw new RangeError("Distance must be a finite non-negative number.");
  }
  if (distanceM <= 1_000) return "within_1km";
  if (distanceM <= 3_000) return "within_3km";
  if (distanceM <= 8_000) return "within_8km";
  if (distanceM <= 20_000) return "within_20km";
  return "remote";
}
