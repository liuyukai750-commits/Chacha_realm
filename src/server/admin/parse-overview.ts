import type { AdminCityId, AdminMetricPair, AdminOverview } from "@/contracts/admin";

const CITY_IDS = new Set<AdminCityId>([
  "changsha",
  "beijing",
  "shanghai",
  "guangzhou",
  "shenzhen",
]);

function record(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid admin overview field: ${field}`);
  }
  return value as Record<string, unknown>;
}

function count(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Invalid admin overview count: ${field}`);
  }
  return value;
}

function metricPair(value: unknown, field: string): AdminMetricPair {
  const item = record(value, field);
  return {
    total: count(item.total, `${field}.total`),
    today: count(item.today, `${field}.today`),
  };
}

function cityId(value: unknown, field: string): AdminCityId {
  if (typeof value !== "string" || !CITY_IDS.has(value as AdminCityId)) {
    throw new Error(`Invalid admin overview city: ${field}`);
  }
  return value as AdminCityId;
}

export function parseAdminOverview(value: unknown): AdminOverview {
  const root = record(value, "overview");
  const users = record(root.users, "users");
  const active = record(users.active, "users.active");
  const engagement = record(root.engagement, "engagement");
  const squats = record(engagement.squats, "engagement.squats");
  const economy = record(root.economy, "economy");
  const balances = record(economy.balances, "economy.balances");
  const earned = record(economy.earned, "economy.earned");
  const fieldPlants = record(economy.fieldPlants, "economy.fieldPlants");
  const fieldHarvests = record(economy.fieldHarvests, "economy.fieldHarvests");
  const moderation = record(root.moderation, "moderation");

  if (typeof root.generatedAt !== "string" || !Number.isFinite(Date.parse(root.generatedAt))) {
    throw new Error("Invalid admin overview field: generatedAt");
  }
  if (root.timezone !== "Asia/Shanghai") {
    throw new Error("Invalid admin overview field: timezone");
  }
  if (!Array.isArray(root.cities)) {
    throw new Error("Invalid admin overview field: cities");
  }

  const seenCities = new Set<AdminCityId>();
  const cities = root.cities.map((value, index) => {
    const item = record(value, `cities.${index}`);
    const id = cityId(item.cityId, `cities.${index}.cityId`);
    if (seenCities.has(id)) throw new Error(`Duplicate admin overview city: ${id}`);
    seenCities.add(id);
    return {
      cityId: id,
      publishedMelons: count(item.publishedMelons, `cities.${index}.publishedMelons`),
      effectiveReads: count(item.effectiveReads, `cities.${index}.effectiveReads`),
      comments: count(item.comments, `cities.${index}.comments`),
      likes: count(item.likes, `cities.${index}.likes`),
      squats: count(item.squats, `cities.${index}.squats`),
    };
  });
  if (seenCities.size !== CITY_IDS.size) {
    throw new Error("Admin overview must include all five cities");
  }

  return {
    generatedAt: root.generatedAt,
    timezone: "Asia/Shanghai",
    users: {
      registrations: metricPair(users.registrations, "users.registrations"),
      active: {
        today: count(active.today, "users.active.today"),
        last7Days: count(active.last7Days, "users.active.last7Days"),
        last30Days: count(active.last30Days, "users.active.last30Days"),
      },
    },
    engagement: {
      publishedMelons: metricPair(engagement.publishedMelons, "engagement.publishedMelons"),
      effectiveReads: metricPair(engagement.effectiveReads, "engagement.effectiveReads"),
      comments: metricPair(engagement.comments, "engagement.comments"),
      likes: metricPair(engagement.likes, "engagement.likes"),
      squats: {
        active: count(squats.active, "engagement.squats.active"),
        addedToday: count(squats.addedToday, "engagement.squats.addedToday"),
      },
    },
    economy: {
      balances: {
        smallSeeds: count(balances.smallSeeds, "economy.balances.smallSeeds"),
        trueSeeds: count(balances.trueSeeds, "economy.balances.trueSeeds"),
      },
      earned: {
        smallSeeds: metricPair(earned.smallSeeds, "economy.earned.smallSeeds"),
        trueSeeds: metricPair(earned.trueSeeds, "economy.earned.trueSeeds"),
      },
      trueSeedsPlanted: metricPair(economy.trueSeedsPlanted, "economy.trueSeedsPlanted"),
      fieldPlants: {
        planted: metricPair(fieldPlants.planted, "economy.fieldPlants.planted"),
        active: count(fieldPlants.active, "economy.fieldPlants.active"),
      },
      fieldHarvests: {
        batches: metricPair(fieldHarvests.batches, "economy.fieldHarvests.batches"),
        plants: metricPair(fieldHarvests.plants, "economy.fieldHarvests.plants"),
      },
    },
    cities,
    moderation: {
      pendingReviewCases: count(moderation.pendingReviewCases, "moderation.pendingReviewCases"),
      heldMelons: count(moderation.heldMelons, "moderation.heldMelons"),
      heldComments: count(moderation.heldComments, "moderation.heldComments"),
      reports: metricPair(moderation.reports, "moderation.reports"),
      reportedTargets: count(moderation.reportedTargets, "moderation.reportedTargets"),
      bannedProfiles: count(moderation.bannedProfiles, "moderation.bannedProfiles"),
      banActions: metricPair(moderation.banActions, "moderation.banActions"),
    },
  };
}
