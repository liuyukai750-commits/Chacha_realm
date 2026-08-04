import { expect, test } from "@playwright/test";
import { enterIsland, fixedNow, installV0Api, melon, openMelon, spot } from "./fixtures/v0-api.mjs";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const preciseLocation = { latitude: 28.195397, longitude: 112.976869 };

async function allowLocation(context) {
  await context.setGeolocation(preciseLocation);
  await context.grantPermissions(["geolocation"], { origin: baseURL });
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

test.describe("V0 核心循环", () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: new Date(fixedNow) });
  });

  test("GEO-ALLOW：授权定位只在发现请求中使用精确坐标", async ({ context, page }) => {
    const api = await installV0Api(page);
    await allowLocation(context);
    await enterIsland(page);

    const locate = page.getByRole("button", { name: /开启定位|重新定位/ });
    if (await locate.isVisible().catch(() => false)) await locate.click();

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

    await page.getByRole("button", { name: /开启定位|重新定位/ }).click();
    await expect(page.getByRole("status")).toContainText(/定位|位置|授权/);
    await expect(page.getByRole("article", { name: melon.title })).toBeVisible();

    const squat = page.getByRole("button", { name: "蹲瓜" });
    await expect(squat).toBeEnabled();
    await squat.click();
    await expect.poll(() => api.squatRequests).toEqual([{ active: true }]);

    await page.getByRole("button", { name: /埋瓜|种下一颗瓜/ }).click();
    await expect(page.getByText(/需要.*位置|开启定位.*埋瓜|公共地点.*500 米/)).toBeVisible();
  });

  test("READ-5S / READ-FIRST：满 5 秒后首次完成并奖励 1 粒瓜籽", async ({ page }) => {
    const api = await installV0Api(page, { seedCount: 2 });
    await enterIsland(page);
    const dialog = await openMelon(page);
    const complete = dialog.getByRole("button", { name: "完成吃瓜" });

    await expect(complete).toBeDisabled();
    await page.clock.fastForward(4_999);
    await expect(complete).toBeDisabled();
    await page.clock.fastForward(1);
    await expect(complete).toBeEnabled();

    await complete.click();
    await expect.poll(() => api.completeRequests).toEqual([{ readToken: "short-lived-read-token" }]);
    await expect(page.getByRole("status")).toContainText(/瓜籽.*\+1|获得.*1.*瓜籽/);
    await expect(page.getByLabel(/拥有 3 (粒|颗)瓜籽/)).toBeVisible();
  });

  test("READ-REPEAT：服务端判定重复阅读时不重复奖励", async ({ page }) => {
    const api = await installV0Api(page, { seedCount: 3, alreadyCompleted: true });
    await enterIsland(page);
    const dialog = await openMelon(page);
    await page.clock.fastForward(5_000);
    await dialog.getByRole("button", { name: "完成吃瓜" }).click();

    await expect.poll(() => api.completeRequests).toHaveLength(1);
    await expect(page.getByRole("status")).toContainText(/已经吃过|不重复奖励|本次不计数/);
    await expect(page.getByLabel(/拥有 3 (粒|颗)瓜籽/)).toBeVisible();
  });

  test("SQUAT：蹲瓜状态可开启和取消", async ({ page }) => {
    const api = await installV0Api(page);
    await enterIsland(page);
    const dialog = await openMelon(page);
    const squat = dialog.getByRole("button", { name: "蹲瓜" });

    await expect(squat).toHaveAttribute("aria-pressed", "false");
    await squat.click();
    const cancel = dialog.getByRole("button", { name: "取消蹲瓜" });
    await expect(cancel).toHaveAttribute("aria-pressed", "true");
    await cancel.click();
    await expect(dialog.getByRole("button", { name: "蹲瓜" })).toHaveAttribute("aria-pressed", "false");
    await expect.poll(() => api.squatRequests).toEqual([{ active: true }, { active: false }]);
  });

  test("PLANT-DISTANCE：距离失败保留草稿并展示可恢复错误", async ({ context, page }) => {
    const api = await installV0Api(page, { plantDistanceFailure: true });
    await allowLocation(context);
    await enterIsland(page);
    await page.getByRole("button", { name: /埋瓜|种下一颗瓜/ }).click();

    const form = page.getByRole("form", { name: /埋瓜|种下一颗瓜/ });
    await form.getByLabel(/公共地点/).selectOption(spot.id);
    await form.getByLabel(/话题/).selectOption("daily");
    await form.getByLabel(/标题/).fill("广场边遇到的一件小事");
    await form.getByLabel(/故事|内容/).fill("今天路过广场时，有人替陌生人挡住了一场突然的大雨。这里是保留的完整草稿。");
    await form.getByRole("button", { name: "埋下这颗瓜" }).click();

    await expect.poll(() => api.createRequests).toHaveLength(1);
    await expect(page.getByRole("alert")).toContainText(/500 米|距离|公共地点/);
    await expect(form.getByLabel(/标题/)).toHaveValue("广场边遇到的一件小事");
    await expect(form.getByLabel(/故事|内容/)).toHaveValue(/这里是保留的完整草稿/);
  });

  test("COMMENT-140：空评论禁用，最多提交 140 字", async ({ page }) => {
    const api = await installV0Api(page);
    await enterIsland(page);
    const dialog = await openMelon(page);
    await dialog.getByRole("button", { name: /评论|留下评论/ }).click();

    const commentDialog = page.getByRole("dialog", { name: /评论/ });
    const input = commentDialog.getByLabel("评论内容");
    const submit = commentDialog.getByRole("button", { name: "发表评论" });
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
    await dialog.getByRole("link", { name: `查看 ${melon.alias} 的瓜田` }).click();

    await expect(page.getByRole("heading", { level: 1, name: new RegExp(melon.alias) })).toBeVisible();
    await expect(page.getByTestId("field-stage")).toHaveAttribute("aria-label", /花|flower/);
    await expect(page.getByText(melon.title)).toBeVisible();
    await expect(page.getByText(/supabase|user id/i)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /埋瓜|种新瓜|种下一颗瓜/ })).toHaveCount(0);
  });
});
