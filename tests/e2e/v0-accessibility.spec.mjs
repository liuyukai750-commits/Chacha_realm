import { expect, test } from "@playwright/test";
import {
  completeReadControl,
  enterIsland,
  installV0Api,
  melon,
  melonTrigger,
  openedMelonDialog,
  openMelon,
} from "./fixtures/v0-api.mjs";

function expectedWidth(testInfo) {
  return testInfo.project.use.viewport?.width;
}

test.describe("V0 响应式与无障碍门槛", () => {
  test.beforeEach(async ({ page }) => {
    await installV0Api(page);
  });

  test("VIEW-375 / VIEW-430 / VIEW-DESKTOP：页面无横向溢出且主操作可达", async ({ page }, testInfo) => {
    await enterIsland(page);

    const layout = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(layout.innerWidth).toBe(expectedWidth(testInfo));
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 1);

    await expect(page.getByRole("main")).toBeVisible();
    await expect(melonTrigger(page)).toBeVisible();
    await expect(page.getByRole("button", { name: /埋.*瓜|种.*瓜/ }).first()).toBeInViewport();

    const quickActions = page.getByRole("group", { name: "瓜区快捷操作" });
    const [quickActionBox, radarBox] = await Promise.all([
      quickActions.boundingBox(),
      page.getByTestId("radar-surface").boundingBox(),
    ]);
    expect(quickActionBox, "玩法入口必须有可见布局盒").not.toBeNull();
    expect(radarBox, "城市瓜区画面必须有可见布局盒").not.toBeNull();
    const overlapsRadar = !(
      quickActionBox.x + quickActionBox.width <= radarBox.x
      || radarBox.x + radarBox.width <= quickActionBox.x
      || quickActionBox.y + quickActionBox.height <= radarBox.y
      || radarBox.y + radarBox.height <= quickActionBox.y
    );
    expect(overlapsRadar, "玩法入口不能覆盖城市瓜区画面").toBe(false);

    if (layout.innerWidth <= 430) {
      const criticalTargets = [
        ...await page.getByRole("navigation").getByRole("button").all(),
        ...await quickActions.getByRole("button").all(),
        page.getByRole("button", { name: /开启附近1公里|刷新附近1公里/ }),
        page.getByRole("button", { name: /瓜篮/ }),
        ...await page.getByRole("group", { name: "按单一话题筛选" }).getByRole("button").all(),
      ];
      for (const target of criticalTargets) {
        const box = await target.boundingBox();
        expect(box, "可见主要触控按钮必须有布局盒").not.toBeNull();
        expect(box.width, "移动端主要触控按钮宽度至少 44px").toBeGreaterThanOrEqual(44);
        expect(box.height, "移动端主要触控按钮高度至少 44px").toBeGreaterThanOrEqual(44);
      }
    }

    await page.getByRole("button", { name: /瓜篮/ }).click();
    const expandedLayout = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(expandedLayout.scrollWidth).toBeLessThanOrEqual(expandedLayout.clientWidth + 1);
  });

  test("A11Y-NAME：地标、标题、控件和 id 提供稳定语义", async ({ page }) => {
    await enterIsland(page);

    await expect(page.getByRole("main")).toHaveCount(1);
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);

    const duplicateIds = await page.evaluate(() => {
      const counts = new Map();
      for (const element of document.querySelectorAll("[id]")) {
        counts.set(element.id, (counts.get(element.id) ?? 0) + 1);
      }
      return [...counts.entries()].filter(([, count]) => count > 1);
    });
    expect(duplicateIds, "DOM 中不能有重复 id").toEqual([]);

    for (const button of await page.getByRole("button").all()) {
      if (await button.isVisible()) await expect(button).toHaveAccessibleName(/\S/);
    }
    for (const link of await page.getByRole("link").all()) {
      if (await link.isVisible()) await expect(link).toHaveAccessibleName(/\S/);
    }

    const unlabeledFields = await page.locator("input, textarea, select").evaluateAll((fields) =>
      fields
        .filter((field) => !field.disabled && field.getClientRects().length > 0)
        .filter((field) => {
          const labelledBy = field.getAttribute("aria-labelledby");
          const explicitLabel = field.id && document.querySelector(`label[for="${CSS.escape(field.id)}"]`);
          return !field.getAttribute("aria-label") && !labelledBy && !explicitLabel && !field.closest("label");
        })
        .map((field) => field.outerHTML),
    );
    expect(unlabeledFields, "所有可见表单控件必须有可访问名称").toEqual([]);
  });

  test("BRAND-ICP：用户界面统一显示猹猹街，不再出现猹猹王国", async ({ page }) => {
    await enterIsland(page);
    await expect(page.getByText("猹猹街", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/猹猹王国/)).toHaveCount(0);
  });

  test("PLACE-SCENE：附近场景贯穿发现、吃瓜和埋瓜，但明确不是实景地图", async ({ page }, testInfo) => {
    await enterIsland(page);

    const discoveryScene = page.getByRole("region", { name: /瓜域.*场景.*没有坐标.*不用于导航/ }).first();
    await expect(discoveryScene).toBeVisible();
    if (testInfo.project.name === "chromium-375") {
      await page.screenshot({ path: testInfo.outputPath("place-scene-discovery.png"), fullPage: true });
    }

    const reader = await openMelon(page);
    await expect(reader.getByRole("img", { name: /半真实城市场景.*不是实景地图/ })).toBeVisible();
    if (testInfo.project.name === "chromium-375") {
      await page.screenshot({ path: testInfo.outputPath("place-scene-reader.png") });
    }
    await reader.getByRole("button", { name: "关闭" }).click();

    await page.getByRole("button", { name: /埋.*瓜/ }).first().click();
    const buryDialog = page.getByRole("dialog").filter({ has: page.locator("form") }).first();
    await expect(buryDialog.getByRole("img", { name: /半真实城市场景.*不是实景地图/ })).toBeVisible();
  });

  test("PLACE-PRIVACY：公司、医院和酒店类场景不展示具体机构名称", async ({ page }) => {
    const sensitiveSpot = {
      id: "spot-sensitive-medical",
      cityId: "changsha",
      districtId: "furong",
      name: "长沙某医院门诊楼",
    };
    await page.unrouteAll({ behavior: "wait" });
    await installV0Api(page, { spot: sensitiveSpot });
    await enterIsland(page);

    const zone = page.getByRole("region", { name: "瓜区控制台" });
    await expect(zone.getByRole("heading", { name: "医疗建筑附近", exact: true })).toBeVisible();
    await expect(page.getByText(sensitiveSpot.name, { exact: true })).toHaveCount(0);

    await page.getByRole("button", { name: /直接吃：职场瓜，医疗建筑附近，同一瓜区/ }).click();
    const reader = openedMelonDialog(page);
    await expect(reader.getByRole("img", { name: /医疗建筑附近.*地点名称已模糊.*不是实景地图/ })).toBeVisible();
    await expect(page.getByText(sensitiveSpot.name, { exact: true })).toHaveCount(0);
    await reader.getByRole("button", { name: "关闭" }).click();

    await page.getByRole("button", { name: /埋.*瓜/ }).first().click();
    const buryDialog = page.getByRole("dialog").filter({ has: page.locator("form") }).first();
    await expect(buryDialog.getByRole("button", { name: "医疗建筑附近", exact: true })).toBeVisible();
    await expect(buryDialog.getByText(sensitiveSpot.name, { exact: true })).toHaveCount(0);
  });

  test("PLACE-NIGHT：夜间保留地点轮廓和亮窗，但不改变核心操作", async ({ page }, testInfo) => {
    await page.clock.install({ time: new Date("2026-08-04T22:00:00+08:00") });
    await enterIsland(page);

    await expect(page.locator(".sunny-shell")).toHaveAttribute("data-day-phase", "night");
    await expect(page.getByRole("region", { name: /瓜域.*场景.*没有坐标.*不用于导航/ }).first()).toBeVisible();
    await expect(melonTrigger(page)).toBeVisible();
    await expect(page.getByRole("button", { name: /埋.*瓜/ }).first()).toBeInViewport();
    if (testInfo.project.name === "chromium-375") {
      await page.screenshot({ path: testInfo.outputPath("place-scene-night.png"), fullPage: true });
    }
  });

  test("NIGHT-CONTRAST：蓝灰月光模式下核心文字保持清晰", async ({ page }) => {
    await page.clock.install({ time: new Date("2026-08-04T22:00:00+08:00") });
    await page.unrouteAll({ behavior: "wait" });
    await installV0Api(page, {
      wallet: { smallSeedCount: 2, trueSeedCount: 1 },
      plants: [
        { id: "night-seedling", plotIndex: 0, slotIndex: 0, plantedAt: "2026-08-04T16:00:00.000Z", maturesAt: "2026-08-05T04:00:00.000Z", stage: "seedling" },
        { id: "night-mature", plotIndex: 1, slotIndex: 0, plantedAt: "2026-08-03T16:00:00.000Z", maturesAt: "2026-08-04T04:00:00.000Z", stage: "mature" },
      ],
    });
    await enterIsland(page);
    await expect(page.locator(".brand strong")).toBeVisible();

    const textLuminance = async (selectors) => page.evaluate((targets) => {
      const luminance = (color) => {
        const channels = color.match(/[\d.]+/g)?.slice(0, 3).map(Number) ?? [];
        return channels.reduce((sum, channel, index) => {
          const value = channel / 255;
          const linear = value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
          return sum + linear * [0.2126, 0.7152, 0.0722][index];
        }, 0);
      };

      return Object.fromEntries(targets.map((selector) => {
        const element = document.querySelector(selector);
        return [selector, element ? luminance(getComputedStyle(element).color) : -1];
      }));
    }, selectors);

    const radarText = await textLuminance([
      ".brand strong",
      ".city-switch",
      ".zone-kicker",
      ".zone-heading h2",
      ".basket-handle strong",
    ]);
    for (const [selector, luminance] of Object.entries(radarText)) {
      expect(luminance, `${selector} 在夜间深色表面上应使用明亮文字`).toBeGreaterThan(0.58);
    }

    await page.getByRole("button", { name: "瓜田", exact: true }).click();
    const fieldText = await textLuminance([
      ".field-ledger strong",
      ".field-cycle-card>div:first-child",
      ".field-cycle-card p",
      ".my-melons h2",
      ".bottom-dock button.active",
    ]);
    for (const [selector, luminance] of Object.entries(fieldText)) {
      expect(luminance, `${selector} 在夜间瓜田中应保持清晰`).toBeGreaterThan(0.58);
    }

    const stateContrast = await page.evaluate((selectors) => {
      const luminance = (color) => {
        const channels = color.match(/[\d.]+/g)?.slice(0, 3).map(Number) ?? [];
        return channels.reduce((sum, channel, index) => {
          const value = channel / 255;
          const linear = value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
          return sum + linear * [0.2126, 0.7152, 0.0722][index];
        }, 0);
      };
      return Object.fromEntries(selectors.map((selector) => {
        const element = document.querySelector(selector);
        if (!element) return [selector, -1];
        const style = getComputedStyle(element);
        const foreground = luminance(style.color);
        const background = luminance(style.backgroundColor);
        return [selector, (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05)];
      }));
    }, [".field-plot-hotspot>span", ".field-crop.seedling b", ".field-crop.mature b"]);
    for (const [selector, contrast] of Object.entries(stateContrast)) {
      expect(contrast, `${selector} 的土地/作物状态文字在夜间应达到 4.5:1`).toBeGreaterThanOrEqual(4.5);
    }
  });

  test("PHASE-TOGGLE：日夜模式可手动切换并在刷新后保留", async ({ page }) => {
    await page.clock.install({ time: new Date("2026-08-04T10:00:00+08:00") });
    await enterIsland(page);

    const shell = page.locator(".sunny-shell");
    await expect(shell).toHaveAttribute("data-day-phase", "day");
    await page.getByRole("button", { name: "当前日间模式，切换到夜间模式" }).click();
    await expect(shell).toHaveAttribute("data-day-phase", "night");

    await page.reload();
    await expect(page.getByRole("button", { name: "当前夜间模式，切换到日间模式" })).toBeVisible();
    await expect(page.locator(".sunny-shell")).toHaveAttribute("data-day-phase", "night");
  });

  test("A11Y-KEYBOARD：瓜详情对话框圈定焦点并把焦点还给触发器", async ({ page }) => {
    await enterIsland(page);
    const trigger = melonTrigger(page);
    await trigger.focus();
    await page.keyboard.press("Enter");

    const dialog = openedMelonDialog(page);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("heading", { name: melon.title, exact: true })).toBeVisible();
    await expect(dialog).toContainText(melon.content);
    await expect(dialog).toHaveAttribute("aria-modal", "true");
    await expect.poll(() => dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);

    const focusables = dialog.locator('button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])');
    const focusableCount = await focusables.count();
    expect(focusableCount).toBeGreaterThan(0);
    for (let index = 0; index <= focusableCount; index += 1) await page.keyboard.press("Tab");
    await expect.poll(() => dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("A11Y-SR：计时解锁和完成结果通过动态区域播报", async ({ page }) => {
    await page.clock.install({ time: new Date("2026-08-04T12:00:00.000Z") });
    await enterIsland(page);
    const dialog = await openMelon(page);
    const complete = completeReadControl(dialog);

    await expect(page.getByRole("status").filter({ hasText: /还需|秒|阅读/ }).first()).toBeVisible();
    await page.clock.fastForward(5_000);
    await expect(page.getByRole("status").filter({ hasText: /可以完成|读完|吃完/ }).first()).toBeVisible();
    await complete.click();
    await expect(page.getByRole("status").filter({ hasText: /瓜籽|完成/ }).first()).toBeVisible();
  });

  test("MOTION-REDUCE：减少动态时移除非必要动画与过渡", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await enterIsland(page);

    const offenders = await page.evaluate(() => {
      const seconds = (value) =>
        value.split(",").reduce((max, part) => {
          const token = part.trim();
          const duration = token.endsWith("ms") ? Number.parseFloat(token) / 1000 : Number.parseFloat(token);
          return Number.isFinite(duration) ? Math.max(max, duration) : max;
        }, 0);

      return [...document.querySelectorAll("body *")]
        .filter((element) => element.getClientRects().length > 0)
        .filter((element) => element.getAttribute("data-motion-essential") !== "true")
        .map((element) => {
          const style = getComputedStyle(element);
          return {
            element: element.outerHTML.slice(0, 160),
            animation: style.animationName === "none" ? 0 : seconds(style.animationDuration),
            transition: seconds(style.transitionDuration),
          };
        })
        .filter(({ animation, transition }) => animation > 0.01 || transition > 0.01);
    });

    expect(offenders, "reduce 模式下非必要动画/过渡应不超过 10ms").toEqual([]);
    await expect(melonTrigger(page)).toBeVisible();
  });
});
