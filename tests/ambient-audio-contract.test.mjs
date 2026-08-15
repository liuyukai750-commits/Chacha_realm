import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";

const component = readFileSync(new URL("../src/components/ambient-audio/ambient-audio.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../src/app/page.tsx", import.meta.url), "utf8");
const audioAsset = new URL("../public/audio/chacha-street-sneaky-blues.mp3", import.meta.url);

test("背景音乐不抢首屏流量，并由原生 audio 循环播放", () => {
  assert.match(component, /preload="none"/);
  assert.match(component, /\bloop\b/);
  assert.match(component, /type="audio\/mpeg"/);
  assert.match(component, /chacha-street-sneaky-blues\.mp3/);
  assert.match(page, /<AmbientAudio\s*\/>/);
  assert.match(page, /<AuthGate required>\{app\}<\/AuthGate>/, "登录闸门应包住音乐，登录页不显示音乐按钮");
  assert.ok(statSync(audioAsset).size < 350_000, "上线音频应控制在 350KB 内");
});

test("背景音乐需要用户手势，并记住偏好和处理页面隐藏", () => {
  assert.match(component, /localStorage\.setItem/);
  assert.match(component, /data-ambient-audio-control/);
  assert.match(component, /addEventListener\("pointerdown"/);
  assert.match(component, /visibilitychange/);
  assert.match(component, /document\.hidden/);
  assert.match(component, /audio\.pause\(\)/);
});
