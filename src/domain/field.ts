import type {
  FieldPlant,
  FieldPlantStage,
  FieldPlot,
  FieldPlotIndex,
  FieldSlotIndex,
} from "../contracts/index.ts";

export const FIELD_PLOT_COUNT = 3;
export const FIELD_PLOT_CAPACITY = 3;
export const FIELD_TOTAL_CAPACITY = 9;
export const FIELD_GROWTH_MS = 12 * 60 * 60 * 1000;
export const FIELD_HARVEST_EXPERIENCE = 9;

export function getFieldPlantStage(maturesAt: string, now: string): FieldPlantStage {
  const maturesAtMs = requiredTimestamp(maturesAt, "maturesAt");
  const nowMs = requiredTimestamp(now, "now");
  if (nowMs >= maturesAtMs) return "mature";
  return maturesAtMs - nowMs <= FIELD_GROWTH_MS / 2 ? "growing" : "seedling";
}

export function getNextMaturesAt(plants: readonly FieldPlant[], now: string): string | undefined {
  const nowMs = requiredTimestamp(now, "now");
  return plants
    .filter((plant) => requiredTimestamp(plant.maturesAt, "maturesAt") > nowMs)
    .sort((a, b) => Date.parse(a.maturesAt) - Date.parse(b.maturesAt))[0]?.maturesAt;
}

export function canHarvestField(plants: readonly FieldPlant[], now: string): boolean {
  if (plants.length !== FIELD_TOTAL_CAPACITY) return false;
  const nowMs = requiredTimestamp(now, "now");
  return plants.every((plant) => requiredTimestamp(plant.maturesAt, "maturesAt") <= nowMs);
}

export function getNextSlotIndex(
  plants: readonly Pick<FieldPlant, "plotIndex" | "slotIndex">[],
  plotIndex: FieldPlotIndex,
): FieldSlotIndex | null {
  const occupied = new Set(
    plants.filter((plant) => plant.plotIndex === plotIndex).map((plant) => plant.slotIndex),
  );
  for (const slotIndex of [0, 1, 2] as const) {
    if (!occupied.has(slotIndex)) return slotIndex;
  }
  return null;
}

export function buildFieldPlots(plants: readonly FieldPlant[]): FieldPlot[] {
  return ([0, 1, 2] as const).map((plotIndex) => ({
    plotIndex,
    capacity: 3,
    plants: plants
      .filter((plant) => plant.plotIndex === plotIndex)
      .sort((a, b) => a.slotIndex - b.slotIndex),
  }));
}

function requiredTimestamp(value: string, label: string): number {
  const result = Date.parse(value);
  if (!Number.isFinite(result)) throw new RangeError(`${label} must be an ISO 8601 timestamp`);
  return result;
}
