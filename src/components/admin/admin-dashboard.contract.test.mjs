import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const component = readFileSync("src/components/admin/admin-dashboard.tsx", "utf8");
const styles = readFileSync("src/components/admin/admin-dashboard.module.css", "utf8");

test("admin dashboard fetches only the aggregate overview contract", () => {
  assert.match(component, /import type \{ AdminOverview \} from "@\/contracts\/admin"/);
  assert.match(component, /fetch\("\/api\/admin\/overview"/);
  assert.match(component, /method:\s*"GET"/);
  assert.match(component, /cache:\s*"no-store"/);
  assert.match(component, /parseAdminOverview\(await response\.json\(\)\)/);
  assert.match(component, /overview\.users\.registrations\.total/);
  assert.match(component, /formatRate\(overview\.users\.active\.today, overview\.users\.registrations\.total\)/);
  assert.doesNotMatch(component, /title:\s*["']种籽与收成["']/);
  assert.doesNotMatch(component, /title:\s*["']治理水位["']/);
  assert.doesNotMatch(component, /\.phone\b|\.email\b|\.latitude\b|\.longitude\b|\.body\b|\.contentText\b/);
});

test("admin dashboard handles access, failure, loading and empty states", () => {
  for (const state of ["loading", "unauthorized", "forbidden", "error", "empty"]) {
    assert.match(component, new RegExp(`\\b${state}\\b`), `${state} state must be rendered`);
  }
  assert.match(component, /response\.status === 401/);
  assert.match(component, /response\.status === 403/);
  assert.match(component, /isOverviewEmpty/);
});

test("admin dashboard keeps its mobile and reduced-motion quality gates", () => {
  assert.match(styles, /@media \(max-width: 430px\)/);
  assert.match(styles, /@media \(max-width: 375px\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /:focus-visible/);
  assert.match(styles, /min-height:\s*44px/);
});
