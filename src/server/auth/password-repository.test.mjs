import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const repository = read("./password-repository.ts");
const service = read("./password-service.ts");
const upgradeRoute = read("../../app/api/auth/account/upgrade/route.ts");
const ui = read("../../components/auth-gate.tsx");

test("password account data access is isolated behind a repository boundary", () => {
  assert.match(repository, /export interface PasswordAuthRepository/);
  assert.match(repository, /findTargetByPublicId/);
  assert.match(repository, /findTargetByUserId/);
  assert.match(repository, /rotateRecoverySecret/);
  assert.match(service, /passwordAuthRepository/);
  assert.doesNotMatch(service, /serviceRpc\(/);
});

test("an authenticated legacy permanent account can set a password without SMS", () => {
  assert.match(service, /export async function upgradeLegacyAccountToPassword/);
  assert.match(service, /const existing = await requireActiveSession\(\)/);
  assert.match(service, /target\.userId !== existing\.userId/);
  assert.match(service, /existingDataPreserved: true/);
  assert.match(upgradeRoute, /requireSameOrigin\(request\)/);
  assert.match(upgradeRoute, /upgradeLegacyAccountToPassword/);
  assert.doesNotMatch(upgradeRoute, /phone|otp|sms/i);
});

test("legacy upgrade records its password completion marker only after every retryable step", () => {
  const start = service.indexOf("export async function upgradeLegacyAccountToPassword");
  const upgradeFunction = service.slice(start);
  const supabasePathStart = upgradeFunction.indexOf("// `account_login_credentials` is the completion marker");
  const upgrade = upgradeFunction.slice(supabasePathStart);
  assert.ok(supabasePathStart > 0);
  const identity = upgrade.indexOf("await updatePasswordIdentity");
  const signIn = upgrade.indexOf("await signIn");
  const recovery = upgrade.indexOf("await passwordAuthRepository.saveRecoverySecret");
  const cookie = upgrade.indexOf("await saveAuthSession");
  const profile = upgrade.indexOf("await publicSessionFor");
  const completionMarker = upgrade.indexOf("await passwordAuthRepository.saveLoginCredential");
  const response = upgrade.indexOf("return {");

  assert.ok(identity > 0);
  assert.ok(identity < signIn);
  assert.ok(signIn < recovery);
  assert.ok(recovery < cookie);
  assert.ok(cookie < profile);
  assert.ok(profile < completionMarker);
  assert.ok(completionMarker < response);
  assert.doesNotMatch(upgrade.slice(completionMarker + 1, response), /await\s/);
});

test("legacy upgrade shows the recovery code once and does not call phone routes", () => {
  assert.match(ui, /AuthStep = [^;]*"upgrade"/);
  assert.match(ui, /\/api\/auth\/account\/upgrade/);
  assert.match(ui, /给现有瓜田设置密码/);
  assert.match(ui, /只显示这一次 · 恢复码/);
  assert.doesNotMatch(ui, /\/api\/auth\/phone\//);
});
