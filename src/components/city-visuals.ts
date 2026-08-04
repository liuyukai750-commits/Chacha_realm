import type { CityId } from "@/contracts";

export type CityLandmarkKind =
  | "tianxin-orange-isle"
  | "temple-of-heaven"
  | "oriental-pearl"
  | "canton-tower"
  | "shenzhen-skyline";

export interface CityVisualConfig {
  cityId: CityId;
  landmarkKind: CityLandmarkKind;
  landmarkLabel: string;
  islandLabel: string;
  landmarkSpotIds: readonly string[];
}

const cityVisuals: Record<CityId, CityVisualConfig> = {
  changsha: {
    cityId: "changsha",
    landmarkKind: "tianxin-orange-isle",
    landmarkLabel: "天心阁与橘子洲意象",
    islandLabel: "湘江边的长沙主岛",
    landmarkSpotIds: ["cs-orange-isle", "cs-tianxin-pavilion", "spot-cs-01", "spot-cs-02"],
  },
  beijing: {
    cityId: "beijing",
    landmarkKind: "temple-of-heaven",
    landmarkLabel: "天坛意象",
    islandLabel: "北京主岛",
    landmarkSpotIds: ["bj-temple-of-heaven"],
  },
  shanghai: {
    cityId: "shanghai",
    landmarkKind: "oriental-pearl",
    landmarkLabel: "东方明珠意象",
    islandLabel: "黄浦江边的上海主岛",
    landmarkSpotIds: ["sh-peoples-square"],
  },
  guangzhou: {
    cityId: "guangzhou",
    landmarkKind: "canton-tower",
    landmarkLabel: "广州塔意象",
    islandLabel: "珠江边的广州主岛",
    landmarkSpotIds: ["gz-library", "gz-haizhu-lake"],
  },
  shenzhen: {
    cityId: "shenzhen",
    landmarkKind: "shenzhen-skyline",
    landmarkLabel: "深圳城市天际线意象",
    islandLabel: "深圳主岛",
    landmarkSpotIds: ["sz-lianhuashan-park", "sz-talent-park"],
  },
};

export const getCityVisual = (cityId: CityId): CityVisualConfig => cityVisuals[cityId];

export function getSpotScene(cityId: CityId, spotId?: string) {
  const city = getCityVisual(cityId);
  const showLandmark = !spotId || city.landmarkSpotIds.includes(spotId);
  return {
    ...city,
    sceneKind: showLandmark ? city.landmarkKind : "common-island",
    sceneLabel: showLandmark ? city.landmarkLabel : "公共瓜点的树、桥与草坡意象",
  } as const;
}
