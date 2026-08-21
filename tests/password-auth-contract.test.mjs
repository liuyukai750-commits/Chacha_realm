import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/202608140002_public_id_password_auth.sql");
const service = read("src/server/auth/password-service.ts");
const validation = read("src/server/auth/validation.ts");
const security = read("src/server/auth/security.ts");
const ui = read("src/components/auth-gate.tsx");
const env = read(".env.example");

test("恢复码和认证尝试只保存摘要且默认 RLS 拒绝", () => {
  assert.match(migration, /account_recovery_credentials[\s\S]*secret_digest text not null/);
  assert.match(migration, /auth_credential_attempts[\s\S]*identity_digest text not null[\s\S]*ip_digest text not null/);
  assert.match(migration, /alter table public\.account_recovery_credentials enable row level security/);
  assert.match(migration, /revoke all on public\.account_recovery_credentials from public, anon, authenticated/);
  assert.doesNotMatch(migration, /recovery_code|raw_password|raw_ip/i);
});

test("猹号密码账号支持旧匿名 UUID 原地升级和新账号创建", () => {
  assert.match(service, /const existing = await getOptionalSession\(\)/);
  assert.match(service, /userId = existing\?\.userId/);
  assert.match(service, /createPasswordUser\(input\.password\)/);
  assert.match(service, /updatePasswordIdentity\(userId, loginEmail, input\.password\)/);
  assert.match(service, /existingDataPreserved: Boolean\(existing\)/);
});

test("公开猹号映射到随机私有登录句柄且不会进入公开 session", () => {
  assert.match(service, /randomUUID\(\).*@accounts\.chachajie\.invalid/);
  assert.match(migration, /account_login_credentials/);
  assert.match(migration, /revoke all on public\.account_login_credentials from public, anon, authenticated/);
  assert.doesNotMatch(service, /publicId\.toLowerCase\(\).*accounts\.chachajie/);
  assert.match(migration, /raw_app_meta_data ->> 'chacha_auth_kind' = 'password'/);
  assert.doesNotMatch(read("src/contracts/index.ts"), /internalEmail|authEmail/);
});

test("恢复成功原子换码并在密码更新失败时恢复旧摘要", () => {
  assert.match(migration, /rotate_account_recovery_secret/);
  assert.match(migration, /for update of r/);
  assert.match(service, /p_current_digest: recoverySecretDigest/);
  assert.match(service, /p_new_digest: recoverySecretDigest/);
  assert.match(service, /catch \(error\)[\s\S]*set_account_recovery_secret/);
});

test("登录、注册和找回均有限流与可选真实 Turnstile 服务端验证", () => {
  assert.match(migration, /action in \('register', 'login', 'recover'\)/);
  assert.match(service, /reserveAttempt\(input\.request[\s\S]*"register"\)/);
  assert.match(service, /reserveAttempt\(input\.request[\s\S]*"login"\)/);
  assert.match(service, /reserveAttempt\(input\.request[\s\S]*"recover"\)/);
  assert.match(service, /turnstile\/v0\/siteverify/);
  assert.match(env, /TURNSTILE_SECRET_KEY=/);
});

test("密码、猹号和恢复码均在服务端规范化校验", () => {
  assert.match(validation, /publicIdPattern/);
  assert.match(validation, /normalized\.length < 8/);
  assert.match(validation, /recoveryCodePattern/);
  assert.match(security, /recoverySecretDigest/);
});

test("登录页不再依赖手机验证码并一次性展示恢复码", () => {
  assert.match(ui, /创建我的猹号/);
  assert.match(ui, /已有猹号，直接登录/);
  assert.match(ui, /只显示这一次 · 恢复码/);
  assert.match(ui, /我已经保存好猹号和恢复码/);
  assert.match(ui, /登录方式<\/dt><dd>猹号 \+ 密码/);
  assert.doesNotMatch(ui, /获取验证码|短信到了|\/api\/auth\/phone\//);
});
