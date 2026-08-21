import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const component = await readFile(new URL("../src/components/chacha-island.tsx", import.meta.url), "utf8");
const css = await readFile(new URL("../src/app/globals.css", import.meta.url), "utf8");

test("自己的瓜田隐藏定位通知和旧宣传标题", () => {
  assert.match(component, /tab === "radar"[\s\S]*className="live-notice"/);
  const ownField = component.slice(component.indexOf("function MyField"), component.indexOf("function OwnerMelonReader"));
  assert.doesNotMatch(ownField, /MY THREE PATCHES/);
  assert.doesNotMatch(ownField, /九个坑，慢慢长/);
});

test("瓜田顶部展示用户名、待开发等级和四项真实数据", () => {
  assert.match(component, /className="field-profile-card"[\s\S]*用户名/);
  assert.match(component, /className="field-profile-card is-level"[\s\S]*用户等级[\s\S]*待开发/);
  assert.match(component, /<div className="field-profile-card">[\s\S]*?<\/div>\s*<div className="field-profile-card is-level">/);
  for (const label of ["田里", "小瓜籽", "真瓜籽", "经验值"]) assert.match(component, new RegExp(`>${label}<`));
  assert.doesNotMatch(component, />XP</);
  assert.match(css, /\.field-profile-summary/);
  assert.match(css, /\.field-profile-card/);
  assert.match(css, /field-profile-heading\{[^}]*padding:12px 82px/);
  const levelRule = css.match(/\.field-profile-card\.is-level\{([^}]*)\}/)?.[1] ?? "";
  assert.doesNotMatch(levelRule, /border|background/);
  assert.match(css, /field-ledger strong\{[^}]*var\(--display\)[^}]*font-variant-numeric:tabular-nums/);
  assert.match(css, /night[^\n]*field-ledger strong[^\n]*color:#f5fbff/);
});
