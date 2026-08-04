import type { MelonStatus } from "../contracts/index";

import { DAY_MS, HOUR_MS, addMilliseconds, timestampMs } from "./time";

export const INCUBATION_MS = 2 * HOUR_MS;
export const UNREAD_ARCHIVE_MS = 24 * HOUR_MS;

export interface MelonLifecycleInput {
  status: MelonStatus;
  createdAt: string;
  validReadCount: number;
  now: string;
}

export interface MelonLifecycle {
  status: MelonStatus;
  maturesAt: string;
  unreadArchivesAt: string;
}

export function resolveMelonLifecycle(input: MelonLifecycleInput): MelonLifecycle {
  assertNonNegativeInteger(input.validReadCount, "validReadCount");

  const createdAtMs = timestampMs(input.createdAt, "createdAt");
  const nowMs = timestampMs(input.now, "now");
  const maturesAt = addMilliseconds(input.createdAt, INCUBATION_MS);
  const unreadArchivesAt = addMilliseconds(maturesAt, UNREAD_ARCHIVE_MS);

  if (input.status === "held" || input.status === "removed" || input.status === "archived") {
    return { status: input.status, maturesAt, unreadArchivesAt };
  }

  if (nowMs < createdAtMs + INCUBATION_MS) {
    return { status: "incubating", maturesAt, unreadArchivesAt };
  }

  if (input.validReadCount === 0 && nowMs >= createdAtMs + INCUBATION_MS + DAY_MS) {
    return { status: "archived", maturesAt, unreadArchivesAt };
  }

  return { status: "mature", maturesAt, unreadArchivesAt };
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
