import type { CityId, CityOpeningState } from "../contracts/index.ts";

import { nextChinaEightPm, timestampMs } from "./time.ts";

export const V0_CITY_IDS: readonly CityId[] = [
  "changsha",
  "beijing",
  "shanghai",
  "guangzhou",
  "shenzhen",
];

export const CITY_OPENING_THRESHOLDS = {
  safeMelons: 30,
  distinctAuthors: 25,
  distinctSpots: 3,
  distinctTopics: 3,
} as const;

export interface CityOpeningMetrics {
  safeMelons: number;
  distinctAuthors: number;
  distinctSpots: number;
  distinctTopics: number;
}

export interface CityOpeningInput {
  cityId: CityId;
  metrics: CityOpeningMetrics;
  thresholdReachedAt?: string;
  now: string;
}

export function hasReachedCityOpeningThresholds(metrics: CityOpeningMetrics): boolean {
  assertMetrics(metrics);
  return (Object.keys(CITY_OPENING_THRESHOLDS) as Array<keyof CityOpeningMetrics>).every(
    (key) => metrics[key] >= CITY_OPENING_THRESHOLDS[key],
  );
}

export function evaluateCityOpening(input: CityOpeningInput): CityOpeningState {
  timestampMs(input.now, "now");
  const base = { cityId: input.cityId, ...input.metrics };

  if (!hasReachedCityOpeningThresholds(input.metrics)) {
    return { ...base, status: "gathering" };
  }

  if (!input.thresholdReachedAt) {
    throw new RangeError("thresholdReachedAt is required after all opening thresholds are reached");
  }

  const opensAt = nextChinaEightPm(input.thresholdReachedAt);
  return {
    ...base,
    status: timestampMs(input.now, "now") >= timestampMs(opensAt, "opensAt") ? "open" : "countdown",
    opensAt,
  };
}

function assertMetrics(metrics: CityOpeningMetrics): void {
  for (const [key, value] of Object.entries(metrics)) {
    if (!Number.isInteger(value) || value < 0) {
      throw new RangeError(`${key} must be a non-negative integer`);
    }
  }
}
