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

    if (layout.innerWidth <= 430) {
      const criticalTargets = [
        ...await page.getByRole("navigation").getByRole("button").all(),
        page.getByRole("button", { name: /开启定位|重新定位/ }),
        page.getByRole("button", { name: "开始感应", exact: true }),
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

  test("PLACE-SCENE：附近场景贯穿发现、吃瓜和埋瓜，但明确不是实景地图", async ({ page }, testInfo) => {
    await enterIsland(page);

    const discoveryScene = page.getByRole("img", { name: /城市瓜域象征地标.*没有坐标.*不用于导航/ }).first();
    await expect(discoveryScene).toBeVisible();
    if (testInfo.project.name === "chromium-375") {
      await page.screenshot({ path: testInfo.outputPath("place-scene-discovery.png"), fullPage: true });
    }

    const reader = await openMelon(page);
    await expect(reader.getByRole("img", { name: /半真实卡通场景.*不是实景地图/ })).toBeVisible();
    if (testInfo.project.name === "chromium-375") {
      await page.screenshot({ path: testInfo.outputPath("place-scene-reader.png") });
    }
    await reader.getByRole("button", { name: "关闭" }).click();

    await page.getByRole("button", { name: /埋.*瓜/ }).first().click();
    const buryDialog = page.getByRole("dialog").filter({ has: page.locator("form") }).first();
    await expect(buryDialog.getByRole("img", { name: /半真实卡通场景.*不是实景地图/ })).toBeVisible();
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

    await page.getByRole("button", { name: /吃瓜：职场瓜，医疗建筑附近，同一瓜区/ }).click();
    const reader = openedMelonDialog(page);
    await expect(reader.getByRole("img", { name: /医疗建筑附近.*地点名称已模糊.*不是实景地图/ })).toBeVisible();
    await expect(page.getByText(sensitiveSpot.name, { exact: true })).toHaveCount(0);
    await reader.getByRole("button", { name: "关闭" }).click();

    await page.getByRole("button", { name: /埋.*瓜/ }).first().click();
    const buryDialog = page.getByRole("dialog").filter({ has: page.locator("form") }).first();
    await expect(buryDialog.getByRole("combobox", { name: /公共地点/ })).toContainText("医疗建筑附近");
    await expect(buryDialog.getByText(sensitiveSpot.name, { exact: true })).toHaveCount(0);
  });

  test("PLACE-NIGHT：夜间保留地点轮廓和亮窗，但不改变核心操作", async ({ page }, testInfo) => {
    await page.clock.install({ time: new Date("2026-08-04T22:00:00+08:00") });
    await enterIsland(page);

    await expect(page.locator(".sunny-shell")).toHaveAttribute("data-day-phase", "night");
    await expect(page.getByRole("img", { name: /城市瓜域象征地标.*没有坐标.*不用于导航/ }).first()).toBeVisible();
    await expect(melonTrigger(page)).toBeVisible();
    await expect(page.getByRole("button", { name: /埋.*瓜/ }).first()).toBeInViewport();
    if (testInfo.project.name === "chromium-375") {
      await page.screenshot({ path: testInfo.outputPath("place-scene-night.png"), fullPage: true });
    }
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
