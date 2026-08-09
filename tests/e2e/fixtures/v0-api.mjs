import { expect } from "@playwright/test";

export const fixedNow = "2026-08-04T12:00:00.000Z";

export const spot = {
  id: "spot-wuyi-square",
  cityId: "changsha",
  districtId: "furong",
  name: "五一广场",
};

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
  alias: "加班仓鼠 237",
  title: "老板凌晨发来一个小改动",
  content: "我回了一个刚准备睡，他秒回说那正好，现在我和广场的路灯一样精神。",
  createdAt: "2026-08-04T08:00:00.000Z",
  squatted: false,
  reactions: { juicy: 2, wild: 1, hug: 0, follow_up: 0 },
};

const melonTopicLabel = "职场瓜";
const melonDistanceLabel = /同一瓜区/;

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

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const otherField = {
  alias: melon.alias,
  animal: "仓鼠",
  progress: { seedCount: 7, stage: "flower", nextStageAt: 12 },
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
  const state = {
    commentRequests: [],
    commentGetRequests: [],
    completeRequests: [],
    createRequests: [],
    discoveryRequests: [],
    presenceRequests: [],
    reactionRequests: [],
    squatRequests: [],
    seedCount: options.seedCount ?? 2,
    completedReads: melon.completedReads,
    alreadyCompleted: options.alreadyCompleted ?? false,
    plantDistanceFailure: options.plantDistanceFailure ?? false,
    activeSpot: options.spot ?? spot,
    presenceSequence: options.presenceSequence ?? ["inside_zone"],
    presenceAttempt: 0,
    commentFailure: options.commentFailure ?? null,
    commentFailureUsed: false,
  };

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    const body = request.postDataJSON?.() ?? null;

    if (method === "POST" && path === "/api/session/anonymous") {
      return json(route, { alias: "巡城小猹 101", animal: "猹", seedCount: state.seedCount });
    }

    if (method === "GET" && path === "/api/cities") {
      return json(route, [
        {
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
        },
      ]);
    }

    if (method === "POST" && path === "/api/discovery") {
      state.discoveryRequests.push(body);
      return json(route, {
        visitorType: body?.location ? "local" : "location_unknown",
        activeCityId: "changsha",
        items: discoveryMelons.map((item) => ({
          id: item.id,
          status: item.status,
          topic: item.topic,
          cityId: state.activeSpot.cityId,
          districtId: state.activeSpot.districtId,
          spot: state.activeSpot,
          distanceBand: item.distanceBand,
          completedReads: item.id === melon.id ? state.completedReads : item.completedReads,
          title: item.title,
          commentCount: publicComments.length,
          isRemote: item.isRemote,
        })),
        localEmpty: false,
      });
    }

    const requestedMelon = discoveryMelons.find((item) => path === `/api/melons/${item.id}`);
    if (method === "GET" && requestedMelon) {
      return json(route, {
        melon: {
          ...requestedMelon,
          cityId: state.activeSpot.cityId,
          districtId: state.activeSpot.districtId,
          spot: state.activeSpot,
          completedReads: requestedMelon.id === melon.id ? state.completedReads : requestedMelon.completedReads,
        },
        readToken: requestedMelon.id === melon.id ? "short-lived-read-token" : `read-token-${requestedMelon.id}`,
        completableAt: "2026-08-04T12:00:05.000Z",
      });
    }

    if (method === "POST" && path === `/api/melons/${melon.id}/complete`) {
      state.completeRequests.push(body);
      const counted = !state.alreadyCompleted;
      if (counted) {
        state.alreadyCompleted = true;
        state.seedCount += 1;
        state.completedReads += 1;
      }
      return json(route, {
        counted,
        readerSeedAwarded: counted,
        authorSeedAwarded: counted,
        readerSeedCount: state.seedCount,
        completedReads: state.completedReads,
      });
    }

    if (method === "POST" && path === `/api/melons/${melon.id}/squat`) {
      state.squatRequests.push(body);
      return json(route, { active: Boolean(body?.active) });
    }

    const squatMelon = discoveryMelons.find((item) => path === `/api/melons/${item.id}/squat`);
    if (method === "POST" && squatMelon) {
      state.squatRequests.push({ melonId: squatMelon.id, ...body });
      return json(route, { active: Boolean(body?.active) });
    }

    const reactionMelon = discoveryMelons.find((item) => path === `/api/melons/${item.id}/reactions`);
    if (method === "POST" && reactionMelon) {
      state.reactionRequests.push({ melonId: reactionMelon.id, ...body });
      return json(route, {
        ...reactionMelon.reactions,
        [body?.reaction]: (reactionMelon.reactions[body?.reaction] ?? 0) + 1,
      });
    }

    const commentsMelon = discoveryMelons.find((item) => path === `/api/melons/${item.id}/comments`);
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
      if (state.plantDistanceFailure) {
        return json(
          route,
          { error: { code: "LOCATION_OUT_OF_RANGE", message: "请到公共地点 500 米内再埋瓜" } },
          403,
        );
      }
      return json(route, { id: "melon-new", status: "incubating", maturesAt: "2026-08-04T14:00:00.000Z" }, 201);
    }

    if (method === "GET" && path === "/api/fields/me") {
      return json(route, {
        alias: "巡城小猹 101",
        animal: "猹",
        progress: {
          seedCount: state.seedCount,
          stage:
            state.seedCount >= 21
              ? "ripe_melon"
              : state.seedCount >= 12
                ? "green_melon"
                : state.seedCount >= 7
                  ? "flower"
                  : state.seedCount >= 3
                    ? "vine"
                    : state.seedCount >= 1
                      ? "sprout"
                      : "bare",
          nextStageAt:
            state.seedCount < 1
              ? 1
              : state.seedCount < 3
                ? 3
                : state.seedCount < 7
                  ? 7
                  : state.seedCount < 12
                    ? 12
                    : state.seedCount < 21
                      ? 21
                      : undefined,
        },
        melons: [],
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
  await page.goto("/");
  const enterButton = page.getByRole("button", { name: /匿名进城|进入猹猹王国/ });
  if (await enterButton.isVisible().catch(() => false)) await enterButton.click();
  await expect(page.getByRole("main")).toBeVisible();
}

export function melonTrigger(page) {
  const accessibleName = new RegExp(
    `${escapeRegex(melonTopicLabel)}.*${escapeRegex(spot.name)}.*${melonDistanceLabel.source}`,
    "i",
  );
  return page.getByRole("button", { name: accessibleName }).first();
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
  const trigger = melonTrigger(page);
  await expect(trigger).toBeVisible();
  await trigger.click();
  const dialog = openedMelonDialog(page);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: melon.title, exact: true })).toBeVisible();
  return dialog;
}
