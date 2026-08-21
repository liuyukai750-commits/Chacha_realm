import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const target = await readFile(new URL("../deploy/postgres/standard-postgres-target.sql", import.meta.url), "utf8");
const patch = await readFile(new URL("../deploy/postgres/20260820_registration_profile_trigger.sql", import.meta.url), "utf8");

for (const [name, sql] of [["target bootstrap", target], ["live patch", patch]]) {
  test(`${name} recreates the profile trigger on the compatibility auth.users table`, () => {
    assert.match(sql, /drop trigger if exists on_auth_user_created on auth\.users/i);
    assert.match(sql, /create trigger on_auth_user_created[\s\S]*after insert on auth\.users[\s\S]*public\.handle_new_anonymous_user\(\)/i);
  });
}
