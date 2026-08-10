export const PUBLIC_SPOT_SCENE_RADIUS_M = 500;

/**
 * Claims a landmark scene only when the whole browser accuracy range is inside
 * the public spot radius. The UI never receives the measured distance.
 */
export function isInsidePublicSpotScene(
  measuredDistanceM: number,
  accuracyM: number,
): boolean {
  if (!Number.isFinite(measuredDistanceM) || measuredDistanceM < 0) return false;
  if (!Number.isFinite(accuracyM) || accuracyM < 0) return false;
  return measuredDistanceM + accuracyM <= PUBLIC_SPOT_SCENE_RADIUS_M;
}
