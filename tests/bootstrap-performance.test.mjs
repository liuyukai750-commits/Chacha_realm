import assert from "node:assert/strict";
import { stat } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = async (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("首屏只请求一个聚合 bootstrap，避免浏览器五接口瀑布", async () => {
  const adapter = await source("src/components/http-island-adapter.ts");
  const bootstrapBody = adapter.slice(adapter.indexOf("async bootstrap"), adapter.indexOf("discover(request)"));
  assert.match(bootstrapBody, /requestJson<IslandBootstrap>\("\/api\/bootstrap"/);
  assert.doesNotMatch(bootstrapBody, /session\/anonymous|\/api\/cities|\/api\/fields\/me|\/api\/squats|\/api\/discovery/);
});

test("聚合 bootstrap 只建立一次匿名会话，并在服务端并行瓜田与蹲瓜读取", async () => {
  const route = await source("src/app/api/bootstrap/route.ts");
  assert.equal(route.match(/createOrResumeAnonymousSessionBundle/g)?.length, 2, "应只有 import 与单次调用");
  assert.match(route, /requireSameOrigin\(request\)/);
  assert.match(route, /const fieldPromise = timed\("field"/);
  assert.match(route, /const squatsPromise = timed\("squats"/);
  assert.match(route, /Promise\.all\(\[\s*citiesPromise,\s*discoveryPromise,\s*fieldPromise,\s*squatsPromise/);
  assert.match(route, /"Server-Timing"/);
  assert.match(route, /"Cache-Control": "private, no-store"/);
});

test("城市目录只做短缓存，用户与定位数据不进入缓存键", async () => {
  const repository = await source("src/server/repositories/island-repository.ts");
  assert.match(repository, /unstable_cache\(fetchCities, \["chacha-city-catalog-v1"\]/);
  assert.match(repository, /revalidate: 60/);
  assert.doesNotMatch(repository, /unstable_cache\((?:discover|getField|getSquatShelf)/);
});

test("首屏场景和瓜田 WebP 资源单张不超过 250KB", async () => {
  const assets = [
    "beijing-temple-of-heaven-day-v1.webp", "beijing-temple-of-heaven-night-v1.webp",
    "changsha-wuyi-day.webp", "changsha-wuyi-night.webp",
    "guangzhou-canton-tower-day-v1.webp", "guangzhou-canton-tower-night-v1.webp",
    "melon-field-empty-day-v2.webp", "melon-field-empty-night-v2.webp",
    "nearby-neighborhood-day-v1.webp", "nearby-neighborhood-night-v1.webp",
    "shanghai-oriental-pearl-day-v1.webp", "shanghai-oriental-pearl-night-v1.webp",
    "shenzhen-bay-day-v1.webp", "shenzhen-bay-night-v1.webp",
  ];
  for (const asset of assets) {
    const info = await stat(new URL(`../public/scenes/${asset}`, import.meta.url));
    assert.ok(info.size <= 250_000, `${asset} 仍有 ${info.size} bytes`);
  }
});
