import { expect, test } from "@playwright/test";

import {
  completeReadControl,
  enterIsland,
  fiveCityMatrix,
  fixedNow,
  installV0Api,
} from "./fixtures/v0-api.mjs";

const cityLocations = {
  changsha: { latitude: 28.195397, longitude: 112.976869, accuracy: 18 },
  beijing: { latitude: 39.8823, longitude: 116.4066, accuracy: 18 },
  shanghai: { latitude: 31.2397, longitude: 121.4998, accuracy: 18 },
  guangzhou: { latitude: 23.1065, longitude: 113.3246, accuracy: 18 },
  shenzhen: { latitude: 22.517, longitude: 113.942, accuracy: 18 },
};

async function preparePhone(browser, baseURL, location) {
  if (!baseURL) throw new Error("Playwright baseURL 未配置");
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    geolocation: location,
    permissions: ["geolocation"],
    baseURL,
  });
  await context.grantPermissions(["geolocation"], { origin: new URL(baseURL).origin });
  const page = await context.newPage();
  await page.clock.install({ time: new Date(fixedNow) });
  return { context, page };
}

async function buryNearby(page, cityName, title) {
  await page.getByRole("button", { name: "埋瓜", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "埋下一颗瓜" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: /附近生活圈/ }).click();
  await dialog.getByRole("combobox", { name: /话题/ }).selectOption("daily");
  await dialog.getByRole("textbox", { name: /标题/ }).fill(title);
  await dialog.getByRole("textbox", { name: /故事内容/ }).fill(
    `${cityName}附近两台手机联调：只有同一固定坐标一公里内的另一只猹才能看到并吃完这颗瓜。`,
  );
  await dialog.getByRole("button", { name: /把秘密压进土里|模拟抵达并埋瓜/ }).click();
  await expect(dialog).toBeHidden();
}

async function openNearbyBasket(page) {
  await page.getByRole("group", { name: "吃瓜范围" }).getByRole("button", { name: /附近 1km/ }).click();
  const handle = page.getByRole("button", { name: /^瓜篮(?:\s|$)/ });
  await expect(handle).toBeVisible();
  if (await handle.getAttribute("aria-expanded") !== "true") await handle.click();
  await expect(handle).toHaveAttribute("aria-expanded", "true");
}

for (const city of fiveCityMatrix) {
  test(`TWO-PHONE-NEARBY：${city.name}两台手机可在 1km 内完成吃瓜，离开后不可见`, async ({ browser, baseURL }) => {
    const location = cityLocations[city.id];
    const publisher = await preparePhone(browser, baseURL, location);
    const reader = await preparePhone(browser, baseURL, location);

    try {
      const publisherApi = await installV0Api(publisher.page, {
        fiveCities: true,
        activeCityId: city.id,
        realLocationCityId: city.id,
        nearLandmark: false,
        sessionAlias: `${city.name}埋瓜猹 01`,
      });
      await enterIsland(publisher.page);

      const title = `${city.name}附近双机测试瓜`;
      await buryNearby(publisher.page, city.name, title);
      const created = publisherApi.createdMelons.at(-1);
      expect(created).toMatchObject({
        burialKind: "nearby_area",
        cityId: city.id,
        distanceBand: "within_1km",
      });

      created.status = "mature";
      delete created.maturesAt;

      const readerApi = await installV0Api(reader.page, {
        fiveCities: true,
        activeCityId: city.id,
        realLocationCityId: city.id,
        nearLandmark: false,
        createdMelons: [created],
        sessionAlias: `${city.name}吃瓜猹 02`,
        wallet: { smallSeedCount: 0, trueSeedCount: 0 },
        validReadsToday: 0,
      });
      await enterIsland(reader.page);
      await openNearbyBasket(reader.page);
      const nearbyZone = reader.page.locator(".zone-switcher").getByRole("button", { name: /附近生活圈/ });
      await expect(nearbyZone).toBeVisible();
      await nearbyZone.click();

      const article = reader.page.getByRole("article").filter({ hasText: title }).first();
      await expect(article).toBeVisible();
      await article.getByRole("button", { name: "直接吃", exact: true }).click();
      const dialog = reader.page.getByRole("dialog").filter({ hasText: title });
      await expect(dialog).toBeVisible();
      await reader.page.clock.fastForward(5_100);
      await completeReadControl(dialog).click();

      await expect.poll(() => readerApi.completeRequests).toHaveLength(1);
      expect(readerApi.wallet).toEqual({ smallSeedCount: 1, trueSeedCount: 0 });
      expect(readerApi.presenceRequests.at(-1)).toMatchObject({ melonId: created.id });

      await dialog.getByRole("button", { name: "关闭", exact: true }).click();
      readerApi.nearbyWithinRange = false;
      await reader.page.getByRole("group", { name: "吃瓜范围" }).getByRole("button", { name: /城市瓜区/ }).click();
      await openNearbyBasket(reader.page);
      await expect(reader.page.getByRole("article").filter({ hasText: title })).toHaveCount(0);
    } finally {
      await publisher.context.close();
      await reader.context.close();
    }
  });
}
