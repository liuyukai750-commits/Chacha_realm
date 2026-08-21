import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("legal pages describe the current PostgreSQL, password and location model", async () => {
  const [privacy, terms] = await Promise.all([
    read("../src/app/privacy/page.tsx"),
    read("../src/app/terms/page.tsx"),
  ]);
  assert.match(privacy, /PostgreSQL/);
  assert.match(privacy, /精确坐标会写入仅限服务端访问的位置表/);
  assert.match(terms, /猹号、密码和恢复码/);
  assert.doesNotMatch(`${privacy}\n${terms}`, /上线准备稿|信息未补齐前不应开启公开注册|Supabase 提供认证与数据库|手机号只用于登录/);
});

test("the global footer links exact environment-provided filing numbers", async () => {
  const [footer, config, env] = await Promise.all([
    read("../src/components/site-footer.tsx"),
    read("../src/config/site-compliance.ts"),
    read("../deploy/tencent/env/chacha-street.env.example"),
  ]);
  assert.match(footer, /beian\.miit\.gov\.cn/);
  assert.match(footer, /beian\.mps\.gov\.cn/);
  assert.match(config, /NEXT_PUBLIC_ICP_FILING_NUMBER/);
  assert.match(config, /NEXT_PUBLIC_PUBLIC_SECURITY_FILING_NUMBER/);
  assert.match(config, /湘ICP备2026034402号/);
  assert.match(config, /湘公网安备43010402003047号/);
  assert.match(config, /support@chacharealm\.cn/);
  assert.match(footer, /public-security-filing\.png/);
  assert.match(footer, /query\/webSearch\?code=/);
  assert.match(env, /NEXT_PUBLIC_OPERATOR_NAME=/);
  assert.match(env, /NEXT_PUBLIC_COMPLIANCE_CONTACT=/);
});

test("legal pages expose the public support mailbox as a mail link", async () => {
  const [privacy, terms] = await Promise.all([
    read("../src/app/privacy/page.tsx"),
    read("../src/app/terms/page.tsx"),
  ]);
  assert.match(privacy, /mailto:/);
  assert.match(terms, /mailto:/);
  assert.match(`${privacy}\n${terms}`, /siteCompliance\.contact/);
});
