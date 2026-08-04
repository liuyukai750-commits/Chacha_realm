import { DAY_MS, timestampMs } from "./time";

export type DiscoveryLocality = "same_district" | "same_city" | "remote_city";

export interface DiscoveryCandidate {
  id: string;
  locality: DiscoveryLocality;
  maturedAt: string;
  validReadCount: number;
}

export interface DiscoveryScore {
  localityRank: 1 | 2 | 3;
  freshnessPoints: number;
  engagementPoints: number;
  total: number;
}

const LOCALITY_RANK: Record<DiscoveryLocality, DiscoveryScore["localityRank"]> = {
  same_district: 3,
  same_city: 2,
  remote_city: 1,
};

const FRESHNESS_WINDOW_MS = 7 * DAY_MS;
const LOCALITY_WEIGHT = 1_000_000_000;
const FRESHNESS_WEIGHT = 10_000;
const MAX_ENGAGEMENT_READS = 10_000;
const ENGAGEMENT_POINTS_PER_READ = 10;

export function calculateDiscoveryScore(
  candidate: DiscoveryCandidate,
  now: string,
): DiscoveryScore {
  if (!Number.isInteger(candidate.validReadCount) || candidate.validReadCount < 0) {
    throw new RangeError("validReadCount must be a non-negative integer");
  }

  const nowMs = timestampMs(now, "now");
  const maturedAtMs = timestampMs(candidate.maturedAt, "maturedAt");
  const ageMinutes = Math.floor(Math.max(0, nowMs - maturedAtMs) / 60_000);
  const freshnessWindowMinutes = FRESHNESS_WINDOW_MS / 60_000;
  const freshnessPoints = Math.max(0, freshnessWindowMinutes - ageMinutes);
  const engagementPoints =
    Math.min(candidate.validReadCount, MAX_ENGAGEMENT_READS) * ENGAGEMENT_POINTS_PER_READ;
  const localityRank = LOCALITY_RANK[candidate.locality];

  return {
    localityRank,
    freshnessPoints,
    engagementPoints,
    total:
      localityRank * LOCALITY_WEIGHT + freshnessPoints * FRESHNESS_WEIGHT + engagementPoints,
  };
}

export function rankDiscoveryCandidates(
  candidates: readonly DiscoveryCandidate[],
  now: string,
): DiscoveryCandidate[] {
  return [...candidates].sort((left, right) => {
    const scoreDifference =
      calculateDiscoveryScore(right, now).total - calculateDiscoveryScore(left, now).total;
    if (scoreDifference !== 0) return scoreDifference;
    if (left.maturedAt !== right.maturedAt) return left.maturedAt > right.maturedAt ? -1 : 1;
    if (left.id === right.id) return 0;
    return left.id < right.id ? -1 : 1;
  });
}
