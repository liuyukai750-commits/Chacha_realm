import type { Coordinates, DistanceBand } from "@/contracts";

const EARTH_RADIUS_M = 6_371_000;

function radians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function distanceMeters(from: Coordinates, to: Coordinates): number {
  const latitudeDelta = radians(to.latitude - from.latitude);
  const longitudeDelta = radians(to.longitude - from.longitude);
  const fromLatitude = radians(from.latitude);
  const toLatitude = radians(to.latitude);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

export function toDistanceBand(distanceM: number): DistanceBand {
  if (distanceM <= 1_000) return "within_1km";
  if (distanceM <= 3_000) return "within_3km";
  if (distanceM <= 8_000) return "within_8km";
  if (distanceM <= 20_000) return "within_20km";
  return "remote";
}
