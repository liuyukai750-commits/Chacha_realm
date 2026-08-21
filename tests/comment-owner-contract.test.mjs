import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const route = await readFile(new URL("../src/app/api/melons/[id]/comments/route.ts", import.meta.url), "utf8");
const component = await readFile(new URL("../src/components/chacha-island.tsx", import.meta.url), "utf8");
const css = await readFile(new URL("../src/app/globals.css", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/202608200002_basket_titles_and_owner_comments.sql", import.meta.url), "utf8");

test("作者从自己的瓜详情留言时不需要现场凭证", () => {
  assert.match(route, /getMelonReadPolicy\(id, session\.userId\)/);
  assert.match(route, /if \(!policy\.isOwner\)[\s\S]*requirePresenceCredential/);
  assert.match(component, /function OwnerMelonReader[\s\S]*adapter\.comment\(opened\.melon\.id, comment\)/);
});

test("全部评论区统一使用作者标识，并保持平铺评论", () => {
  assert.match(component, /function CommentList/);
  assert.match(component, /comment-owner-badge/);
  assert.match(component, />作者</);
  assert.match(css, /\.comment-owner-badge/);
  assert.doesNotMatch(css, /\.comment-list article\.is-owner-comment/);
  assert.doesNotMatch(component, /parentCommentId|replyToCommentId/);
});

test("评论 RPC 明确返回评论者是否为作者", () => {
  assert.match(migration, /'isOwner',\s*c\.author_id\s*=\s*m\.author_id/i);
  assert.match(migration, /'isOwner',\s*p_actor_id\s*=\s*melon_author_id/i);
});
