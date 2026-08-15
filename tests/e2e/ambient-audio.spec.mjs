import { expect, test } from "@playwright/test";
import { installV0Api } from "./fixtures/v0-api.mjs";

const preferenceKey = "chacha-street:ambient-audio:v2";
const legacyPreferenceKey = "chacha-street:ambient-audio";

async function installMediaProbe(page, { savedPreference, rejectPlay = false } = {}) {
  await page.addInitScript(({ preferenceKey, savedPreference, rejectPlay }) => {
    window.__audioProbe = { playCalls: 0, pauseCalls: 0, rejectPlay };
    if (savedPreference) window.localStorage.setItem(preferenceKey, savedPreference);
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value() {
        window.__audioProbe.playCalls += 1;
        if (window.__audioProbe.rejectPlay) {
          return Promise.reject(new DOMException("Playback blocked", "NotAllowedError"));
        }
        this.dispatchEvent(new Event("play"));
        return Promise.resolve();
      },
    });
    Object.defineProperty(HTMLMediaElement.prototype, "pause", {
      configurable: true,
      value() {
        window.__audioProbe.pauseCalls += 1;
        this.dispatchEvent(new Event("pause"));
      },
    });
  }, { preferenceKey, savedPreference, rejectPlay });
}

async function openStreet(page, options) {
  await installMediaProbe(page, options);
  await installV0Api(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  return page.locator("[data-ambient-audio-control]");
}

test.describe("背景音乐浏览器能力模拟（不代表真机）", () => {
  test("默认开启并尝试播放，控件固定在城市按钮旁且可关闭", async ({ page }) => {
    const control = await openStreet(page);
    await expect(control).toBeVisible();
    await expect(control).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => page.evaluate(() => window.__audioProbe.playCalls)).toBe(1);
    await expect(control).toHaveAttribute("aria-label", "关闭背景音乐");

    const actions = page.locator(".topbar-actions");
    await expect(actions.locator(".city-switch + aside")).toHaveCount(1);

    const audioSemantics = await page.locator("audio").evaluate((audio) => ({
      loop: audio.loop,
      preload: audio.preload,
      playsInline: audio.hasAttribute("playsinline"),
      source: audio.querySelector("source")?.getAttribute("src"),
    }));
    expect(audioSemantics).toEqual({
      loop: true,
      preload: "none",
      playsInline: true,
      source: "/audio/chacha-street-sneaky-blues.mp3",
    });

    await control.click();
    await expect(control).toHaveAttribute("aria-pressed", "false");
    await expect(control).toHaveAttribute("aria-label", "播放背景音乐");
    expect(await page.evaluate(() => window.__audioProbe.pauseCalls)).toBeGreaterThanOrEqual(1);
    expect(await page.evaluate((key) => localStorage.getItem(key), preferenceKey)).toBe("off");

    await control.click();
    await expect(control).toHaveAttribute("aria-pressed", "true");
    await expect(control).toHaveAttribute("aria-label", "关闭背景音乐");
    expect(await page.evaluate(() => window.__audioProbe.playCalls)).toBe(2);
    expect(await page.evaluate((key) => localStorage.getItem(key), preferenceKey)).toBe("on");

    const box = await control.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
  });

  test("旧预览保存的关闭状态不会让新版首次进入继续保持关闭", async ({ page }) => {
    await page.addInitScript((key) => window.localStorage.setItem(key, "off"), legacyPreferenceKey);
    const control = await openStreet(page);
    await expect(control).toHaveAttribute("aria-pressed", "true");
    await expect(control).toContainText("音乐中");
    await expect.poll(() => page.evaluate(() => window.__audioProbe.playCalls)).toBe(1);
  });

  test("保存的开启偏好自动尝试播放，并在隐藏/恢复时暂停续播", async ({ page }) => {
    const control = await openStreet(page, { savedPreference: "on" });
    await expect(control).toHaveAttribute("aria-pressed", "true");
    await expect(control).toHaveAttribute("aria-label", "关闭背景音乐");
    await expect.poll(() => page.evaluate(() => window.__audioProbe.playCalls)).toBe(1);

    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, value: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect.poll(() => page.evaluate(() => window.__audioProbe.pauseCalls)).toBeGreaterThanOrEqual(1);

    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, value: false });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect.poll(() => page.evaluate(() => window.__audioProbe.playCalls)).toBe(2);
  });

  test("明确关闭偏好不会自动播放", async ({ page }) => {
    const control = await openStreet(page, { savedPreference: "off" });
    await expect(control).toHaveAttribute("aria-pressed", "false");
    expect(await page.evaluate(() => window.__audioProbe.playCalls)).toBe(0);
  });

  test("播放拒绝和媒体错误都有文字回退，不会点击无反应", async ({ page }) => {
    const control = await openStreet(page, { rejectPlay: true });
    await expect.poll(() => page.evaluate(() => window.__audioProbe.playCalls)).toBe(1);
    await expect(page.getByText("音乐没有响起来，点一下再试。", { exact: true })).toHaveCount(0);
    await control.click();
    await expect(page.getByText("音乐没有响起来，点一下再试。", { exact: true })).toBeVisible();
    await expect(control).toHaveAttribute("aria-pressed", "true");

    await page.evaluate(() => {
      window.__audioProbe.rejectPlay = false;
      document.querySelector("audio")?.dispatchEvent(new Event("error"));
    });
    await expect(page.getByText("音乐暂时没接上，稍后再试。", { exact: true })).toBeVisible();
    await expect(control).toHaveAttribute("aria-pressed", "false");
    expect(await page.evaluate((key) => localStorage.getItem(key), preferenceKey)).toBe("off");
  });
});
