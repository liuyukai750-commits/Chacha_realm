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
  await page.getByRole("button", { name: new RegExp(`刚成熟.*${melon.title}`) }).click();
  await expect(page.getByRole("dialog")).toContainText(melon.content);
});

test("空蹲瓜架明确说明只做站内成熟提醒", async ({ page }) => {
  await installV0Api(page);
  await enterIsland(page);
  await page.getByRole("button", { name: /听瓜.*没有未读/ }).click();
  await expect(page.getByText("架子还是空的", { exact: true })).toBeVisible();
  await expect(page.getByText(/不会发系统推送/)).toBeVisible();
});
