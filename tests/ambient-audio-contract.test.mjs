import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";

const component = readFileSync(new URL("../src/components/ambient-audio/ambient-audio.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../src/app/page.tsx", import.meta.url), "utf8");
const island = readFileSync(new URL("../src/components/chacha-island.tsx", import.meta.url), "utf8");
const audioAsset = new URL("../public/audio/chacha-street-sneaky-blues.mp3", import.meta.url);

test("背景音乐不抢首屏流量，并由原生 audio 循环播放", () => {
  assert.match(component, /preload="none"/);
  assert.match(component, /\bloop\b/);
  assert.match(component, /type="audio\/mpeg"/);
  assert.match(component, /chacha-street-sneaky-blues\.mp3/);
  assert.match(island, /className="topbar-actions"[\s\S]*?<button className="city-switch"[\s\S]*?<AmbientAudio\s*\/>/);
  assert.doesNotMatch(page, /<AmbientAudio\s*\/>/, "音乐控件应属于登录后的街区头部，而不是页面级悬浮层");
  assert.match(page, /<AuthGate required>\{app\}<\/AuthGate>/, "登录闸门应包住街区，登录页不显示音乐按钮");
  assert.ok(statSync(audioAsset).size < 350_000, "上线音频应控制在 350KB 内");
});

test("背景音乐默认开启，受浏览器限制时等待手势，并记住关闭偏好", () => {
  assert.match(component, /=== "off" \? "off" : "on"/);
  assert.match(component, /void play\(false\)/);
  assert.match(component, /localStorage\.setItem/);
  assert.match(component, /data-ambient-audio-control/);
  assert.match(component, /addEventListener\("pointerdown"/);
  assert.match(component, /visibilitychange/);
  assert.match(component, /document\.hidden/);
  assert.match(component, /audio\.pause\(\)/);
});
