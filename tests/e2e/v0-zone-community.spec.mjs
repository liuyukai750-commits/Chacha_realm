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
  test("NEARBY-DEMO：本地试玩无需定位权限也能模拟附近 1 公里", async ({ page }) => {
    await page.addInitScript(() => {
      window.__demoGeolocationCalls = 0;
      Object.defineProperty(navigator, "geolocation", {
        configurable: true,
        value: {
          clearWatch() {},
          getCurrentPosition() { window.__demoGeolocationCalls += 1; },
          watchPosition() { window.__demoGeolocationCalls += 1; return 1; },
        },
      });
    });
    await page.route("**/api/**", async (route) => {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "service_unavailable", message: "测试环境未连接数据服务" } }),
      });
    });

    await page.goto("/");
    await page.getByRole("button", { name: "进入本地试玩", exact: true }).click();
    const scope = page.getByRole("group", { name: "吃瓜范围" });
    const nearbyButton = scope.getByRole("button", { name: /模拟附近 1km/ });
    await expect(nearbyButton).toContainText("不读取真实位置");

    await nearbyButton.click();
    await expect(nearbyButton).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("status").filter({ hasText: "已模拟附近 1 公里" })).toContainText("未读取电脑位置");
    await expect(page.getByRole("heading", { name: "1公里内， 正在冒瓜。" })).toBeVisible();
    await expect(page.getByTestId("radar-surface")).toHaveAttribute("data-scene-context", "nearby_area");
    await expect(page.getByTestId("radar-surface").locator("img")).toHaveAttribute("src", /nearby-neighborhood-(day|night)-v1/);
    await expect(page.getByRole("region", { name: "瓜区控制台" })).toContainText("0 颗瓜");
    await expect(page.getByRole("status").filter({ hasText: "1 公里内暂时没有瓜" })).toBeVisible();
    await expect(page.getByTestId("radar-surface").getByText("五一广场", { exact: true })).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => window.__demoGeolocationCalls)).toBe(0);
  });

  test("NEARBY-1KM：定位后只展示 1 公里内的瓜，并可返回城市瓜区", async ({ baseURL, context, page }) => {
    const api = await installV0Api(page);
    await allowLocation(context, baseURL);
    await enterIsland(page);

    const scope = page.getByRole("group", { name: "吃瓜范围" });
    const nearbyButton = scope.getByRole("button", { name: /附近 1km/ });
    const cityButton = scope.getByRole("button", { name: /城市瓜区/ });
    await expect(cityButton).toHaveAttribute("aria-pressed", "true");

    await nearbyButton.click();
    await expect(nearbyButton).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("heading", { name: "1公里内， 正在冒瓜。" })).toBeVisible();
    await expect(page.getByTestId("radar-surface")).toHaveAttribute("data-scene-context", "public_spot");
    await expect(page.getByTestId("radar-surface").locator("img")).toHaveAttribute("src", /changsha-wuyi-(day|night)/);
    await expect(page.getByRole("region", { name: "瓜区控制台" })).toContainText("4 颗瓜");
    await expect(page.getByTestId("radar-surface").locator(".melon-node")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "瓜区总览：4颗瓜，点开挑选" })).toBeVisible();
    await expandBasket(page);
    await expect(page.getByRole("article")).toHaveCount(4);
    await expect.poll(() => api.discoveryRequests.at(-1)).toMatchObject({
      location: {
        latitude: preciseLocation.latitude,
        longitude: preciseLocation.longitude,
      },
    });
    expect(api.discoveryRequests.at(-1)?.selectedCityId).toBe("changsha");

    await cityButton.click();
    await expect(cityButton).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("radar-surface")).toHaveAttribute("data-scene-context", "city_overview");
    await expect(page.getByRole("region", { name: "瓜区控制台" })).toContainText("12 颗瓜");
  });

  test("NEARBY-SCENE：未进入公共地标范围时切换为普通生活街区", async ({ baseURL, context, page }) => {
    await installV0Api(page, { nearLandmark: false });
    await allowLocation(context, baseURL);
    await enterIsland(page);

    const stage = page.getByTestId("radar-surface");
    await expect(stage).toHaveAttribute("data-scene-context", "city_overview");
    await page.getByRole("group", { name: "吃瓜范围" }).getByRole("button", { name: /附近 1km/ }).click();
    await expect(stage).toHaveAttribute("data-scene-context", "nearby_area");
    await expect(stage).toHaveAccessibleName(/普通生活街区瓜域场景.*尚未进入公共地标范围.*没有坐标/);
    await expect(stage.locator("img")).toHaveAttribute("src", /nearby-neighborhood-(day|night)-v1/);
    await expect(stage.getByText("普通附近", { exact: true })).toBeVisible();
    await expect(stage.getByText("1km 生活圈", { exact: true })).toBeVisible();
    await expect(stage.getByText("五一广场", { exact: true })).toHaveCount(0);
    await expect(stage.locator(".melon-node")).toHaveCount(0);
    await expect(page.getByRole("region", { name: "瓜区控制台" })).toContainText("0 颗瓜");
  });

  test("NEARBY-EMPTY：1 公里没有瓜时明确为空且不自动扩到 3 公里", async ({ baseURL, context, page }) => {
    await installV0Api(page, { noNearby: true });
    await allowLocation(context, baseURL);
    await enterIsland(page);

    await page.getByRole("group", { name: "吃瓜范围" }).getByRole("button", { name: /附近 1km/ }).click();
    await expect(page.getByRole("status").filter({ hasText: "1 公里内暂时没有瓜" })).toContainText("不会偷偷扩大距离");
    await expect(page.getByRole("region", { name: "瓜区控制台" })).toContainText("0 颗瓜");
    await page.getByRole("button", { name: "看看城市瓜区", exact: true }).click();
    await expect(page.getByRole("region", { name: "瓜区控制台" })).toContainText("12 颗瓜");
  });

  test("ZONE-12：瓜篮承载 12 颗示例瓜，话题筛选与两类动作语义明确", async ({ page }) => {
    await installV0Api(page);
    await enterIsland(page);

    await expect(page.getByRole("region", { name: "瓜区控制台" })).toContainText("12 颗瓜");
    const stage = page.getByTestId("radar-surface");
    await expect(stage.locator(".melon-node")).toHaveCount(0);
    const overview = page.getByRole("button", { name: "瓜区总览：12颗瓜，点开挑选" });
    await expect(overview).toBeVisible();
    await overview.click();
    await expect(page.getByRole("button", { name: /瓜篮/ })).toHaveAttribute("aria-expanded", "true");
    const basket = page.getByRole("region", { name: "瓜篮" });
    await expect(basket.getByRole("article")).toHaveCount(12);

    const topicFilter = page.getByRole("group", { name: "按单一话题筛选" });
    await topicFilter.getByRole("button", { name: "职场", exact: true }).click();
    await expect(topicFilter.getByRole("button", { name: "职场", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("region", { name: "瓜区控制台" })).toContainText("3 颗瓜");
    await expect(basket.getByRole("article")).toHaveCount(3);

    await topicFilter.getByRole("button", { name: "全部", exact: true }).click();
    const localRow = page.getByRole("article", { name: melon.title, exact: true });
    await expect(localRow.getByRole("button", { name: "直接吃", exact: true })).toBeVisible();
    await expect(localRow.getByRole("button", { name: "顺藤摸瓜", exact: true })).toHaveCount(0);

    const secondLocal = discoveryMelons.find((item) => !item.isRemote && item.id !== melon.id && item.status === "mature");
    const secondLocalRow = page.getByRole("article", { name: secondLocal.title, exact: true });
    await expect(secondLocalRow.getByRole("button", { name: "直接吃", exact: true })).toBeVisible();
    await expect(secondLocalRow.getByRole("button", { name: "顺藤摸瓜", exact: true })).toHaveCount(0);

    const remote = discoveryMelons.find((item) => item.isRemote);
    const remoteRow = page.getByRole("article", { name: remote.title, exact: true });
    await expect(remoteRow.getByRole("button", { name: "远方围观", exact: true })).toBeVisible();
    await expect(remoteRow.getByRole("button", { name: "顺藤摸瓜", exact: true })).toHaveCount(0);
  });

  test("CITY-ISOLATION：城市瓜区不会混入手机附近生活圈的瓜", async ({ page }) => {
    await installV0Api(page, { includeNearbyAreaInCity: true });
    await enterIsland(page);

    const cityScope = page.getByRole("group", { name: "吃瓜范围" }).getByRole("button", { name: /城市瓜区/ });
    await expect(cityScope).toContainText("11 颗公开瓜");
    await expect(page.getByRole("button", { name: "瓜区总览：11颗瓜，点开挑选" })).toBeVisible();
    await page.getByRole("button", { name: "瓜区总览：11颗瓜，点开挑选" }).click();
    await expect(page.getByRole("region", { name: "瓜篮" }).getByRole("article")).toHaveCount(11);
    await expect(page.getByRole("article", { name: melon.title, exact: true })).toHaveCount(0);
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

    await dialog.getByRole("button", { name: /^点赞/ }).click();
    await dialog.getByRole("button", { name: /蹲后续/ }).click();
    await expect.poll(() => api.reactionRequests).toEqual([{ melonId: remote.id, reaction: "like", active: true }]);
    await expect.poll(() => api.squatRequests).toContainEqual({ melonId: remote.id, active: true });
    await expect.poll(() => api.commentGetRequests).toContainEqual({ melonId: remote.id, search: "?limit=20" });
  });

  test("LIKE-SQUAT-COUNTS：点赞和蹲后续按服务端聚合立即加减并重开保持", async ({ page }) => {
    const api = await installV0Api(page);
    await enterIsland(page);
    const { dialog, remote } = await openRemoteMelon(page);
    const like = dialog.getByRole("button", { name: /^点赞/ });

    await expect(like).toContainText("3");
    await like.click();
    await expect.poll(() => api.reactionRequests).toEqual([{ melonId: remote.id, reaction: "like", active: true }]);
    await expect(like).toContainText("4");

    await like.click();
    await expect.poll(() => api.reactionRequests).toEqual([
      { melonId: remote.id, reaction: "like", active: true },
      { melonId: remote.id, reaction: "like", active: false },
    ]);
    await expect(like).toContainText("3");

    const squat = dialog.getByRole("button", { name: /蹲/ }).first();
    await squat.click();
    await expect.poll(() => api.squatRequests).toContainEqual({ melonId: remote.id, active: true });
    await expect(squat).toContainText("1");
    await squat.click();
    await expect.poll(() => api.squatRequests).toContainEqual({ melonId: remote.id, active: false });
    await expect(squat).toContainText("0");

    await dialog.getByRole("button", { name: "关闭" }).click();
    const reopened = await openRemoteMelon(page);
    await expect(reopened.dialog.getByRole("button", { name: /^点赞/ })).toContainText("3");
    await expect(reopened.dialog.getByRole("button", { name: /蹲/ }).first()).toContainText("0");
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

test.describe("现场评论凭证", () => {
  test("PRESENCE-COMMENT：位置验证只在评论前触发，正文和公开评论可直接读取", async ({ baseURL, context, page }) => {
    const api = await installV0Api(page, { presenceSequence: ["inside_zone"] });
    await allowLocation(context, baseURL);
    await enterIsland(page);
    const dialog = await openLocalMelon(page);

    await expect(dialog).toContainText(melon.content);
    await expect(dialog.getByText(publicComments[0].content, { exact: true })).toBeVisible();
    await expect(dialog.getByRole("textbox", { name: /评论/ })).toHaveCount(0);
    await dialog.getByRole("button", { name: "验证现场评论资格", exact: true }).click();
    await expect(dialog.getByRole("textbox", { name: /评论/ })).toBeVisible();
    await expect.poll(() => api.presenceRequests).toHaveLength(1);
    expect(api.presenceRequests[0].spotId).toBe(spot.id);
    expect(api.presenceRequests[0].location.latitude).toBeCloseTo(preciseLocation.latitude, 5);
    expect(api.presenceRequests[0].location.longitude).toBeCloseTo(preciseLocation.longitude, 5);
  });

  test("GEO-UNSUPPORTED：定位能力缺失时给出说明并保留远程围观", async ({ page }) => {
    await removePlatformCapabilities(page, ["geolocation", "vibrate"]);
    await installV0Api(page);
    await enterIsland(page);

    const dialog = await openLocalMelon(page);
    await dialog.getByRole("button", { name: "验证现场评论资格", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText(/不支持定位/);
    await expect(dialog).toContainText(melon.content);
  });

  test("GEO-DENIED：定位拒绝时保留远程围观", async ({ context, page }) => {
    await denyLocation(page, context);
    await installV0Api(page);
    await enterIsland(page);

    const dialog = await openLocalMelon(page);
    await dialog.getByRole("button", { name: "验证现场评论资格", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText(/定位已拒绝|授权/);
    await expect(dialog).toContainText(melon.content);
  });

  test("GEO-LOW-ACCURACY：低精度验证失败时说明限制并保留远程围观", async ({ baseURL, context, page }) => {
    await allowLocation(context, baseURL, { ...preciseLocation, accuracy: 2_500 });
    await installV0Api(page, { rejectLowAccuracy: true });
    await enterIsland(page);

    const dialog = await openLocalMelon(page);
    await dialog.getByRole("button", { name: "验证现场评论资格", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText(/精度不足|位置/);
    await expect(dialog).toContainText(melon.content);
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
      await dialog.getByRole("button", { name: "验证现场评论资格", exact: true }).click();
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

      await dialog.getByRole("button", { name: "验证现场评论资格", exact: true }).click();
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

    const dialog = await openLocalMelon(page);
    await dialog.getByRole("button", { name: "验证现场评论资格", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText(/定位已拒绝|授权/);
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

    const dialog = await openLocalMelon(page);
    await dialog.getByRole("button", { name: "验证现场评论资格", exact: true }).click();
    await expect(dialog.getByText("现场凭证已点亮", { exact: true }).first()).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.__vibrationCalls)).toEqual([18]);
    await page.setViewportSize({ width: 430, height: 820 });
    await expect(page.getByText("现场凭证已点亮", { exact: true }).first()).toBeVisible();
  });

  test("SIM-HARMONY：定位与振动均缺失、动态视口变化时仍无横向溢出", async ({ page }, testInfo) => {
    annotateCapabilitySimulation(testInfo, "鸿蒙系统浏览器");
    await removePlatformCapabilities(page, ["geolocation", "vibrate"]);
    await installV0Api(page);
    await page.setViewportSize({ width: 430, height: 500 });
    await enterIsland(page);

    const dialog = await openLocalMelon(page);
    await dialog.getByRole("button", { name: "验证现场评论资格", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText(/不支持定位/);
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
    await dialog.getByRole("button", { name: "验证现场评论资格", exact: true }).click();

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
