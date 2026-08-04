import { expect, test } from "@playwright/test";
import { enterIsland, installV0Api, melon, openMelon } from "./fixtures/v0-api.mjs";

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
    await expect(page.getByRole("article", { name: melon.title })).toBeVisible();
    await expect(page.getByRole("button", { name: /埋瓜|种下一颗瓜/ })).toBeInViewport();

    if (layout.innerWidth <= 430) {
      const criticalTargets = page.getByRole("navigation").getByRole("button");
      for (const target of await criticalTargets.all()) {
        const box = await target.boundingBox();
        expect(box, "可见导航按钮必须有布局盒").not.toBeNull();
        expect(box.width, "移动端导航按钮宽度至少 44px").toBeGreaterThanOrEqual(44);
        expect(box.height, "移动端导航按钮高度至少 44px").toBeGreaterThanOrEqual(44);
      }
    }
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

  test("A11Y-KEYBOARD：瓜详情对话框圈定焦点并把焦点还给触发器", async ({ page }) => {
    await enterIsland(page);
    const card = page.getByRole("article", { name: melon.title });
    const trigger = card.getByRole("button", { name: "打开这颗瓜" });
    await trigger.focus();
    await page.keyboard.press("Enter");

    const dialog = page.getByRole("dialog", { name: melon.title });
    await expect(dialog).toBeVisible();
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
    const complete = dialog.getByRole("button", { name: "完成吃瓜" });

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
    await expect(page.getByRole("article", { name: melon.title })).toBeVisible();
  });
});
