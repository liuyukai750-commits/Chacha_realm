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
  readerSeedAwarded: boolean;
  authorSeedAwarded: boolean;
  readerDailyValidReadCount: number;
}

export const DAILY_READER_SEED_LIMIT = 3;

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
  return {
    counted: true,
    reason: null,
    readerSeedAwarded: priorDailyValidReads < DAILY_READER_SEED_LIMIT,
    authorSeedAwarded: true,
    readerDailyValidReadCount: priorDailyValidReads + 1,
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
    readerSeedAwarded: false,
    authorSeedAwarded: false,
    readerDailyValidReadCount,
  };
}
