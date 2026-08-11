# 猹猹街五城独立 QA 验收

基线：`a0fe8f4`（`origin/codex/chacha-street-release-wrap` 已对齐）。

范围：仅覆盖五城同步、双埋瓜、nearby 生活圈、成熟/孵化瓜、远程/现场评论与移动能力模拟；本轨道不修改业务实现，不提交、不推送、不部署。

## 结论

整体状态：`HOLD`。

阻断原因：

- `src/app/api/melons/route.ts` 的 nearby 埋瓜仍会在缺失/非法 `cityId` 时回退到 `"changsha"`，静态门禁失败。跨城发布不能允许暗跳长沙。
- 孵化瓜在 375px E2E 中只展示“旁观”，没有“蹲瓜/蹲后续”入口；“孵化瓜蹲守”验收失败。

## 已运行自动化

| 命令 | 结果 |
|---|---|
| `node --test tests\five-city-gate.test.mjs` | 4 项：3 PASS / 1 FAIL |
| `npx.cmd playwright test five-city-release.spec.mjs --config=tests\e2e\five-city-release.config.mjs --project=chromium-375` | 10 项：9 PASS / 1 FAIL |

注：`node --test` 与 Playwright worker 在沙箱内遇到 Windows `spawn EPERM`，已按审批提升权限重跑。Playwright 使用测试专用 3117 端口 build/start 当前 worktree，避免复用 3107 旧预览。

## PASS 项

- 五城公共点矩阵：长、北、上、广、深每城 5 个公共点，spotId 唯一。
- 五城切城表单：每城埋瓜表单展示本城 5 个公共点。
- 公共点埋瓜 payload：五城公共点发布携带 `burialKind: "public_spot"` 与本城 `spotId`，不携带 `cityId`。
- nearby 埋瓜 E2E：五城 nearby 发布携带当前 `cityId`，成功后发现请求仍使用当前城市。
- nearby 发现：五城 nearby 只展示 4 条本城 1km 生活圈瓜，不混入远方瓜或其他城市公共点；当前 cityId 未在 UI/E2E 中暗跳长沙。
- 定位拒绝、超时、HTTP 不支持：均展示明确失败，不发帖、不奖励。
- 低精度：服务端模拟拒绝后展示距离/公共地点错误，不奖励。
- 成熟瓜：成熟瓜提供“直接吃”，无“顺藤摸瓜”残留。
- 评论：远程围观无评论输入；本地评论必须先验证现场评论资格，并携带 presence 请求。
- 移动能力模拟：375、430、desktop 视口，昼夜切换、reduced motion、触摸目标、软键盘缩高均通过 Chromium 模拟检查。

## HOLD 证据

1. `nearby burial route must not silently fall back to changsha`

失败断言：

```text
assert.doesNotMatch(createRoute, /cityId\(body\.cityId\)\s*\?\?\s*"changsha"/)
```

实际命中：

```ts
历史发现：route 曾存在 Changsha fallback，集成树已移除
```

2. `READ-MODES：成熟瓜直接打开，孵化瓜只能蹲守，无顺藤摸瓜残留`

失败现象：孵化瓜 article 展示标题“正在孵化，2 小时 0 分 后成熟”，操作按钮为“旁观”，未提供“蹲瓜/蹲后续”。

证据路径：

```text
tests/.artifacts/five-city-release-results/five-city-release-成熟、孵化、评论-6e377-DES：成熟瓜直接打开，孵化瓜只能蹲守，无顺藤摸瓜残留-chromium-375/error-context.md
```

## 未验证

- iOS Safari、Android Chrome、鸿蒙系统浏览器真机定位权限、软键盘、触感反馈。
- 真实 Supabase：迁移执行、RLS、并发、真实 RPC、真实 HMAC 生活圈匹配。
- 真实线下到点距离与 5 城公共点现场可达性。
- NVDA/VoiceOver/TalkBack 屏幕阅读器实测。

## 独立判定

任何一城失败整项 HOLD；当前虽然五城 E2E 同步链路通过，但静态契约存在暗回长沙，且孵化瓜缺少蹲守入口，因此本轨道判定 `HOLD`，不可作为 release PASS。

## 集成复核更新

原 C 轨道发现的 cityId(body.cityId) fallback 已在集成树移除；孵化瓜可见入口已改为“蹲瓜/蹲后续”。最终 release 结论以本轮 tsc、lint、build、five-city gate、five-city-release 375/430/desktop 与关键社区/瓜田 E2E 的真实结果为准。

