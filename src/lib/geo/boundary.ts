import type { Coordinates } from "@/contracts";
import type { CityGeography, GeoBoundary, GeoPoint, GeoRing } from "./types";
import { isValidCoordinates } from "./distance";

const BOUNDARY_EPSILON = 1e-10;

function isPointOnSegment(point: Coordinates, start: GeoPoint, end: GeoPoint): boolean {
  const cross =
    (point.longitude - start.longitude) * (end.latitude - start.latitude) -
    (point.latitude - start.latitude) * (end.longitude - start.longitude);
  if (Math.abs(cross) > BOUNDARY_EPSILON) return false;

  const dot =
    (point.longitude - start.longitude) * (end.longitude - start.longitude) +
    (point.latitude - start.latitude) * (end.latitude - start.latitude);
  if (dot < -BOUNDARY_EPSILON) return false;

  const squaredLength =
    (end.longitude - start.longitude) ** 2 + (end.latitude - start.latitude) ** 2;
  return dot <= squaredLength + BOUNDARY_EPSILON;
}

function ringContainsPoint(point: Coordinates, ring: GeoRing): boolean {
  if (ring.length < 3) return false;

  let inside = false;
  for (let currentIndex = 0, previousIndex = ring.length - 1; currentIndex < ring.length; previousIndex = currentIndex++) {
    const current = ring[currentIndex];
    const previous = ring[previousIndex];
    if (isPointOnSegment(point, previous, current)) return true;

    const crossesLatitude = current.latitude > point.latitude !== previous.latitude > point.latitude;
    if (!crossesLatitude) continue;
    const crossingLongitude =
      ((previous.longitude - current.longitude) * (point.latitude - current.latitude)) /
        (previous.latitude - current.latitude) +
      current.longitude;
    if (point.longitude < crossingLongitude) inside = !inside;
  }
  return inside;
}

export function boundaryContainsPoint(boundary: GeoBoundary, point: Coordinates): boolean {
  if (!isValidCoordinates(point) || !ringContainsPoint(point, boundary.outer)) return false;
  return !(boundary.holes ?? []).some((hole) => ringContainsPoint(point, hole));
}

export function findCityForCoordinates(
  point: Coordinates,
  cities: readonly CityGeography[],
): CityGeography | undefined {
  if (!isValidCoordinates(point)) return undefined;
  return cities.find((city) => city.boundaries.some((boundary) => boundaryContainsPoint(boundary, point)));
}
