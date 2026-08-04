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
const melonDistanceLabel = /1\s*km\s*内/i;

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
    completeRequests: [],
    createRequests: [],
    discoveryRequests: [],
    squatRequests: [],
    seedCount: options.seedCount ?? 2,
    completedReads: melon.completedReads,
    alreadyCompleted: options.alreadyCompleted ?? false,
    plantDistanceFailure: options.plantDistanceFailure ?? false,
  };

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    const body = request.postDataJSON?.() ?? null;

    if (method === "POST" && path === "/api/session/anonymous") {
      return json(route, { alias: "巡岛小猹 101", animal: "猹", seedCount: state.seedCount });
    }

    if (method === "GET" && path === "/api/cities") {
      return json(route, [
        {
          id: "changsha",
          name: "长沙",
          districts: [{ id: "furong", name: "芙蓉区" }],
          spots: [spot],
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
        items: [
          {
            id: melon.id,
            status: "mature",
            topic: melon.topic,
            cityId: melon.cityId,
            districtId: melon.districtId,
            spot,
            distanceBand: melon.distanceBand,
            completedReads: state.completedReads,
            isRemote: false,
          },
        ],
        localEmpty: false,
      });
    }

    if (method === "GET" && path === `/api/melons/${melon.id}`) {
      return json(route, {
        melon: { ...melon, completedReads: state.completedReads },
        readToken: "short-lived-read-token",
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

    if (method === "POST" && path === `/api/melons/${melon.id}/comments`) {
      state.commentRequests.push(body);
      if (typeof body?.content !== "string" || body.content.length > 140) {
        return json(route, { error: { code: "INVALID_COMMENT", message: "评论不能超过 140 字" } }, 422);
      }
      return json(route, {
        id: `comment-${state.commentRequests.length}`,
        melonId: melon.id,
        alias: "巡岛小猹 101",
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
        alias: "巡岛小猹 101",
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
  const enterButton = page.getByRole("button", { name: /匿名登岛|进入猹猹岛/ });
  if (await enterButton.isVisible().catch(() => false)) await enterButton.click();
  await expect(page.getByRole("main")).toBeVisible();
}

export function melonTrigger(page) {
  return page
    .getByRole("button")
    .filter({ hasText: melonTopicLabel })
    .filter({ hasText: spot.name })
    .filter({ hasText: melonDistanceLabel })
    .first();
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
