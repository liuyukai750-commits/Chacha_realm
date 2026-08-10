import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";

const source = stripTypeScriptTypes(readFileSync(new URL("./presence-token.ts", import.meta.url), "utf8"));
const { PresenceTokenError, issuePresenceToken, verifyPresenceToken } = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
);

const secret = "test-secret-with-at-least-thirty-two-characters";
const now = Date.parse("2026-08-09T08:00:00.000Z");

test("issues a 15 minute token bound to the anonymous session and spot without coordinates", () => {
  const result = issuePresenceToken({ userId: "user-1", spotId: "spot-1", level: "found" }, secret, now, "nonce-1");
  assert.equal(result.expiresAt, "2026-08-09T08:15:00.000Z");
  assert.deepEqual(verifyPresenceToken(result.token, { userId: "user-1", spotId: "spot-1" }, secret, now), {
    spotId: "spot-1",
    level: "found",
    expiresAt: result.expiresAt,
  });
  assert.equal(result.token.includes("latitude"), false);
  assert.equal(result.token.includes("longitude"), false);
});
test("rejects tampering, expiry and binding mismatches", () => {
  const { token } = issuePresenceToken({ userId: "user-1", spotId: "spot-1", level: "found" }, secret, now, "nonce-1");
  assert.throws(() => verifyPresenceToken(`${token}x`, { userId: "user-1" }, secret, now), PresenceTokenError);
  assert.throws(() => verifyPresenceToken(token, { userId: "user-2" }, secret, now), /binding_mismatch/);
  assert.throws(() => verifyPresenceToken(token, { userId: "user-1", spotId: "spot-2" }, secret, now), /binding_mismatch/);
  assert.throws(() => verifyPresenceToken(token, { userId: "user-1" }, secret, now + 15 * 60 * 1000), /expired/);
});

test("requires a found-level credential for seek-locked melon access", () => {
  const { token } = issuePresenceToken({ userId: "user-1", spotId: "spot-1", level: "zone" }, secret, now, "nonce-zone");
  assert.throws(() => verifyPresenceToken(token, { userId: "user-1", spotId: "spot-1", requireFound: true }, secret, now), /binding_mismatch/);
});
