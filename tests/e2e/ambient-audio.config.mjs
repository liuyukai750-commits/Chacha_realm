import { defineConfig } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3128";

export default defineConfig({
  testDir: ".",
  testMatch: "ambient-audio.spec.mjs",
  outputDir: "../.artifacts/ambient-audio-results",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 75_000,
  reporter: [["list"]],
  expect: { timeout: 7_500 },
  use: {
    baseURL,
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "npm run build && npm run start -- --port 3128",
        url: baseURL,
        reuseExistingServer: false,
        timeout: 180_000,
        stdout: "pipe",
        stderr: "pipe",
      },
  projects: [
    {
      name: "chromium-android-capability-375",
      use: { browserName: "chromium", viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true },
    },
    {
      name: "chromium-harmonyos-capability-430",
      use: { browserName: "chromium", viewport: { width: 430, height: 932 }, hasTouch: true, isMobile: true },
    },
    {
      name: "webkit-ios-capability-390",
      use: { browserName: "webkit", viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true },
    },
    {
      name: "chromium-desktop-capability",
      use: { browserName: "chromium", viewport: { width: 1440, height: 900 } },
    },
  ],
});
