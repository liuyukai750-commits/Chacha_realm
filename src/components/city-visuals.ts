import type { CityId, PublicSpotSummary } from "@/contracts";

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
  realmLabel: string;
  sceneImages: Readonly<Record<"day" | "night", string>>;
  landmarkSpotIds: readonly string[];
}

export type PlaceSceneKind =
  | "office"
  | "medical"
  | "hotel"
  | "commerce"
  | "park"
  | "culture"
  | "campus"
  | "transit"
  | "waterfront"
  | "neighborhood";

export interface PlaceSceneConfig {
  kind: PlaceSceneKind;
  title: string;
  sceneLabel: string;
  displayName: string;
  hidesExactVenue: boolean;
}

const sceneCopy: Record<PlaceSceneKind, Pick<PlaceSceneConfig, "title" | "sceneLabel">> = {
  office: { title: "写字楼附近", sceneLabel: "楼影、亮窗与下班路口" },
  medical: { title: "医疗建筑附近", sceneLabel: "安静楼体、长椅与夜间灯光" },
  hotel: { title: "酒店街区附近", sceneLabel: "门廊、行李与夜班灯光" },
  commerce: { title: "热闹商圈附近", sceneLabel: "橱窗、街口与来往人影" },
  park: { title: "公园绿地附近", sceneLabel: "树冠、步道与开阔草坡" },
  culture: { title: "文化场馆附近", sceneLabel: "展馆轮廓、台阶与城市树影" },
  campus: { title: "校园街区附近", sceneLabel: "教学楼、钟面与林荫路" },
  transit: { title: "交通枢纽附近", sceneLabel: "站棚、灯带与匆匆脚步" },
  waterfront: { title: "水岸附近", sceneLabel: "江风、桥影与沿岸灯光" },
  neighborhood: { title: "生活街区附近", sceneLabel: "楼道、便利店与回家小路" },
};

const sensitiveKinds = new Set<PlaceSceneKind>(["office", "medical", "hotel"]);

const spotSceneKinds: Record<string, PlaceSceneKind> = {
  "cs-orange-isle": "waterfront",
  "cs-yuelu-mountain": "park",
  "cs-wuyi-square": "commerce",
  "cs-hunan-museum": "culture",
  "cs-tianxin-pavilion": "culture",
  "bj-temple-of-heaven": "culture",
  "bj-olympic-forest": "park",
  "bj-summer-palace": "culture",
  "bj-zoo": "park",
  "bj-garden-expo": "park",
  "sh-peoples-square": "commerce",
  "sh-xujiahui-park": "park",
  "sh-zhongshan-park": "park",
  "sh-natural-history-museum": "culture",
  "sh-gongqing-forest-park": "park",
  "gz-yuexiu-park": "park",
  "gz-shamian-park": "waterfront",
  "gz-library": "culture",
  "gz-haizhu-lake": "waterfront",
  "gz-baiyun-south-gate": "park",
  "sz-lianhuashan-park": "park",
  "sz-talent-park": "waterfront",
  "sz-donghu-park": "waterfront",
  "sz-baoan-park": "park",
  "sz-longcheng-park": "park",
  "spot-cs-01": "commerce",
  "spot-cs-02": "waterfront",
  "spot-cs-03": "campus",
  "spot-cs-04": "park",
  "spot-sh-01": "park",
};

const keywordScenes: Array<[RegExp, PlaceSceneKind]> = [
  [/医院|门诊|诊所|医疗|卫生院/, "medical"],
  [/酒店|宾馆|旅馆|民宿/, "hotel"],
  [/公司|写字楼|产业园|科技园|大厦|办公/, "office"],
  [/大学|学院|学校|校园|书院/, "campus"],
  [/车站|机场|地铁|码头|枢纽/, "transit"],
  [/商场|广场|步行街|商圈|购物|市场/, "commerce"],
  [/博物|图书馆|美术馆|剧院|展览|阁|坛|园博园|颐和园/, "culture"],
  [/江|河|湖|洲|海岸|水岸|沙面/, "waterfront"],
  [/公园|山|森林|动物园|绿地/, "park"],
];

const cityVisuals: Record<CityId, CityVisualConfig> = {
  changsha: {
    cityId: "changsha",
    landmarkKind: "tianxin-orange-isle",
    landmarkLabel: "天心阁与橘子洲意象",
    realmLabel: "湘江边的长沙瓜域",
    sceneImages: { day: "/scenes/changsha-wuyi-day.png", night: "/scenes/changsha-wuyi-night.png" },
    landmarkSpotIds: ["cs-orange-isle", "cs-tianxin-pavilion", "spot-cs-01", "spot-cs-02"],
  },
  beijing: {
    cityId: "beijing",
    landmarkKind: "temple-of-heaven",
    landmarkLabel: "天坛意象",
    realmLabel: "北京城市瓜域",
    sceneImages: { day: "/scenes/beijing-temple-of-heaven-day-v1.png", night: "/scenes/beijing-temple-of-heaven-night-v1.png" },
    landmarkSpotIds: ["bj-temple-of-heaven"],
  },
  shanghai: {
    cityId: "shanghai",
    landmarkKind: "oriental-pearl",
    landmarkLabel: "东方明珠意象",
    realmLabel: "黄浦江边的上海瓜域",
    sceneImages: { day: "/scenes/shanghai-oriental-pearl-day-v1.png", night: "/scenes/shanghai-oriental-pearl-night-v1.png" },
    landmarkSpotIds: ["sh-peoples-square"],
  },
  guangzhou: {
    cityId: "guangzhou",
    landmarkKind: "canton-tower",
    landmarkLabel: "广州塔意象",
    realmLabel: "珠江边的广州瓜域",
    sceneImages: { day: "/scenes/guangzhou-canton-tower-day-v1.png", night: "/scenes/guangzhou-canton-tower-night-v1.png" },
    landmarkSpotIds: ["gz-library", "gz-haizhu-lake"],
  },
  shenzhen: {
    cityId: "shenzhen",
    landmarkKind: "shenzhen-skyline",
    landmarkLabel: "深圳湾意象",
    realmLabel: "深圳湾畔城市瓜域",
    sceneImages: { day: "/scenes/shenzhen-bay-day-v1.png", night: "/scenes/shenzhen-bay-night-v1.png" },
    landmarkSpotIds: ["sz-lianhuashan-park", "sz-talent-park"],
  },
};

export const getCityVisual = (cityId: CityId): CityVisualConfig => cityVisuals[cityId];

export function getSpotScene(spot: PublicSpotSummary): PlaceSceneConfig {
  const kind = spotSceneKinds[spot.id]
    ?? keywordScenes.find(([pattern]) => pattern.test(spot.name))?.[1]
    ?? "neighborhood";
  const copy = sceneCopy[kind];
  const hidesExactVenue = sensitiveKinds.has(kind);
  return {
    kind,
    title: copy.title,
    sceneLabel: copy.sceneLabel,
    displayName: hidesExactVenue ? copy.title : spot.name,
    hidesExactVenue,
  };
}
