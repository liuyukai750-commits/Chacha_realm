import { expect } from "@playwright/test";

export const fixedNow = "2026-08-04T12:00:00.000Z";

export const spot = {
  id: "spot-wuyi-square",
  cityId: "changsha",
  districtId: "furong",
  name: "五一广场",
};

export const fiveCityMatrix = [
  {
    id: "changsha",
    name: "长沙",
    districtId: "cs-furong",
    districtName: "芙蓉区",
    spots: [
      ["cs-orange-isle", "橘子洲"],
      ["cs-yuelu-mountain", "岳麓山"],
      ["cs-wuyi-square", "五一广场"],
      ["cs-hunan-museum", "湖南博物院"],
      ["cs-tianxin-pavilion", "天心阁"],
    ],
  },
  {
    id: "beijing",
    name: "北京",
    districtId: "bj-dongcheng",
    districtName: "东城区",
    spots: [
      ["bj-temple-of-heaven", "天坛公园"],
      ["bj-olympic-forest", "奥林匹克森林公园"],
      ["bj-summer-palace", "颐和园"],
      ["bj-zoo", "北京动物园"],
      ["bj-garden-expo", "北京园博园"],
    ],
  },
  {
    id: "shanghai",
    name: "上海",
    districtId: "sh-huangpu",
    districtName: "黄浦区",
    spots: [
      ["sh-peoples-square", "人民广场"],
      ["sh-xujiahui-park", "徐家汇公园"],
      ["sh-zhongshan-park", "中山公园"],
      ["sh-natural-history-museum", "上海自然博物馆"],
      ["sh-gongqing-forest-park", "共青森林公园"],
    ],
  },
  {
    id: "guangzhou",
    name: "广州",
    districtId: "gz-yuexiu",
    districtName: "越秀区",
    spots: [
      ["gz-yuexiu-park", "越秀公园"],
      ["gz-shamian-park", "沙面公园"],
      ["gz-library", "广州图书馆"],
      ["gz-haizhu-lake", "海珠湖公园"],
      ["gz-baiyun-south-gate", "白云山南门（云台花园）"],
    ],
  },
  {
    id: "shenzhen",
    name: "深圳",
    districtId: "sz-futian",
    districtName: "福田区",
    spots: [
      ["sz-lianhuashan-park", "莲花山公园"],
      ["sz-talent-park", "深圳人才公园"],
      ["sz-donghu-park", "东湖公园"],
      ["sz-baoan-park", "宝安公园"],
      ["sz-longcheng-park", "龙城公园"],
    ],
  },
].map((city, index) => ({
  id: city.id,
  name: city.name,
  districts: [{ id: city.districtId, name: city.districtName }],
  spots: city.spots.map(([id, name]) => ({ id, cityId: city.id, districtId: city.districtId, name })),
  opening: {
    cityId: city.id,
    status: index < 3 ? "open" : "gathering",
    safeMelons: 30 + index,
    distinctAuthors: 25 + index,
    distinctSpots: 5,
    distinctTopics: 5,
  },
}));

export const melon = {
  id: "melon-local-1",
  status: "mature",
  topic: "work",
  cityId: "changsha",
  districtId: "furong",
  spot,
  distanceBand: "within_1km",
  completedReads: 8,
  isRemote: false,
  revealMode: "open",
  alias: "加班仓鼠 237",
  title: "老板凌晨发来一个小改动",
  content: "我回了一个刚准备睡，他秒回说那正好，现在我和广场的路灯一样精神。",
  createdAt: "2026-08-04T08:00:00.000Z",
  squatted: false,
  squatCount: 0,
  liked: false,
  reactions: { like: 3 },
};

const topicCycle = ["work", "daily", "relationship", "food", "neighborhood"];
export const discoveryMelons = Array.from({ length: 12 }, (_, index) => {
  if (index === 0) return melon;
  const number = index + 1;
  const isRemote = number === 12;
  return {
    ...melon,
    id: `melon-${String(number).padStart(2, "0")}`,
    topic: topicCycle[index % topicCycle.length],
    distanceBand: isRemote ? "remote" : index < 4 ? "within_1km" : index < 8 ? "within_3km" : "within_8km",
    completedReads: 3 + index,
    isRemote,
    revealMode: "open",
    alias: `晒太阳的小动物 ${100 + number}`,
    title: isRemote ? "远方瓜棚传来一阵笑声" : `瓜区里的第 ${number} 件小事`,
    content: isRemote
      ? "虽然隔着一座城，公开瓜棚里的故事、评论和轻反应仍然清楚可读。"
      : `这是五一广场瓜区第 ${number} 颗成熟瓜的完整正文。`,
  };
});

export const publicComments = [
  {
    id: "comment-public-1",
    melonId: melon.id,
    alias: "抱书海獭 204",
    content: "这是从评论 GET fixture 读取的第一条公开回声。",
    createdAt: "2026-08-04T11:30:00.000Z",
  },
  {
    id: "comment-public-2",
    melonId: melon.id,
    alias: "赶车刺猬 305",
    content: "远方围观也应该看得到这条评论。",
    createdAt: "2026-08-04T11:45:00.000Z",
  },
];

export function cityFixture(cityId) {
  return fiveCityMatrix.find((city) => city.id === cityId);
}

export function primarySpotForCity(cityId) {
  return cityFixture(cityId)?.spots[0] ?? spot;
}

export function cityMelons(cityId, activeSpot = primarySpotForCity(cityId), options = {}) {
  const city = cityFixture(cityId);
  const local = discoveryMelons.slice(0, 4).map((item, index) => ({
    ...item,
    id: item.id === melon.id ? `${cityId}-local-1` : `${cityId}-${item.id}`,
    cityId,
    districtId: activeSpot.districtId,
    spot: activeSpot,
    title: item.id === melon.id ? `${city?.name ?? cityId}公共瓜` : `${city?.name ?? cityId}瓜区第 ${index + 1} 件小事`,
    distanceBand: options.noNearby && item.distanceBand === "within_1km" ? "within_3km" : item.distanceBand,
    isRemote: false,
  }));
  const remoteCityId = cityId === "changsha" ? "beijing" : "changsha";
  return [
    ...local,
    {
      ...discoveryMelons.at(-1),
      id: `${cityId}-remote-1`,
      cityId: remoteCityId,
      districtId: "remote-district",
      spot: { id: "remote-spot", cityId: remoteCityId, districtId: "remote-district", name: "远方公开瓜棚" },
      distanceBand: "remote",
      isRemote: true,
      title: "远方瓜棚传来一阵笑声",
    },
  ];
}

const emptyPlots = () => ([0, 1, 2].map((plotIndex) => ({ plotIndex, capacity: 3, plants: [] })));

const otherField = {
  alias: melon.alias,
  animal: "仓鼠",
  plots: emptyPlots(),
  plantedCount: 0,
  matureCount: 0,
  melons: [
    {
      id: melon.id,
      status: "mature",
      topic: melon.topic,
      cityId: melon.cityId,
      districtId: melon.districtId,
      spot,
      distanceBand: melon.distanceBand,
      completedReads: melon.completedReads,
      isRemote: false,
      revealMode: melon.revealMode,
    },
  ],
};

function json(route, body, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify(body),
  });
}

/**
 * Installs deterministic mocks at the HTTP contract boundary. Returned arrays are
 * mutable observation logs for assertions; the UI remains the system under test.
 */
export async function installV0Api(page, options = {}) {
  const initialWallet = options.wallet ?? {
    smallSeedCount: options.seedCount ?? 2,
    trueSeedCount: options.trueSeedCount ?? 0,
  };
  const initialExperience = options.experience ?? { total: 0, fromReads: 0, fromHarvests: 0 };
  const state = {
    commentRequests: [],
    commentGetRequests: [],
    completeRequests: [],
    createRequests: [],
    createOperations: new Map(),
    createdMelons: structuredClone(options.createdMelons ?? []),
    createStatusSequence: [...(options.createStatusSequence ?? [])],
    fieldRequests: [],
    discoveryRequests: [],
    presenceRequests: [],
    reactionRequests: [],
    squatRequests: [],
    wallet: { ...initialWallet },
    experience: { ...initialExperience },
    plants: structuredClone(options.plants ?? []),
    plantRequests: [],
    plantOperations: new Map(),
    plantFailure: options.plantFailure ?? null,
    plantFailureUsed: false,
    harvestRequests: [],
    harvestFailure: options.harvestFailure ?? null,
    harvestFailureUsed: false,
    validReadsToday: options.validReadsToday ?? initialWallet.smallSeedCount,
    originalRewardClaimed: options.originalRewardClaimed ?? false,
    completedReads: melon.completedReads,
    alreadyCompleted: options.alreadyCompleted ?? false,
    plantDistanceFailure: options.plantDistanceFailure ?? false,
    activeSpot: options.spot ?? spot,
    activeCityId: options.activeCityId ?? "changsha",
    fiveCities: options.fiveCities ?? false,
    presenceSequence: options.presenceSequence ?? ["inside_zone"],
    presenceAttempt: 0,
    commentFailure: options.commentFailure ?? null,
    commentFailureUsed: false,
    squats: new Map(),
    likes: new Set(options.likes ?? []),
    reactionFailure: options.reactionFailure ?? null,
    reactionFailureUsed: false,
  };

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    const body = request.postDataJSON?.() ?? null;

    if (method === "POST" && path === "/api/session/anonymous") {
      return json(route, {
        alias: "巡城小猹 101",
        animal: "猹",
        wallet: { ...state.wallet },
        experience: { ...state.experience },
      });
    }

    if (method === "GET" && path === "/api/cities") {
      if (state.fiveCities) return json(route, fiveCityMatrix);
      return json(route, [{
        id: "changsha",
        name: "长沙",
        districts: [{ id: "furong", name: "芙蓉区" }],
        spots: [state.activeSpot],
        opening: {
          cityId: "changsha",
          status: "open",
          safeMelons: 30,
          distinctAuthors: 25,
          distinctSpots: 3,
          distinctTopics: 3,
        },
      }]);
    }

    if (method === "GET" && path === "/api/squats") {
      const items = Array.from(state.squats.values());
      return json(route, { unreadCount: items.filter((item) => item.unread).length, items });
    }

    const seenSquatId = path.match(/^\/api\/squats\/([^/]+)\/seen$/)?.[1];
    if (method === "POST" && seenSquatId) {
      const current = state.squats.get(seenSquatId);
      if (current) state.squats.set(seenSquatId, { ...current, unread: false, alertKind: null });
      return json(route, { seen: true });
    }

    if (method === "POST" && path === "/api/discovery") {
      state.discoveryRequests.push(body);
      const requestedCityId = body?.location
        ? options.realLocationCityId ?? body?.selectedCityId ?? state.activeCityId
        : body?.selectedCityId ?? state.activeCityId;
      if (state.fiveCities) {
        const activeSpot = primarySpotForCity(requestedCityId);
        state.activeCityId = requestedCityId;
        state.activeSpot = activeSpot;
        return json(route, {
          visitorType: body?.location ? "local" : "location_unknown",
          activeCityId: requestedCityId,
          sceneContext: body?.location
            ? options.nearLandmark === false ? { kind: "nearby_area" } : { kind: "public_spot", spot: activeSpot }
            : { kind: "city_overview" },
          items: cityMelons(requestedCityId, activeSpot, options),
          localEmpty: false,
        });
      }
      return json(route, {
        visitorType: body?.location ? "local" : "location_unknown",
        activeCityId: "changsha",
        sceneContext: body?.location
          ? options.nearLandmark === false ? { kind: "nearby_area" } : { kind: "public_spot", spot: state.activeSpot }
          : { kind: "city_overview" },
        items: discoveryMelons.map((item, index) => ({
          id: item.id,
          status: options.includeIncubating && index === 1 ? "incubating" : item.status,
          burialKind: options.includeNearbyAreaInCity && index === 0 ? "nearby_area" : "public_spot",
          topic: item.topic,
          cityId: state.activeSpot.cityId,
          districtId: state.activeSpot.districtId,
          spot: state.activeSpot,
          distanceBand: options.noNearby && item.distanceBand === "within_1km" ? "within_3km" : item.distanceBand,
          completedReads: item.id === melon.id ? state.completedReads : item.completedReads,
          title: options.includeIncubating && index === 1 ? "还在长的后续瓜" : item.title,
          commentCount: publicComments.length,
          isRemote: item.isRemote,
          revealMode: item.revealMode,
          ...(options.includeIncubating && index === 1 ? { maturesAt: "2026-08-04T14:00:00.000Z" } : {}),
        })),
        localEmpty: false,
      });
    }

    const requestMelons = [
      ...(state.fiveCities ? cityMelons(state.activeCityId, state.activeSpot, options) : discoveryMelons),
      ...state.createdMelons,
    ];
    const requestedMelon = requestMelons.find((item) => path === `/api/melons/${item.id}`);
    if (method === "GET" && requestedMelon) {
      return json(route, {
        melon: {
          ...requestedMelon,
          cityId: state.activeSpot.cityId,
          districtId: state.activeSpot.districtId,
          spot: state.activeSpot,
          completedReads: requestedMelon.id === melon.id ? state.completedReads : requestedMelon.completedReads,
          liked: state.likes.has(requestedMelon.id),
          squatCount: state.squats.has(requestedMelon.id) ? 1 : requestedMelon.squatCount ?? 0,
          reactions: {
            like: (requestedMelon.reactions.like ?? 0) + (state.likes.has(requestedMelon.id) ? 1 : 0),
          },
        },
        readToken: requestedMelon.id === melon.id ? "short-lived-read-token" : `read-token-${requestedMelon.id}`,
        completableAt: "2026-08-04T12:00:05.000Z",
      });
    }

    const completedMelon = requestMelons.find((item) => path === `/api/melons/${item.id}/complete`);
    if (method === "POST" && completedMelon) {
      state.completeRequests.push(body);
      const counted = !state.alreadyCompleted || completedMelon.id !== melon.id;
      let smallSeedAwarded = false;
      let autoConverted = false;
      if (counted) {
        if (completedMelon.id === melon.id) state.alreadyCompleted = true;
        state.validReadsToday += 1;
        smallSeedAwarded = state.validReadsToday <= 5;
        if (smallSeedAwarded) {
          state.wallet.smallSeedCount += 1;
          if (state.wallet.smallSeedCount === 5) {
            state.wallet.smallSeedCount = 0;
            state.wallet.trueSeedCount += 1;
            autoConverted = true;
          }
        }
        state.completedReads += 1;
      }
      return json(route, {
        counted,
        smallSeedAwarded,
        autoConverted,
        wallet: { ...state.wallet },
        authorExperienceAwarded: counted ? 1 : 0,
        completedReads: state.completedReads,
      });
    }

    if (method === "POST" && path === `/api/melons/${melon.id}/squat`) {
      state.squatRequests.push(body);
      if (body?.active) state.squats.set(melon.id, { melon, squattedAt: fixedNow, alertKind: null, unread: false });
      else state.squats.delete(melon.id);
      return json(route, { active: Boolean(body?.active), squatCount: state.squats.has(melon.id) ? 1 : 0 });
    }

    const squatMelon = requestMelons.find((item) => path === `/api/melons/${item.id}/squat`);
    if (method === "POST" && squatMelon) {
      state.squatRequests.push({ melonId: squatMelon.id, ...body });
      if (body?.active) state.squats.set(squatMelon.id, { melon: squatMelon, squattedAt: fixedNow, alertKind: null, unread: false });
      else state.squats.delete(squatMelon.id);
      return json(route, { active: Boolean(body?.active), squatCount: state.squats.has(squatMelon.id) ? 1 : 0 });
    }

    const reactionMelon = requestMelons.find((item) => path === `/api/melons/${item.id}/reactions`);
    if (method === "POST" && reactionMelon) {
      state.reactionRequests.push({ melonId: reactionMelon.id, ...body });
      if (state.reactionFailure && (!state.reactionFailure.once || !state.reactionFailureUsed)) {
        state.reactionFailureUsed = true;
        return json(route, { error: { code: "REACTION_FAILED", message: state.reactionFailure.message ?? "点赞暂时失败，请重试" } }, state.reactionFailure.status ?? 503);
      }
      if (body?.reaction === "like" && body?.active) state.likes.add(reactionMelon.id);
      if (body?.reaction === "like" && body?.active === false) state.likes.delete(reactionMelon.id);
      const baseLike = reactionMelon.reactions.like ?? 0;
      return json(route, {
        active: state.likes.has(reactionMelon.id),
        reactions: {
          like: baseLike + (state.likes.has(reactionMelon.id) ? 1 : 0),
        },
      });
    }

    const commentsMelon = requestMelons.find((item) => path === `/api/melons/${item.id}/comments`);
    if (method === "GET" && commentsMelon) {
      state.commentGetRequests.push({ melonId: commentsMelon.id, search: url.search });
      return json(route, { items: publicComments.map((item) => ({ ...item, melonId: commentsMelon.id })) });
    }

    if (method === "POST" && path === "/api/presence/verify") {
      state.presenceRequests.push(body);
      if (options.rejectLowAccuracy && body?.location?.accuracyM > 1_000) {
        return json(route, { error: { code: "LOCATION_LOW_ACCURACY", message: "定位精度不足，仍可继续远方围观" } }, 422);
      }
      const seekState = state.presenceSequence[Math.min(state.presenceAttempt, state.presenceSequence.length - 1)];
      state.presenceAttempt += 1;
      const local = seekState === "inside_zone" || seekState === "found";
      return json(route, {
        presence: local ? "local" : "remote",
        seekState,
        ...(local ? { presenceToken: `presence-token-${seekState}`, expiresAt: "2026-08-04T12:15:00.000Z" } : {}),
      });
    }

    if (method === "POST" && commentsMelon) {
      state.commentRequests.push(body);
      if (state.commentFailure && (!state.commentFailure.once || !state.commentFailureUsed)) {
        state.commentFailureUsed = true;
        return json(route, {
          error: {
            code: state.commentFailure.code,
            message: state.commentFailure.message,
          },
        }, state.commentFailure.status);
      }
      if (typeof body?.content !== "string" || body.content.length > 140) {
        return json(route, { error: { code: "INVALID_COMMENT", message: "评论不能超过 140 字" } }, 422);
      }
      if (!body?.presenceToken) {
        return json(route, { error: { code: "PRESENCE_REQUIRED", message: "需要有效的现场凭证" } }, 403);
      }
      return json(route, {
        id: `comment-${state.commentRequests.length}`,
        melonId: commentsMelon.id,
        alias: "巡城小猹 101",
        content: body.content,
        createdAt: fixedNow,
      });
    }

    if (method === "POST" && path === "/api/melons") {
      state.createRequests.push(body);
      if (typeof body?.operationId !== "string") {
        return json(route, { error: { code: "INVALID_OPERATION_ID", message: "缺少埋瓜操作编号" } }, 400);
      }
      const previousCreateResult = state.createOperations.get(body.operationId);
      if (previousCreateResult) return json(route, structuredClone(previousCreateResult), 201);
      if (options.unopenedNearbyCity && body.burialKind === "nearby_area") {
        return json(route, { error: { code: "nearby_city_unavailable", message: "当前生活圈尚未开放" } }, 403);
      }
      if (state.plantDistanceFailure) {
        return json(
          route,
          { error: { code: "LOCATION_OUT_OF_RANGE", message: "请到公共地点 500 米内再埋瓜" } },
          403,
        );
      }
      const status = state.createStatusSequence.shift() ?? "incubating";
      const trueSeedAwarded = status === "incubating" && !state.originalRewardClaimed;
      if (trueSeedAwarded) {
        state.originalRewardClaimed = true;
        state.wallet.trueSeedCount += 1;
      }
      const resolvedCityId = body.burialKind === "nearby_area" ? options.realLocationCityId ?? state.activeCityId : state.activeSpot.cityId;
      const createdSpot = body.burialKind === "nearby_area"
        ? {
            id: `nearby-area-${resolvedCityId}`,
            cityId: resolvedCityId,
            districtId: "nearby-area",
            name: "附近生活圈",
          }
        : state.activeSpot;
      const createdMelon = {
        id: `melon-new-${state.createdMelons.length + 1}`,
        status,
        topic: body.topic,
        cityId: createdSpot.cityId,
        districtId: createdSpot.districtId,
        spot: createdSpot,
        burialKind: body.burialKind,
        distanceBand: "within_1km",
        maturesAt: status === "incubating" ? "2026-08-04T14:00:00.000Z" : undefined,
        completedReads: 0,
        isRemote: false,
        revealMode: "open",
        alias: "巡城小猹 101",
        title: body.title,
        content: body.content,
        createdAt: fixedNow,
        squatted: false,
        squatCount: 0,
        liked: false,
        reactions: { like: 0 },
      };
      if (status === "incubating" || status === "mature") state.createdMelons.unshift(createdMelon);
      const result = {
        id: createdMelon.id,
        status,
        cityId: createdMelon.cityId,
        ...(createdMelon.maturesAt ? { maturesAt: createdMelon.maturesAt } : {}),
        trueSeedAwarded,
        wallet: { ...state.wallet },
      };
      state.createOperations.set(body.operationId, structuredClone(result));
      return json(route, result, 201);
    }

    if (method === "GET" && path === "/api/fields/me") {
      state.fieldRequests.push({ at: Date.now() });
      return json(route, ownField(state));
    }

    if (method === "POST" && path === "/api/fields/me/plant") {
      state.plantRequests.push(body);
      if (state.plantFailure && (!state.plantFailure.once || !state.plantFailureUsed)) {
        state.plantFailureUsed = true;
        return json(route, {
          error: {
            code: state.plantFailure.code ?? "PLANT_FAILED",
            message: state.plantFailure.message ?? "播种暂时失败，真瓜籽没有扣除。",
          },
        }, state.plantFailure.status ?? 503);
      }
      if (typeof body?.operationId !== "string") {
        return json(route, { error: { code: "INVALID_OPERATION_ID", message: "缺少播种操作编号" } }, 400);
      }
      const previousPlantResult = state.plantOperations.get(body.operationId);
      if (previousPlantResult) return json(route, structuredClone(previousPlantResult));
      if (state.wallet.trueSeedCount < 1) {
        return json(route, { error: { code: "TRUE_SEED_REQUIRED", message: "还没有真瓜籽" } }, 409);
      }
      const plotPlants = state.plants.filter((plant) => plant.plotIndex === body?.plotIndex);
      if (plotPlants.length >= 3 || state.plants.length >= 9) {
        return json(route, { error: { code: "FIELD_PLOT_FULL", message: "这片土地已经种满了" } }, 409);
      }
      const slotIndex = [0, 1, 2].find((slot) => !plotPlants.some((plant) => plant.slotIndex === slot));
      const plant = {
        id: `plant-${state.plants.length + 1}`,
        plotIndex: body.plotIndex,
        slotIndex,
        plantedAt: fixedNow,
        maturesAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
        stage: "seedling",
      };
      state.wallet.trueSeedCount -= 1;
      state.plants.push(plant);
      const result = { plant, wallet: { ...state.wallet }, field: ownField(state) };
      state.plantOperations.set(body.operationId, structuredClone(result));
      return json(route, result);
    }

    if (method === "POST" && path === "/api/fields/me/harvest") {
      state.harvestRequests.push(body);
      if (state.harvestFailure && (!state.harvestFailure.once || !state.harvestFailureUsed)) {
        state.harvestFailureUsed = true;
        return json(route, {
          error: {
            code: state.harvestFailure.code ?? "HARVEST_FAILED",
            message: state.harvestFailure.message ?? "收瓜暂时失败，瓜田保持原样。",
          },
        }, state.harvestFailure.status ?? 503);
      }
      const allMature = state.plants.length === 9 && state.plants.every((plant) => plant.stage === "mature");
      if (!allMature) {
        return json(route, { error: { code: "FIELD_NOT_READY", message: "九个瓜还没有全部成熟" } }, 409);
      }
      state.plants = [];
      state.experience.total += 9;
      state.experience.fromHarvests += 9;
      return json(route, {
        harvestedCount: 9,
        experienceAwarded: 9,
        experience: { ...state.experience },
        field: ownField(state),
      });
    }

    if (method === "GET" && path === `/api/fields/${encodeURIComponent(melon.alias)}`) {
      return json(route, otherField);
    }

    if (method === "GET" && path === `/api/fields/${melon.alias}`) {
      return json(route, otherField);
    }

    return json(route, { error: { code: "UNMOCKED_API", message: `${method} ${path} 没有测试 fixture` } }, 501);
  });

  return state;
}

export async function enterIsland(page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const enterButton = page.getByRole("button", { name: /匿名进街|匿名进城|进入猹猹街|进入猹猹王国/ });
  if (await enterButton.isVisible().catch(() => false)) await enterButton.click();
  await expect(page.getByRole("main")).toBeVisible();
}

export function melonTrigger(page) {
  return page.getByRole("button", { name: /瓜区总览：\d+颗瓜，点开挑选/ }).first();
}

function ownField(state) {
  const plots = [0, 1, 2].map((plotIndex) => ({
    plotIndex,
    capacity: 3,
    plants: state.plants.filter((plant) => plant.plotIndex === plotIndex).sort((a, b) => a.slotIndex - b.slotIndex),
  }));
  const matureCount = state.plants.filter((plant) => plant.stage === "mature").length;
  return {
    alias: "巡城小猹 101",
    animal: "猹",
    plots,
    plantedCount: state.plants.length,
    matureCount,
    nextMaturesAt: state.plants.find((plant) => plant.stage !== "mature")?.maturesAt,
    melons: structuredClone(state.createdMelons),
    wallet: { ...state.wallet },
    experience: { ...state.experience },
    canHarvest: state.plants.length === 9 && matureCount === 9,
  };
}

export function openedMelonDialog(page) {
  return page
    .getByRole("dialog")
    .filter({ has: page.getByRole("heading", { name: melon.title, exact: true }) })
    .first();
}

export function completeReadControl(dialog) {
  return dialog.getByRole("button", { name: /完成.*吃瓜|吃完|留.*瓜籽/ }).first();
}

export async function openMelon(page) {
  const overview = melonTrigger(page);
  await expect(overview).toBeVisible();
  await overview.click();
  const trigger = page.getByRole("article", { name: melon.title, exact: true }).getByRole("button", { name: "直接吃", exact: true });
  await expect(trigger).toBeVisible();
  await trigger.click();
  const dialog = openedMelonDialog(page);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: melon.title, exact: true })).toBeVisible();
  return dialog;
}
