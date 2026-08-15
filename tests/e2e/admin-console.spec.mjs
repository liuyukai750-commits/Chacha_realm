import { expect, test } from "@playwright/test";

const cityIds = ["changsha", "beijing", "shanghai", "guangzhou", "shenzhen"];

function metric(total = 0, today = 0) {
  return { total, today };
}

function overviewFixture({ empty = false } = {}) {
  const value = empty ? 0 : 7;
  return {
    generatedAt: "2026-08-15T08:30:00.000Z",
    timezone: "Asia/Shanghai",
    users: {
      registrations: metric(value * 10, value),
      active: { today: value, last7Days: value * 3, last30Days: value * 5 },
    },
    engagement: {
      publishedMelons: metric(value * 6, value),
      effectiveReads: metric(value * 12, value * 2),
      comments: metric(value * 3, value),
      likes: metric(value * 4, value),
      squats: { active: value * 2, addedToday: value },
    },
    economy: {
      balances: { smallSeeds: value * 8, trueSeeds: value * 2 },
      earned: { smallSeeds: metric(value * 9, value), trueSeeds: metric(value * 3, value) },
      trueSeedsPlanted: metric(value * 2, value),
      fieldPlants: { planted: metric(value * 4, value), active: value },
      fieldHarvests: { batches: metric(value, value), plants: metric(value * 9, value) },
    },
    cities: cityIds.map((cityId, index) => ({
      cityId,
      publishedMelons: empty ? 0 : value + index,
      effectiveReads: empty ? 0 : value * 2 + index,
      comments: empty ? 0 : index,
      likes: empty ? 0 : value + index,
      squats: empty ? 0 : index + 1,
    })),
    moderation: {
      pendingReviewCases: value,
      heldMelons: value,
      heldComments: value,
      reports: metric(value * 2, value),
      reportedTargets: value,
      bannedProfiles: value,
      banActions: metric(value, value),
    },
  };
}

async function mockOverview(page, response) {
  await page.route("**/api/admin/overview", async (route) => {
    if (typeof response === "function") return response(route);
    return route.fulfill({
      status: response.status ?? 200,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify(response.body ?? response),
    });
  });
}

test.describe("主理人驾驶舱聚合只读界面", () => {
  test("未登录、无权限、服务失败和空账本都有明确反馈", async ({ page }) => {
    for (const state of [
      { status: 401, name: "请先登录主理人账号" },
      { status: 403, name: "这个猹号没有驾驶舱权限" },
      { status: 500, name: "城市汇总读取失败" },
    ]) {
      await page.unrouteAll({ behavior: "wait" });
      await mockOverview(page, { status: state.status, body: { error: { code: "test" } } });
      await page.goto("/admin", { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { name: state.name })).toBeVisible();
    }

    await page.unrouteAll({ behavior: "wait" });
    await mockOverview(page, overviewFixture({ empty: true }));
    await page.goto("/admin", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "城市账本还没有记录" })).toBeVisible();
  });

  test("加载态可见，完成后只展示五城聚合且无敏感明细", async ({ page }) => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    await mockOverview(page, async (route) => {
      await gate;
      return route.fulfill({
        status: 200,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify(overviewFixture()),
      });
    });

    await page.goto("/admin", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "汇总街区脉搏…" })).toBeVisible();
    release();
    await expect(page.getByRole("heading", { name: "街上有动静" })).toBeVisible();

    for (const city of ["长沙", "北京", "上海", "广州", "深圳"]) {
      await expect(page.getByText(city, { exact: true })).toBeVisible();
    }
    await expect(page.getByText("只看城市汇总。", { exact: true })).toBeVisible();
    const text = await page.locator("body").innerText();
    expect(text).not.toContain("13800138000");
    expect(text).not.toContain("00000000-0000-4000-8000-000000000001");
    expect(text).not.toContain("28.2282");
    expect(text).not.toContain("112.9388");
    expect(text).not.toContain("这是某个瓜的正文");
  });

  test("375/430/桌面视口无横向溢出且刷新目标至少 44px", async ({ page }) => {
    await mockOverview(page, overviewFixture());
    await page.goto("/admin", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "街上有动静" })).toBeVisible();

    const layout = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.viewport);
    const refresh = page.getByRole("button", { name: "重新读取城市账本" });
    const box = await refresh.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
  });
});
