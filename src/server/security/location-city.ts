import type { CityId, Coordinates } from "@/contracts";
import { cities } from "@/data/geography";
import { findCityForCoordinates } from "@/lib/geo";
import { ApiProblem } from "@/server/api";

const MAX_CITY_BURIAL_ACCURACY_M = 100;
const METERS_PER_LATITUDE_DEGREE = 111_320;

function offsetByMeters(point: Coordinates, northM: number, eastM: number): Coordinates {
  const latitude = point.latitude + northM / METERS_PER_LATITUDE_DEGREE;
  const longitudeScale = METERS_PER_LATITUDE_DEGREE * Math.max(0.2, Math.cos(point.latitude * Math.PI / 180));
  const longitude = point.longitude + eastM / longitudeScale;
  return { latitude, longitude };
}

function cityAt(point: Coordinates): CityId | undefined {
  return findCityForCoordinates(point, cities)?.id;
}

export function resolveSupportedCityForBurial(location: Coordinates): CityId {
  const accuracyM = location.accuracyM;
  if (
    accuracyM === undefined ||
    !Number.isFinite(accuracyM) ||
    accuracyM < 0 ||
    accuracyM > MAX_CITY_BURIAL_ACCURACY_M
  ) {
    throw new ApiProblem(403, "nearby_city_unavailable", "当前位置尚未开放埋瓜");
  }

  const resolvedCityId = cityAt(location);
  if (!resolvedCityId) {
    throw new ApiProblem(403, "nearby_city_unavailable", "当前位置尚未开放埋瓜");
  }

  const samples = [
    offsetByMeters(location, accuracyM, 0),
    offsetByMeters(location, -accuracyM, 0),
    offsetByMeters(location, 0, accuracyM),
    offsetByMeters(location, 0, -accuracyM),
  ];
  if (samples.some((point) => cityAt(point) !== resolvedCityId)) {
    throw new ApiProblem(403, "nearby_city_unavailable", "当前位置尚未开放埋瓜");
  }

  return resolvedCityId;
}
