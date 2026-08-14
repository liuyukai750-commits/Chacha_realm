import { expect, test } from "@playwright/test";
import { installAuthApi } from "./fixtures/auth-api.mjs";
import { installV0Api } from "./fixtures/v0-api.mjs";

async function openGate(page, options = {}) {
  await installV0Api(page); const auth = await installAuthApi(page, options); await page.goto("/", { waitUntil: "domcontentloaded" }); return auth;
}

test.describe("猹号认证安全门禁", () => {
  test("错误密码只返回统一错误且停留登录页", async ({ page }) => {
    const auth = await openGate(page, { loginFailure: { code: "invalid_credentials", message: "猹号或密码不正确。" } });
    await page.getByRole("button", { name: /已有猹号/ }).click();
    await page.getByRole("textbox", { name: "猹号" }).fill("CC-7K3M9Q2R"); await page.getByLabel("密码").fill("wrong-pass"); await page.getByRole("button", { name: "登录猹猹街" }).click();
    await expect(page.getByText("猹号或密码不正确。", { exact: true })).toBeVisible();
    expect(auth.loginCalls).toHaveLength(1);
    await expect(page.getByLabel("密码")).toBeVisible();
  });

  test("恢复成功换发新恢复码，进入前必须确认已保存", async ({ page }) => {
    const auth = await openGate(page);
    await page.getByRole("button", { name: /恢复码找回/ }).click();
    await page.getByRole("textbox", { name: "猹号" }).fill("CC-7K3M9Q2R"); await page.getByLabel("一次性恢复码").fill("ABCD-EFGH-JKLM-NPQR"); await page.getByLabel("新密码").fill("new-street-pass");
    await page.getByRole("button", { name: /重置密码/ }).click();
    expect(auth.recoverCalls[0]).toMatchObject({ publicId: "CC-7K3M9Q2R", recoveryCode: "ABCD-EFGH-JKLM-NPQR", newPassword: "new-street-pass" });
    await expect(page.getByText("WXYZ-2345-6789-ABCD", { exact: true })).toBeVisible();
    await expect(page.getByText(/旧恢复码已作废/)).toBeVisible();
  });

  test("用户协议和隐私政策为真实可访问页面", async ({ request }) => {
    const [terms, privacy] = await Promise.all([request.get("/terms"), request.get("/privacy")]);
    expect(terms.status()).toBe(200); expect(privacy.status()).toBe(200);
    await expect(terms.text()).resolves.toMatch(/用户协议|猹猹街/); await expect(privacy.text()).resolves.toMatch(/隐私政策|账号/);
  });

  test("配置 Turnstile 时注册请求携带 captchaToken", async ({ page }) => {
    test.skip(!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY, "仅在显式配置测试 site key 时执行");
    await page.addInitScript(() => { window.turnstile = { render: (_container, options) => { queueMicrotask(() => options.callback("turnstile-test-token")); return "test-widget"; }, remove: () => {} }; });
    const auth = await openGate(page); await page.getByRole("button", { name: "创建我的猹号" }).click();
    await page.getByRole("textbox", { name: /匿名昵称/ }).fill("小街灯"); await page.getByLabel("设置密码").fill("street-pass-2026"); await page.getByRole("checkbox").check();
    const submit = page.getByRole("button", { name: /生成我的猹号/ }); await expect(submit).toBeEnabled(); await submit.click();
    expect(auth.registerCalls[0].captchaToken).toBe("turnstile-test-token");
  });

  test("服务端强制 CAPTCHA 时，无 token 的注册请求直接拒绝", async ({ request }) => {
    test.skip(process.env.CHACHA_CAPTCHA_REQUIRED !== "true", "仅在显式开启服务端 CAPTCHA 门禁时执行");
    const response = await request.post("/api/auth/account/register", { data: { password: "street-pass-2026", animal: "猹", displayName: "小街灯", acceptedTerms: true } });
    expect(response.status()).toBe(400); await expect(response.json()).resolves.toMatchObject({ error: { code: "captcha_required" } });
  });

  test("登录闸门关闭时首页直接可用，不请求认证会话", async ({ page }) => {
    test.skip(process.env.AUTH_GATE_ENABLED !== "false", "仅在显式关闭登录闸门时执行");
    const paths = []; page.on("request", (request) => paths.push(new URL(request.url()).pathname)); await installV0Api(page); await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("main")).toBeVisible(); await expect(page.getByText("正在认路…", { exact: true })).toHaveCount(0); expect(paths).not.toContain("/api/auth/session");
  });
});
