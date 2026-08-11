import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const component = await readFile(new URL("../src/components/chacha-island.tsx", import.meta.url), "utf8");
const burySheet = await readFile(new URL("../src/components/bury-sheet-v1.tsx", import.meta.url), "utf8");
const apiRoute = await readFile(new URL("../src/server/api.ts", import.meta.url), "utf8");

test("iPhone 埋瓜请求使用高精度新鲜定位证明", () => {
  const proofFactory = component.slice(component.indexOf("function requestLocationProof"));
  assert.match(proofFactory, /capturedAt:\s*new Date\(\)\.toISOString\(\)/);
  assert.match(proofFactory, /enableHighAccuracy:\s*true/);
  assert.match(proofFactory, /maximumAge:\s*0/);
  assert.doesNotMatch(proofFactory, /new Date\(position\.timestamp\)/);
});

test("埋瓜失败会滚动并聚焦明确错误，不再表现为点击无反应", () => {
  assert.match(burySheet, /className="form-error bury-submit-error"/);
  assert.match(burySheet, /aria-live="assertive"/);
  assert.match(burySheet, /scrollIntoView/);
  assert.match(burySheet, /重新埋一次/);
});

test("服务端只记录状态和错误码，不记录请求或一次性位置", () => {
  assert.match(apiRoute, /\{ status: error\.status, code: error\.code \}/);
  const consoleStatements = [...apiRoute.matchAll(/console\.(?:warn|error)\([^;]+;/g)].map(([statement]) => statement).join("\n");
  assert.doesNotMatch(consoleStatements, /body|location|latitude|longitude|token|content/i);
});
