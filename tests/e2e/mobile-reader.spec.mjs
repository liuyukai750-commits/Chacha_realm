import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { enterIsland, installV0Api, melon } from "./fixtures/v0-api.mjs";

const screenshots = resolve(process.cwd(), "tests", ".artifacts", "mobile-reader-screenshots");

test.beforeAll(async () => {
  await mkdir(screenshots, { recursive: true });
});

async function installPlayableAudio(page) {
  await page.addInitScript(() => {
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value() { this.dispatchEvent(new Event("play")); return Promise.resolve(); },
    });
    Object.defineProperty(HTMLMediaElement.prototype, "pause", {
      configurable: true,
      value() { this.dispatchEvent(new Event("pause")); },
    });
  });
}

test("普通点按瓜篮会打开正文，不会误触发不看了", async ({ page }, testInfo) => {
  await installPlayableAudio(page);
  const state = await installV0Api(page);
  await enterIsland(page);

  const row = page.getByRole("article", { name: melon.title, exact: true });
  await row.getByRole("button", { name: "直接吃", exact: true }).tap();

  const dialog = page.getByRole("dialog").filter({ has: page.getByRole("heading", { name: melon.title, exact: true }) });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("标题", { exact: true })).toBeVisible();
  await expect(dialog.locator('img[src*="hamster"]')).toHaveCount(1);
  await expect(dialog.getByText(melon.content, { exact: true })).toBeVisible();
  await expect(dialog.getByText("扒开草丛", { exact: true })).toHaveCount(0);
  await expect(dialog.locator(".place-scene, .peel-story, .melon-peel")).toHaveCount(0);
  expect(state.basketDismissRequests).toEqual([]);

  const audioVolume = await page.locator("audio").evaluate((audio) => audio.volume);
  expect(audioVolume).toBeCloseTo(0.55, 2);
  await page.screenshot({ path: resolve(screenshots, `${testInfo.project.name}-reader.png`), fullPage: true });
});

test("普通点按自己的瓜会打开正文，不会误触发删除", async ({ page }) => {
  const owned = {
    ...melon,
    id: "owned-mobile-tap",
    status: "incubating",
    maturesAt: "2026-08-04T14:00:00.000Z",
    alias: "街角小猹",
    displayName: "街角小猹",
    animal: "狐狸",
    title: "自己的瓜也应当顺畅打开",
    content: "这是用来验证 Android、鸿蒙和 iPhone 普通点按不会误删的正文。",
  };
  const state = await installV0Api(page, { createdMelons: [owned] });
  let confirmDialogs = 0;
  page.on("dialog", (dialog) => { confirmDialogs += 1; void dialog.dismiss(); });
  await enterIsland(page);
  await page.getByRole("button", { name: "瓜田", exact: true }).tap();
  await page.getByRole("button", { name: `查看${owned.title}的正文和评论` }).tap();

  const dialog = page.getByRole("dialog").filter({ has: page.getByRole("heading", { name: owned.title, exact: true }) });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(owned.content, { exact: true })).toBeVisible();
  await expect(dialog.locator('img[src*="fox"]')).toHaveCount(1);
  expect(confirmDialogs).toBe(0);
  expect(state.deletedMelons).toEqual([]);
});

test("三类列表统一显示头像、昵称、方括号标题和时间戳", async ({ page }) => {
  const owned = {
    ...melon,
    id: "owned-list-metadata",
    displayName: "街角小猹",
    animal: "狐狸",
    title: "自己的故事标题",
    createdAt: "2026-08-04T10:20:00.000Z",
  };
  await installV0Api(page, { createdMelons: [owned] });
  await enterIsland(page);

  const basketRows = page.locator(".melon-basket .basket-row");
  await expect(basketRows.first()).toBeVisible();
  const basketTimes = await basketRows.locator("time").evaluateAll((nodes) => nodes.map((node) => node.dateTime));
  expect(basketTimes.length).toBeGreaterThan(1);
  expect(basketTimes).toEqual([...basketTimes].sort((left, right) => Date.parse(right) - Date.parse(left)));
  await expect(basketRows.first().getByRole("heading", { name: `[${melon.title}]`, exact: true })).toBeVisible();

  await basketRows.first().getByRole("button", { name: "添加蹲瓜", exact: true }).click();
  await page.getByRole("button", { name: /听瓜，蹲瓜架/ }).click();
  const shelf = page.getByRole("dialog", { name: "我的蹲瓜架" });
  await expect(shelf.locator(".squat-shelf-avatar img")).toHaveCount(1);
  await expect(shelf.getByText("加班仓鼠 237", { exact: true })).toBeVisible();
  await expect(shelf.getByText(`[${melon.title}]`, { exact: true })).toBeVisible();
  await expect(shelf.locator("time")).toHaveCount(1);
  await shelf.getByRole("button", { name: "关闭", exact: true }).click();

  await page.getByRole("button", { name: "瓜田", exact: true }).click();
  const ownCard = page.locator(".field-melon-card").filter({ hasText: "自己的故事标题" });
  await expect(ownCard.locator(".field-melon-avatar img")).toHaveCount(1);
  await expect(ownCard.getByText("[自己的故事标题]", { exact: true })).toBeVisible();
  await expect(ownCard.locator("time")).toHaveAttribute("datetime", owned.createdAt);
  await expect(ownCard).not.toContainText("附近生活圈");
});

test("正文与评论请求并行启动且评论只请求一次", async ({ page }) => {
  const state = await installV0Api(page, { openMelonDelayMs: 350 });
  await enterIsland(page);
  await page.getByRole("article", { name: melon.title, exact: true }).getByRole("button", { name: "直接吃", exact: true }).click();
  await expect(page.getByRole("dialog").filter({ hasText: melon.title })).toBeVisible();
  await expect.poll(() => state.commentGetRequests.length).toBe(1);
  expect(state.openMelonRequests).toHaveLength(1);
  expect(Math.abs(state.commentGetRequests[0].at - state.openMelonRequests[0].at)).toBeLessThan(150);
});

test("附近瓜篮、我的瓜和蹲瓜架都先即时打开详情壳层", async ({ page }) => {
  const owned = {
    ...melon,
    id: "owned-slow-detail",
    alias: "慢网狐狸",
    displayName: "慢网狐狸",
    animal: "狐狸",
    title: "弱网也要立刻有反馈",
    content: "服务端尚未返回时，详情壳层应当已经出现。",
  };
  await installV0Api(page, { createdMelons: [owned], openMelonDelayMs: 1_200, commentsDelayMs: 1_350 });
  await enterIsland(page);

  await page.getByRole("article", { name: melon.title, exact: true }).getByRole("button", { name: "直接吃", exact: true }).click();
  const basketLoading = page.getByRole("dialog", { name: "吃瓜详情" });
  await expect(basketLoading).toBeVisible({ timeout: 350 });
  await expect(basketLoading.getByRole("status", { name: `正在打开${melon.title}` })).toBeVisible();
  await expect(basketLoading.getByText(melon.content, { exact: true })).toBeVisible({ timeout: 2_500 });
  await basketLoading.getByRole("button", { name: "关闭" }).click();

  await page.getByRole("button", { name: "瓜田", exact: true }).click();
  await page.getByRole("button", { name: `查看${owned.title}的正文和评论` }).click();
  const ownerLoading = page.getByRole("dialog", { name: "我的瓜详情" });
  await expect(ownerLoading).toBeVisible({ timeout: 350 });
  await expect(ownerLoading.getByRole("status", { name: `正在打开${owned.title}` })).toBeVisible();
  await expect(ownerLoading.getByText(owned.content, { exact: true })).toBeVisible({ timeout: 2_500 });
  await ownerLoading.getByRole("button", { name: "关闭" }).click();

  await page.getByRole("button", { name: /听瓜，蹲瓜架/ }).click();
  const emptyShelf = page.getByRole("dialog", { name: "我的蹲瓜架" });
  await emptyShelf.getByRole("button", { name: "关闭" }).click();
  await page.getByRole("article", { name: melon.title, exact: true }).getByRole("button", { name: "添加蹲瓜", exact: true }).click();
  await page.getByRole("button", { name: /听瓜，蹲瓜架/ }).click();
  const shelf = page.getByRole("dialog", { name: "我的蹲瓜架" });
  await shelf.locator(".squat-shelf-main").filter({ hasText: melon.title }).click();
  const shelfLoading = page.getByRole("dialog", { name: "吃瓜详情" });
  await expect(shelfLoading).toBeVisible({ timeout: 350 });
  await expect(shelfLoading.getByRole("status", { name: `正在打开${melon.title}` })).toBeVisible();
});
