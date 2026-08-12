import { expect, test } from "@playwright/test";

import {
  cityFixture,
  enterIsland,
  fiveCityMatrix,
  fixedNow,
  installV0Api,
  primarySpotForCity,
} from "./fixtures/v0-api.mjs";

const preciseLocation = { latitude: 28.195397, longitude: 112.976869, accuracy: 18 };

async function allowLocation(context, baseURL, location = preciseLocation) {
  if (!baseURL) throw new Error("Playwright baseURL 未配置");
  await context.setGeolocation(location);
  await context.grantPermissions(["geolocation"], { origin: new URL(baseURL).origin });
}

async function mockLocationFailure(page, context, mode) {
  await context.clearPermissions();
  if (mode === "http") {
    await page.addInitScript(() => {
      Object.defineProperty(window, "isSecureContext", { configurable: true, value: false });
    });
    return;
  }
  await page.addInitScript((failureMode) => {
    const errors = {
      denied: { code: 1, message: "User denied Geolocation", PERMISSION_DENIED: 1 },
      timeout: { code: 3, message: "Timeout expired", PERMISSION_DENIED: 1 },
      lowAccuracy: null,
    };
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        clearWatch() {},
        getCurrentPosition(success, failure) {
          if (failureMode === "lowAccuracy") {
            success?.({
              coords: { latitude: 28.195397, longitude: 112.976869, accuracy: 2_500 },
              timestamp: Date.now(),
            });
            return;
          }
          failure?.(errors[failureMode]);
        },
        watchPosition(_success, failure) {
          failure?.(errors[failureMode] ?? errors.timeout);
          return 1;
        },
      },
    });
  }, mode);
}

async function switchCity(page, cityName) {
  await page.getByRole("button", { name: /当前城市.*切换城市/ }).click();
  const picker = page.getByRole("dialog", { name: /换一个城市瓜域逛逛/ });
  await expect(picker).toBeVisible();
  await picker.getByRole("button", { name: new RegExp(`${cityName}城市瓜域`) }).click();
  await expect(page.getByRole("button", { name: new RegExp(`当前城市${cityName}`) })).toBeVisible();
}

async function openBurySheet(page) {
  await page.getByRole("button", { name: "埋瓜", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "埋下一颗瓜" });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function fillBuryForm(dialog, cityName) {
  await dialog.getByRole("combobox", { name: /话题/ }).selectOption("daily");
  await dialog.getByRole("textbox", { name: /标题/ }).fill(`${cityName}街角的一件小事`);
  await dialog.getByRole("textbox", { name: /故事内容/ }).fill(`${cityName}的公开街角有人把掉落的物品放到显眼处，路过的人都能安全看见。`);
}

async function submitNearbyMelon(page, cityName) {
  const dialog = await openBurySheet(page);
  await dialog.getByRole("button", { name: /附近生活圈/ }).click();
  await fillBuryForm(dialog, cityName);
  await dialog.getByRole("button", { name: /模拟抵达并埋瓜|把秘密压进土里/ }).click();
  await expect(dialog).toBeHidden();
}

async function submitPublicSpotMelon(page, cityName, spotName) {
  const dialog = await openBurySheet(page);
  await dialog.getByRole("button", { name: spotName, exact: true }).click();
  await fillBuryForm(dialog, cityName);
  await dialog.getByRole("button", { name: /模拟抵达并埋瓜|把秘密压进土里/ }).click();
  await expect(dialog).toBeHidden();
}

async function expandBasket(page) {
  const handle = page.getByRole("button", { name: /瓜篮/ });
  await expect(handle).toBeVisible();
  if (await handle.getAttribute("aria-expanded") !== "true") await handle.click();
  await expect(handle).toHaveAttribute("aria-expanded", "true");
}

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date(fixedNow) });
});

test.describe("五城同步发布门禁", () => {
  test("CITY-GATE：切城、公共点表单、payload、成功归属和发现结果不串城", async ({ baseURL, context, page }) => {
    const api = await installV0Api(page, { fiveCities: true });
    await allowLocation(context, baseURL);
    await enterIsland(page);

    for (const city of fiveCityMatrix) {
      if (city.id !== "changsha") await switchCity(page, city.name);
      const dialog = await openBurySheet(page);
      for (const publicSpot of city.spots) {
        await expect(dialog.getByRole("button", { name: publicSpot.name, exact: true }), `${city.name} 应展示 ${publicSpot.name}`).toBeVisible();
      }
      await dialog.getByRole("button", { name: "关闭", exact: true }).click();

      const publicSpot = primarySpotForCity(city.id);
      await submitPublicSpotMelon(page, city.name, publicSpot.name);
      const createPayload = api.createRequests.at(-1);
      expect(createPayload).toMatchObject({ burialKind: "public_spot", spotId: publicSpot.id });
      expect(createPayload).not.toHaveProperty("cityId");
      expect(api.discoveryRequests.at(-1)).toMatchObject({ location: expect.any(Object) });
      expect(api.discoveryRequests.at(-1)).not.toHaveProperty("selectedCityId");

      await expandBasket(page);
      const articles = page.getByRole("article");
      const articleCount = await articles.count();
      expect(articleCount, `${city.name} 发现结果应有本城或远方瓜`).toBeGreaterThan(0);
      for (let index = 0; index < articleCount; index += 1) {
        const text = await articles.nth(index).innerText();
        expect(text, `${city.name} 发现结果不应混入其他城市公共点`).not.toMatch(otherCitySpotPattern(city.id));
      }
    }
  });

  test("DOUBLE-BURY：五城 nearby 与公共点发布均归属当前城市", async ({ baseURL, context, page }) => {
    const api = await installV0Api(page, { fiveCities: true });
    await allowLocation(context, baseURL);
    await enterIsland(page);

    for (const city of fiveCityMatrix) {
      if (city.id !== "changsha") await switchCity(page, city.name);
      await submitNearbyMelon(page, city.name);
      expect(api.createRequests.at(-1)).toMatchObject({ burialKind: "nearby_area" });
      expect(api.createRequests.at(-1)).not.toHaveProperty("cityId");
      expect(api.discoveryRequests.at(-1)).toMatchObject({ location: expect.any(Object) });
      expect(api.discoveryRequests.at(-1)).not.toHaveProperty("selectedCityId");

      const publicSpot = primarySpotForCity(city.id);
      await submitPublicSpotMelon(page, city.name, publicSpot.name);
      expect(api.createRequests.at(-1)).toMatchObject({ burialKind: "public_spot", spotId: publicSpot.id });
      expect(api.createRequests.at(-1)).not.toHaveProperty("cityId");
      expect(api.discoveryRequests.at(-1)).toMatchObject({ location: expect.any(Object) });
      expect(api.discoveryRequests.at(-1)).not.toHaveProperty("selectedCityId");
    }
  });

  test("REAL-CITY-P0：长沙人在上海浏览时 nearby 埋瓜归入长沙", async ({ baseURL, context, page }) => {
    const api = await installV0Api(page, { fiveCities: true, realLocationCityId: "changsha" });
    await allowLocation(context, baseURL);
    await enterIsland(page);
    await switchCity(page, "上海");

    await submitNearbyMelon(page, "上海");

    const createPayload = api.createRequests.at(-1);
    expect(createPayload).toMatchObject({ burialKind: "nearby_area", location: expect.any(Object) });
    expect(createPayload).not.toHaveProperty("cityId");
    await expect(page.getByRole("button", { name: /当前城市长沙/ })).toBeVisible();
    await expect(page.locator(".bury-success-panel").getByText(/归入长沙/)).toBeVisible();
    expect(api.createdMelons[0]).toMatchObject({ cityId: "changsha", spot: { cityId: "changsha", name: "附近生活圈" } });
  });

  test("NEARBY-CITY：五城附近范围只显示生活圈瓜，当前 cityId 不暗跳长沙", async ({ baseURL, context, page }) => {
    const api = await installV0Api(page, { fiveCities: true });
    await allowLocation(context, baseURL);
    await enterIsland(page);

    for (const city of fiveCityMatrix) {
      if (city.id !== "changsha") await switchCity(page, city.name);
      const requestCount = api.discoveryRequests.length;
      await page.getByRole("group", { name: "吃瓜范围" }).getByRole("button", { name: /附近 1km/ }).click();
      await expect(page.getByRole("button", { name: new RegExp(`当前城市${city.name}`) })).toBeVisible();
      await expect.poll(() => api.discoveryRequests.length).toBeGreaterThan(requestCount);
      const nearbyRequest = api.discoveryRequests.slice(requestCount).find((request) => request.location);
      expect(nearbyRequest).toMatchObject({ location: expect.any(Object) });
      expect(nearbyRequest).not.toHaveProperty("selectedCityId");

      await expandBasket(page);
      const articles = page.getByRole("article");
      await expect(articles).toHaveCount(4);
      for (let index = 0; index < 4; index += 1) {
        const text = await articles.nth(index).innerText();
        expect(text).toContain(city.name);
        expect(text).not.toMatch(/远方瓜棚|远方围观/);
        expect(text).not.toMatch(otherCitySpotPattern(city.id));
      }
    }
  });
});

test.describe("埋瓜能力失败门禁", () => {
  for (const failure of [
    { mode: "denied", copy: /定位已拒绝|授权|埋瓜需要本次定位/ },
    { mode: "timeout", copy: /没有取到位置|重试|继续按城市浏览/ },
    { mode: "http", copy: /不是安全连接|不能读取位置/ },
  ]) {
    test(`BURY-GEO-${failure.mode.toUpperCase()}：失败时不发帖不奖励`, async ({ context, page }) => {
      const api = await installV0Api(page, { fiveCities: true });
      await mockLocationFailure(page, context, failure.mode);
      await enterIsland(page);

      const dialog = await openBurySheet(page);
      await dialog.getByRole("button", { name: /附近生活圈/ }).click();
      await fillBuryForm(dialog, "长沙");
      await dialog.getByRole("button", { name: /把秘密压进土里/ }).click();

      await expect(dialog.getByRole("alert")).toContainText(failure.copy);
      expect(api.createRequests).toEqual([]);
      expect(api.discoveryRequests).toHaveLength(1);
      expect(api.wallet.trueSeedCount).toBe(0);
    });
  }

  test("BURY-GEO-LOW-ACCURACY：低精度被服务端明确拒绝且不奖励", async ({ baseURL, context, page }) => {
    const api = await installV0Api(page, {
      fiveCities: true,
      plantDistanceFailure: true,
    });
    await allowLocation(context, baseURL, { ...preciseLocation, accuracy: 2_500 });
    await enterIsland(page);

    const city = cityFixture("changsha");
    await submitPublicSpotAttempt(page, city.name, primarySpotForCity(city.id).name);
    const dialog = page.getByRole("dialog", { name: "埋下一颗瓜" });
    await expect(dialog.getByRole("alert")).toContainText(/500\s*米|距离|公共地点/);
    expect(api.createRequests).toHaveLength(1);
    expect(api.wallet.trueSeedCount).toBe(0);
  });
});

test.describe("成熟、孵化、评论和移动能力模拟", () => {
  test("READ-MODES：成熟瓜直接打开，孵化瓜只能蹲守，无顺藤摸瓜残留", async ({ page }) => {
    await installV0Api(page, { includeIncubating: true });
    await enterIsland(page);
    await expandBasket(page);

    const matureRow = page.getByRole("article", { name: "老板凌晨发来一个小改动", exact: true });
    await expect(matureRow.getByRole("button", { name: "直接吃", exact: true })).toBeVisible();
    await expect(matureRow.getByRole("button", { name: "顺藤摸瓜", exact: true })).toHaveCount(0);

    const incubatingRow = page.getByRole("article").filter({ hasText: /还在长|成熟|分钟|小时/ }).first();
    await expect(incubatingRow.getByRole("button", { name: /蹲瓜|蹲后续/ })).toBeVisible();
    await expect(incubatingRow.getByRole("button", { name: "顺藤摸瓜", exact: true })).toHaveCount(0);

    await matureRow.getByRole("button", { name: "直接吃", exact: true }).click();
    await expect(page.getByRole("dialog").filter({ hasText: "老板凌晨发来一个小改动" })).toBeVisible();
  });

  test("COMMENTS-REMOTE-LOCAL：远程评论只读，现场评论必须先拿凭证", async ({ baseURL, context, page }) => {
    const api = await installV0Api(page);
    await allowLocation(context, baseURL);
    await enterIsland(page);
    await expandBasket(page);

    const remoteRow = page.getByRole("article", { name: "远方瓜棚传来一阵笑声", exact: true });
    await remoteRow.getByRole("button", { name: "远方围观", exact: true }).click();
    let dialog = page.getByRole("dialog").filter({ hasText: "远方瓜棚传来一阵笑声" });
    await expect(dialog.getByRole("textbox", { name: /评论/ })).toHaveCount(0);
    await expect(dialog).toContainText(/远方围观模式|可读全部评论/);
    await dialog.getByRole("button", { name: "关闭", exact: true }).click();

    await page.getByRole("article", { name: "老板凌晨发来一个小改动", exact: true }).getByRole("button", { name: "直接吃", exact: true }).click();
    dialog = page.getByRole("dialog").filter({ hasText: "老板凌晨发来一个小改动" });
    await expect(dialog.getByRole("textbox", { name: /评论/ })).toHaveCount(0);
    await dialog.getByRole("button", { name: "验证现场评论资格", exact: true }).click();
    await expect(dialog.getByRole("textbox", { name: /评论/ })).toBeVisible();
    expect(api.presenceRequests).toHaveLength(1);
  });

  test("MOBILE-MATRIX：375/430/desktop、昼夜、reduced motion、触摸目标和软键盘为模拟验收", async ({ page }, testInfo) => {
    testInfo.annotations.push({
      type: "capability-simulation",
      description: "Chromium 视口、触摸、昼夜、reduced motion 与软键盘缩高模拟；不等于 iOS/Android/鸿蒙真机验收",
    });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await installV0Api(page, { fiveCities: true });
    await enterIsland(page);

    for (const viewport of [
      { width: 375, height: 812 },
      { width: 430, height: 932 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      for (const phase of ["夜间", "日间"]) {
        const toggle = page.getByRole("button", { name: new RegExp(`切换到${phase}模式`) });
        if (await toggle.count()) await toggle.click();
        await expect(page.getByTestId("radar-surface")).toBeVisible();
      }
      const hitTargets = await page.locator("button:visible").evaluateAll((buttons) =>
        buttons.map((button) => {
          const box = button.getBoundingClientRect();
          return { name: button.innerText || button.getAttribute("aria-label") || "", width: box.width, height: box.height };
        }),
      );
      for (const target of hitTargets.filter((item) => !/关闭/.test(item.name))) {
        expect(Math.min(target.width, target.height), `${viewport.width}px ${target.name} 触摸目标`).toBeGreaterThanOrEqual(36);
      }
      await page.setViewportSize({ width: Math.min(viewport.width, 430), height: 520 });
      const layout = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
      expect(layout.scroll).toBeLessThanOrEqual(layout.client + 1);
    }
  });
});

async function submitPublicSpotAttempt(page, cityName, spotName) {
  const dialog = await openBurySheet(page);
  await dialog.getByRole("button", { name: spotName, exact: true }).click();
  await fillBuryForm(dialog, cityName);
  await dialog.getByRole("button", { name: /把秘密压进土里|模拟抵达并埋瓜/ }).click();
}

function otherCitySpotPattern(activeCityId) {
  const names = fiveCityMatrix
    .filter((city) => city.id !== activeCityId)
    .flatMap((city) => city.spots.map((spot) => spot.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  return new RegExp(names.join("|"));
}
