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
  await page.getByRole("button", { name: "查看职场瓜的正文和评论" }).tap();

  const dialog = page.getByRole("dialog").filter({ has: page.getByRole("heading", { name: owned.title, exact: true }) });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(owned.content, { exact: true })).toBeVisible();
  await expect(dialog.locator('img[src*="fox"]')).toHaveCount(1);
  expect(confirmDialogs).toBe(0);
  expect(state.deletedMelons).toEqual([]);
});
