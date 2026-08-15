import { expect, test } from "@playwright/test";
import { installV0Api } from "./fixtures/v0-api.mjs";

const preferenceKey = "chacha-street:ambient-audio";

async function installMediaProbe(page, { savedPreference } = {}) {
  await page.addInitScript(({ preferenceKey, savedPreference }) => {
    window.__audioProbe = { playCalls: 0, pauseCalls: 0, rejectPlay: false };
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
  }, { preferenceKey, savedPreference });
}

async function openStreet(page, options) {
  await installMediaProbe(page, options);
  await installV0Api(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  return page.locator("[data-ambient-audio-control]");
}

test.describe("背景音乐浏览器能力模拟（不代表真机）", () => {
  test("默认不自动播放，首次用户手势可开启并持久保存偏好", async ({ page }) => {
    const control = await openStreet(page);
    await expect(control).toBeVisible();
    await expect(control).toHaveAttribute("aria-pressed", "false");
    expect(await page.evaluate(() => window.__audioProbe.playCalls)).toBe(0);

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
    await expect(control).toHaveAttribute("aria-pressed", "true");
    await expect(control).toHaveAttribute("aria-label", "关闭背景音乐");
    expect(await page.evaluate(() => window.__audioProbe.playCalls)).toBe(1);
    expect(await page.evaluate((key) => localStorage.getItem(key), preferenceKey)).toBe("on");

    await control.click();
    await expect(control).toHaveAttribute("aria-pressed", "false");
    await expect(control).toHaveAttribute("aria-label", "播放背景音乐");
    expect(await page.evaluate(() => window.__audioProbe.pauseCalls)).toBeGreaterThanOrEqual(1);
    expect(await page.evaluate((key) => localStorage.getItem(key), preferenceKey)).toBe("off");

    const box = await control.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
  });

  test("已保存开启偏好也等待页面手势，并在隐藏/恢复时暂停续播", async ({ page }) => {
    const control = await openStreet(page, { savedPreference: "on" });
    await expect(control).toHaveAttribute("aria-pressed", "true");
    expect(await page.evaluate(() => window.__audioProbe.playCalls)).toBe(0);

    await page.locator("main").dispatchEvent("pointerdown");
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

  test("播放拒绝和媒体错误都有文字回退，不会点击无反应", async ({ page }) => {
    const control = await openStreet(page);
    await page.evaluate(() => { window.__audioProbe.rejectPlay = true; });
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
