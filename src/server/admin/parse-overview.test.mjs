import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";

const source = readFileSync(new URL("./parse-overview.ts", import.meta.url), "utf8");
const { parseAdminOverview } = await import(
  `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString("base64")}`
);

function pair(total = 0, today = 0) {
  return { total, today };
}

function fixture() {
  return {
    generatedAt: "2026-08-15T12:00:00.000Z",
    timezone: "Asia/Shanghai",
    users: { registrations: pair(12, 2), active: { today: 3, last7Days: 8, last30Days: 11 } },
    engagement: {
      publishedMelons: pair(),
      effectiveReads: pair(),
      comments: pair(),
      likes: pair(),
      squats: { active: 0, addedToday: 0 },
    },
    economy: {
      balances: { smallSeeds: 0, trueSeeds: 0 },
      earned: { smallSeeds: pair(), trueSeeds: pair() },
      trueSeedsPlanted: pair(),
      fieldPlants: { planted: pair(), active: 0 },
      fieldHarvests: { batches: pair(), plants: pair() },
    },
    cities: ["changsha", "beijing", "shanghai", "guangzhou", "shenzhen"].map((cityId) => ({
      cityId,
      publishedMelons: 0,
      effectiveReads: 0,
      comments: 0,
      likes: 0,
      squats: 0,
    })),
    moderation: {
      pendingReviewCases: 0,
      heldMelons: 0,
      heldComments: 0,
      reports: pair(),
      reportedTargets: 0,
      bannedProfiles: 0,
      banActions: pair(),
    },
  };
}

test("accepts the aggregate-only five-city contract", () => {
  assert.deepEqual(parseAdminOverview(fixture()), fixture());
});

test("rejects unsafe or incomplete RPC shapes", () => {
  const negative = fixture();
  negative.users.registrations.total = -1;
  assert.throws(() => parseAdminOverview(negative), /count/);

  const missingCity = fixture();
  missingCity.cities.pop();
  assert.throws(() => parseAdminOverview(missingCity), /five cities/);

  const badTimezone = fixture();
  badTimezone.timezone = "UTC";
  assert.throws(() => parseAdminOverview(badTimezone), /timezone/);
});
