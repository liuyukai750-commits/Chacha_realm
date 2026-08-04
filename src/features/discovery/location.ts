import type { Coordinates } from "../../contracts";
import { cities } from "../../data/geography";
import { findCityForCoordinates, isValidCoordinates } from "../../lib/geo";
import type { LocationResult, LocationUnavailableReason } from "./types";

export const MAX_TRUSTED_ACCURACY_M = 100;

export interface ResolveLocationInput {
  readonly location?: Coordinates;
  readonly unavailableReason?: LocationUnavailableReason;
}

export function resolveVisitorLocation(input: ResolveLocationInput): LocationResult {
  if (input.unavailableReason) {
    return {
      kind: "unavailable",
      visitorType: "location_unknown",
      reason: input.unavailableReason,
    };
  }

  const location = input.location;
  if (!location || !isValidCoordinates(location)) {
    return {
      kind: "unavailable",
      visitorType: "location_unknown",
      reason: "position_unavailable",
    };
  }

  if (
    location.accuracyM !== undefined &&
    (!Number.isFinite(location.accuracyM) || location.accuracyM < 0 || location.accuracyM > MAX_TRUSTED_ACCURACY_M)
  ) {
    return {
      kind: "unavailable",
      visitorType: "location_unknown",
      reason: "low_accuracy",
      accuracyM: location.accuracyM,
    };
  }

  const city = findCityForCoordinates(location, cities);
  if (!city) {
    return {
      kind: "outsider",
      visitorType: "outsider",
      reason: "outside_supported_cities",
    };
  }

  return { kind: "located", visitorType: "local", cityId: city.id };
}
