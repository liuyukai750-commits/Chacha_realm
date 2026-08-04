# 猹猹岛 V0 质量验收

本目录只验证 `docs/PRODUCT_SPEC.md` 与 `docs/coordination/CONTRACTS.md` 已承诺的用户行为，不重新定义业务契约。功能尚未集成时，E2E 用例可以作为红灯验收门槛，但不得通过放宽断言、扩大 mock 或禁用规则制造“通过”。

## 目录

- `acceptance/V0_ACCEPTANCE.md`：可追踪的验收清单与风险说明。
- `e2e/fixtures/`：只模拟共享 HTTP 契约，不模拟组件内部状态。
- `e2e/v0-core.spec.mjs`：定位、吃瓜、蹲瓜、埋瓜、评论和瓜田主流程。
- `e2e/v0-accessibility.spec.mjs`：视口、键盘、焦点、动态反馈与 reduced motion。

## 语义化选择器约定

测试优先使用 `getByRole`、`getByLabel`、`getByText` 和可见标题。功能实现需要提供下列可访问语义：

| 场景 | 约定 |
|---|---|
| 页面结构 | 每页一个明确的 `main`；页面标题使用唯一的一级标题。 |
| 定位 | 触发按钮可访问名称为“开启定位”或“重新定位”；拒绝后说明使用 `role="status"`。 |
| 瓜卡片 | 每颗瓜使用 `article`，以瓜标题作为 accessible name；卡片内操作是有名称的 `button` 或 `link`。 |
| 吃瓜 | 打开动作名称为“打开这颗瓜”；完成动作名称为“完成吃瓜”，不足 5 秒时原生 `disabled`。 |
| 蹲瓜 | 状态按钮名称在“蹲瓜”和“取消蹲瓜”之间切换，并用 `aria-pressed` 表示当前状态。 |
| 埋瓜 | 表单使用可见 `label`；提交按钮名称为“埋下这颗瓜”；距离失败使用 `role="alert"`。 |
| 评论 | 输入框标签为“评论内容”，原生 `maxlength="140"`；提交按钮名称为“发表评论”。 |
| 他人瓜田 | 作者入口名称为“查看 {alias} 的瓜田”；瓜田页一级标题包含该 alias。 |
| 浮层 | 使用 `role="dialog"`、唯一名称、焦点圈定；关闭后焦点返回触发器。 |
| 异步反馈 | 成功使用 `role="status"`，失败使用 `role="alert"`；不只依赖颜色或动画。 |

仅在没有合适原生语义的视觉状态使用 `data-testid`：`radar-surface` 和 `field-stage`。二者仍需提供描述当前状态的 `aria-label`。不得为普通按钮、表单或标题新增 test id。

## 执行前提

根依赖尚未包含 Playwright。总控加入 `@playwright/test` 并安装 Chromium 后，可执行：

```powershell
npx playwright test
```

默认配置构建生产包，再以短生命周期 `next start` 运行；不会启动常驻 dev server。设置 `PLAYWRIGHT_BASE_URL` 时复用外部服务，不启动本地服务。
