import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";

const source = readFileSync(new URL("./access-policy.ts", import.meta.url), "utf8");
const { isAllowedAdminIdentity, parseAdminPublicIds } = await import(
  `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString("base64")}`
);

const validIdentity = {
  authKind: "phone",
  publicId: "CC-01AB2CD3",
  onboardingComplete: true,
  accountStatus: "active",
};

test("admin allowlist defaults to deny and ignores malformed public ids", () => {
  assert.equal(parseAdminPublicIds(undefined).size, 0);
  assert.deepEqual(
    [...parseAdminPublicIds(" random, CC-01AB2CD3, cc-4567efgh ")],
    ["CC-01AB2CD3", "CC-4567EFGH"],
  );
});

test("only a completed active permanent profile on the allowlist is accepted", () => {
  const allowlist = parseAdminPublicIds("CC-01AB2CD3");
  assert.equal(isAllowedAdminIdentity(validIdentity, allowlist), true);
  assert.equal(isAllowedAdminIdentity({ ...validIdentity, authKind: "password" }, allowlist), true);
  assert.equal(isAllowedAdminIdentity({ ...validIdentity, authKind: "anonymous" }, allowlist), false);
  assert.equal(isAllowedAdminIdentity({ ...validIdentity, onboardingComplete: false }, allowlist), false);
  assert.equal(isAllowedAdminIdentity({ ...validIdentity, accountStatus: "banned" }, allowlist), false);
  assert.equal(isAllowedAdminIdentity({ ...validIdentity, publicId: "CC-ZZZZZZZZ" }, allowlist), false);
});
