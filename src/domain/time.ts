export const HOUR_MS = 60 * 60 * 1_000;
export const DAY_MS = 24 * HOUR_MS;

const CHINA_UTC_OFFSET_MS = 8 * HOUR_MS;

export function timestampMs(value: string, label = "timestamp"): number {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) {
    throw new RangeError(`${label} must be a valid ISO 8601 timestamp`);
  }
  return milliseconds;
}

export function addMilliseconds(value: string, milliseconds: number): string {
  return new Date(timestampMs(value) + milliseconds).toISOString();
}

export function chinaDateKey(value: string): string {
  return new Date(timestampMs(value) + CHINA_UTC_OFFSET_MS).toISOString().slice(0, 10);
}

export function nextChinaEightPm(value: string): string {
  const chinaTime = new Date(timestampMs(value) + CHINA_UTC_OFFSET_MS);
  return new Date(
    Date.UTC(
      chinaTime.getUTCFullYear(),
      chinaTime.getUTCMonth(),
      chinaTime.getUTCDate() + 1,
      12,
    ),
  ).toISOString();
}
