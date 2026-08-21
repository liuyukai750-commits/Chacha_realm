import { chinaDateKey, timestampMs } from "./time.ts";

export interface ValidReadRecord {
  melonId: string;
  readerId: string;
  authorId: string;
  completedAt: string;
  counted: boolean;
}

export interface ReadRewardInput {
  melonId: string;
  readerId: string;
  authorId: string;
  completedAt: string;
  previousReads: readonly ValidReadRecord[];
}

export interface ReadRewardResult {
  counted: boolean;
  reason: "self_read" | "duplicate_read" | null;
  smallSeedAwarded: boolean;
  autoConverted: boolean;
  authorExperienceAwarded: 0 | 1;
  readerDailyValidReadCount: number;
}

export const DAILY_READER_SEED_LIMIT = 5;

export function evaluateReadReward(input: ReadRewardInput): ReadRewardResult {
  timestampMs(input.completedAt, "completedAt");

  const priorCountedReads = input.previousReads.filter((read) => read.counted);

  if (input.readerId === input.authorId) {
    return noReward("self_read", countDailyReads(priorCountedReads, input.readerId, input.completedAt));
  }

  const isDuplicate = priorCountedReads.some(
    (read) => read.readerId === input.readerId && read.melonId === input.melonId,
  );
  if (isDuplicate) {
    return noReward("duplicate_read", countDailyReads(priorCountedReads, input.readerId, input.completedAt));
  }

  const priorDailyValidReads = countDailyReads(priorCountedReads, input.readerId, input.completedAt);
  const nextDailyValidReadCount = priorDailyValidReads + 1;
  const smallSeedAwarded = nextDailyValidReadCount <= DAILY_READER_SEED_LIMIT;
  return {
    counted: true,
    reason: null,
    smallSeedAwarded,
    autoConverted: smallSeedAwarded && nextDailyValidReadCount === DAILY_READER_SEED_LIMIT,
    authorExperienceAwarded: 1,
    readerDailyValidReadCount: nextDailyValidReadCount,
  };
}

function countDailyReads(
  previousReads: readonly ValidReadRecord[],
  readerId: string,
  completedAt: string,
): number {
  const day = chinaDateKey(completedAt);
  return previousReads.filter(
    (read) => read.readerId === readerId && chinaDateKey(read.completedAt) === day,
  ).length;
}

function noReward(
  reason: Exclude<ReadRewardResult["reason"], null>,
  readerDailyValidReadCount: number,
): ReadRewardResult {
  return {
    counted: false,
    reason,
    smallSeedAwarded: false,
    autoConverted: false,
    authorExperienceAwarded: 0,
    readerDailyValidReadCount,
  };
}
