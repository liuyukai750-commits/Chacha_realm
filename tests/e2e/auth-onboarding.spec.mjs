import { expect, test } from "@playwright/test";
import { installAuthApi, permanentProfile } from "./fixtures/auth-api.mjs";
import { installV0Api } from "./fixtures/v0-api.mjs";

async function openLogin(page, options) {
  await installV0Api(page);
  const auth = await installAuthApi(page, options);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: /真名留在门外/ })).toBeVisible();
  return auth;
}

async function requestOtp(page) {
  await page.getByRole("textbox", { name: /手机号/ }).fill("13800138000");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: /获取验证码/ }).click();
  await expect(page.getByRole("heading", { name: /六位数字/ })).toBeVisible();
}

test.describe("手机号登录与身份新手流程", () => {
  test("新访客不会在展示登录页时调用 bootstrap 或自动创建匿名账号", async ({ page }) => {
    const apiRequests = [];
    page.on("request", (request) => apiRequests.push(new URL(request.url()).pathname));
    await openLogin(page);

    await expect(page.getByRole("textbox", { name: /手机号/ })).toHaveAttribute("inputmode", "numeric");
    await expect(page.getByRole("textbox", { name: /手机号/ })).toHaveAttribute("autocomplete", "tel-national");
    expect(apiRequests).not.toContain("/api/bootstrap");
    expect(apiRequests).not.toContain("/api/session/anonymous");
  });

  test("手机号、OTP、六种动物和昵称组成完整的可恢复流程", async ({ page }) => {
    const auth = await openLogin(page);
    await requestOtp(page);

    expect(auth.requestCalls).toEqual([{ phone: "+8613800138000", acceptedTerms: true }]);
    const otp = page.getByRole("textbox", { name: /发送至|验证码/ });
    await expect(otp).toHaveAttribute("autocomplete", "one-time-code");
    await expect(otp).toHaveAttribute("inputmode", "numeric");
    await otp.fill("123456");
    await page.getByRole("button", { name: /验证并继续/ }).click();

    await expect(page.getByRole("heading", { name: /选一只动物/ })).toBeVisible();
    for (const animal of ["猹", "水豚", "狐狸", "熊猫", "青蛙", "仓鼠"]) {
      await expect(page.getByRole("button", { name: new RegExp(`^${animal}`) })).toBeVisible();
    }
    await expect(page.getByRole("button", { name: /^猹/ })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: /^狐狸/ }).click();
    await page.getByRole("textbox", { name: /匿名昵称/ }).fill("晚风小猹超过六字");
    await expect(page.getByRole("textbox", { name: /匿名昵称/ })).toHaveValue("晚风小猹超过");
    await page.getByRole("button", { name: /生成我的猹号/ }).click();

    expect(auth.verifyCalls).toEqual([{ phone: "+8613800138000", code: "123456", flow: "sign_in" }]);
    expect(auth.profileCalls).toEqual([{ animal: "狐狸", displayName: "晚风小猹超过" }]);
    await expect(page.getByText("CC-7K3M9Q2R", { exact: true })).toBeVisible();
    await expect(page.getByText("+8613800138000", { exact: true })).toHaveCount(0);
  });

  test("OTP 错误或过期后保留验证码步骤并展示可恢复错误", async ({ page }) => {
    await openLogin(page, {
      verifyFailure: { code: "otp_expired", message: "验证码错误或已经过期，请重新输入。" },
    });
    await requestOtp(page);
    const otp = page.getByRole("textbox", { name: /发送至|验证码/ });
    await otp.fill("000000");
    await page.getByRole("button", { name: /验证并继续/ }).click();

    await expect(page.getByRole("alert").filter({ hasText: "验证码错误或已经过期" })).toBeVisible();
    await expect(otp).toBeVisible();
    await expect(otp).toHaveValue("000000");
  });

  test("资料保存失败可在原步骤重试，不会重新验证或创建第二个账号", async ({ page }) => {
    const auth = await openLogin(page, { profileFailures: 1 });
    await requestOtp(page);
    await page.getByRole("textbox", { name: /发送至|验证码/ }).fill("123456");
    await page.getByRole("button", { name: /验证并继续/ }).click();
    await page.getByRole("textbox", { name: /匿名昵称/ }).fill("小街灯");
    await page.getByRole("button", { name: /生成我的猹号/ }).click();

    await expect(page.getByRole("alert").filter({ hasText: "身份没有保存成功" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: /匿名昵称/ })).toHaveValue("小街灯");
    await page.getByRole("button", { name: /生成我的猹号/ }).click();
    await expect(page.getByText("CC-7K3M9Q2R", { exact: true })).toBeVisible();
    expect(auth.verifyCalls).toHaveLength(1);
    expect(auth.profileCalls).toHaveLength(2);
  });

  test("旧匿名用户看到保留瓜田提示，永久用户直接恢复街区", async ({ page }) => {
    await openLogin(page, { anonymous: true });
    await expect(page.getByText(/绑定手机号后.*瓜.*瓜籽.*经验/)).toBeVisible();

    await page.unrouteAll({ behavior: "wait" });
    await installV0Api(page);
    await installAuthApi(page, {
      session: { authenticated: true, anonymous: false, needsProfile: false, required: true, profile: permanentProfile },
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByRole("heading", { name: /真名留在门外/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /打开我的账号/ })).toBeVisible();
  });

  test("账号页只展示脱敏手机号，并使用明确确认值注销账号", async ({ page }) => {
    await installV0Api(page);
    const auth = await installAuthApi(page, {
      session: { authenticated: true, anonymous: false, needsProfile: false, required: true, profile: permanentProfile },
    });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /打开我的账号/ }).click();

    await expect(page.getByRole("dialog")).toContainText("138****8000");
    await expect(page.getByRole("dialog")).not.toContainText("13800138000");
    await page.getByRole("button", { name: "注销账号", exact: true }).click();
    await page.getByRole("button", { name: "确认注销账号", exact: true }).click();

    expect(auth.deleteCalls).toEqual([{ confirmation: "DELETE" }]);
  });

  test("登录卡在 375/430 视口不产生横向溢出，主要触控目标不少于 44px", async ({ page }) => {
    await openLogin(page);
    const metrics = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    expect(metrics.scroll).toBeLessThanOrEqual(metrics.viewport);
    const send = page.getByRole("button", { name: /获取验证码/ });
    expect((await send.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect((await page.getByRole("checkbox").boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(20);
  });
});
