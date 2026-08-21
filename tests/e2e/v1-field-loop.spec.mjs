import { expect, test } from "@playwright/test";

import { enterIsland, installV0Api } from "./fixtures/v0-api.mjs";

async function openOwnField(page) {
  await enterIsland(page);
  await page.getByRole("navigation").getByRole("button", { name: "瓜田", exact: true }).click();
  await expect(page.getByRole("region", { name: /我的瓜田/ })).toBeVisible();
}

function plotButton(page, number) {
  return page.getByRole("button", { name: new RegExp(`第[${number}${chineseNumber(number)}]片土地`) });
}

test.describe("V1 吃瓜—瓜籽—三片地—收瓜闭环", () => {
  test("FIELD-EMPTY：新账号是三片空地、0/9、双籽与 XP 都为 0", async ({ page }) => {
    await installV0Api(page, {
      wallet: { smallSeedCount: 0, trueSeedCount: 0 },
      validReadsToday: 0,
      experience: { total: 0, fromReads: 0, fromHarvests: 0 },
    });
    await openOwnField(page);

    await expect(page.getByText(/0\s*\/\s*9/).first()).toBeVisible();
    await expect(page.getByText(/小瓜籽[^\d]*0|0[^\d]*小瓜籽/).first()).toBeVisible();
    await expect(page.getByText(/真瓜籽[^\d]*0|0[^\d]*真瓜籽/).first()).toBeVisible();
    await expect(page.getByText(/XP[^\d]*0|0[^\d]*XP/).first()).toBeVisible();

    for (const number of [1, 2, 3]) {
      const plot = plotButton(page, number);
      await expect(plot).toBeVisible();
      await expect(plot).toHaveAccessibleName(/0\/3/);
    }
    await expect(page.getByRole("button", { name: /一键收瓜/ })).toHaveCount(0);
  });

  test("FIELD-PLANT：选择整片土地再确认，成功恰好扣 1 颗真瓜籽并出现幼苗", async ({ page }) => {
    const api = await installV0Api(page, {
      wallet: { smallSeedCount: 0, trueSeedCount: 1 },
      validReadsToday: 0,
    });
    await openOwnField(page);

    const firstPlot = plotButton(page, 1);
    const hitbox = await firstPlot.boundingBox();
    expect(hitbox, "土地热区必须有布局盒").not.toBeNull();
    expect(hitbox.width).toBeGreaterThanOrEqual(44);
    expect(hitbox.height).toBeGreaterThanOrEqual(44);

    await firstPlot.click();
    const confirm = page.getByRole("button", { name: "种在这里", exact: true });
    await expect(confirm).toBeVisible();
    await confirm.click();

    await expect.poll(() => api.plantRequests).toHaveLength(1);
    expect(api.plantRequests[0].plotIndex).toBe(0);
    expect(api.plantRequests[0].operationId).toMatch(/^[0-9a-f-]{36}$/i);
    await expect(firstPlot).toHaveAccessibleName(/1\/3/);
    await expect(page.getByText(/1\s*\/\s*9/).first()).toBeVisible();
    await expect(page.getByText(/真瓜籽[^\d]*0|0[^\d]*真瓜籽/).first()).toBeVisible();
    await expect(page.getByRole("img", { name: /瓜苗/ }).first()).toBeVisible();
  });

  test("FIELD-PLANT-FAIL：播种失败不扣籽、不占位，重试复用 operationId 且只种一次", async ({ page }) => {
    const api = await installV0Api(page, {
      wallet: { smallSeedCount: 1, trueSeedCount: 1 },
      plantFailure: { once: true, status: 503, code: "PLANT_FAILED", message: "播种暂时失败，真瓜籽没有扣除。" },
    });
    await openOwnField(page);

    await plotButton(page, 1).click();
    const confirm = page.getByRole("button", { name: "种在这里", exact: true });
    await confirm.click();
    await expect.poll(() => api.plantRequests).toHaveLength(1);
    await expect(page.locator(".field-error")).toContainText(/播种暂时失败|没有扣除/);
    expect(api.wallet).toEqual({ smallSeedCount: 1, trueSeedCount: 1 });
    expect(api.plants).toHaveLength(0);
    await expect(page.getByText(/0\s*\/\s*9/).first()).toBeVisible();
    await expect(page.getByText(/真瓜籽[^\d]*1|1[^\d]*真瓜籽/).first()).toBeVisible();

    await confirm.click();
    await expect.poll(() => api.plantRequests).toHaveLength(2);
    expect(api.plantRequests[1].operationId).toBe(api.plantRequests[0].operationId);
    expect(api.wallet).toEqual({ smallSeedCount: 1, trueSeedCount: 0 });
    expect(api.plants).toHaveLength(1);
    await expect(plotButton(page, 1)).toHaveAccessibleName(/1\/3/);
  });

  test("FIELD-FULL-GROWING：九位占满但未全熟时不能收，也不会出现第 10 个瓜", async ({ page }) => {
    const api = await installV0Api(page, {
      wallet: { smallSeedCount: 0, trueSeedCount: 2 },
      plants: ninePlants("growing"),
    });
    await openOwnField(page);

    await expect(page.getByText(/9\s*\/\s*9/).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /一键收瓜/ })).toHaveCount(0);
    for (const number of [1, 2, 3]) {
      await expect(plotButton(page, number)).toHaveAccessibleName(/3\/3/);
    }
    expect(api.plantRequests).toHaveLength(0);
  });

  test("FIELD-HARVEST：九瓜全熟后一次收瓜清空土地并恰好增加 9 XP", async ({ page }) => {
    const api = await installV0Api(page, {
      wallet: { smallSeedCount: 2, trueSeedCount: 0 },
      experience: { total: 4, fromReads: 4, fromHarvests: 0 },
      plants: ninePlants("mature"),
    });
    await openOwnField(page);

    const harvest = page.getByRole("button", { name: /一键收瓜.*\+9\s*XP/ });
    await expect(harvest).toBeVisible();
    await harvest.click();

    await expect.poll(() => api.harvestRequests).toHaveLength(1);
    await expect(page.getByText(/0\s*\/\s*9/).first()).toBeVisible();
    await expect(page.getByText(/XP[^\d]*13|13[^\d]*XP/).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /一键收瓜/ })).toHaveCount(0);
  });

  test("FIELD-HARVEST-FAIL：收瓜失败不清空九个瓜，也不增加 XP", async ({ page }) => {
    const api = await installV0Api(page, {
      wallet: { smallSeedCount: 0, trueSeedCount: 0 },
      experience: { total: 4, fromReads: 4, fromHarvests: 0 },
      plants: ninePlants("mature"),
      harvestFailure: { once: true, status: 503, code: "HARVEST_FAILED", message: "收瓜暂时失败，瓜田保持原样。" },
    });
    await openOwnField(page);

    await page.getByRole("button", { name: /一键收瓜.*\+9\s*XP/ }).click();
    await expect.poll(() => api.harvestRequests).toHaveLength(1);
    await expect(page.locator(".field-error")).toContainText(/收瓜暂时失败|保持原样/);
    expect(api.plants).toHaveLength(9);
    expect(api.experience).toEqual({ total: 4, fromReads: 4, fromHarvests: 0 });
    await expect(page.getByText(/9\s*\/\s*9/).first()).toBeVisible();
    await expect(page.getByText(/XP[^\d]*4|4[^\d]*XP/).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /一键收瓜.*\+9\s*XP/ })).toBeVisible();
  });
});

test.describe("V1 手机瓜田布局", () => {
  test("FIELD-VIEWPORT：375/430/桌面三片地完整可达且不被底栏遮挡", async ({ page }) => {
    await installV0Api(page, { wallet: { smallSeedCount: 0, trueSeedCount: 1 } });
    await openOwnField(page);

    const navigation = page.getByRole("navigation");
    const stageBox = await page.getByTestId("field-stage").boundingBox();
    const navBox = await navigation.boundingBox();
    expect(stageBox, "瓜田底图必须有布局盒").not.toBeNull();
    expect(navBox).not.toBeNull();
    const normalizedCenters = [];
    for (const number of [1, 2, 3]) {
      const plot = plotButton(page, number);
      await expect(plot).toBeVisible();
      const box = await plot.boundingBox();
      expect(box, `第 ${number} 片土地必须有布局盒`).not.toBeNull();
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.y + box.height, `第 ${number} 片土地不能被底部导航遮挡`).toBeLessThanOrEqual(navBox.y + 1);
      expect(box.x).toBeGreaterThanOrEqual(stageBox.x - 1);
      expect(box.y).toBeGreaterThanOrEqual(stageBox.y - 1);
      expect(box.x + box.width).toBeLessThanOrEqual(stageBox.x + stageBox.width + 1);
      expect(box.y + box.height).toBeLessThanOrEqual(stageBox.y + stageBox.height + 1);
      expect((box.width * box.height) / (stageBox.width * stageBox.height), `第 ${number} 片土地应覆盖可触摸的整片土壤`).toBeGreaterThan(0.08);
      normalizedCenters.push({
        x: (box.x + box.width / 2 - stageBox.x) / stageBox.width,
        y: (box.y + box.height / 2 - stageBox.y) / stageBox.height,
      });
    }
    expect(normalizedCenters[0].x, "第一片土地应覆盖底图左侧土壤").toBeLessThan(0.55);
    expect(normalizedCenters[1].x, "第二片土地应覆盖底图右上土壤").toBeGreaterThan(0.55);
    expect(normalizedCenters[1].y).toBeLessThan(0.65);
    expect(normalizedCenters[2].x, "第三片土地应覆盖底图右下土壤").toBeGreaterThan(0.55);
    expect(normalizedCenters[2].y).toBeGreaterThan(0.55);

    const widths = await page.evaluate(() => ({
      client: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    expect(widths.scroll).toBeLessThanOrEqual(widths.client + 1);
  });

  test("FIELD-REDUCED-MOTION：减少动态时播种结果仍可见且无长时间位移动画", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const api = await installV0Api(page, { wallet: { smallSeedCount: 0, trueSeedCount: 1 } });
    await openOwnField(page);

    await plotButton(page, 2).click();
    await page.getByRole("button", { name: "种在这里", exact: true }).click();
    await expect.poll(() => api.plantRequests).toHaveLength(1);
    expect(api.plantRequests[0].plotIndex).toBe(1);
    expect(api.plantRequests[0].operationId).toMatch(/^[0-9a-f-]{36}$/i);
    await expect(plotButton(page, 2)).toHaveAccessibleName(/1\/3/);

    const longMotion = await page.getByTestId("field-stage").locator("*").evaluateAll((elements) =>
      elements
        .filter((element) => element.getClientRects().length > 0)
        .flatMap((element) => {
          const style = getComputedStyle(element);
          const toSeconds = (value) => {
            const number = Number.parseFloat(value);
            return value.trim().endsWith("ms") ? number / 1000 : number;
          };
          const animation = style.animationDuration.split(",").map(toSeconds);
          const transition = style.transitionDuration.split(",").map(toSeconds);
          return [...animation, ...transition].filter((seconds) => seconds > 0.1);
        }),
    );
    expect(longMotion, "减少动态模式下不应保留超过 100ms 的动画或过渡").toEqual([]);
  });
});

function ninePlants(stage) {
  return Array.from({ length: 9 }, (_, index) => ({
    id: `plant-${index + 1}`,
    plotIndex: Math.floor(index / 3),
    slotIndex: index % 3,
    plantedAt: "2026-08-03T00:00:00.000Z",
    maturesAt: stage === "mature" ? "2000-01-01T00:00:00.000Z" : "2099-01-01T00:00:00.000Z",
    stage,
  }));
}

function chineseNumber(number) {
  return ["", "一", "二", "三"][number];
}
