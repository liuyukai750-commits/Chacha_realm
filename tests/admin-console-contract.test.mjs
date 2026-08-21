import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = (relativePath) => readFile(new URL(relativePath, root), "utf8");

test("主理人接口先鉴权再调用 service-role 聚合，且响应禁止缓存", async () => {
  const [route, access, policy, service] = await Promise.all([
    source("src/app/api/admin/overview/route.ts"),
    source("src/server/admin/access.ts"),
    source("src/server/admin/access-policy.ts"),
    source("src/server/admin/overview.ts"),
  ]);

  const authorize = route.indexOf("await requireAdminSession()");
  const aggregate = route.indexOf("return getAdminOverview()");
  assert.ok(authorize >= 0 && aggregate > authorize, "必须在执行聚合查询前完成主理人鉴权");
  assert.match(route, /Cache-Control[\s\S]*private, no-store, max-age=0/);
  assert.match(route, /Vary:\s*["']Cookie["']/);
  assert.match(service, /serviceRpc<unknown>\(["']get_admin_overview["']/);
  assert.match(access, /CHACHA_ADMIN_PUBLIC_IDS/);
  assert.match(access, /admin_forbidden/);
  assert.match(policy, /authKind\s*===\s*["']password["']\s*\|\|\s*identity\.authKind\s*===\s*["']phone["']/);
  assert.match(policy, /onboardingComplete\s*===\s*true/);
  assert.match(policy, /accountStatus\s*===\s*["']active["']/);
  assert.match(policy, /allowlist\.has\(publicId\)/);
});

test("数据库聚合只允许 service_role，并只返回五城聚合指标", async () => {
  const [sql, contract] = await Promise.all([
    source("supabase/migrations/202608150004_admin_overview.sql"),
    source("src/contracts/admin.ts"),
  ]);

  assert.match(sql, /auth\.jwt\(\)\s*->>\s*'role'[\s\S]*service_role_required/i);
  assert.match(sql, /revoke all on function public\.get_admin_overview\(\) from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.get_admin_overview\(\) to service_role/i);
  assert.match(sql, /Asia\/Shanghai/);
  for (const city of ["changsha", "beijing", "shanghai", "guangzhou", "shenzhen"]) {
    assert.match(sql, new RegExp(`'${city}'`));
  }

  const publicShape = `${contract}\n${sql.match(/jsonb_build_object\([\s\S]*?return result;/i)?.[0] ?? ""}`;
  assert.doesNotMatch(publicShape, /'phone'\s*,|'uuid'\s*,|'latitude'\s*,|'longitude'\s*,|'content'\s*,|'title'\s*,|'body'\s*,/i);
  assert.doesNotMatch(contract, /phone|uuid|latitude|longitude|content|title|body|alias|displayName/i);
});

test("主理人页面禁止索引，账号面板入口只对 steward 身份显示", async () => {
  const [page, authGate, session, migration] = await Promise.all([
    source("src/app/admin/page.tsx"),
    source("src/components/auth-gate.tsx"),
    source("src/server/supabase/session.ts"),
    source("supabase/migrations/202608150001_steward_identity.sql"),
  ]);

  assert.match(page, /robots:\s*\{[\s\S]*index:\s*false[\s\S]*follow:\s*false/);
  assert.match(authGate, /session\.profile\.identityBadge\s*===\s*["']steward["'][\s\S]{0,500}href=["']\/admin["']/);
  assert.match(session, /profile\.identityBadge\s*\?[\s\S]{0,100}identityBadge:\s*profile\.identityBadge/);
  assert.match(migration, /identity_badge\s+text/);
  assert.match(migration, /identity_badge is null or identity_badge = 'steward'/);
  assert.match(migration, /profiles_single_steward_idx[\s\S]*where identity_badge = 'steward'/i);
});
