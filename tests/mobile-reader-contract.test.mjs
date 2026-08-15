import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const island = readFileSync(new URL("../src/components/chacha-island.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/202608150006_public_animal_identity.sql", import.meta.url), "utf8");

test("普通触摸焦点不会被误判为左滑操作", () => {
  assert.doesNotMatch(css, /\.swipe-action-row:focus-within\s+\.swipe-action-content/);
  assert.match(css, /\.swipe-action-row\.is-revealed\s+\.swipe-action-content/);
  assert.match(island, /onFocus=\{\(\) => setRevealed\(true\)\}/, "键盘直接聚焦操作按钮时仍可揭示操作");
});

test("吃瓜详情以标题、宠物身份、正文和评论为主体", () => {
  assert.match(island, /function StoryFocus/);
  assert.match(island, /className="story-author"[\s\S]*?<AnimalAvatar/);
  assert.match(island, /className="story-focus-body"/);
  assert.doesNotMatch(island, /<StealthCue title="扒开草丛"/);
  assert.doesNotMatch(island, /className="peel-story"/);
  assert.doesNotMatch(island, /<PlaceScene spot=\{opened\.melon\.spot\}/);
  assert.match(css, /\.story-focus-body\{[^}]*background:/);
});

test("公开故事身份包含用户选择的动物，但不包含内部账号", () => {
  assert.match(migration, /'animal', p\.animal/);
  assert.match(migration, /revoke all on function public\.profile_public_identity\(uuid\) from public, anon, authenticated/i);
  assert.doesNotMatch(migration, /auth\.users|phone|user_id/i);
});
