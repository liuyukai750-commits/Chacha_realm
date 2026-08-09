import assert from "node:assert/strict";
import test from "node:test";

import { evaluateCityOpening, hasReachedCityOpeningThresholds } from "./city-opening";
import { calculateDiscoveryScore, rankDiscoveryCandidates } from "./discovery";
import { getFieldProgress } from "./field";
import { getMelonSpreadRadiusKm, resolveMelonLifecycle } from "./lifecycle";
import { evaluateReadReward, type ValidReadRecord } from "./reads";

test("瓜在创建两小时后成熟，成熟后 24 小时零有效阅读归档", () => {
  const createdAt = "2026-08-04T00:00:00.000Z";

  assert.equal(
    resolveMelonLifecycle({ status: "incubating", createdAt, validReadCount: 0, now: "2026-08-04T01:59:59.999Z" }).status,
    "incubating",
  );
  assert.equal(
    resolveMelonLifecycle({ status: "incubating", createdAt, validReadCount: 0, now: "2026-08-04T02:00:00.000Z" }).status,
    "mature",
  );
  assert.equal(
    resolveMelonLifecycle({ status: "mature", createdAt, validReadCount: 0, now: "2026-08-05T02:00:00.000Z" }).status,
    "archived",
  );
  assert.equal(
    resolveMelonLifecycle({ status: "mature", createdAt, validReadCount: 1, now: "2026-08-05T02:00:00.000Z" }).status,
    "mature",
  );
});

test("held 与 removed 状态不会被时间推进覆盖", () => {
  const input = { createdAt: "2026-08-01T00:00:00.000Z", validReadCount: 0, now: "2026-08-05T00:00:00.000Z" };
  assert.equal(resolveMelonLifecycle({ ...input, status: "held" }).status, "held");
  assert.equal(resolveMelonLifecycle({ ...input, status: "removed" }).status, "removed");
});

test("瓜按成熟时长或有效阅读量中先达到的条件扩散至 1/3/8/20 公里", () => {
  const maturedAt = "2026-08-04T00:00:00.000Z";
  assert.equal(getMelonSpreadRadiusKm({ maturedAt, validReadCount: 0, now: maturedAt }), 1);
  assert.equal(getMelonSpreadRadiusKm({ maturedAt, validReadCount: 3, now: maturedAt }), 3);
  assert.equal(getMelonSpreadRadiusKm({ maturedAt, validReadCount: 0, now: "2026-08-04T08:00:00.000Z" }), 8);
  assert.equal(getMelonSpreadRadiusKm({ maturedAt, validReadCount: 20, now: maturedAt }), 20);
  assert.equal(getMelonSpreadRadiusKm({ maturedAt, validReadCount: 0, now: "2026-08-04T16:00:00.000Z" }), 20);
});

test("每天前三次有效阅读奖励读者，且每位唯一读者奖励瓜主", () => {
  const previousReads: ValidReadRecord[] = [
    read("melon-a", "reader", "2026-08-04T01:00:00.000Z"),
    read("melon-b", "reader", "2026-08-04T02:00:00.000Z"),
  ];

  const third = evaluateReadReward({
    melonId: "melon-c",
    readerId: "reader",
    authorId: "author-c",
    completedAt: "2026-08-04T03:00:00.000Z",
    previousReads,
  });
  assert.deepEqual(third, {
    counted: true,
    reason: null,
    readerSeedAwarded: true,
    authorSeedAwarded: true,
    readerDailyValidReadCount: 3,
  });

  const fourth = evaluateReadReward({
    melonId: "melon-d",
    readerId: "reader",
    authorId: "author-d",
    completedAt: "2026-08-04T04:00:00.000Z",
    previousReads: [...previousReads, read("melon-c", "reader", "2026-08-04T03:00:00.000Z")],
  });
  assert.equal(fourth.counted, true);
  assert.equal(fourth.readerSeedAwarded, false);
  assert.equal(fourth.authorSeedAwarded, true);
});

test("自读和同一读者重复阅读同一瓜不计数也不奖励", () => {
  const selfRead = evaluateReadReward({
    melonId: "melon-a",
    readerId: "author-a",
    authorId: "author-a",
    completedAt: "2026-08-04T01:00:00.000Z",
    previousReads: [],
  });
  assert.equal(selfRead.reason, "self_read");
  assert.equal(selfRead.counted, false);

  const duplicate = evaluateReadReward({
    melonId: "melon-a",
    readerId: "reader",
    authorId: "author-a",
    completedAt: "2026-08-05T01:00:00.000Z",
    previousReads: [read("melon-a", "reader", "2026-08-04T01:00:00.000Z")],
  });
  assert.equal(duplicate.reason, "duplicate_read");
  assert.equal(duplicate.authorSeedAwarded, false);
});

test("每日奖励以中国标准时间零点重置", () => {
  const previousReads = [
    read("melon-a", "reader", "2026-08-04T15:59:00.000Z"),
    read("melon-b", "reader", "2026-08-04T15:58:00.000Z"),
    read("melon-c", "reader", "2026-08-04T15:57:00.000Z"),
  ];
  const nextDay = evaluateReadReward({
    melonId: "melon-d",
    readerId: "reader",
    authorId: "author-d",
    completedAt: "2026-08-04T16:00:00.000Z",
    previousReads,
  });
  assert.equal(nextDay.readerDailyValidReadCount, 1);
  assert.equal(nextDay.readerSeedAwarded, true);
});

test("瓜田在 1/3/7/12/21 粒瓜籽的边界成长", () => {
  assert.deepEqual(getFieldProgress(0), { seedCount: 0, stage: "bare", nextStageAt: 1 });
  assert.deepEqual(getFieldProgress(1), { seedCount: 1, stage: "sprout", nextStageAt: 3 });
  assert.deepEqual(getFieldProgress(3), { seedCount: 3, stage: "vine", nextStageAt: 7 });
  assert.deepEqual(getFieldProgress(7), { seedCount: 7, stage: "flower", nextStageAt: 12 });
  assert.deepEqual(getFieldProgress(12), { seedCount: 12, stage: "green_melon", nextStageAt: 21 });
  assert.deepEqual(getFieldProgress(21), { seedCount: 21, stage: "ripe_melon" });
});

test("五城达到全部阈值后于中国标准时间次日 20:00 开城门", () => {
  const metrics = { safeMelons: 30, distinctAuthors: 25, distinctSpots: 3, distinctTopics: 3 };
  assert.equal(hasReachedCityOpeningThresholds(metrics), true);

  const countdown = evaluateCityOpening({
    cityId: "changsha",
    metrics,
    thresholdReachedAt: "2026-08-04T13:00:00.000Z",
    now: "2026-08-05T11:59:59.999Z",
  });
  assert.equal(countdown.status, "countdown");
  assert.equal(countdown.opensAt, "2026-08-05T12:00:00.000Z");

  const open = evaluateCityOpening({
    cityId: "shenzhen",
    metrics,
    thresholdReachedAt: "2026-08-04T13:00:00.000Z",
    now: "2026-08-05T12:00:00.000Z",
  });
  assert.equal(open.status, "open");
});

test("任一开城门指标未达标时保持 gathering", () => {
  const state = evaluateCityOpening({
    cityId: "beijing",
    metrics: { safeMelons: 29, distinctAuthors: 25, distinctSpots: 3, distinctTopics: 3 },
    now: "2026-08-05T12:00:00.000Z",
  });
  assert.equal(state.status, "gathering");
  assert.equal(state.opensAt, undefined);
});

test("发现排序严格遵循同区、同城、远方，再按评分稳定排序", () => {
  const now = "2026-08-04T12:00:00.000Z";
  const candidates = [
    candidate("remote", "remote_city", "2026-08-04T11:59:00.000Z", 9_999),
    candidate("city", "same_city", "2026-08-04T10:00:00.000Z", 0),
    candidate("district-b", "same_district", "2026-08-04T11:00:00.000Z", 1),
    candidate("district-a", "same_district", "2026-08-04T11:00:00.000Z", 1),
  ];

  const ranked = rankDiscoveryCandidates(candidates, now);
  assert.deepEqual(ranked.map(({ id }) => id), ["district-a", "district-b", "city", "remote"]);
  assert.deepEqual(candidates.map(({ id }) => id), ["remote", "city", "district-b", "district-a"]);
  assert.deepEqual(
    calculateDiscoveryScore(candidates[0], now),
    calculateDiscoveryScore(candidates[0], now),
  );
});

function read(melonId: string, readerId: string, completedAt: string): ValidReadRecord {
  return { melonId, readerId, authorId: `author-${melonId}`, completedAt, counted: true };
}

function candidate(
  id: string,
  locality: "same_district" | "same_city" | "remote_city",
  maturedAt: string,
  validReadCount: number,
) {
  return { id, locality, maturedAt, validReadCount };
}
