import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const config = await readFile(new URL("../next.config.ts", import.meta.url), "utf8");

test("production responses set baseline browser security policies", () => {
  assert.match(config, /poweredByHeader:\s*false/);
  for (const header of [
    "Content-Security-Policy",
    "Strict-Transport-Security",
    "X-Content-Type-Options",
    "X-Frame-Options",
    "Referrer-Policy",
    "Permissions-Policy",
  ]) assert.match(config, new RegExp(header));
  assert.match(config, /geolocation=\(self\)/);
  assert.match(config, /challenges\.cloudflare\.com/);
  assert.match(config, /frame-ancestors 'none'/);
});
