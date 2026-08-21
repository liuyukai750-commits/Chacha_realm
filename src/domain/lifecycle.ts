import type { MelonStatus } from "../contracts/index.ts";

import { HOUR_MS, MINUTE_MS, addMilliseconds, timestampMs } from "./time.ts";

export const INCUBATION_MS = 3 * MINUTE_MS;
export const DISCOVERY_VISIBILITY_MS = 48 * HOUR_MS;
export const MAX_VISIBLE_MELONS_PER_LOCATION = 25;

export interface MelonLifecycleInput {
  status: MelonStatus;
  createdAt: string;
  validReadCount: number;
  now: string;
}

export interface MelonLifecycle {
  status: MelonStatus;
  maturesAt: string;
  discoveryExpiresAt: string;
}

export function resolveMelonLifecycle(input: MelonLifecycleInput): MelonLifecycle {
  assertNonNegativeInteger(input.validReadCount, "validReadCount");

  const createdAtMs = timestampMs(input.createdAt, "createdAt");
  const nowMs = timestampMs(input.now, "now");
  const maturesAt = addMilliseconds(input.createdAt, INCUBATION_MS);
  const discoveryExpiresAt = addMilliseconds(input.createdAt, DISCOVERY_VISIBILITY_MS);

  if (input.status === "held" || input.status === "removed" || input.status === "archived") {
    return { status: input.status, maturesAt, discoveryExpiresAt };
  }

  if (nowMs < createdAtMs + INCUBATION_MS) {
    return { status: "incubating", maturesAt, discoveryExpiresAt };
  }

  return { status: "mature", maturesAt, discoveryExpiresAt };
}

export function isWithinDiscoveryWindow(createdAt: string, now: string): boolean {
  return timestampMs(now, "now") < timestampMs(createdAt, "createdAt") + DISCOVERY_VISIBILITY_MS;
}

export type SpreadRadiusKm = 1 | 3 | 8 | 20;

export interface SpreadStage {
  radiusKm: SpreadRadiusKm;
  minMatureAgeMs: number;
  minValidReads: number;
}

export const MELON_SPREAD_STAGES: readonly SpreadStage[] = [
  { radiusKm: 1, minMatureAgeMs: 0, minValidReads: 0 },
  { radiusKm: 3, minMatureAgeMs: 3 * HOUR_MS, minValidReads: 3 },
  { radiusKm: 8, minMatureAgeMs: 8 * HOUR_MS, minValidReads: 8 },
  { radiusKm: 20, minMatureAgeMs: 16 * HOUR_MS, minValidReads: 20 },
];

export interface MelonSpreadInput {
  maturedAt: string;
  validReadCount: number;
  now: string;
}

export function getMelonSpreadRadiusKm(input: MelonSpreadInput): SpreadRadiusKm {
  assertNonNegativeInteger(input.validReadCount, "validReadCount");

  const matureAgeMs = timestampMs(input.now, "now") - timestampMs(input.maturedAt, "maturedAt");
  if (matureAgeMs < 0) {
    throw new RangeError("now must not be earlier than maturedAt");
  }

  let radius: SpreadRadiusKm = 1;
  for (const stage of MELON_SPREAD_STAGES.slice(1)) {
    if (matureAgeMs >= stage.minMatureAgeMs || input.validReadCount >= stage.minValidReads) {
      radius = stage.radiusKm;
    }
  }
  return radius;
}

function assertNonNegativeInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative integer`);
  }
}
