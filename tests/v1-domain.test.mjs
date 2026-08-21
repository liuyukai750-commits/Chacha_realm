import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

// The app uses bundler-style extensionless TypeScript imports. This test-only
// resolver lets Node 26 exercise those exact source files without adding a
// second runtime such as tsx to the product dependency graph.
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (specifier.startsWith(".") && !specifier.endsWith(".ts")) {
        return nextResolve(`${specifier}.ts`, context);
      }
      throw error;
    }
  },
});

const {
  FIELD_GROWTH_MS,
  FIELD_HARVEST_EXPERIENCE,
  FIELD_PLOT_CAPACITY,
  FIELD_TOTAL_CAPACITY,
  buildFieldPlots,
  canHarvestField,
  getFieldPlantStage,
  getNextSlotIndex,
} = await import("../src/domain/field.ts");
const { DAILY_READER_SEED_LIMIT, evaluateReadReward } = await import("../src/domain/reads.ts");

test("V1 经济常量固定为每天 5 次、三片地各 3 个、满田收获 9 XP", () => {
  assert.equal(DAILY_READER_SEED_LIMIT, 5);
  assert.equal(FIELD_PLOT_CAPACITY, 3);
  assert.equal(FIELD_TOTAL_CAPACITY, 9);
  assert.equal(FIELD_HARVEST_EXPERIENCE, 9);
  assert.equal(FIELD_GROWTH_MS, 12 * 60 * 60 * 1000);
});

test("第 1—4 次有效吃瓜获得小瓜籽，第 5 次自动换真瓜籽，第 6 次不再奖励读者", () => {
  const previousReads = [];
  for (let count = 1; count <= 6; count += 1) {
    const completedAt = `2026-08-04T0${count}:00:00.000Z`;
    const result = evaluateReadReward({
      melonId: `melon-${count}`,
      readerId: "reader",
      authorId: `author-${count}`,
      completedAt,
      previousReads,
    });

    assert.equal(result.counted, true);
    assert.equal(result.smallSeedAwarded, count <= 5);
    assert.equal(result.autoConverted, count === 5);
    assert.equal(result.authorExperienceAwarded, 1);
    assert.equal(result.readerDailyValidReadCount, count);
    previousReads.push(read(`melon-${count}`, completedAt));
  }
});

test("自读与重复完成不发资源也不给作者 XP", () => {
  const self = evaluateReadReward({
    melonId: "melon-self",
    readerId: "same-user",
    authorId: "same-user",
    completedAt: "2026-08-04T08:00:00.000Z",
    previousReads: [],
  });
  assert.deepEqual(
    pickReward(self),
    { counted: false, smallSeedAwarded: false, autoConverted: false, authorExperienceAwarded: 0 },
  );

  const duplicate = evaluateReadReward({
    melonId: "melon-a",
    readerId: "reader",
    authorId: "author-a",
    completedAt: "2026-08-05T08:00:00.000Z",
    previousReads: [read("melon-a", "2026-08-04T08:00:00.000Z")],
  });
  assert.deepEqual(
    pickReward(duplicate),
    { counted: false, smallSeedAwarded: false, autoConverted: false, authorExperienceAwarded: 0 },
  );
});

test("每日奖励在北京时间零点重置，不按 UTC 零点误判", () => {
  const previousReads = Array.from({ length: 5 }, (_, index) =>
    read(`melon-old-${index}`, `2026-08-04T15:${String(50 + index).padStart(2, "0")}:00.000Z`),
  );
  const firstInChinaDate = evaluateReadReward({
    melonId: "melon-new-day",
    readerId: "reader",
    authorId: "author-new-day",
    completedAt: "2026-08-04T16:00:00.000Z",
    previousReads,
  });
  assert.equal(firstInChinaDate.readerDailyValidReadCount, 1);
  assert.equal(firstInChinaDate.smallSeedAwarded, true);
  assert.equal(firstInChinaDate.autoConverted, false);
});

test("三片土地各自只提供 3 个位置，并自动选择下一空位", () => {
  const plants = [plant(0, 0), plant(0, 2), plant(1, 1)];
  assert.equal(getNextSlotIndex(plants, 0), 1);
  assert.equal(getNextSlotIndex([...plants, plant(0, 1)], 0), null);

  const plots = buildFieldPlots(plants);
  assert.deepEqual(plots.map(({ plotIndex, capacity, plants: items }) => [plotIndex, capacity, items.length]), [
    [0, 3, 2],
    [1, 3, 1],
    [2, 3, 0],
  ]);
});

test("种下不足 12 小时不成熟，满 12 小时由时间规则判定成熟", () => {
  const plantedAt = "2026-08-04T00:00:00.000Z";
  const maturesAt = "2026-08-04T12:00:00.000Z";
  assert.notEqual(getFieldPlantStage(maturesAt, "2026-08-04T11:59:59.999Z"), "mature");
  assert.equal(getFieldPlantStage(maturesAt, "2026-08-04T12:00:00.000Z"), "mature");
  assert.equal(Date.parse(maturesAt) - Date.parse(plantedAt), FIELD_GROWTH_MS);
});

test("只有九个位置全部占用且全部成熟才能一键收瓜", () => {
  const maturePlants = Array.from({ length: 9 }, (_, index) =>
    plant(Math.floor(index / 3), index % 3, "2026-08-04T00:00:00.000Z"),
  );
  assert.equal(canHarvestField(maturePlants.slice(0, 8), "2026-08-04T12:00:00.000Z"), false);
  assert.equal(canHarvestField(maturePlants, "2026-08-03T23:59:59.999Z"), false);
  assert.equal(canHarvestField(maturePlants, "2026-08-04T12:00:00.000Z"), true);
});

function read(melonId, completedAt) {
  return { melonId, readerId: "reader", authorId: `author-${melonId}`, completedAt, counted: true };
}

function plant(plotIndex, slotIndex, maturesAt = "2026-08-05T00:00:00.000Z") {
  return {
    id: `plant-${plotIndex}-${slotIndex}`,
    plotIndex,
    slotIndex,
    plantedAt: "2026-08-04T00:00:00.000Z",
    maturesAt,
    stage: "seedling",
  };
}

function pickReward(result) {
  return {
    counted: result.counted,
    smallSeedAwarded: result.smallSeedAwarded,
    autoConverted: result.autoConverted,
    authorExperienceAwarded: result.authorExperienceAwarded,
  };
}
