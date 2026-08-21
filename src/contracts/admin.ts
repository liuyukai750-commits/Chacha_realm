export const ADMIN_CITY_IDS = [
  "changsha",
  "beijing",
  "shanghai",
  "guangzhou",
  "shenzhen",
] as const;

export type AdminCityId = (typeof ADMIN_CITY_IDS)[number];

export interface AdminMetricPair {
  total: number;
  today: number;
}

export interface AdminOverview {
  generatedAt: string;
  timezone: "Asia/Shanghai";
  users: {
    registrations: AdminMetricPair;
    active: {
      today: number;
      last7Days: number;
      last30Days: number;
    };
  };
  engagement: {
    publishedMelons: AdminMetricPair;
    effectiveReads: AdminMetricPair;
    comments: AdminMetricPair;
    likes: AdminMetricPair;
    squats: {
      active: number;
      addedToday: number;
    };
  };
  economy: {
    balances: {
      smallSeeds: number;
      trueSeeds: number;
    };
    earned: {
      smallSeeds: AdminMetricPair;
      trueSeeds: AdminMetricPair;
    };
    trueSeedsPlanted: AdminMetricPair;
    fieldPlants: {
      planted: AdminMetricPair;
      active: number;
    };
    fieldHarvests: {
      batches: AdminMetricPair;
      plants: AdminMetricPair;
    };
  };
  cities: Array<{
    cityId: AdminCityId;
    publishedMelons: number;
    effectiveReads: number;
    comments: number;
    likes: number;
    squats: number;
  }>;
  moderation: {
    pendingReviewCases: number;
    heldMelons: number;
    heldComments: number;
    reports: AdminMetricPair;
    reportedTargets: number;
    bannedProfiles: number;
    banActions: AdminMetricPair;
  };
}
