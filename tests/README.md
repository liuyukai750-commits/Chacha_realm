# 猹猹街 V1 质量验收

本目录只验证 `docs/PRODUCT_SPEC.md` 与 `docs/coordination/CONTRACTS.md` 已承诺的用户行为，不重新定义业务契约。功能尚未集成时，E2E 用例可以作为红灯验收门槛，但不得通过放宽断言、扩大 mock 或禁用规则制造“通过”。

## 目录

- `acceptance/V0_ACCEPTANCE.md`：原有社区能力的回归清单。
- `acceptance/V1_FIELD_LOOP_ACCEPTANCE.md`：吃瓜—瓜籽—播种—收瓜闭环的可追踪清单。
- `e2e/fixtures/`：只模拟共享 HTTP 契约，不模拟组件内部状态。
- `e2e/v0-core.spec.mjs`：定位、吃瓜、蹲瓜、埋瓜、评论和瓜田主流程。
- `e2e/v0-accessibility.spec.mjs`：视口、地点场景、隐私模糊、昼夜、键盘、焦点、动态反馈与 reduced motion。
- `e2e/v0-zone-community.spec.mjs`：12 颗瓜承载、话题筛选、远程围观、现场评论凭证与移动能力降级。
- `e2e/v1-field-loop.spec.mjs`：三片土地、九个位置、播种确认、12 小时成长、收获与隐私。
- `v1-domain.test.mjs`：北京时间日界、5 籽合成、三片地容量和成熟边界。
- `v1-migration-contract.test.mjs`：数据库事务、幂等、RLS 和公开/私有瓜田契约。

标注为 `capability-simulation` 的 iOS Safari、Android Chrome、鸿蒙与软键盘场景，只在 Chromium 中模拟 `geolocation`、`vibrate` 和动态视口组合，用于验证应用降级逻辑；它们不等于真实浏览器引擎或真机验收。

## 语义化选择器约定

测试优先使用 `getByRole`、`getByLabel`、`getByText` 和可见标题。功能实现需要提供下列可访问语义：

| 场景 | 约定 |
|---|---|
| 页面结构 | 每页一个明确的 `main`；页面标题使用唯一的一级标题。 |
| 定位 | 触发控件的 accessible name 清楚表达“定位”或“距离校准”；拒绝后说明使用 `role="status"`。 |
| 雷达瓜点 | 交互元素使用有名称的 `button` 或 `link`，名称包含话题、公共地点和距离；`MelonPreview` 不要求提前提供标题。 |
| 吃瓜 | 详情打开后展示标题；完成控件表达“吃完/完成阅读/留下瓜籽”，不足 5 秒时原生 `disabled`。 |
| 蹲瓜 | 控件名称表达“蹲”，并通过 `aria-pressed` 或名称变化让辅助技术感知开启/取消状态。 |
| 埋瓜 | 文本字段使用可见 `label`；地点和话题可使用具名 select、radio 或按钮组选项；距离失败使用 `role="alert"`。 |
| 评论 | 输入框名称表达评论用途并使用原生 `maxlength="140"`；空内容时提交控件原生 `disabled`。 |
| 他人瓜田 | 作者入口的 accessible name 包含公开 alias；瓜田视图展示 alias，并隔离仅属于本人瓜田的编辑操作。 |
| 浮层 | 使用 `role="dialog"`、唯一名称、焦点圈定；关闭后焦点返回触发器。 |
| 异步反馈 | 成功使用 `role="status"`，失败使用 `role="alert"`；不只依赖颜色或动画。 |

视觉状态优先使用可见文字、`aria-label` 或原生状态，不强制 `data-testid`。不得为了测试把按钮组改造成特定控件，也不得把固定营销文案当成业务契约。

## 执行前提

项目已包含 `@playwright/test`。安装 Chromium 后可执行：

```powershell
npx playwright test
```

默认配置构建生产包，再以短生命周期 `next start` 运行；不会启动常驻 dev server。设置 `PLAYWRIGHT_BASE_URL` 时复用外部服务，不启动本地服务。
