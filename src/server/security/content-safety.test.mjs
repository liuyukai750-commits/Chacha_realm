import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";

const source = stripTypeScriptTypes(readFileSync(new URL("./content-safety.ts", import.meta.url), "utf8"));
const { assessContentSafety } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

test("flags contact details without returning the matched value", () => {
  const flags = assessContentSafety("加我微信 abcde123");
  assert.deepEqual(flags, ["contact"]);
  assert.equal(JSON.stringify(flags).includes("abcde123"), false);
});

test("flags phone, email, precise address and doxxing signals", () => {
  const flags = assessContentSafety(
    "电话 138 1234 5678",
    "mail@example.com",
    "家庭住址 8号楼302室",
    "准备开盒",
  );
  assert.deepEqual(flags, ["phone", "email", "precise_address", "illegal_or_doxxing"]);
});

test("allows ordinary neighborhood storytelling", () => {
  assert.deepEqual(assessContentSafety("今天在公园遇到一只很亲人的小狗。"), []);
});
