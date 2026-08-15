import { defineConfig } from "@playwright/test";

const baseURL = "http://127.0.0.1:3132";

export default defineConfig({
  testDir: ".",
  testMatch: "release-smoke.spec.mjs",
  outputDir: "../.artifacts/release-smoke-results",
  fullyParallel: false,
  retries: 0,
  timeout: 75_000,
  reporter: [["list"]],
  expect: { timeout: 7_500 },
  use: {
    baseURL,
    browserName: "webkit",
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: "npm run build -- --webpack && npm run start -- --port 3132",
    url: baseURL,
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
  },
  projects: [{ name: "webkit-iphone-390-smoke" }],
});
