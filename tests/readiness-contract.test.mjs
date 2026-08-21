import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("release readiness checks PostgreSQL without exposing diagnostics", async () => {
  const [route, installer] = await Promise.all([
    read("../src/app/api/health/ready/route.ts"),
    read("../scripts/deploy/install-release.sh"),
  ]);

  assert.match(route, /postgresQuery/);
  assert.match(route, /select 1::int as ok/);
  assert.match(route, /status:\s*"unavailable"/);
  assert.match(route, /status:\s*503/);
  assert.match(route, /private, no-store/);
  assert.doesNotMatch(route, /error\.message|DATABASE_URL|console\./);
  assert.match(installer, /\/api\/health\/ready/);
  assert.doesNotMatch(installer, /127\.0\.0\.1:3000\/\s*>\/dev\/null/);
});
