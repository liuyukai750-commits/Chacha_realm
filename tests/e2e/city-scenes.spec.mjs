import { expect, test } from "@playwright/test";
import { enterIsland, installV0Api } from "./fixtures/v0-api.mjs";

const cityScenes = [
  {
    city: "长沙",
    landmark: /天心阁与橘子洲|五一广场|湘江/,
    day: /changsha-wuyi-day/,
    night: /changsha-wuyi-night/,
  },
  {
    city: "北京",
    landmark: /天坛/,
    day: /beijing-temple-of-heaven-day-v1/,
    night: /beijing-temple-of-heaven-night-v1/,
  },
  {
    city: "上海",
    landmark: /东方明珠/,
    day: /shanghai-oriental-pearl-day-v1/,
    night: /shanghai-oriental-pearl-night-v1/,
  },
  {
    city: "广州",
    landmark: /广州塔/,
    day: /guangzhou-canton-tower-day-v1/,
    night: /guangzhou-canton-tower-night-v1/,
  },
  {
    city: "深圳",
    landmark: /深圳湾/,
    day: /shenzhen-bay-day-v1/,
    night: /shenzhen-bay-night-v1/,
  },
];

async function enterDemo(page) {
  await page.route("**/api/**", (route) => route.fulfill({
    status: 503,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify({ error: { code: "service_unavailable", message: "测试环境未连接数据服务" } }),
  }));
  await page.goto("/");
  await page.getByRole("button", { name: "进入本地试玩", exact: true }).click();
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.getByTestId("radar-surface")).toHaveAttribute("data-scene-context", "city_overview");
}

async function switchCity(page, city) {
  const currentCity = page.getByRole("button", { name: /当前城市.+，切换城市/ });
  if ((await currentCity.getAttribute("aria-label")) !== `当前城市${city}，切换城市`) {
    await currentCity.click();
    const picker = page.getByRole("dialog");
    await picker.getByRole("button", { name: new RegExp(`^${city}城市瓜域`) }).click();
  }
  await expect(page.getByRole("button", { name: `当前城市${city}，切换城市` })).toBeVisible();
}

function sceneImage(page) {
  return page.getByTestId("radar-surface").locator("img.urban-scene-image");
}

async function expectSceneLoaded(page, expectedSource) {
  const image = sceneImage(page);
  await expect(image).toHaveAttribute("src", expectedSource);
  await expect.poll(() => image.evaluate((element) => element.complete && element.naturalWidth > 0), {
    message: `场景资源 ${expectedSource} 必须真实加载成功`,
  }).toBe(true);
  return image.getAttribute("src");
}

async function assertNoHorizontalOverflow(page, label) {
  const layout = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(layout.scrollWidth, `${label}不能产生横向滚动`).toBeLessThanOrEqual(layout.clientWidth + 1);
}

test.describe("五城场景与附近生活圈验收", () => {
  // This matrix intentionally loads ten distinct large scene assets in one journey.
  // First-run image optimization in development can exceed the suite's 30s default.
  test.setTimeout(90_000);

  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-08-10T10:00:00+08:00"));
  });

  test("CITY-SCENES：五城日夜资源和地标语义各不相同", async ({ page }) => {
    await enterDemo(page);

    const daySources = new Set();
    for (const expected of cityScenes) {
      await switchCity(page, expected.city);
      const stage = page.getByTestId("radar-surface");
      await expect(stage).toHaveAttribute("data-scene-context", "city_overview");
      await expect(stage).toHaveAccessibleName(new RegExp(`${expected.city}.*${expected.landmark.source}`));
      daySources.add(await expectSceneLoaded(page, expected.day));
    }
    expect(daySources.size, "五城日间场景必须使用五个不同资源").toBe(cityScenes.length);

    await page.clock.setFixedTime(new Date("2026-08-10T20:00:00+08:00"));
    await page.clock.runFor(60_000);
    await expect(page.locator(".sunny-shell")).toHaveAttribute("data-day-phase", "night");

    const nightSources = new Set();
    for (const expected of cityScenes) {
      await switchCity(page, expected.city);
      nightSources.add(await expectSceneLoaded(page, expected.night));
    }
    expect(nightSources.size, "五城夜间场景必须使用五个不同资源").toBe(cityScenes.length);
  });

  test("CITY-OVERVIEW：五城昼夜雷达都只显示单一瓜量总览", async ({ page }) => {
    await installV0Api(page, { fiveCities: true });
    await enterIsland(page);

    for (const phase of ["day", "night"]) {
      if (phase === "night") {
        await page.clock.setFixedTime(new Date("2026-08-10T20:00:00+08:00"));
        await page.clock.runFor(60_000);
      }
      for (const expected of cityScenes) {
        await switchCity(page, expected.city);
        const stage = page.getByTestId("radar-surface");
        await expect(stage).toHaveAttribute("data-scene-context", "city_overview");
        await expect(stage.locator(".melon-node")).toHaveCount(0);
        await expect(page.locator(".radar-summary-signal")).toHaveCount(1);
        await expect(page.getByRole("button", { name: /瓜区总览：\d+颗瓜，点开挑选/ })).toBeVisible();
        await assertNoHorizontalOverflow(page, `${expected.city}${phase === "day" ? "日间" : "夜间"}瓜量总览`);
      }
    }
  });

  test("NEARBY-SHARED：任意城市的附近 1km 共用生活圈资源且不展示地标瓜", async ({ page }) => {
    await enterDemo(page);

    for (const expected of cityScenes) {
      await switchCity(page, expected.city);
      const scope = page.getByRole("group", { name: "吃瓜范围" });
      await scope.getByRole("button", { name: /模拟附近 1km/ }).click();

      await expect(page.getByRole("button", { name: `当前城市${expected.city}，切换城市` })).toBeVisible();
      const stage = page.getByTestId("radar-surface");
      await expect(stage).toHaveAttribute("data-scene-context", "nearby_area");
      await expectSceneLoaded(page, /nearby-neighborhood-day-v1/);
      await expect(stage).toHaveAccessibleName(/普通生活街区.*附近 1 公里.*尚未进入公共地标范围/);
      await expect(stage.locator(".melon-node")).toHaveCount(0);

      await scope.getByRole("button", { name: /城市瓜区/ }).click();
      await expect(stage).toHaveAttribute("data-scene-context", "city_overview");
    }

    await page.clock.setFixedTime(new Date("2026-08-10T20:00:00+08:00"));
    await page.clock.runFor(60_000);
    await page.getByRole("group", { name: "吃瓜范围" }).getByRole("button", { name: /模拟附近 1km/ }).click();
    await expectSceneLoaded(page, /nearby-neighborhood-night-v1/);
  });

  test("CITY-MOBILE：375 / 430 下五城与附近场景无横向溢出", async ({ page }, testInfo) => {
    test.skip(!["chromium-375", "chromium-430"].includes(testInfo.project.name), "仅覆盖两个移动视口");
    await enterDemo(page);

    for (const expected of cityScenes) {
      await switchCity(page, expected.city);
      await expectSceneLoaded(page, expected.day);
      await assertNoHorizontalOverflow(page, `${testInfo.project.name} ${expected.city}城市场景`);
    }

    await page.getByRole("group", { name: "吃瓜范围" }).getByRole("button", { name: /模拟附近 1km/ }).click();
    await expectSceneLoaded(page, /nearby-neighborhood-day-v1/);
    await assertNoHorizontalOverflow(page, `${testInfo.project.name} 附近生活圈`);
  });
});
