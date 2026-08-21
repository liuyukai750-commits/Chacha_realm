import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const repository = await readFile(new URL("../src/server/repositories/island-repository.ts", import.meta.url), "utf8");
const component = await readFile(new URL("../src/components/chacha-island.tsx", import.meta.url), "utf8");
const css = await readFile(new URL("../src/app/globals.css", import.meta.url), "utf8");

test("公共地点发布复用安全定义的城市目录，不被 PostgreSQL RLS 误判为 invalid_spot", () => {
  const resolver = repository.slice(repository.indexOf("async function activePublicSpot"), repository.indexOf("const getCachedCities"));
  assert.match(resolver, /getCities\(\)/);
  assert.doesNotMatch(resolver, /selectRows/);
});

test("发布者统一称为作者，评论只使用珊瑚色作者徽章", () => {
  assert.doesNotMatch(component, /瓜主/);
  assert.match(component, /comment-owner-badge">作者</);
  assert.doesNotMatch(component, /className=\{item\.isOwner \? "is-owner-comment"/);
  assert.doesNotMatch(css, /\.comment-list article\.is-owner-comment/);
  assert.match(css, /\.comment-owner-badge[^}]*background:var\(--coral-dark\)/);
});
