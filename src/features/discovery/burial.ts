import type { Coordinates } from "@/contracts";
import { getPublicSpot } from "@/data/geography";
import { haversineDistanceM, isValidCoordinates } from "@/lib/geo";
import { MAX_TRUSTED_ACCURACY_M } from "./location";
import type { BurialEligibility, LocationUnavailableReason } from "./types";

export const BURIAL_RADIUS_M = 500;

export interface BurialEligibilityInput {
  readonly spotId: string;
  readonly location?: Coordinates;
  readonly unavailableReason?: LocationUnavailableReason;
}

export function evaluateBurialEligibility(input: BurialEligibilityInput): BurialEligibility {
  if (input.unavailableReason) {
    return { eligible: false, reason: input.unavailableReason };
  }

  const spot = getPublicSpot(input.spotId);
  if (!spot) return { eligible: false, reason: "unknown_spot" };

  const location = input.location;
  if (!location || !isValidCoordinates(location)) {
    return { eligible: false, reason: "position_unavailable" };
  }

  const accuracyM = location.accuracyM;
  if (
    accuracyM === undefined ||
    !Number.isFinite(accuracyM) ||
    accuracyM < 0 ||
    accuracyM > MAX_TRUSTED_ACCURACY_M
  ) {
    return { eligible: false, reason: "low_accuracy", accuracyM };
  }

  const distanceM = haversineDistanceM(location, spot.coordinates);
  if (distanceM + accuracyM > BURIAL_RADIUS_M) {
    return { eligible: false, reason: "outside_500m", distanceM, accuracyM };
  }

  return { eligible: true, spotId: spot.id, distanceM };
}
