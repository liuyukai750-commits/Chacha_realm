import type { LocationProof, SeekState } from "../../contracts";
import { getPublicSpot } from "../../data/geography";
import { haversineDistanceM, isSeekTargetAllowed, isValidCoordinates } from "../../lib/geo";
import type { LocationUnavailableReason, SeekEvaluation } from "./types";

export const SEEK_DISTANCE_THRESHOLDS_M = {
  found: 500,
  insideZone: 1_000,
  near: 3_000,
} as const;

export const MAX_SEEK_ACCURACY_M = 100;
export const MAX_SEEK_LOCATION_AGE_MS = 5 * 60 * 1_000;
export const MAX_SEEK_FUTURE_SKEW_MS = 30 * 1_000;

const DISTANCE_EPSILON_M = 1e-6;

export interface EvaluateSeekStateInput {
  readonly spotId: string;
  readonly location?: LocationProof;
  readonly unavailableReason?: LocationUnavailableReason;
  readonly now?: number | string | Date;
}

function timestampMs(value: number | string | Date): number {
  if (typeof value === "number") return value;
  return value instanceof Date ? value.getTime() : Date.parse(value);
}

function stateForCertainRange(lowerDistanceM: number, upperDistanceM: number): SeekState | undefined {
  if (upperDistanceM <= SEEK_DISTANCE_THRESHOLDS_M.found + DISTANCE_EPSILON_M) return "found";
  if (
    lowerDistanceM > SEEK_DISTANCE_THRESHOLDS_M.found + DISTANCE_EPSILON_M &&
    upperDistanceM <= SEEK_DISTANCE_THRESHOLDS_M.insideZone + DISTANCE_EPSILON_M
  ) {
    return "inside_zone";
  }
  if (
    lowerDistanceM > SEEK_DISTANCE_THRESHOLDS_M.insideZone + DISTANCE_EPSILON_M &&
    upperDistanceM <= SEEK_DISTANCE_THRESHOLDS_M.near + DISTANCE_EPSILON_M
  ) {
    return "near";
  }
  if (lowerDistanceM > SEEK_DISTANCE_THRESHOLDS_M.near + DISTANCE_EPSILON_M) return "outside";
  return undefined;
}

/**
 * Evaluates a single, ephemeral location proof against one configured public spot.
 * The returned value intentionally contains neither the user coordinates nor a route,
 * trajectory, raw timestamp, or exact distance.
 */
export function evaluateSeekState(input: EvaluateSeekStateInput): SeekEvaluation {
  if (input.unavailableReason) return { ok: false, reason: input.unavailableReason };

  const spot = getPublicSpot(input.spotId);
  if (!spot) return { ok: false, reason: "unknown_spot" };
  if (spot.seekSafety.status === "review_required") {
    return { ok: false, reason: "seek_target_review_required" };
  }
  if (!isSeekTargetAllowed(spot.seekSafety)) return { ok: false, reason: "seek_not_allowed" };

  const location = input.location;
  if (!location || !isValidCoordinates(location)) return { ok: false, reason: "invalid_location" };

  const accuracyM = location.accuracyM;
  if (
    accuracyM === undefined ||
    !Number.isFinite(accuracyM) ||
    accuracyM < 0 ||
    accuracyM > MAX_SEEK_ACCURACY_M
  ) {
    return { ok: false, reason: "low_accuracy", accuracyM };
  }

  const capturedAtMs = Date.parse(location.capturedAt);
  const nowMs = timestampMs(input.now ?? Date.now());
  if (!Number.isFinite(capturedAtMs) || !Number.isFinite(nowMs)) {
    return { ok: false, reason: "invalid_location" };
  }
  if (capturedAtMs < nowMs - MAX_SEEK_LOCATION_AGE_MS) {
    return { ok: false, reason: "stale_location" };
  }
  if (capturedAtMs > nowMs + MAX_SEEK_FUTURE_SKEW_MS) {
    return { ok: false, reason: "future_location" };
  }

  const measuredDistanceM = haversineDistanceM(location, spot.coordinates);
  const lowerDistanceM = Math.max(0, measuredDistanceM - accuracyM);
  const upperDistanceM = measuredDistanceM + accuracyM;
  const seekState = stateForCertainRange(lowerDistanceM, upperDistanceM);
  if (!seekState) return { ok: false, reason: "boundary_uncertain", accuracyM };

  return { ok: true, spotId: spot.id, seekState };
}
