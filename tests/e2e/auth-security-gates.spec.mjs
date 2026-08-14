import { expect, test } from "@playwright/test";
import { installAuthApi } from "./fixtures/auth-api.mjs";
import { installV0Api } from "./fixtures/v0-api.mjs";

async function openAnonymousLogin(page, options = {}) {
  await installV0Api(page);
  const auth = await installAuthApi(page, { anonymous: true, ...options });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  return auth;
}

async function reachConflictConfirmation(page, options = {}) {
  const auth = await openAnonymousLogin(page, { accountConflict: true, ...options });
  await page.getByRole("textbox", { name: /手机号/ }).fill("13800138000");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: /获取验证码/ }).click();
  expect(auth.requestCalls).toEqual([{ phone: "+8613800138000", acceptedTerms: true }]);
  await expect(page.getByText("这个手机号已有一片瓜田")).toHaveCount(0);
  await page.getByRole("textbox", { name: /发送至|验证码/ }).fill("123456");
  await page.getByRole("button", { name: /验证并继续|绑定并保留这片瓜田/ }).click();
  await expect(page.getByText("这个手机号已有一片瓜田")).toBeVisible();
  return auth;
}

test.describe("认证上线安全门禁", () => {
  test("旧匿名账号在 OTP 验证前不暴露手机号是否已有瓜田", async ({ page }) => {
    const conflict = await openAnonymousLogin(page, { accountConflict: true });
    await page.getByRole("textbox", { name: /手机号/ }).fill("13800138000");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: /获取验证码/ }).click();

    expect(conflict.requestCalls).toEqual([{ phone: "+8613800138000", acceptedTerms: true }]);
    await expect(page.getByText("这个手机号已有一片瓜田")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /绑定并保留这片瓜田/ })).toBeVisible();
  });

  test("已有手机号通过 OTP 后仍保留匿名号，明确确认后才切换", async ({ page }) => {
    const auth = await reachConflictConfirmation(page);

    expect(auth.activeUserId).toBe("anonymous-user-id");
    expect(auth.confirmCalls).toHaveLength(0);
    await page.getByRole("button", { name: "进入原来的瓜田", exact: true }).click();

    expect(auth.confirmCalls).toEqual([{ confirm: true }]);
    expect(auth.activeUserId).toBe("phone-user-id");
  });

  test("取消手机号账号切换后，原匿名瓜田保持不变", async ({ page }) => {
    const auth = await reachConflictConfirmation(page);
    await page.getByRole("button", { name: "暂不切换", exact: true }).click();

    expect(auth.confirmCalls).toEqual([{ confirm: false }]);
    expect(auth.activeUserId).toBe("anonymous-user-id");
    await expect(page.getByText("把现在的瓜田带走")).toBeVisible();
  });

  test("账号切换确认过期时不覆盖原匿名瓜田", async ({ page }) => {
    const auth = await reachConflictConfirmation(page, {
      confirmFailure: { code: "phone_switch_expired", message: "切换确认已过期，请重新获取验证码。" },
    });
    await page.getByRole("button", { name: "进入原来的瓜田", exact: true }).click();

    await expect(page.getByText("切换确认已过期，请重新获取验证码。", { exact: true })).toBeVisible();
    expect(auth.activeUserId).toBe("anonymous-user-id");
  });

  test("用户协议和隐私政策为真实可访问页面", async ({ request }) => {
    const [terms, privacy] = await Promise.all([request.get("/terms"), request.get("/privacy")]);
    expect(terms.status()).toBe(200);
    expect(privacy.status()).toBe(200);
    await expect(terms.text()).resolves.toMatch(/用户协议|猹猹街/);
    await expect(privacy.text()).resolves.toMatch(/隐私政策|手机号/);
  });

  test("配置 Turnstile 时，完成验证后发送 captchaToken", async ({ page }) => {
    test.skip(!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY, "仅在显式配置测试 site key 时执行");
    await page.addInitScript(() => {
      window.turnstile = {
        render: (_container, options) => {
          queueMicrotask(() => options.callback("turnstile-test-token"));
          return "test-widget";
        },
        remove: () => {},
      };
    });
    await installV0Api(page);
    const auth = await installAuthApi(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.getByRole("textbox", { name: /手机号/ }).fill("13800138000");
    await page.getByRole("checkbox").check();
    const submit = page.getByRole("button", { name: /获取验证码/ });
    await expect(submit).toBeEnabled();
    await submit.click();

    expect(auth.requestCalls).toEqual([{ phone: "+8613800138000", acceptedTerms: true, captchaToken: "turnstile-test-token" }]);
  });

  test("服务端强制 CAPTCHA 时，无 token 的短信请求直接被拒绝", async ({ request }) => {
    test.skip(process.env.CHACHA_CAPTCHA_REQUIRED !== "true", "仅在显式开启服务端 CAPTCHA 门禁时执行");
    const response = await request.post("/api/auth/phone/request", {
      data: { phone: "+8613800138000" },
    });
    expect(response.status()).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "captcha_required" } });
  });

  test("登录闸门关闭时首页直接可用，不请求认证会话或显示认路等待", async ({ page }) => {
    test.skip(process.env.AUTH_GATE_ENABLED !== "false", "仅在显式关闭登录闸门时执行");
    const paths = [];
    page.on("request", (request) => paths.push(new URL(request.url()).pathname));
    await installV0Api(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByText("正在认路…", { exact: true })).toHaveCount(0);
    expect(paths).not.toContain("/api/auth/session");
  });
});
