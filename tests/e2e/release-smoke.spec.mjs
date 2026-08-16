import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

import { enterIsland, installV0Api } from "./fixtures/v0-api.mjs";

const screenshots = resolve(process.cwd(), "tests", ".artifacts", "release-smoke-screenshots");
const location = { latitude: 28.195397, longitude: 112.976869 };

test.beforeAll(async () => {
  await mkdir(screenshots, { recursive: true });
});

test("Preview 核心路径：音乐恢复、附近埋瓜、真籽和瓜田", async ({ baseURL, context, page }) => {
  await page.addInitScript(() => {
    window.__releaseAudio = { allowed: false, playCalls: 0 };
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value() {
        window.__releaseAudio.playCalls += 1;
        if (!window.__releaseAudio.allowed) return Promise.reject(new DOMException("blocked", "NotAllowedError"));
        this.dispatchEvent(new Event("play"));
        return Promise.resolve();
      },
    });
    Object.defineProperty(HTMLMediaElement.prototype, "pause", {
      configurable: true,
      value() { this.dispatchEvent(new Event("pause")); },
    });
  });

  const api = await installV0Api(page, {
    fiveCities: true,
    wallet: { smallSeedCount: 0, trueSeedCount: 0 },
    validReadsToday: 0,
  });
  await context.grantPermissions(["geolocation"], { origin: new URL(baseURL).origin });
  await context.setGeolocation(location);
  await enterIsland(page);

  const audio = page.locator("[data-ambient-audio-control]");
  await expect(audio).toHaveAttribute("aria-pressed", "true");
  await expect(audio).toContainText("音乐待响");
  await page.evaluate(() => { window.__releaseAudio.allowed = true; });
  await page.locator(".brand").click();
  await expect(audio).toHaveAttribute("aria-label", "关闭背景音乐");
  await expect(audio).toContainText("音乐中");
  await page.screenshot({ path: resolve(screenshots, "01-street.png"), fullPage: true });

  await page.getByRole("navigation").getByRole("button", { name: "埋瓜", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "埋下一颗瓜" });
  await expect(dialog.getByRole("button", { name: /附近生活圈/ })).toHaveAttribute("aria-pressed", "true");
  await dialog.getByRole("textbox", { name: "标题" }).fill("Preview 发布前埋瓜验收");
  await dialog.getByRole("textbox", { name: "故事内容" }).fill("这是一段用于发布前快速验收的匿名故事，不包含真实姓名、联系方式或可识别信息。");
  await page.screenshot({ path: resolve(screenshots, "02-bury-ready.png"), fullPage: true });
  await dialog.getByRole("button", { name: /埋瓜，把秘密压进土里/ }).click();

  await expect.poll(() => api.createRequests).toHaveLength(1);
  expect(api.createRequests[0].burialKind).toBe("nearby_area");
  await expect(page.getByRole("status").filter({ hasText: /这颗瓜已经埋好/ })).toBeVisible();
  await expect(page.locator(".bury-success-panel")).toContainText("奖励 1 颗真瓜籽");
  await page.screenshot({ path: resolve(screenshots, "03-bury-success.png"), fullPage: true });

  await page.getByRole("button", { name: "去瓜田种下", exact: true }).click();
  const field = page.getByRole("region", { name: /我的瓜田/ });
  await expect(field).toBeVisible();
  await expect(field.getByText(/真瓜籽[^\d]*1|1[^\d]*真瓜籽/).first()).toBeVisible();
  await expect(field.locator(".my-melons")).toContainText("[Preview 发布前埋瓜验收]");
  await page.screenshot({ path: resolve(screenshots, "04-field.png"), fullPage: true });
});
