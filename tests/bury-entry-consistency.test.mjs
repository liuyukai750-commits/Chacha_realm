import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const component = await readFile(new URL("../src/components/chacha-island.tsx", import.meta.url), "utf8");
const css = await readFile(new URL("../src/app/globals.css", import.meta.url), "utf8");
const migrationDirectory = new URL("../supabase/migrations/", import.meta.url);
const migrationNames = (await readdir(migrationDirectory)).filter((name) => name.endsWith(".sql")).sort();
const migrations = await Promise.all(migrationNames.map((name) => readFile(new URL(name, migrationDirectory), "utf8")));

test("主界面和瓜田入口都进入同一套发布流程", () => {
  assert.match(component, /onBury=\{\(\) => setShowBury\(true\)\}/);
  assert.match(component, /className="bury-button" onClick=\{\(\) => setShowBury\(true\)\}/);
  assert.equal((component.match(/<BurySheetV1/g) ?? []).length, 1, "只能保留一个发布表单实现");
});

test("发布成功反馈固定在当前手机视口并重试刷新瓜田", () => {
  assert.match(component, /refreshOwnFieldAfterCreate\(islandAdapter\)/);
  assert.match(component, /const delays = \[0, 600, 1_800\]/);
  const successPanel = css.slice(css.indexOf(".bury-success-panel{"), css.indexOf(".bury-success-panel strong"));
  assert.match(successPanel, /position:fixed/);
  assert.match(successPanel, /bottom:calc\(100px \+ env\(safe-area-inset-bottom\)\)/);
});

test("安全复核中的瓜只对瓜主瓜田可见，不会被静默丢失", () => {
  const joined = migrations.join("\n");
  const definitions = [...joined.matchAll(/create or replace function public\.field_view_for_profile\([^]*?\n\$\$;/gi)];
  assert.ok(definitions.length > 0);
  const substantive = definitions.map((match) => match[0]).reverse().find((body) => /m\.status\s*=\s*'held'/i.test(body));
  assert.ok(substantive, "瓜田视图实现必须保留 held 瓜主分支；身份包装函数不能掩盖该实现");
  assert.match(substantive, /p_include_private\s+and\s+m\.status\s*=\s*'held'/i);
  assert.match(component, /安全复核中 · 只有你能看到原文/);
});

test("安全复核触发器使用 Supabase extensions schema，不会回滚埋瓜", () => {
  const moderationMigration = migrations[migrationNames.indexOf("202608110004_moderation_digest_schema.sql")];
  assert.ok(moderationMigration, "必须保留内容复核 digest schema 修复迁移");
  assert.match(moderationMigration, /extensions\.digest\(new\.title/i);
  assert.match(moderationMigration, /extensions\.digest\(new\.content/i);
  assert.doesNotMatch(moderationMigration, /(?<!extensions\.)digest\(/i);
});
