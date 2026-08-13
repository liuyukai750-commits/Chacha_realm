import { expect, test } from "@playwright/test";
import { enterIsland, installV0Api, melon } from "./fixtures/v0-api.mjs";

test("吃完后从发现瓜篮消失，但已蹲瓜仍保留在蹲瓜架", async ({ page }) => {
  const state = await installV0Api(page);
  await enterIsland(page);
  const row = page.getByRole("article", { name: melon.title, exact: true });
  await row.getByRole("button", { name: "添加蹲瓜" }).click();
  await row.getByRole("button", { name: "直接吃", exact: true }).click();
  const dialog = page.getByRole("dialog").filter({ has: page.getByRole("heading", { name: melon.title, exact: true }) });
  const finish = dialog.getByRole("button", { name: "完成吃瓜" });
  await expect(finish).toBeEnabled({ timeout: 6_500 });
  await finish.click();
  await dialog.getByRole("button", { name: "关闭" }).click();
  await expect(page.getByRole("article", { name: melon.title, exact: true })).toHaveCount(0);
  expect(state.squats.has(melon.id)).toBe(true);
  await page.getByRole("button", { name: /听瓜/ }).click();
  await expect(page.getByRole("heading", { name: "我的蹲瓜架" })).toBeVisible();
  await expect(page.getByText(melon.title, { exact: true })).toBeVisible();
});

test("瓜篮可以移出不想看的瓜，自己的瓜确认后可软删除", async ({ page }) => {
  const created = {
    ...melon,
    id: "owned-melon-1",
    status: "incubating",
    maturesAt: "2026-08-04T14:00:00.000Z",
    alias: "巡城小猹 101",
  };
  const state = await installV0Api(page, { createdMelons: [created] });
  await enterIsland(page);

  const dismiss = page.getByRole("button", { name: `从瓜篮移出${melon.title}` });
  await dismiss.focus();
  await dismiss.click();
  await expect(page.getByRole("article", { name: melon.title, exact: true })).toHaveCount(0);
  expect(state.basketDismissRequests).toEqual([{ melonId: melon.id, hidden: true }]);

  await page.getByRole("button", { name: "瓜田", exact: true }).click();
  page.once("dialog", (prompt) => prompt.accept());
  const remove = page.getByRole("button", { name: "删除职场瓜" });
  await remove.focus();
  await remove.click();
  await expect(page.getByRole("button", { name: /查看职场瓜的正文和评论/ })).toHaveCount(0);
  expect(state.deletedMelons).toEqual([created.id]);
});
