# 固定 Preview 发布流程

本项目的测试发布只使用 `codex/preview` 分支。`main`、正式域名和 Vercel Production 不参与日常验收。

## 一次发布的固定顺序

1. 在功能分支完成修改，不 Push。
2. 合并或切换到 `codex/preview`。
3. 确认已连接的是测试 Supabase，应用待迁移后运行 `npm run qa:smoke`。
4. 查看 `tests/.artifacts/release-smoke-screenshots/` 中的四张截图：街区首页、可提交埋瓜、埋瓜成功、我的瓜田。
5. 按 `PREVIEW_FEEDBACK_TEMPLATE.md` 记录结果。
6. 只有 smoke 全绿、截图无明显问题、反馈清单没有 P0/P1 时才允许 Push。
7. Push 后只创建 Vercel Preview；禁止 `vercel --prod`、`vercel promote`，禁止修改 `chacharealm.cn`。

## 本地启用 Push 门禁

```bash
npm run preview:setup
```

`.githooks/pre-push` 会拒绝从 `codex/preview` 以外的分支推送，并在真正 Push 前再次运行 `npm run qa:smoke`。Supabase 未登录、迁移不齐、类型错误、Lint 错误、构建失败或核心 WebKit 流程失败，都会阻止 Push。

## 快速验收命令

```bash
npm run qa:smoke
```

该命令覆盖：

- 埋瓜奖励、五城和音乐静态契约；
- 已连接测试 Supabase 的本地/远端迁移齐平；
- 关键代码 Lint 与 TypeScript；
- Next.js production build；
- 390px WebKit 能力模拟下的音乐恢复、附近埋瓜、真籽到账和瓜田显示；
- 四张关键页面截图。

WebKit 视口是能力模拟，不冒充真实 iPhone。Preview 推送后仍需在真实手机完成最终确认。
