import { expect, test } from "@playwright/test";
import { enterIsland, installV0Api, melon } from "./fixtures/v0-api.mjs";

test("听瓜入口打开蹲瓜架，成熟瓜可直达正文和评论", async ({ page }) => {
  const state = await installV0Api(page);
  state.squats.set(melon.id, {
    melon: { ...melon, commentCount: 2 },
    squattedAt: "2026-08-04T11:00:00.000Z",
    alertKind: "mature",
    unread: true,
  });
  await enterIsland(page);

  const listen = page.getByRole("button", { name: /听瓜.*1 条未读/ });
  await expect(listen).toBeVisible();
  await listen.click();
  await expect(page.getByRole("heading", { name: "我的蹲瓜架" })).toBeVisible();
  await expect(page.getByText("刚成熟", { exact: true })).toBeVisible();
  const matureBadge = page.locator(".squat-shelf>header>span");
  const badgeColors = await matureBadge.evaluate((element) => {
    const style = getComputedStyle(element);
    return { background: style.backgroundColor, color: style.color };
  });
  expect(badgeColors.background).not.toBe("rgb(230, 255, 118)");
  expect(badgeColors.color).toBe("rgb(23, 59, 55)");
  await page.getByRole("button", { name: new RegExp(`刚成熟.*${melon.title}`) }).click();
  await expect(page.getByRole("dialog")).toContainText(melon.content);
  await expect(page.getByRole("dialog")).toContainText("这是从评论 GET fixture 读取的第一条公开回声。");
});

test("蹲瓜架里发表的评论在重新打开后仍能读取", async ({ baseURL, context, page }) => {
  const state = await installV0Api(page, { presenceSequence: ["inside_zone"] });
  state.squats.set(melon.id, {
    melon: { ...melon, commentCount: 2 },
    squattedAt: "2026-08-04T11:00:00.000Z",
    alertKind: "mature",
    unread: true,
  });
  await context.grantPermissions(["geolocation"], { origin: new URL(baseURL).origin });
  await context.setGeolocation({ latitude: 28.195397, longitude: 112.976869 });
  await enterIsland(page);

  await page.getByRole("button", { name: /听瓜.*1 条未读/ }).click();
  await page.getByRole("button", { name: new RegExp(`刚成熟.*${melon.title}`) }).click();
  let reader = page.getByRole("dialog", { name: melon.title });
  await reader.getByRole("button", { name: "验证现场评论资格", exact: true }).click();
  const content = "这是我刚刚留下的公开评论";
  await reader.getByRole("textbox", { name: /评论/ }).fill(content);
  await reader.getByRole("button", { name: "发表评论", exact: true }).click();
  await expect(reader.getByText(content, { exact: true })).toBeVisible();
  await reader.getByRole("button", { name: "关闭" }).click();

  await page.getByRole("button", { name: /听瓜/ }).click();
  const shelf = page.getByRole("dialog", { name: "我的蹲瓜架" });
  await shelf.getByRole("button", { name: new RegExp(`已成熟.*${melon.title}`) }).click();
  reader = page.getByRole("dialog", { name: melon.title });
  await expect(reader.getByText(content, { exact: true })).toBeVisible();
  expect(state.commentGetRequests.filter((request) => request.melonId === melon.id)).toHaveLength(2);
});

test("空蹲瓜架明确说明只做站内成熟提醒", async ({ page }) => {
  await installV0Api(page);
  await enterIsland(page);
  await page.getByRole("button", { name: /听瓜.*没有未读/ }).click();
  await expect(page.getByText("架子还是空的", { exact: true })).toBeVisible();
  await expect(page.getByText(/不会发系统推送/)).toBeVisible();
});
