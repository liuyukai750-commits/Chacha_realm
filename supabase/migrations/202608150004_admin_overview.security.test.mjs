import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync(new URL("./202608150004_admin_overview.sql", import.meta.url), "utf8");

test("admin aggregate is service-role only and checks its JWT role", () => {
  assert.match(sql, /create or replace function public\.get_admin_overview\(\)/i);
  assert.match(sql, /auth\.jwt\(\) ->> 'role'[\s\S]*service_role_required/i);
  assert.match(sql, /revoke all on function public\.get_admin_overview\(\) from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.get_admin_overview\(\) to service_role/i);
});

test("all daily metrics share the Asia Shanghai boundary", () => {
  assert.match(sql, /date_trunc\('day', statement_timestamp\(\) at time zone 'Asia\/Shanghai'\)[\s\S]*at time zone 'Asia\/Shanghai'/i);
  assert.doesNotMatch(sql, /date_trunc\('day', now\(\) at time zone 'UTC'\)/i);
});

test("registration and active-user metrics exclude unfinished legacy profiles", () => {
  assert.match(sql, /where p\.onboarding_completed_at is not null/i);
  assert.match(sql, /where p\.onboarding_completed_at >= b\.today_start/i);
  assert.match(sql, /join public\.profiles p on p\.id = a\.profile_id[\s\S]*p\.onboarding_completed_at is not null/i);
});

test("overview is aggregate-only and covers the required operating signals", () => {
  for (const key of [
    "registrations",
    "active",
    "publishedMelons",
    "effectiveReads",
    "comments",
    "likes",
    "squats",
    "smallSeeds",
    "trueSeeds",
    "fieldPlants",
    "fieldHarvests",
    "pendingReviewCases",
    "reports",
    "bannedProfiles",
  ]) {
    assert.match(sql, new RegExp(`'${key}'`));
  }
  for (const city of ["changsha", "beijing", "shanghai", "guangzhou", "shenzhen"]) {
    assert.match(sql, new RegExp(`'${city}'`));
  }
  assert.doesNotMatch(sql, /'phone'\s*,|'content'\s*,|'latitude'\s*,|'longitude'\s*,|'profileId'\s*,/i);
});
