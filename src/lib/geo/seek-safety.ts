import type { SeekSafetyMetadata } from "./types";

const SAFE_PUBLIC_CATEGORIES = new Set<SeekSafetyMetadata["category"]>([
  "public_square",
  "public_park",
  "cultural_venue",
]);

/**
 * Defense-in-depth guard for public seek targets. It deliberately rejects an
 * inconsistent record even if a sensitive category is accidentally marked allowed.
 */
export function isSeekTargetAllowed(safety: SeekSafetyMetadata): boolean {
  return (
    safety.status === "allowed" &&
    safety.publicAccess !== "restricted_or_private" &&
    SAFE_PUBLIC_CATEGORIES.has(safety.category)
  );
}
