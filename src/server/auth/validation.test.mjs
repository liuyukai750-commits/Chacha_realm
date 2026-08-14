import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";

let source = readFileSync(new URL("./validation.ts", import.meta.url), "utf8")
  .replace(/import type \{ AnimalIdentity \} from "@\/contracts";\r?\n/, "")
  .replace(/import \{ ApiProblem \} from "@\/server\/api";\r?\n/, `
    class ApiProblem extends Error {
      constructor(status, code, message) { super(message); this.status = status; this.code = code; }
    }
  `);
const moduleUrl = `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString("base64")}`;
const { animalIdentity, displayName, normalizeChinesePhone, otpCode } = await import(moduleUrl);

test("normalizes mainland phone numbers without persisting formatting", () => {
  assert.equal(normalizeChinesePhone("138 0013-8000"), "+8613800138000");
  assert.equal(normalizeChinesePhone("008613800138000"), "+8613800138000");
  assert.throws(() => normalizeChinesePhone("123"), { code: "invalid_phone" });
});

test("accepts only six-digit OTP codes", () => {
  assert.equal(otpCode("１２３４５６"), "123456");
  assert.throws(() => otpCode("12345"), { code: "invalid_otp" });
});

test("nickname is NFKC-normalized, short and identity-safe", () => {
  assert.equal(displayName("Ａ猹12"), "A猹12");
  assert.throws(() => displayName("七个字昵称太长了"), { code: "invalid_display_name" });
  assert.throws(() => displayName("官方猹"), { code: "display_name_held" });
  assert.throws(() => displayName("猹 猹"), { code: "invalid_display_name" });
});

test("animal identity is restricted to the six launch choices", () => {
  for (const animal of ["猹", "水豚", "狐狸", "熊猫", "青蛙", "仓鼠"]) {
    assert.equal(animalIdentity(animal), animal);
  }
  assert.throws(() => animalIdentity("老虎"), { code: "invalid_animal" });
});
