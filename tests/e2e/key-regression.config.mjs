import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: [
    "v0-core.spec.mjs",
    "v0-zone-community.spec.mjs",
    "v1-field-loop.spec.mjs",
  ],
  outputDir: "../.artifacts/key-regression-results",
  fullyParallel: true,
  timeout: 75_000,
  reporter: [["list"]],
  expect: { timeout: 7_500 },
  use: {
    baseURL: "http://127.0.0.1:3118",
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: "npm run build && npm run start -- --port 3118",
    url: "http://127.0.0.1:3118",
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
  },
  projects: [
    {
      name: "chromium-375",
      use: {
        browserName: "chromium",
        viewport: { width: 375, height: 812 },
        hasTouch: true,
        isMobile: true,
      },
    },
    {
      name: "chromium-430",
      use: {
        browserName: "chromium",
        viewport: { width: 430, height: 932 },
        hasTouch: true,
        isMobile: true,
      },
    },
    {
      name: "chromium-desktop",
      use: {
        browserName: "chromium",
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
});
