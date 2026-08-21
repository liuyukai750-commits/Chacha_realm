import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const target = await readFile(new URL("../deploy/postgres/standard-postgres-target.sql", import.meta.url), "utf8");
const patch = await readFile(new URL("../deploy/postgres/20260820_burial_service_compat.sql", import.meta.url), "utf8");

for (const [name, sql] of [["target bootstrap", target], ["live patch", patch]]) {
  test(`${name} removes legacy JWT guards from the current burial call chain`, () => {
    assert.match(sql, /create_melon_v3\(uuid,uuid,text,text,uuid,double precision,double precision,public\.safe_topic,text,text,text\)/i);
    assert.match(sql, /create_melon_v4\(uuid,uuid,text,text,uuid,double precision,double precision,public\.safe_topic,text,text,text\)/i);
    assert.match(sql, /regexp_replace\([\s\S]*legacy_jwt_guard/i);
    assert.match(sql, /grant execute on function public\.create_melon_v4[\s\S]*to [^;]*chacha_app/i);
    assert.doesNotMatch(sql, /alter role[\s\S]*request\.jwt\.claims/i);
  });
}
