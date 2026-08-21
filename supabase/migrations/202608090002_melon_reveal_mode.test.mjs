import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync(new URL("./202608090002_melon_reveal_mode.sql", import.meta.url), "utf8");

test("adds a legacy-compatible reveal mode and returns it in public previews", () => {
  assert.match(sql, /reveal_mode in \('open', 'seek_locked'\)/i);
  assert.match(sql, /'revealMode', m\.reveal_mode/i);
  assert.match(sql, /set reveal_mode = 'open'/i);
});

test("removes direct client detail access and exposes only the actor-bound service RPC", () => {
  assert.match(sql, /revoke all on function public\.get_melon_detail\(uuid\) from public, anon, authenticated/i);
  assert.match(sql, /service_role_required/i);
  assert.match(sql, /grant execute on function public\.get_melon_detail_for_actor\(uuid, uuid\) to service_role/i);
});

test("keeps the create parameter compatible while normalizing new melons to open", () => {
  assert.match(sql, /p_reveal_mode text/i);
  assert.match(sql, /invalid_reveal_mode/i);
  assert.match(sql, /revoke all on function public\.create_melon\(uuid, public\.safe_topic, text, text\) from public, anon, authenticated/i);
});
