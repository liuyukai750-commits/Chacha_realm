import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const island = readFileSync(new URL("../src/components/chacha-island.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/202608150006_public_animal_identity.sql", import.meta.url), "utf8");
const discoveryIdentityMigration = readFileSync(new URL("../supabase/migrations/202608150007_discovery_author_identity.sql", import.meta.url), "utf8");

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

test("五城共用的瓜篮预览直接携带公开动物与昵称", () => {
  assert.match(island, /className="basket-author-avatar"[\s\S]*?<AnimalAvatar/);
  assert.match(island, /className="basket-author-name"/);
  assert.doesNotMatch(island, /蹲后续不会打扰它成熟/);
  assert.match(discoveryIdentityMigration, /get_discovery_candidates_for_visitor_v2/i);
  assert.match(discoveryIdentityMigration, /profile_public_identity\(m\.author_id\)/i);
  assert.match(discoveryIdentityMigration, /-\s*'publicId'/i, "发现列表不需要公开猹号");
  assert.doesNotMatch(discoveryIdentityMigration, /auth\.users|phone|latitude[^\n]*jsonb_build_object|longitude[^\n]*jsonb_build_object/i);
});
