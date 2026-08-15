import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const access = readFileSync(new URL("./access.ts", import.meta.url), "utf8");
const accessPolicy = readFileSync(new URL("./access-policy.ts", import.meta.url), "utf8");
const service = readFileSync(new URL("./overview.ts", import.meta.url), "utf8");
const contract = readFileSync(new URL("../../contracts/admin.ts", import.meta.url), "utf8");
const route = readFileSync(new URL("../../app/api/admin/overview/route.ts", import.meta.url), "utf8");

test("overview route authorizes before invoking the service-role aggregate", () => {
  assert.match(route, /await requireAdminSession\(\)[\s\S]*return getAdminOverview\(\)/);
  assert.match(route, /force-dynamic/);
  assert.match(route, /private, no-store/);
  assert.match(service, /serviceRpc<unknown>\("get_admin_overview", \{\}\)/);
});

test("admin access requires permanent auth, completed profile, active status and server allowlist", () => {
  assert.match(access, /CHACHA_ADMIN_PUBLIC_IDS/);
  assert.match(access, /publicSessionFor\(session\)/);
  assert.match(access, /admin_forbidden/);
  assert.match(accessPolicy, /authKind === "password" \|\| identity\.authKind === "phone"/);
});

test("public admin contract contains aggregates only", () => {
  assert.doesNotMatch(contract, /phone|uuid|latitude|longitude|content|title|alias|displayName/i);
  assert.match(contract, /publishedMelons/);
  assert.match(contract, /effectiveReads/);
  assert.match(contract, /pendingReviewCases/);
  assert.match(contract, /bannedProfiles/);
});
