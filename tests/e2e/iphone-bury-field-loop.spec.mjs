import { expect, test } from "@playwright/test";

import { enterIsland, installV0Api } from "./fixtures/v0-api.mjs";

const location = { latitude: 28.195397, longitude: 112.976869 };

async function allowLocation(context, baseURL) {
  await context.grantPermissions(["geolocation"], { origin: new URL(baseURL).origin });
  await context.setGeolocation(location);
}

async function openBurySheet(page) {
  await page.getByRole("navigation").getByRole("button", { name: "埋瓜", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "埋下一颗瓜" });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function fillSafeMelon(dialog, suffix = "") {
  await dialog.getByRole("textbox", { name: "标题" }).fill(`下班路上遇到一件暖心小事${suffix}`);
  await dialog.getByRole("textbox", { name: "故事内容" }).fill(`今天路过附近街口时，有位陌生人主动帮忙扶住了快要倒下的共享单车。${suffix}`);
}

async function openOwnField(page) {
  await page.getByRole("navigation").getByRole("button", { name: "瓜田", exact: true }).click();
  await expect(page.getByRole("region", { name: /我的瓜田/ })).toBeVisible();
}

test.describe("iPhone 埋瓜—真籽—瓜田闭环", () => {
  test("SHARE-FIRST-UI：首个安全原创有成功反馈、真籽 +1，并可进入瓜田播种", async ({ baseURL, context, page }) => {
    const api = await installV0Api(page, {
      wallet: { smallSeedCount: 0, trueSeedCount: 0 },
      validReadsToday: 0,
      fiveCities: true,
    });
    await allowLocation(context, baseURL);
    await enterIsland(page);

    const dialog = await openBurySheet(page);
    await expect(dialog.getByRole("button", { name: /附近生活圈/ })).toHaveAttribute("aria-pressed", "true");
    await fillSafeMelon(dialog);
    const submit = dialog.getByRole("button", { name: /埋瓜，把秘密压进土里/ });
    await expect(submit).toBeEnabled();
    await submit.click();

    await expect.poll(() => api.createRequests).toHaveLength(1);
    expect(api.createRequests[0].burialKind).toBe("nearby_area");
    expect(api.createRequests[0]).not.toHaveProperty("cityId");
    await expect(page.getByRole("status").filter({ hasText: /这颗瓜已经埋好/ })).toBeVisible();
    await expect(page.locator(".bury-success-panel").getByText(/奖励 1 颗真瓜籽/)).toBeVisible();
    const goToField = page.getByRole("button", { name: "去瓜田种下", exact: true });
    await expect(goToField).toBeVisible();
    await goToField.click();

    const field = page.getByRole("region", { name: /我的瓜田/ });
    await expect(field).toBeVisible();
    await expect(field.getByText(/真瓜籽[^\d]*1|1[^\d]*真瓜籽/).first()).toBeVisible();
    const ownMelons = field.locator(".my-melons");
    await expect(ownMelons.getByText("日常瓜", { exact: true })).toBeVisible();
    await expect(ownMelons.getByText("附近生活圈", { exact: true })).toBeVisible();
    await expect(ownMelons.getByText(/后成熟/)).toBeVisible();
    expect(api.fieldRequests.length, "发布完成后必须重新读取服务端瓜田").toBeGreaterThanOrEqual(2);

    const firstPlot = field.getByRole("button", { name: /第[1一]片土地.*0\/3/ });
    await expect(firstPlot).toBeEnabled();
    await firstPlot.click();
    await field.getByRole("button", { name: "种在这里", exact: true }).click();
    await expect.poll(() => api.plantRequests).toHaveLength(1);
    await expect(field.getByText(/真瓜籽[^\d]*0|0[^\d]*真瓜籽/).first()).toBeVisible();
    await expect(field.getByText(/1\s*\/\s*9/).first()).toBeVisible();
  });

  test("SHARE-PERSIST：发布后的瓜刷新页面仍由 GET /api/fields/me 返回", async ({ baseURL, context, page }) => {
    const api = await installV0Api(page, {
      wallet: { smallSeedCount: 0, trueSeedCount: 0 },
      validReadsToday: 0,
      fiveCities: true,
    });
    await allowLocation(context, baseURL);
    await enterIsland(page);

    const dialog = await openBurySheet(page);
    await fillSafeMelon(dialog, "，刷新后也要看得见");
    await dialog.getByRole("button", { name: /埋瓜，把秘密压进土里/ }).click();
    await expect.poll(() => api.createdMelons).toHaveLength(1);

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("main")).toBeVisible();
    await openOwnField(page);
    const ownMelons = page.getByRole("region", { name: /我的瓜田/ }).locator(".my-melons");
    await expect(ownMelons.getByText("日常瓜", { exact: true })).toBeVisible();
    await expect(ownMelons.getByText("附近生活圈", { exact: true })).toBeVisible();
    expect(api.fieldRequests.length, "页面刷新后必须再次读取服务端瓜田").toBeGreaterThanOrEqual(2);
  });

  test("OWNER-READER：点击我埋下的成熟瓜可查看原文和公开评论", async ({ baseURL, context, page }) => {
    const api = await installV0Api(page, {
      wallet: { smallSeedCount: 0, trueSeedCount: 0 },
      createStatusSequence: ["mature"],
    });
    await allowLocation(context, baseURL);
    await enterIsland(page);

    const dialog = await openBurySheet(page);
    await fillSafeMelon(dialog, "，成熟后能打开评论");
    const expectedTitle = await dialog.getByRole("textbox", { name: "标题" }).inputValue();
    const expectedContent = await dialog.getByRole("textbox", { name: "故事内容" }).inputValue();
    await dialog.getByRole("button", { name: /埋瓜，把秘密压进土里/ }).click();
    await expect.poll(() => api.createdMelons).toHaveLength(1);

    await page.getByRole("button", { name: "查看我埋下的瓜", exact: true }).click();
    await expect(page.getByRole("region", { name: /我的瓜田/ })).toBeVisible();
    await page.getByRole("button", { name: /查看日常瓜的正文和评论/ }).click();

    const reader = page.getByRole("dialog", { name: expectedTitle });
    await expect(reader).toBeVisible();
    await expect(reader.getByText("我的瓜 · 瓜主管理视图")).toBeVisible();
    await expect(reader.getByText(expectedContent)).toBeVisible();
    await expect(reader.getByRole("heading", { name: "吃瓜猹的评论" })).toBeVisible();
    await expect(reader.getByText("这是从评论 GET fixture 读取的第一条公开回声。")).toBeVisible();
    await expect(reader.getByText("远方围观也应该看得到这条评论。")).toBeVisible();
    expect(api.commentGetRequests).toEqual([{ melonId: api.createdMelons[0].id, search: "?limit=20" }]);
  });

  test("SHARE-LEDGER：held、后续发布和幂等重放都不会多发真瓜籽", async ({ page }) => {
    const api = await installV0Api(page, {
      wallet: { smallSeedCount: 0, trueSeedCount: 0 },
      validReadsToday: 0,
      createStatusSequence: ["held", "incubating", "incubating"],
    });
    await enterIsland(page);

    const result = await page.evaluate(async () => {
      const locationProof = { latitude: 28.195397, longitude: 112.976869, accuracyM: 18, capturedAt: new Date().toISOString() };
      const create = async (operationId, title) => {
        const response = await fetch("/api/melons", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            operationId,
            burialKind: "nearby_area",
            topic: "daily",
            title,
            content: "这是一段满足长度要求且不会泄露任何真实身份信息的匿名测试故事。",
            revealMode: "open",
            location: locationProof,
          }),
        });
        return response.json();
      };
      const held = await create("00000000-0000-4000-8000-000000000001", "需要复核的内容");
      const firstSafe = await create("00000000-0000-4000-8000-000000000002", "第一颗安全原创瓜");
      const laterSafe = await create("00000000-0000-4000-8000-000000000003", "当天后续安全原创瓜");
      const replay = await create("00000000-0000-4000-8000-000000000003", "重复提交不应新增奖励");
      return { held, firstSafe, laterSafe, replay };
    });

    expect(result.held).toMatchObject({ status: "held", trueSeedAwarded: false, wallet: { trueSeedCount: 0 } });
    expect(result.firstSafe).toMatchObject({ status: "incubating", trueSeedAwarded: true, wallet: { trueSeedCount: 1 } });
    expect(result.laterSafe).toMatchObject({ status: "incubating", trueSeedAwarded: false, wallet: { trueSeedCount: 1 } });
    expect(result.replay).toEqual(result.laterSafe);
    expect(api.wallet.trueSeedCount).toBe(1);
    expect(api.createdMelons).toHaveLength(2);
  });
});

test.describe("iPhone 深色弹层可读性（WebKit/视口自动化仅为模拟）", () => {
  test("NIGHT-CONTRAST：城市切换与埋瓜弹层的字号、选中态和禁用态可辨", async ({ page }) => {
    const viewportWidth = page.viewportSize()?.width;
    test.skip(![375, 430, 450].includes(viewportWidth), "这条视觉门禁只覆盖明确列出的手机视口");
    await page.clock.install({ time: new Date("2026-08-04T22:00:00+08:00") });
    await installV0Api(page, { fiveCities: true });
    await enterIsland(page);
    await expect(page.locator(".sunny-shell")).toHaveAttribute("data-day-phase", "night");

    await page.getByRole("button", { name: /当前城市.*切换城市/ }).click();
    const cityDialog = page.getByRole("dialog", { name: /换一个城市瓜域逛逛/ });
    await expect(cityDialog).toBeVisible();
    await expectReadableNightText(cityDialog.getByRole("heading", { level: 2 }), 20, 0.72);
    await expectReadableNightText(cityDialog.locator(".sheet-header p"), 12, 0.55);
    const selectedCity = cityDialog.locator(".city-list button.selected");
    const otherCity = cityDialog.locator(".city-list button:not(.selected)").first();
    await expect(selectedCity).toBeVisible();
    await expect(otherCity).toBeVisible();
    await expectReadableNightText(otherCity.locator("strong"), 15, 0.72);
    await expectReadableNightText(otherCity.locator("small").first(), 11, 0.52);
    const selectedCityTextLuminance = await relativeLuminance(selectedCity.locator("strong"));
    const selectedCityBackgroundLuminance = await relativeLuminance(selectedCity);
    expect(selectedCityTextLuminance, "选中城市应使用深色文字配浅色底").toBeLessThan(0.24);
    expect(selectedCityBackgroundLuminance, "选中城市背景应明显变亮").toBeGreaterThan(0.5);
    expect(contrastRatio(selectedCityTextLuminance, selectedCityBackgroundLuminance), "选中城市文字对比度").toBeGreaterThanOrEqual(4.5);
    await cityDialog.getByRole("button", { name: "关闭", exact: true }).click();

    const buryDialog = await openBurySheet(page);
    await expectReadableNightText(buryDialog.getByRole("heading", { level: 2 }), 20, 0.72);
    await expectReadableNightText(buryDialog.locator(".sheet-header p"), 12, 0.55);
    const nearby = buryDialog.getByRole("button", { name: /附近生活圈/ });
    const publicSpot = buryDialog.getByRole("button", { name: /公共地点/ }).first();
    await expect(nearby).toHaveAttribute("aria-pressed", "true");
    await expect(publicSpot).toHaveAttribute("aria-pressed", "false");
    const nearbyTextLuminance = await relativeLuminance(nearby.locator("strong"));
    const nearbyBackgroundLuminance = await relativeLuminance(nearby);
    expect(nearbyTextLuminance, "选中埋瓜方式文字应为深色").toBeLessThan(0.24);
    expect(nearbyBackgroundLuminance, "选中埋瓜方式背景应为亮色").toBeGreaterThan(0.5);
    expect(contrastRatio(nearbyTextLuminance, nearbyBackgroundLuminance), "选中埋瓜方式文字对比度").toBeGreaterThanOrEqual(4.5);
    await expectReadableNightText(publicSpot.locator("strong"), 14, 0.72);
    await expectReadableNightText(publicSpot.locator("small"), 11, 0.52);
    const nearbyNote = buryDialog.locator(".bury-mode-note");
    const nearbyNoteTitle = nearbyNote.locator("strong");
    const nearbyNoteCopy = nearbyNote.locator("p");
    await expect(nearbyNoteTitle).toBeVisible();
    await expect(nearbyNoteCopy).toBeVisible();
    expect(await fontSize(nearbyNoteTitle)).toBeGreaterThanOrEqual(14);
    expect(await fontSize(nearbyNoteCopy)).toBeGreaterThanOrEqual(12);
    const nearbyNoteBackground = await relativeLuminance(nearbyNote);
    expect(contrastRatio(await relativeLuminance(nearbyNoteTitle), nearbyNoteBackground), "附近说明标题对比度").toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(await relativeLuminance(nearbyNoteCopy), nearbyNoteBackground), "附近说明正文对比度").toBeGreaterThanOrEqual(4.5);

    const disabledSubmit = buryDialog.getByRole("button", { name: /埋瓜，把秘密压进土里/ });
    await expect(disabledSubmit).toBeDisabled();
    const disabledBackground = await disabledSubmit.evaluate((element) => getComputedStyle(element).backgroundColor);
    expect(await disabledSubmit.evaluate((element) => Number.parseFloat(getComputedStyle(element).opacity)), "禁用态文字不能透明到看不清").toBeGreaterThanOrEqual(0.95);
    expect(await fontSize(disabledSubmit), "主提交按钮字号不能过小").toBeGreaterThanOrEqual(14);
    await fillSafeMelon(buryDialog);
    await expect(disabledSubmit).toBeEnabled();
    const enabledBackground = await disabledSubmit.evaluate((element) => getComputedStyle(element).backgroundColor);
    expect(enabledBackground, "禁用与可提交状态必须有明确配色差异").not.toBe(disabledBackground);

    const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(horizontalOverflow).toBeLessThanOrEqual(1);
  });
});

async function expectReadableNightText(locator, minimumFontSize, minimumLuminance) {
  await expect(locator).toBeVisible();
  expect(await fontSize(locator)).toBeGreaterThanOrEqual(minimumFontSize);
  expect(await relativeLuminance(locator)).toBeGreaterThanOrEqual(minimumLuminance);
}

async function fontSize(locator) {
  return locator.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
}

async function relativeLuminance(locator) {
  return locator.evaluate((element) => {
    const color = getComputedStyle(element).backgroundColor === "rgba(0, 0, 0, 0)"
      ? getComputedStyle(element).color
      : getComputedStyle(element).backgroundColor;
    const channels = color.match(/[\d.]+/g)?.slice(0, 3).map(Number) ?? [0, 0, 0];
    const linear = channels.map((value) => {
      const channel = value / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  });
}

function contrastRatio(first, second) {
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}
