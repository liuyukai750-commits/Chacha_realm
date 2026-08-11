import { defineConfig } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3122";

export default defineConfig({
  testDir: ".",
  testMatch: "iphone-bury-field-loop.spec.mjs",
  outputDir: "../.artifacts/iphone-regression-results",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 75_000,
  reporter: [
    ["list"],
    ["html", { outputFolder: "../.artifacts/iphone-regression-report", open: "never" }],
  ],
  expect: { timeout: 7_500 },
  use: {
    baseURL,
    browserName: "webkit",
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
    hasTouch: true,
    isMobile: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        // The test worktree shares node_modules through a junction. Next 16's
        // Turbopack rejects junctions outside the worktree root, so this QA-only
        // server uses the supported webpack build path.
        command: "npm run build -- --webpack && npm run start -- --port 3122",
        url: baseURL,
        reuseExistingServer: false,
        timeout: 180_000,
        stdout: "pipe",
        stderr: "pipe",
      },
  projects: [
    { name: "webkit-iphone-375-simulation", use: { viewport: { width: 375, height: 812 } } },
    { name: "webkit-iphone-430-simulation", use: { viewport: { width: 430, height: 932 } } },
    { name: "webkit-iphone-450-simulation", use: { viewport: { width: 450, height: 956 } } },
  ],
});
