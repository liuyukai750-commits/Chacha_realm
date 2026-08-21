import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync(new URL("./202608090001_presence_comments_moderation.sql", import.meta.url), "utf8");

test("public comments use stable newest-first pagination and exclude held rows", () => {
  assert.match(sql, /order by c\.created_at desc, c\.id desc/i);
  assert.match(sql, /\(c\.created_at, c\.id\) < \(p_cursor_created_at, p_cursor_id\)/i);
  assert.match(sql, /and not c\.held/i);
});
test("comment writes are privileged and independently bind actor, melon and spot", () => {
  assert.match(sql, /revoke all on function public\.add_melon_comment\(uuid, uuid, uuid, text\) from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.add_melon_comment\(uuid, uuid, uuid, text\) to service_role/i);
  assert.match(sql, /id = p_melon_id\s+and spot_id = p_spot_id/is);
  assert.match(sql, /account_status = 'banned'/i);
});

test("reports do not automatically ban accounts and moderation changes are audited", () => {
  assert.match(sql, /create table public\.account_moderation_actions/i);
  assert.match(sql, /create or replace function public\.set_profile_account_status/i);
  assert.match(sql, /no report count or report insert automatically changes account_status/i);
  assert.doesNotMatch(sql, /create trigger reports[^;]+set_profile_account_status/is);
});
