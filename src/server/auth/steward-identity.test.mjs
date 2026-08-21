import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../../supabase/migrations/202608150001_steward_identity.sql", import.meta.url),
  "utf8",
);
const displayNameMigration = readFileSync(
  new URL("../../../supabase/migrations/202608150002_display_name_length_12.sql", import.meta.url),
  "utf8",
);
const contracts = readFileSync(new URL("../../contracts/index.ts", import.meta.url), "utf8");
const session = readFileSync(new URL("../supabase/session.ts", import.meta.url), "utf8");
const badgeComponent = readFileSync(new URL("../../components/identity-badge.tsx", import.meta.url), "utf8");
const community = readFileSync(new URL("../../components/chacha-island.tsx", import.meta.url), "utf8");

test("steward identity is singular and service-managed", () => {
  assert.match(migration, /profiles_single_steward_idx[\s\S]*where identity_badge = 'steward'/i);
  assert.match(migration, /revoke all on function public\.assign_steward_identity\(text, boolean\) from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.assign_steward_identity\(text, boolean\) to service_role/i);
});

test("ordinary onboarding cannot claim the reserved owner identity", () => {
  const profileFunction = migration.slice(
    migration.indexOf("create or replace function public.complete_current_profile"),
    migration.indexOf("create or replace function public.get_current_profile"),
  );
  assert.match(profileFunction, /p_display_name = '猹猹国王'/);
  assert.match(migration, /display_name is distinct from '猹猹国王' or identity_badge = 'steward'/);
});

test("database profile validation accepts at most twelve display-name characters", () => {
  assert.match(displayNameMigration, /char_length\(display_name\) between 1 and 12/);
  assert.match(displayNameMigration, /char_length\(p_display_name\) not between 1 and 12/);
  assert.match(displayNameMigration, /p_display_name = '猹猹国王'/);
});

test("private session and public community identity expose only the badge code", () => {
  const publicIdentity = migration.slice(
    migration.indexOf("create or replace function public.profile_public_identity"),
    migration.indexOf("revoke all on function public.assign_steward_identity"),
  );
  assert.match(migration, /'identityBadge', p\.identity_badge/g);
  assert.match(contracts, /export type IdentityBadge = "steward"/);
  assert.match(session, /profile\.identityBadge/);
  assert.doesNotMatch(publicIdentity, /'userId'|'phone'/);
});

test("the public badge is accessible and appears across community identity surfaces", () => {
  assert.match(badgeComponent, /aria-label="猹猹街主理人"/);
  assert.match(badgeComponent, />\s*主理人\s*</);
  assert.match(community, /badge=\{melon\.identityBadge\}/);
  assert.match(community, /badge=\{item\.identityBadge\}/);
  assert.match(community, /badge=\{field\.identityBadge\}/);
});
