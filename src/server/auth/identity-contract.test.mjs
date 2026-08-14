import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../../supabase/migrations/202608140001_phone_identity.sql", import.meta.url),
  "utf8",
);
const session = readFileSync(new URL("../supabase/session.ts", import.meta.url), "utf8");
const service = readFileSync(new URL("./service.ts", import.meta.url), "utf8");

test("profile identity is public-id based while auth UUID stays internal", () => {
  assert.match(migration, /add column if not exists display_name text/);
  assert.match(migration, /add column if not exists public_id text/);
  assert.match(migration, /profiles_public_id_unique_idx/);
  assert.match(migration, /'CC-'/);
  assert.match(migration, /extensions\.gen_random_bytes/);
  assert.match(migration, /onboarding_completed_at/);
});

test("rate limiting persists only HMAC digests", () => {
  assert.match(migration, /phone_digest text not null/);
  assert.match(migration, /ip_digest text not null/);
  assert.doesNotMatch(migration, /phone_number|raw_phone|remote_address/);
  assert.match(service, /phoneDigest\(phone\)/);
  assert.match(service, /requestIpDigest\(request\)/);
});

test("legacy sessions resume but new visitors are not anonymously signed up", () => {
  assert.match(session, /Compatibility export for the existing bootstrap route/);
  assert.doesNotMatch(session, /auth\/v1\/signup/);
  assert.doesNotMatch(session, /is_anonymous === false\) throw/);
});

test("account deletion uses server-only admin credentials and clears cookies", () => {
  assert.match(service, /getSupabaseAdminConfig/);
  assert.match(service, /auth\/v1\/admin\/users\/\$\{session\.userId\}/);
  assert.match(service, /clearAuthSession/);
  assert.doesNotMatch(service, /phone:\s*phone[^,}]*console/);
});

test("anonymous users cannot bypass the phone gate by calling profile RPC directly", () => {
  const profileFunction = migration.slice(
    migration.indexOf("create or replace function public.complete_current_profile"),
    migration.indexOf("-- Auth deletion"),
  );
  assert.match(profileFunction, /auth\.jwt\(\)->>'is_anonymous'/);
  assert.match(profileFunction, /auth\.users/);
  assert.match(profileFunction, /phone is not null/);
  assert.match(profileFunction, /phone_account_required/);
});

test("community DTOs retain legacy alias and add chosen display identity", () => {
  assert.match(migration, /profile_public_identity/);
  assert.match(migration, /'displayName', coalesce\(p\.display_name, p\.alias\)/);
  assert.match(migration, /'publicId', p\.public_id/);
  assert.match(migration, /get_melon_detail_for_actor_legacy_identity/);
  assert.match(migration, /get_melon_comments_legacy_identity/);
  assert.match(migration, /field_view_for_profile_legacy_identity/);
  assert.match(migration, /p\.public_id = upper\(p_alias\) or p\.alias = p_alias/);
});
