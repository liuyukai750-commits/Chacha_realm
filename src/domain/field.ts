import type { FieldProgress, FieldStage } from "../contracts/index";

export interface FieldStageThreshold {
  stage: FieldStage;
  seedCount: number;
}

export const FIELD_STAGE_THRESHOLDS: readonly FieldStageThreshold[] = [
  { stage: "bare", seedCount: 0 },
  { stage: "sprout", seedCount: 1 },
  { stage: "vine", seedCount: 3 },
  { stage: "flower", seedCount: 7 },
  { stage: "green_melon", seedCount: 12 },
  { stage: "ripe_melon", seedCount: 21 },
];

export function getFieldProgress(seedCount: number): FieldProgress {
  if (!Number.isInteger(seedCount) || seedCount < 0) {
    throw new RangeError("seedCount must be a non-negative integer");
  }

  let currentIndex = 0;
  for (let index = 1; index < FIELD_STAGE_THRESHOLDS.length; index += 1) {
    if (seedCount < FIELD_STAGE_THRESHOLDS[index].seedCount) break;
    currentIndex = index;
  }

  const nextStage = FIELD_STAGE_THRESHOLDS[currentIndex + 1];
  return {
    seedCount,
    stage: FIELD_STAGE_THRESHOLDS[currentIndex].stage,
    ...(nextStage ? { nextStageAt: nextStage.seedCount } : {}),
  };
}
