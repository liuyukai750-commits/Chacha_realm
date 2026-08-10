import { expect, test } from "@playwright/test";

test("recording demo completes the nearby-to-field story", async ({ page }) => {
  await page.goto("/demo");

  await expect(page.getByRole("heading", { name: /32只猹.*正在活动/ })).toBeVisible();
  await expect(page.getByText("附近 1km", { exact: true }).first()).toBeVisible();

  await page.getByText("原来工作再努力，也没有站对队重要。我领导昨天还说公平，今天却把那个名额……", { exact: true }).click();
  await expect(page.getByText("猹007", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "蹲后续" }).click();
  await expect(page.getByRole("button", { name: /蹲后续.*\+1/ })).toBeVisible();

  await page.getByRole("button", { name: "埋瓜", exact: true }).click();
  await expect(page.getByRole("textbox")).toHaveValue(/这次机会得先给/);
  await page.getByRole("button", { name: /埋进瓜田/ }).click();

  await expect(page.getByRole("heading", { name: /已经有3只猹.*闻着味来了/ })).toBeVisible();
  await page.getByRole("button", { name: /去我的瓜田看看/ }).click();

  await expect(page.getByText("3", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("个瓜正在生长", { exact: true })).toBeVisible();
  await expect(page.getByText("刚刚埋下", { exact: true })).toBeVisible();
  await expect(page.getByText("已有 3 只猹闻着味来了", { exact: true })).toBeVisible();
});

test("recording reel automatically reaches the bury hook", async ({ page }) => {
  await page.goto("/demo/reel");
  await expect(page.getByText("背着你吃上瓜了。", { exact: true })).toBeVisible();
  await expect(page.getByText("概念演示", { exact: true })).toBeVisible();
  await expect(page.getByText("也没有站对队重要……", { exact: true })).toBeVisible({ timeout: 5_000 });
  await expect(page.getByText("都在蹲后续。", { exact: true })).toBeVisible({ timeout: 5_000 });
  await expect(page.getByText(/你附近，.*有什么瓜？/)).toBeVisible({ timeout: 5_000 });
  await expect(page.getByRole("button", { name: /埋进瓜田/ })).toBeVisible();
});
