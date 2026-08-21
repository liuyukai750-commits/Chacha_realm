import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const api = await readFile(new URL("../src/server/api.ts", import.meta.url), "utf8");
const nginx = await readFile(new URL("../deploy/tencent/nginx/chacha-street-https.conf.example", import.meta.url), "utf8");

test("same-origin writes use the public origin forwarded by the trusted reverse proxy", () => {
  assert.match(api, /x-forwarded-proto/i);
  assert.match(api, /x-forwarded-host/i);
  assert.match(api, /origin\s*!==\s*requestOrigin\s*&&\s*origin\s*!==\s*forwardedOrigin/);
  assert.match(nginx, /proxy_set_header\s+X-Forwarded-Host\s+\$host;/);
});

test("the direct request origin remains the fallback outside a reverse proxy", () => {
  assert.match(api, /new URL\(request\.url\)\.origin/);
});
