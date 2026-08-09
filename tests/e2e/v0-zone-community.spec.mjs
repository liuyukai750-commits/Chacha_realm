import { expect, test } from "@playwright/test";
import {
  discoveryMelons,
  enterIsland,
  fixedNow,
  installV0Api,
  melon,
  publicComments,
  spot,
} from "./fixtures/v0-api.mjs";

const preciseLocation = { latitude: 28.195397, longitude: 112.976869, accuracy: 18 };

async function allowLocation(context, baseURL, location = preciseLocation) {
  if (!baseURL) throw new Error("Playwright baseURL 未配置");
  await context.setGeolocation(location);
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
        getCurrentPosition(_success, failure) { failure?.(denied); },
        watchPosition(_success, failure) { failure?.(denied); return 1; },
      },
    });
  });
}

async function removePlatformCapabilities(page, capabilities) {
  await page.addInitScript((names) => {
    for (const name of names) {
      try { delete Navigator.prototype[name]; } catch { /* Capability absence is the test input. */ }
      try { delete navigator[name]; } catch { /* Capability absence is the test input. */ }
    }
  }, capabilities);
}

async function expandBasket(page) {
  const handle = page.getByRole("button", { name: /瓜篮/ });
  await expect(handle).toBeVisible();
  if (await handle.getAttribute("aria-expanded") !== "true") await handle.click();
  await expect(handle).toHaveAttribute("aria-expanded", "true");
}

async function openRemoteMelon(page) {
  const remote = discoveryMelons.find((item) => item.isRemote);
  if (!remote) throw new Error("fixture 必须包含远方瓜");
  await expandBasket(page);
  const row = page.getByRole("article", { name: remote.title, exact: true });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "远方围观", exact: true }).click();
  const dialog = page.getByRole("dialog").filter({ has: page.getByRole("heading", { name: remote.title, exact: true }) });
  await expect(dialog).toBeVisible();
  return { dialog, remote };
}

async function openLocalMelon(page) {
  await expandBasket(page);
  const row = page.getByRole("article", { name: melon.title, exact: true });
  await row.getByRole("button", { name: "直接吃", exact: true }).click();
  const dialog = page.getByRole("dialog").filter({ has: page.getByRole("heading", { name: melon.title, exact: true }) });
  await expect(dialog).toBeVisible();
  return dialog;
}

function annotateCapabilitySimulation(testInfo, profile) {
  testInfo.annotations.push({
    type: "capability-simulation",
    description: `${profile}：在 Chromium 中模拟能力与动态视口，不代表真实系统浏览器或真机验收`,
  });
}

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date(fixedNow) });
});

test.describe("瓜区承载、筛选与远程围观", () => {
  test("ZONE-12：瓜篮承载 12 颗示例瓜，话题筛选与两类动作语义明确", async ({ page }) => {
    await installV0Api(page);
    await enterIsland(page);

    await expect(page.getByRole("region", { name: "瓜区控制台" })).toContainText("12 颗瓜");
    await expandBasket(page);
    await expect(page.getByRole("article")).toHaveCount(12);

    const topicFilter = page.getByRole("group", { name: "按单一话题筛选" });
    await topicFilter.getByRole("button", { name: "职场", exact: true }).click();
    await expect(topicFilter.getByRole("button", { name: "职场", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("region", { name: "瓜区控制台" })).toContainText("3 颗瓜");
    await expect(page.getByRole("article")).toHaveCount(3);

    await topicFilter.getByRole("button", { name: "全部", exact: true }).click();
    const localRow = page.getByRole("article", { name: melon.title, exact: true });
    await expect(localRow.getByRole("button", { name: "直接吃", exact: true })).toBeVisible();
    await expect(localRow.getByRole("button", { name: "去现场找", exact: true })).toBeVisible();

    const remote = discoveryMelons.find((item) => item.isRemote);
    const remoteRow = page.getByRole("article", { name: remote.title, exact: true });
    await expect(remoteRow.getByRole("button", { name: "远方围观", exact: true })).toBeVisible();
    await expect(remoteRow.getByRole("button", { name: "去现场找", exact: true })).toBeVisible();
  });

  test("REMOTE-READ：远程可读正文、公开评论、轻反应和蹲瓜，但没有评论输入", async ({ page }) => {
    const api = await installV0Api(page);
    await enterIsland(page);
    const { dialog, remote } = await openRemoteMelon(page);

    await expect(dialog).toContainText(remote.content);
    await expect(dialog.getByText(publicComments[0].content, { exact: true })).toBeVisible();
    await expect(dialog.getByText(publicComments[1].content, { exact: true })).toBeVisible();
    await expect(dialog.getByText("远方围观模式", { exact: true })).toBeVisible();
    await expect(dialog.getByRole("textbox", { name: /评论/ })).toHaveCount(0);

    await dialog.getByRole("button", { name: /^有汁/ }).click();
    await dialog.getByRole("button", { name: "蹲瓜", exact: true }).click();
    await expect.poll(() => api.reactionRequests).toEqual([{ melonId: remote.id, reaction: "juicy" }]);
    await expect.poll(() => api.squatRequests).toContainEqual({ melonId: remote.id, active: true });
    await expect.poll(() => api.commentGetRequests).toContainEqual({ melonId: remote.id, search: "?limit=20" });
  });

  test("COMMENTS-GET：评论保持单层，刷新后重新读取 GET fixture，且没有社交入口", async ({ page }) => {
    const api = await installV0Api(page);
    await enterIsland(page);
    let opened = await openRemoteMelon(page);

    const commentList = opened.dialog.getByRole("region", { name: "评论" });
    await expect(commentList.getByRole("article")).toHaveCount(publicComments.length);
    expect(await commentList.getByRole("article").evaluateAll((items) => items.every((item) => !item.querySelector("article")))).toBe(true);
    await expect(opened.dialog.getByRole("button", { name: /回复|私信|好友|关注/ })).toHaveCount(0);
    await expect(opened.dialog.getByRole("link", { name: /回复|私信|好友|关注/ })).toHaveCount(0);

    await page.reload();
    await expect(page.getByRole("main")).toBeVisible();
    opened = await openRemoteMelon(page);
    await expect(opened.dialog.getByText(publicComments[0].content, { exact: true })).toBeVisible();
    await expect.poll(() => api.commentGetRequests.filter((item) => item.melonId === opened.remote.id)).toHaveLength(2);
  });
});

test.describe("四段寻瓜与现场评论凭证", () => {
  test("SEEK-STATES：outside / near / inside_zone / found 逐段可见", async ({ baseURL, context, page }) => {
    const api = await installV0Api(page, { presenceSequence: ["outside", "near", "inside_zone", "found"] });
    await allowLocation(context, baseURL);
    await enterIsland(page);

    const expectedLabels = ["叶语很轻", "叶脉有回应", "已进入瓜区", "找到瓜棚了"];
    for (const label of expectedLabels) {
      await page.getByRole("button", { name: /开始感应|再感应/ }).click();
      await expect(page.getByRole("status").filter({ hasText: label }).first()).toBeVisible();
    }
    await expect.poll(() => api.presenceRequests).toHaveLength(4);
    for (const request of api.presenceRequests) {
      expect(request.spotId).toBe(spot.id);
      expect(request.location.latitude).toBeCloseTo(preciseLocation.latitude, 5);
      expect(request.location.longitude).toBeCloseTo(preciseLocation.longitude, 5);
    }
  });

  test("GEO-UNSUPPORTED：定位能力缺失时给出说明并保留远程围观", async ({ page }) => {
    await removePlatformCapabilities(page, ["geolocation", "vibrate"]);
    await installV0Api(page);
    await enterIsland(page);

    await page.getByRole("button", { name: "开始感应", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: /远方围观/ }).first()).toContainText(/不支持定位.*远方围观/);
    await expandBasket(page);
    await expect(page.getByRole("button", { name: "远方围观", exact: true })).toBeVisible();
  });

  test("GEO-DENIED：定位拒绝时保留远程围观", async ({ context, page }) => {
    await denyLocation(page, context);
    await installV0Api(page);
    await enterIsland(page);

    await page.getByRole("button", { name: "开始感应", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: /远方围观/ }).first()).toContainText(/拒绝|授权.*远方围观/);
    await expandBasket(page);
    await expect(page.getByRole("button", { name: "远方围观", exact: true })).toBeVisible();
  });

  test("GEO-LOW-ACCURACY：低精度验证失败时说明限制并保留远程围观", async ({ baseURL, context, page }) => {
    await allowLocation(context, baseURL, { ...preciseLocation, accuracy: 2_500 });
    await installV0Api(page, { rejectLowAccuracy: true });
    await enterIsland(page);

    await page.getByRole("button", { name: "开始感应", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: /远方围观/ }).first()).toContainText(/精度不足.*远方围观/);
    await expandBasket(page);
    await expect(page.getByRole("button", { name: "远方围观", exact: true })).toBeVisible();
  });

  for (const failure of [
    { label: "过期", status: 401, code: "PRESENCE_EXPIRED", message: "现场凭证已过期" },
    { label: "不匹配", status: 403, code: "PRESENCE_MISMATCH", message: "现场凭证与瓜区不匹配" },
    { label: "服务失败", status: 503, code: "COMMENT_FAILED", message: "评论暂时发送失败" },
  ]) {
    test(`COMMENT-DRAFT-${failure.label}：POST 携带 token 且失败后保留草稿`, async ({ baseURL, context, page }) => {
      const api = await installV0Api(page, { commentFailure: { ...failure, once: true } });
      await allowLocation(context, baseURL);
      await enterIsland(page);
      const dialog = await openLocalMelon(page);

      await expect(dialog.getByRole("textbox", { name: /评论/ })).toHaveCount(0);
      await dialog.getByRole("button", { name: "去现场找", exact: true }).click();
      const input = dialog.getByRole("textbox", { name: /评论/ });
      const draft = `这条${failure.label}草稿必须留下`;
      await input.fill(draft);
      await dialog.getByRole("button", { name: "发表评论", exact: true }).click();

      await expect.poll(() => api.commentRequests).toEqual([{
        content: draft,
        presenceToken: "presence-token-inside_zone",
      }]);
      await expect(dialog.getByRole("alert")).toContainText(new RegExp(`${failure.message}.*草稿已保留`));
      await expect.poll(() => page.evaluate((key) => sessionStorage.getItem(key), `chacha-comment-draft:${melon.id}`)).toBe(draft);

      await dialog.getByRole("button", { name: "去现场找", exact: true }).click();
      await expect(dialog.getByRole("textbox", { name: /评论/ })).toHaveValue(draft);
      await expect(dialog).toContainText("不支持回复、@、私信或好友关系");
    });
  }
});

test.describe("移动浏览器能力模拟（不是实机或真实引擎）", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium-375", "能力组合在单一 Chromium 项目执行，避免被误报为多浏览器真机覆盖");
  });

  test("SIM-IOS-SAFARI：拒绝定位、无振动与动态视口下远程入口可达", async ({ context, page }, testInfo) => {
    annotateCapabilitySimulation(testInfo, "iOS Safari");
    await denyLocation(page, context);
    await removePlatformCapabilities(page, ["vibrate"]);
    await installV0Api(page);
    await page.setViewportSize({ width: 375, height: 520 });
    await enterIsland(page);

    await page.getByRole("button", { name: "开始感应", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: /远方围观/ }).first()).toContainText(/远方围观/);
    await page.setViewportSize({ width: 375, height: 760 });
    await expandBasket(page);
    await expect(page.getByRole("button", { name: "远方围观", exact: true })).toBeVisible();
  });

  test("SIM-ANDROID-CHROME：定位与振动增强存在时 found 仍以文字反馈", async ({ baseURL, context, page }, testInfo) => {
    annotateCapabilitySimulation(testInfo, "Android Chrome");
    await page.addInitScript(() => {
      window.__vibrationCalls = [];
      Object.defineProperty(navigator, "vibrate", {
        configurable: true,
        value: (duration) => { window.__vibrationCalls.push(duration); return true; },
      });
    });
    await allowLocation(context, baseURL);
    await installV0Api(page, { presenceSequence: ["found"] });
    await page.setViewportSize({ width: 430, height: 560 });
    await enterIsland(page);

    await page.getByRole("button", { name: "开始感应", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "找到瓜棚了" }).first()).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.__vibrationCalls)).toEqual([18]);
    await page.setViewportSize({ width: 430, height: 820 });
    await expect(page.getByText("找到瓜棚了", { exact: true }).first()).toBeVisible();
  });

  test("SIM-HARMONY：定位与振动均缺失、动态视口变化时仍无横向溢出", async ({ page }, testInfo) => {
    annotateCapabilitySimulation(testInfo, "鸿蒙系统浏览器");
    await removePlatformCapabilities(page, ["geolocation", "vibrate"]);
    await installV0Api(page);
    await page.setViewportSize({ width: 430, height: 500 });
    await enterIsland(page);

    await page.getByRole("button", { name: "开始感应", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: /远方围观/ }).first()).toContainText(/不支持定位.*远方围观/);
    for (const height of [500, 780]) {
      await page.setViewportSize({ width: 430, height });
      const widths = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
      expect(widths.scroll).toBeLessThanOrEqual(widths.client + 1);
    }
  });

  test("SIM-SOFT-KEYBOARD：动态视口缩小时评论输入与发送操作仍可滚动到达", async ({ baseURL, context, page }, testInfo) => {
    annotateCapabilitySimulation(testInfo, "移动端软键盘");
    await allowLocation(context, baseURL);
    await installV0Api(page);
    await page.setViewportSize({ width: 375, height: 720 });
    await enterIsland(page);
    const dialog = await openLocalMelon(page);
    await dialog.getByRole("button", { name: "去现场找", exact: true }).click();

    const input = dialog.getByRole("textbox", { name: /评论/ });
    await input.focus();
    await page.setViewportSize({ width: 375, height: 500 });
    const submit = dialog.getByRole("button", { name: "发表评论", exact: true });
    await submit.scrollIntoViewIfNeeded();
    await expect(input).toBeEditable();
    await expect(submit).toBeInViewport();
    const layout = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
    expect(layout.scroll).toBeLessThanOrEqual(layout.client + 1);
  });
});
