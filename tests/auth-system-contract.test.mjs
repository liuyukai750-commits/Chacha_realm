import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = (relativePath) => readFile(new URL(relativePath, root), "utf8");

async function latestAuthMigration() {
  const candidates = [
    "supabase/migrations/202608140001_phone_identity.sql",
    "supabase/migrations/202608140001_phone_auth_identity.sql",
    "supabase/migrations/202608140001_auth_identity.sql",
  ];
  for (const candidate of candidates) {
    try {
      await access(new URL(candidate, root));
      return source(candidate);
    } catch {}
  }
  assert.fail(`缺少手机号身份迁移；预期文件之一：${candidates.join(", ")}`);
}

test("新访客 bootstrap 不再自动创建匿名 Supabase 用户", async () => {
  const [bootstrap, session] = await Promise.all([
    source("src/app/api/bootstrap/route.ts"),
    source("src/server/supabase/session.ts"),
  ]);

  assert.doesNotMatch(bootstrap, /\/auth\/v1\/signup/);
  assert.match(bootstrap, /requireSession|createOrResumeAnonymousSessionBundle|authenticated/i);
  assert.doesNotMatch(session, /\/auth\/v1\/signup/);

  const activePath = session.slice(session.indexOf("async function currentSession"));
  assert.doesNotMatch(activePath, /is_anonymous\s*===\s*false[\s\S]{0,100}(?:throw|unauthorized)/i);
});

test("永久会话继续使用 HttpOnly/Secure/SameSite Cookie，并保留 30 天刷新凭证", async () => {
  const session = await source("src/server/supabase/session.ts");
  assert.match(session, /httpOnly:\s*true/);
  assert.match(session, /sameSite:\s*["']lax["']/i);
  assert.match(session, /secure:\s*process\.env\.NODE_ENV\s*===\s*["']production["']/);
  assert.match(session, /30\s*\*\s*24\s*\*\s*60\s*\*\s*60/);
  assert.match(session, /refresh_token/);
});

test("手机号认证提供 session/request/verify/confirm/profile/logout/delete 七个边界", async () => {
  const routes = [
    "src/app/api/auth/session/route.ts",
    "src/app/api/auth/phone/request/route.ts",
    "src/app/api/auth/phone/verify/route.ts",
    "src/app/api/auth/phone/confirm/route.ts",
    "src/app/api/auth/profile/route.ts",
    "src/app/api/auth/logout/route.ts",
    "src/app/api/auth/account/delete/route.ts",
  ];
  const files = await Promise.all(routes.map(async (path) => [path, await source(path)]));
  for (const [path, route] of files) {
    assert.match(route, /export async function (?:GET|POST|DELETE)/, `${path} 缺少公开 handler`);
    if (!path.endsWith("session/route.ts")) {
      assert.match(route, /requireSameOrigin\(request\)/, `${path} 必须拒绝跨站写入`);
    }
  }
});

test("验证码请求在服务端规范化中国手机号并执行冷却/限流", async () => {
  const [requestRoute, authService, validation, sql] = await Promise.all([
    source("src/app/api/auth/phone/request/route.ts"),
    source("src/server/auth/service.ts"),
    source("src/server/auth/validation.ts"),
    latestAuthMigration(),
  ]);
  const implementation = `${requestRoute}\n${authService}\n${validation}\n${sql}`;
  assert.match(implementation, /(?:\+86|ChinesePhone|phone)/i);
  assert.match(implementation, /60\s*(?:seconds|_000)|rate_limited|reserve_phone_auth_attempt/i);
  assert.match(authService, /phoneDigest\(phone\)/);
  assert.doesNotMatch(authService, /console\.(?:log|info|debug)\([^\n]*phone/i);
});

test("验证码请求在服务端确认用户已同意协议", async () => {
  const [requestRoute, authGate, contracts] = await Promise.all([
    source("src/app/api/auth/phone/request/route.ts"),
    source("src/components/auth-gate.tsx"),
    source("src/contracts/index.ts"),
  ]);
  assert.match(requestRoute, /input\.acceptedTerms\s*!==\s*true/);
  assert.match(requestRoute, /terms_required/);
  assert.match(authGate, /acceptedTerms:\s*true/);
  assert.match(contracts, /acceptedTerms:\s*true/);
});

test("生产环境可强制 CAPTCHA，缺少 token 时不会请求 Supabase 短信", async () => {
  const [requestRoute, authService, validation, envExample, authGate] = await Promise.all([
    source("src/app/api/auth/phone/request/route.ts"),
    source("src/server/auth/service.ts"),
    source("src/server/auth/validation.ts"),
    source(".env.example"),
    source("src/components/auth-gate.tsx"),
  ]);
  const server = `${requestRoute}\n${authService}\n${validation}`;
  assert.match(envExample, /CHACHA_CAPTCHA_REQUIRED/);
  assert.match(server, /CHACHA_CAPTCHA_REQUIRED/);
  assert.match(authService, /(?:const\s+)?CAPTCHA_REQUIRED[\s\S]{0,160}CHACHA_CAPTCHA_REQUIRED/);
  assert.match(server, /captcha_required/);
  const requestStart = authService.indexOf("export async function requestPhoneOtp");
  const requestEnd = authService.indexOf("function isFullSession", requestStart);
  const requestBlock = authService.slice(requestStart, requestEnd);
  const guardPosition = requestBlock.indexOf("CAPTCHA_REQUIRED");
  const smsPosition = requestBlock.search(/send(?:SignIn|Upgrade)Otp/);
  assert.ok(guardPosition >= 0 && smsPosition > guardPosition, "强制 CAPTCHA 检查必须发生在发送短信之前");
  assert.match(authGate, /NEXT_PUBLIC_TURNSTILE_SITE_KEY/);
  assert.match(authGate, /captchaToken:\s*captchaToken\s*\|\|\s*undefined/);
});

test("验证码验证覆盖错误、过期、重放与已有手机号冲突，且冲突不自动合并", async () => {
  const [verifyRoute, authService] = await Promise.all([
    source("src/app/api/auth/phone/verify/route.ts"),
    source("src/server/auth/service.ts"),
  ]);
  const implementation = `${verifyRoute}\n${authService}`;
  assert.match(implementation, /otp|token|code/i);
  assert.match(implementation, /expired|invalid|verify|requirePendingPhoneAuth/i);
  assert.match(implementation, /phone_already_registered|already.*registered/i);
  assert.match(implementation, /Keep the anonymous cookies untouched|clearPendingPhoneAuth/i);
  assert.doesNotMatch(implementation, /mergeAnonymous|mergeAccounts|transferAllData/i);
});

test("旧匿名账号使用 phone_change 原地升级，并校验验证后的 userId 不变", async () => {
  const authService = await source("src/server/auth/service.ts");
  assert.match(authService, /type:\s*["']phone_change["']/);
  assert.match(authService, /verified\.user\?\.id\s*!==\s*existing\.userId/);
  assert.match(authService, /pending\.userId/);
  const savePosition = authService.indexOf("saveAuthSession(verified)");
  const verifyPosition = authService.indexOf('"/auth/v1/verify"');
  assert.ok(verifyPosition >= 0 && savePosition > verifyPosition, "验证码成功前不得覆盖旧匿名 Cookie");
});

test("手机号冲突只保存短期切换候选，确认后才覆盖认证 Cookie", async () => {
  const [authService, security, contracts] = await Promise.all([
    source("src/server/auth/service.ts"),
    source("src/server/auth/security.ts"),
    source("src/contracts/index.ts"),
  ]);
  const implementation = `${authService}\n${security}\n${contracts}`;
  assert.match(implementation, /requiresAccountSwitchConfirmation/);
  assert.match(implementation, /PhoneSwitchCandidate|savePhoneSwitch|switch.*candidate/i);
  assert.match(implementation, /SWITCH_TTL_SECONDS\s*=\s*5\s*\*\s*60/);
  assert.match(implementation, /createCipheriv|aes-256-gcm/i);
  assert.match(implementation, /confirmPhoneAccountSwitch|confirm.*switch/i);
  const verifyStart = authService.indexOf("export async function verifyPhoneOtp");
  const confirmStart = authService.search(/export async function confirmPhoneAccountSwitch|export async function confirm.*Switch/i);
  assert.ok(verifyStart >= 0 && confirmStart > verifyStart, "缺少独立的账号切换确认阶段");
  const verifyBlock = authService.slice(verifyStart, confirmStart);
  const conflictStart = verifyBlock.indexOf("if (pending.conflictUserId)");
  const candidatePosition = verifyBlock.indexOf("savePhoneSwitchCandidate", conflictStart);
  const conflictReturn = verifyBlock.indexOf("requiresAccountSwitchConfirmation: true", candidatePosition);
  const normalSavePosition = verifyBlock.indexOf("saveAuthSession(verified)", candidatePosition);
  assert.ok(
    conflictStart >= 0 && candidatePosition > conflictStart && conflictReturn > candidatePosition
      && normalSavePosition > conflictReturn,
    "冲突分支必须先保存短期候选并提前返回，不能覆盖匿名 Cookie",
  );
  assert.match(authService.slice(confirmStart), /saveAuthSession/);
  assert.match(security, /expiresAt\s*<\s*Date\.now\(\)/);
});

test("旧匿名账号请求验证码时不暴露手机号是否已有瓜田", async () => {
  const [authService, contracts] = await Promise.all([
    source("src/server/auth/service.ts"),
    source("src/contracts/index.ts"),
  ]);
  const requestStart = authService.indexOf("export async function requestPhoneOtp");
  const requestEnd = authService.indexOf("function isFullSession", requestStart);
  const requestBlock = authService.slice(requestStart, requestEnd);
  assert.match(requestBlock, /publicFlow|flow:\s*session\?\.isAnonymous\s*\?\s*["']upgrade["']/);
  const returnStatement = requestBlock.slice(requestBlock.lastIndexOf("return"));
  assert.doesNotMatch(returnStatement, /accountConflict|phone_already_registered/);
  const requestResult = contracts.slice(
    contracts.indexOf("export interface PhoneOtpRequestResult"),
    contracts.indexOf("export interface PhoneOtpVerifyRequest"),
  );
  assert.doesNotMatch(requestResult, /accountConflict/);
  assert.match(contracts, /requiresAccountSwitchConfirmation/);
});

test("登录闸门关闭时首页绕过 AuthGate，避免会话请求阻塞刷新", async () => {
  const [page, envExample] = await Promise.all([
    source("src/app/page.tsx"),
    source(".env.example"),
  ]);
  assert.match(envExample, /AUTH_GATE_ENABLED=false/);
  assert.match(page, /process\.env\.AUTH_GATE_ENABLED\s*===\s*["']true["']/);
  const appDeclaration = page.search(/const\s+app\s*=\s*<ChachaIsland\s*\/>;/);
  const disabledReturn = page.search(/if\s*\(!authGateRequired\)\s*return\s+app\s*;/);
  const authGateRender = page.search(/return\s*<AuthGate/);
  assert.ok(appDeclaration >= 0, "街区应用主体应在关闭登录闸门时直接渲染");
  assert.ok(disabledReturn > appDeclaration && authGateRender > disabledReturn, "闸门关闭时必须直接渲染应用，不能先挂载 AuthGate");
});

test("身份迁移提供显示昵称、不可变公开猹号、完成时间和六种动物约束", async () => {
  const sql = await latestAuthMigration();
  assert.match(sql, /display_name/i);
  assert.match(sql, /public_id/i);
  assert.match(sql, /onboarding_completed_at/i);
  assert.match(sql, /unique[\s\S]{0,120}public_id|public_id[\s\S]{0,120}unique/i);
  for (const animal of ["猹", "水豚", "狐狸", "熊猫", "青蛙", "仓鼠"]) {
    assert.ok(sql.includes(animal), `动物白名单缺少 ${animal}`);
  }
  assert.match(sql, /generate_(?:chacha_)?public_id|result\s+text\s*:=\s*'CC-'/i);
});

test("资料接口在服务端执行 NFKC、1..12 可见字符、字符白名单和敏感身份风控", async () => {
  const [profileRoute, validation] = await Promise.all([
    source("src/app/api/auth/profile/route.ts"),
    source("src/server/auth/validation.ts"),
  ]);
  const implementation = `${profileRoute}\n${validation}`;
  assert.match(implementation, /NFKC|normalize/i);
  assert.match(implementation, /\{1,12\}|grapheme|visible/i);
  assert.match(implementation, /Script=Han|A-Za-z0-9|nickname|displayName/i);
  assert.match(implementation, /官方|客服|管理员|blockedNicknameSignals/i);
  for (const animal of ["猹", "水豚", "狐狸", "熊猫", "青蛙", "仓鼠"]) {
    assert.ok(implementation.includes(animal), `服务端动物白名单缺少 ${animal}`);
  }
});

test("昵称输入在拼音组合完成前不截断，完成后才收敛到十二个可见字符", async () => {
  const gate = await source("src/components/auth-gate.tsx");
  assert.match(gate, /onCompositionStart[\s\S]{0,160}composingDisplayName\.current\s*=\s*true/);
  assert.match(gate, /onCompositionEnd[\s\S]{0,220}trimToVisibleLength\([^,]+,\s*12\)/);
  assert.match(gate, /composingDisplayName\.current\s*\?\s*event\.target\.value\s*:\s*trimToVisibleLength/);
  assert.doesNotMatch(gate, /maxLength=\{?12\}?/);
});

test("资料 RPC 自身拒绝匿名 JWT，不能绕过 API 完成身份资料", async () => {
  const sql = await latestAuthMigration();
  const functionStart = sql.indexOf("create or replace function public.complete_current_profile");
  const functionEnd = sql.indexOf("$$;", functionStart);
  const functionBody = sql.slice(functionStart, functionEnd);
  assert.match(functionBody, /auth\.jwt\(\)[\s\S]{0,160}is_anonymous/);
  assert.match(functionBody, /phone_required|anonymous|42501/i);
});

test("公开契约不暴露手机号、Supabase UUID、登录凭证或认证日志", async () => {
  const [contracts, repository] = await Promise.all([
    source("src/contracts/index.ts"),
    source("src/server/repositories/island-repository.ts"),
  ]);
  const publicTypes = contracts
    .split(/export (?:interface|type) /)
    .filter((part) => /Melon|FieldView|Comment|Discovery|Squat/i.test(part.slice(0, 80)))
    .join("\n");
  assert.doesNotMatch(publicTypes, /phone|accessToken|refreshToken|authUserId|supabaseUserId/i);
  assert.doesNotMatch(repository, /select\([^)]*(?:phone|access_token|refresh_token)/i);
});
