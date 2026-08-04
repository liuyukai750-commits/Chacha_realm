import type { LocationProof } from "@/contracts";

import { ApiProblem } from "@/server/api";

const MAX_LOCATION_AGE_MS = 5 * 60 * 1000;
const MAX_FUTURE_SKEW_MS = 30 * 1000;

export { distanceMeters, toDistanceBand } from "@/server/security/location-math";

export function validateLocationProof(value: unknown, now = Date.now()): LocationProof {
  if (!value || typeof value !== "object") {
    throw new ApiProblem(400, "invalid_location", "需要有效的位置证明。 ");
  }
  const input = value as Record<string, unknown>;
  const latitude = input.latitude;
  const longitude = input.longitude;
  const accuracyM = input.accuracyM;
  const capturedAt = input.capturedAt;
  if (
    typeof latitude !== "number" ||
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    typeof longitude !== "number" ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180 ||
    typeof capturedAt !== "string"
  ) {
    throw new ApiProblem(400, "invalid_location", "位置证明格式无效。 ");
  }
  if (accuracyM !== undefined && (typeof accuracyM !== "number" || accuracyM < 0 || accuracyM > 1000)) {
    throw new ApiProblem(400, "location_too_imprecise", "当前位置精度不足，请靠近公共地点后重试。 ");
  }
  const capturedTime = Date.parse(capturedAt);
  if (!Number.isFinite(capturedTime) || capturedTime < now - MAX_LOCATION_AGE_MS || capturedTime > now + MAX_FUTURE_SKEW_MS) {
    throw new ApiProblem(400, "stale_location", "位置证明已过期，请重新获取位置。 ");
  }
  return { latitude, longitude, accuracyM: accuracyM as number | undefined, capturedAt };
}
