import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";

process.env.CHACHA_READ_TOKEN_SECRET = "test-only-secret-with-at-least-32-characters";
let source = readFileSync(new URL("./read-token.ts", import.meta.url), "utf8");
source = source
  .replace('import "server-only";', "")
  .replace(
    'import { ApiProblem, unavailable } from "@/server/api";',
    'class ApiProblem extends Error { constructor(status, code, message) { super(message); this.status = status; this.code = code; } } const unavailable = () => new ApiProblem(503, "service_unavailable", "unavailable");',
  );
const { issueReadToken, verifyReadToken } = await import(
  `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString("base64")}`
);

const userId = "00000000-0000-4000-8000-000000000001";
const melonId = "00000000-0000-4000-8000-000000000002";

test("issues a token that becomes valid after five seconds", () => {
  const issued = issueReadToken(userId, melonId, 1_000_000);
  assert.equal(issued.completableAt, new Date(1_005_000).toISOString());
  assert.equal(verifyReadToken(issued.token, userId, melonId, 1_005_000).melonId, melonId);
});

test("rejects completing before five seconds", () => {
  const issued = issueReadToken(userId, melonId, 1_000_000);
  assert.throws(
    () => verifyReadToken(issued.token, userId, melonId, 1_004_999),
    (error) => error.code === "read_too_short" && error.status === 409,
  );
});

test("rejects tampered, cross-user and expired tokens", () => {
  const issued = issueReadToken(userId, melonId, 1_000_000);
  const tampered = `${issued.token.slice(0, -1)}x`;
  assert.throws(() => verifyReadToken(tampered, userId, melonId, 1_005_000), (error) => error.code === "invalid_read_token");
  assert.throws(
    () => verifyReadToken(issued.token, "00000000-0000-4000-8000-000000000003", melonId, 1_005_000),
    (error) => error.code === "invalid_read_token",
  );
  assert.throws(() => verifyReadToken(issued.token, userId, melonId, 1_600_001), (error) => error.code === "invalid_read_token");
});
