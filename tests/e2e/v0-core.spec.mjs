import { expect, test } from "@playwright/test";
import {
  completeReadControl,
  enterIsland,
  fixedNow,
  installV0Api,
  melon,
  openMelon,
  spot,
} from "./fixtures/v0-api.mjs";

const preciseLocation = { latitude: 28.195397, longitude: 112.976869 };

async function allowLocation(context, baseURL) {
  if (!baseURL) throw new Error("Playwright baseURL 未配置");
  await context.setGeolocation(preciseLocation);
  await context.grantPermissions(["geolocation"], { origin: new URL(baseURL).origin });
}

async function denyLocation(page, context) {
  await context.clearPermissions();
  await page.addInitScript(() => {
    const denied = { code: 1, message: "User denied Geolocation", PERMISSION_DENIED: 1 };
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        clearWatch() {},
        getCurrentPosition(_success, failure) {
          failure?.(denied);
        },
        watchPosition(_success, failure) {
          failure?.(denied);
          return 1;
        },
      },
    });
  });
}

function locationControl(page) {
  return page.getByRole("button", { name: /定位|距离/ }).first();
}

function buryControl(page) {
  return page.getByRole("button", { name: /埋.*瓜|种.*瓜/ }).first();
}

async function chooseOption(scope, { label, optionName, optionValue }) {
  const select = scope.getByRole("combobox", { name: label });
  if (await select.count()) {
    await select.selectOption(optionValue);
    return;
  }

  const radio = scope.getByRole("radio", { name: optionName, exact: true });
  if (await radio.count()) {
    await radio.check();
    return;
  }

  const button = scope.getByRole("button", { name: optionName, exact: true });
  await expect(button, `应提供可访问的“${optionName}”选项`).toBeVisible();
  await button.click();
}

async function squatControl(dialog, active) {
  const button = dialog.getByRole("button", { name: /蹲/ }).first();
  await expect(button).toBeVisible();
  const pressed = await button.getAttribute("aria-pressed");
  if (pressed !== null) {
    await expect(button).toHaveAttribute("aria-pressed", String(active));
  } else {
    await expect(button).toHaveAccessibleName(active ? /已.*蹲|取消.*蹲/ : /^(?!.*已)(?!.*取消).*蹲/);
  }
  return button;
}

test.describe("V0 核心循环", () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: new Date(fixedNow) });
  });

  test("GEO-ALLOW：授权定位只在发现请求中使用精确坐标", async ({ baseURL, context, page }) => {
    const api = await installV0Api(page);
    await allowLocation(context, baseURL);
    await enterIsland(page);

    const locate = locationControl(page);
    await expect(locate).toBeVisible();
    await locate.click();

    await expect.poll(() => api.discoveryRequests.some((request) => request?.location)).toBe(true);
    const locatedRequest = api.discoveryRequests.find((request) => request?.location);
    expect(locatedRequest.location.latitude).toBeCloseTo(preciseLocation.latitude, 5);
    expect(locatedRequest.location.longitude).toBeCloseTo(preciseLocation.longitude, 5);
    expect(locatedRequest.location.capturedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const pageText = await page.locator("body").innerText();
    expect(pageText).not.toContain(String(preciseLocation.latitude));
    expect(pageText).not.toContain(String(preciseLocation.longitude));
    const persisted = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
    expect(persisted).not.toContain(String(preciseLocation.latitude));
    expect(persisted).not.toContain(String(preciseLocation.longitude));
  });

  test("GEO-DENY：拒绝定位后仍可浏览和蹲瓜，埋瓜有明确限制", async ({ context, page }) => {
    const api = await installV0Api(page);
    await denyLocation(page, context);
    await enterIsland(page);

    await locationControl(page).click();
    await expect(page.getByRole("status").filter({ hasText: /定位|位置|授权/ }).first()).toBeVisible();

    const fallbackDialog = page.getByRole("dialog").first();
    if (await fallbackDialog.isVisible().catch(() => false)) {
      await fallbackDialog.getByRole("button", { name: /关闭/ }).click();
    }

    const reader = await openMelon(page);
    const squat = await squatControl(reader, false);
    await squat.click();
    await expect.poll(() => api.squatRequests).toEqual([{ active: true }]);
    await reader.getByRole("button", { name: /关闭/ }).click();

    await buryControl(page).click();
    await expect(page.getByRole("dialog").filter({ hasText: /定位|位置|公共地点.*500\s*米/ }).first()).toBeVisible();
  });

  test("READ-5S / READ-FIRST：满 5 秒后首次完成并奖励 1 粒瓜籽", async ({ page }) => {
    const api = await installV0Api(page, { seedCount: 2 });
    await enterIsland(page);
    const dialog = await openMelon(page);
    const complete = completeReadControl(dialog);
    const readingStatus = dialog.getByRole("status", { name: /阅读.*秒/ });

    await expect(readingStatus).toHaveAccessibleName(/还需.*秒/);
    await expect(complete).toBeDisabled();
    await page.clock.fastForward(4_000);
    await expect(complete).toBeDisabled();
    await page.clock.fastForward(1_100);
    await expect(complete).toBeEnabled();

    await complete.click();
    await expect.poll(() => api.completeRequests).toEqual([{ readToken: "short-lived-read-token" }]);
    await expect(page.getByRole("status").filter({ hasText: /瓜籽.*\+1|获得.*1.*瓜籽/ }).first()).toBeVisible();
    await expect(page.getByLabel(/拥有 3 (粒|颗)瓜籽/)).toBeVisible();
  });

  test("READ-REPEAT：服务端判定重复阅读时不重复奖励", async ({ page }) => {
    const api = await installV0Api(page, { seedCount: 3, alreadyCompleted: true });
    await enterIsland(page);
    const dialog = await openMelon(page);
    await page.clock.fastForward(5_000);
    await completeReadControl(dialog).click();

    await expect.poll(() => api.completeRequests).toHaveLength(1);
    await expect(page.getByRole("status").filter({ hasText: /已经吃过|不重复奖励|本次不计数/ }).first()).toBeVisible();
    await expect(page.getByLabel(/拥有 3 (粒|颗)瓜籽/)).toBeVisible();
  });

  test("SQUAT：蹲瓜状态可开启和取消", async ({ page }) => {
    const api = await installV0Api(page);
    await enterIsland(page);
    const dialog = await openMelon(page);
    const squat = await squatControl(dialog, false);

    await squat.click();
    const cancel = await squatControl(dialog, true);
    await cancel.click();
    await squatControl(dialog, false);
    await expect.poll(() => api.squatRequests).toEqual([{ active: true }, { active: false }]);
  });

  test("PLANT-DISTANCE：距离失败保留草稿并展示可恢复错误", async ({ baseURL, context, page }) => {
    const api = await installV0Api(page, { plantDistanceFailure: true });
    await allowLocation(context, baseURL);
    await enterIsland(page);
    await buryControl(page).click();

    const buryDialog = page.getByRole("dialog").filter({ has: page.locator("form") }).first();
    const form = buryDialog.locator("form");
    await chooseOption(buryDialog, { label: /公共地点/, optionName: spot.name, optionValue: spot.id });
    await chooseOption(buryDialog, { label: /话题|瓜/, optionName: "日常", optionValue: "daily" });
    await form.getByRole("textbox", { name: /标题|瓜.*名字/ }).fill("广场边遇到的一件小事");
    await form.getByRole("textbox", { name: /故事|内容/ }).fill("今天路过广场时，有人替陌生人挡住了一场突然的大雨。这里是保留的完整草稿。");
    await form.getByRole("button", { name: /埋.*瓜|种.*瓜/ }).click();

    await expect.poll(() => api.createRequests).toHaveLength(1);
    await expect(buryDialog.getByRole("alert")).toContainText(/500\s*米|距离|公共地点/);
    await expect(form.getByRole("textbox", { name: /标题|瓜.*名字/ })).toHaveValue("广场边遇到的一件小事");
    await expect(form.getByRole("textbox", { name: /故事|内容/ })).toHaveValue(/这里是保留的完整草稿/);
  });

  test("COMMENT-140：空评论禁用，最多提交 140 字", async ({ page }) => {
    const api = await installV0Api(page);
    await enterIsland(page);
    const dialog = await openMelon(page);
    let input = dialog.getByRole("textbox", { name: /评论/ });
    if (!(await input.count())) {
      await dialog.getByRole("button", { name: /评论/ }).click();
      input = page.getByRole("textbox", { name: /评论/ }).last();
    }
    const commentForm = input.locator("xpath=ancestor::form[1]");
    const submit = commentForm.getByRole("button", { name: /评论|回声|留下/ });
    await expect(input).toHaveAttribute("maxlength", "140");
    await expect(submit).toBeDisabled();

    await input.pressSequentially("瓜".repeat(141));
    await expect(input).toHaveValue("瓜".repeat(140));
    await submit.click();
    await expect.poll(() => api.commentRequests).toEqual([{ content: "瓜".repeat(140) }]);
  });

  test("FIELD-OTHER：他人瓜田只展示公开资料和成长状态", async ({ page }) => {
    await installV0Api(page);
    await enterIsland(page);
    const dialog = await openMelon(page);
    await dialog.getByRole("link", { name: new RegExp(melon.alias) }).click();

    await expect(page.getByText(melon.alias, { exact: true })).toBeVisible();
    await expect(page.locator('[aria-label*="阶段"], [aria-label*="stage" i]').first()).toHaveAttribute("aria-label", /花|flower/);
    await expect(page.getByText(spot.name)).toBeVisible();
    await expect(page.getByText(/supabase|user id/i)).toHaveCount(0);
    await expect(page.getByRole("main").getByRole("button", { name: /埋.*瓜|种.*瓜/ })).toHaveCount(0);
  });
});
