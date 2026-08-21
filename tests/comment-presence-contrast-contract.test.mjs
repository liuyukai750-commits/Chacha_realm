import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const css = await readFile(new URL("../src/app/globals.css", import.meta.url), "utf8");

test("夜间现场凭证卡使用深色文字而不是浅色字叠浅色底", () => {
  assert.match(css, /\.sunny-shell\[data-day-phase="night"\] \.comment-gate\.is-local\{[^}]*background:#d5e9c4[^}]*color:#173535/);
  assert.match(css, /\.comment-gate\.is-local \.comment-gate-copy strong\{color:#173535\}/);
  assert.match(css, /\.comment-gate\.is-local \.comment-gate-copy small\{color:#36564c\}/);
});
