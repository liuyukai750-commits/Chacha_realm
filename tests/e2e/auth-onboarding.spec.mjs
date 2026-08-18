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

test.describe("猹号密码登录与身份流程", () => {
  test("新访客不会自动创建匿名账号，可选择注册、登录或恢复", async ({ page }) => {
    const paths = [];
    page.on("request", (request) => paths.push(new URL(request.url()).pathname));
    await openLogin(page);
    await expect(page.getByRole("button", { name: "创建我的猹号" })).toBeVisible();
    await expect(page.getByRole("button", { name: /已有猹号/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /恢复码找回/ })).toBeVisible();
    expect(paths).not.toContain("/api/bootstrap");
    expect(paths).not.toContain("/api/session/anonymous");
  });

  test("六种动物、昵称、密码和一次性恢复码组成完整注册流程", async ({ page }) => {
    const auth = await openLogin(page);
    await page.getByRole("button", { name: "创建我的猹号" }).click();
    for (const animal of ["猹", "水豚", "狐狸", "熊猫", "青蛙", "仓鼠"]) await expect(page.getByRole("button", { name: new RegExp(`^${animal}`) })).toBeVisible();
    await page.getByRole("button", { name: /^狐狸/ }).click();
    await page.getByRole("textbox", { name: /匿名昵称/ }).fill("晚风小猹在街口慢慢听故事ABC");
    await expect(page.getByRole("textbox", { name: /匿名昵称/ })).toHaveValue("晚风小猹在街口慢慢听故事");
    await page.getByLabel("设置密码").fill("street-pass-2026");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: /生成我的猹号/ }).click();

    expect(auth.registerCalls[0]).toMatchObject({ animal: "狐狸", displayName: "晚风小猹在街口慢慢听故事", password: "street-pass-2026", acceptedTerms: true });
    await expect(page.getByText("CC-7K3M9Q2R", { exact: true })).toBeVisible();
    await expect(page.getByText("ABCD-EFGH-JKLM-NPQR", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "进入猹猹街" })).toBeDisabled();
    await page.getByRole("checkbox", { name: /已经保存好/ }).check();
    await expect(page.getByRole("button", { name: "进入猹猹街" })).toBeEnabled();
  });

  test("创建失败保留动物、昵称和密码，可在原地重试", async ({ page }) => {
    const auth = await openLogin(page, { registerFailures: 1 });
    await page.getByRole("button", { name: "创建我的猹号" }).click();
    await page.getByRole("textbox", { name: /匿名昵称/ }).fill("小街灯");
    await page.getByLabel("设置密码").fill("street-pass-2026");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: /生成我的猹号/ }).click();
    await expect(page.getByText("猹号没有创建成功，请重试。", { exact: true })).toBeVisible();
    await expect(page.getByRole("textbox", { name: /匿名昵称/ })).toHaveValue("小街灯");
    await page.getByRole("button", { name: /生成我的猹号/ }).click();
    await expect(page.getByText("ABCD-EFGH-JKLM-NPQR", { exact: true })).toBeVisible();
    expect(auth.registerCalls).toHaveLength(2);
  });

  test("旧匿名账号可以选择保留试玩瓜田创建新号或登录已有猹号", async ({ page }) => {
    await installV0Api(page); await installAuthApi(page, { anonymous: true }); await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/当前浏览器还有一片试玩瓜田/)).toBeVisible();
    await expect(page.getByRole("button", { name: /创建猹号并保留试玩瓜田/ })).toBeVisible();
    await page.getByRole("button", { name: /已有猹号/ }).click();
    await expect(page.getByRole("heading", { name: /回到原来的瓜田/ })).toBeVisible();
    await expect(page.getByText(/试玩数据不会自动合并/)).toBeVisible();
    await page.getByRole("button", { name: /返回/ }).click();
    await page.getByRole("button", { name: /创建猹号并保留试玩瓜田/ }).click();
    await expect(page.getByText(/已经埋下的瓜、瓜籽、评论和蹲瓜都会保留/)).toBeVisible();
    await expect(page.getByRole("button", { name: /返回/ })).toBeVisible();
  });

  test("永久用户直接恢复街区", async ({ page }) => {
    await installV0Api(page); await installAuthApi(page, { session: { authenticated: true, anonymous: false, needsProfile: false, profile: permanentProfile } });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: /打开我的账号/ })).toBeVisible();
  });

  test("旧永久账号原地设置密码并保留同一猹号", async ({ page }) => {
    await installV0Api(page);
    const auth = await installAuthApi(page, {
      session: { authenticated: true, anonymous: false, authKind: "phone", needsProfile: false, profile: permanentProfile },
    });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /给现有瓜田设置密码/ })).toBeVisible();
    await expect(page.getByText(`晚风小猹 · ${permanentProfile.publicId}`)).toBeVisible();
    await page.getByLabel("设置登录密码").fill("street-pass-2026");
    await page.getByRole("button", { name: "给现有瓜田设置密码" }).click();
    expect(auth.upgradeCalls).toEqual([{ password: "street-pass-2026" }]);
    expect(auth.registerCalls).toHaveLength(0);
    await expect(page.getByText(permanentProfile.publicId, { exact: true })).toBeVisible();
    await expect(page.getByText("UPGD-2345-6789-ABCD", { exact: true })).toBeVisible();
    await expect(page.getByText(/原来的猹号、瓜田、瓜籽和互动数据都已保留/)).toBeVisible();
  });

  test("账号页展示猹号密码，不展示内部邮箱，并明确确认注销", async ({ page }) => {
    await installV0Api(page); const auth = await installAuthApi(page, { session: { authenticated: true, anonymous: false, needsProfile: false, profile: permanentProfile } });
    await page.goto("/", { waitUntil: "domcontentloaded" }); await page.getByRole("button", { name: /打开我的账号/ }).click();
    await expect(page.getByRole("dialog")).toContainText("猹号 + 密码");
    await expect(page.getByRole("dialog")).not.toContainText("accounts.chachajie.invalid");
    await page.getByRole("button", { name: "注销账号", exact: true }).click(); await page.getByRole("button", { name: "确认注销账号", exact: true }).click();
    expect(auth.deleteCalls).toEqual([{ confirmation: "DELETE" }]);
  });

  test("账号页可以用系统分享邀请好友且链接不携带页面状态", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "share", {
        configurable: true,
        value: async (payload) => { window.__sharedInvite = payload; },
      });
    });
    await installV0Api(page);
    await installAuthApi(page, { session: { authenticated: true, anonymous: false, needsProfile: false, profile: permanentProfile } });
    await page.goto("/?city=changsha&melon=private", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /打开我的账号/ }).click();
    const accountSheet = page.getByRole("dialog");
    const layout = await accountSheet.evaluate((node) => ({ clientWidth: node.clientWidth, scrollWidth: node.scrollWidth }));
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);
    expect((await page.getByRole("button", { name: "发给好友" }).boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    await page.getByRole("button", { name: "发给好友" }).click();
    await expect.poll(() => page.evaluate(() => window.__sharedInvite)).toMatchObject({
      title: "猹猹街",
      url: "http://127.0.0.1:3107/",
    });
    const payload = await page.evaluate(() => window.__sharedInvite);
    expect(payload.url).not.toContain("city=");
    expect(payload.url).not.toContain("melon=");
    await expect(page.getByText("已交给系统分享。", { exact: true })).toBeVisible();
  });

  test("系统分享不可用时仍可复制干净的邀请链接", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: async (value) => { window.__copiedInvite = value; } },
      });
    });
    await installV0Api(page);
    await installAuthApi(page, { session: { authenticated: true, anonymous: false, needsProfile: false, profile: permanentProfile } });
    await page.goto("/?from=test", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /打开我的账号/ }).click();
    await page.getByRole("button", { name: "复制邀请链接" }).click();
    await expect.poll(() => page.evaluate(() => window.__copiedInvite)).toBe("http://127.0.0.1:3107/");
    await expect(page.getByText("邀请链接已复制。", { exact: true })).toBeVisible();
  });

  test("主理人街牌只在被授予的账号上出现且保持清晰可读", async ({ page }) => {
    const stewardProfile = { ...permanentProfile, displayName: "猹猹国王", identityBadge: "steward" };
    await installV0Api(page);
    await installAuthApi(page, { session: { authenticated: true, anonymous: false, needsProfile: false, profile: stewardProfile } });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /打开我的账号/ }).click();
    const badge = page.getByLabel("猹猹街主理人");
    await expect(page.getByRole("heading", { name: "猹猹国王" })).toBeVisible();
    await expect(badge).toHaveText("主理人");
    await expect(page.getByRole("link", { name: /打开主理人驾驶舱/ })).toHaveAttribute("href", "/admin");
    const metrics = await badge.evaluate((node) => {
      const style = getComputedStyle(node);
      return { height: node.getBoundingClientRect().height, color: style.color, background: style.backgroundColor };
    });
    expect(metrics.height).toBeGreaterThanOrEqual(20);
    expect(metrics.color).not.toBe(metrics.background);
  });

  test("普通账号的账号面板不出现主理人驾驶舱入口", async ({ page }) => {
    await installV0Api(page);
    await installAuthApi(page, { session: { authenticated: true, anonymous: false, needsProfile: false, profile: permanentProfile } });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /打开我的账号/ }).click();
    await expect(page.getByRole("link", { name: /打开主理人驾驶舱/ })).toHaveCount(0);
  });

  test("375/430 登录卡无横向溢出且主要触控目标不少于 44px", async ({ page }) => {
    await openLogin(page);
    const metrics = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
    expect(metrics.scroll).toBeLessThanOrEqual(metrics.viewport);
    expect((await page.getByRole("button", { name: "创建我的猹号" }).boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  });
});
