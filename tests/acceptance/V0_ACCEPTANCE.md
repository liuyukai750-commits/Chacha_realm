# 猹猹王国 V0 验收清单

状态说明：`E2E` 表示已有自动化场景，`Manual` 表示仍需真实设备或人工辅助技术验证，`Blocked` 表示等待 V0 功能集成。每个条目都应在发布候选版本上重新执行。

| ID | 状态 | 验收结果 |
|---|---|---|
| VIEW-375 | E2E / Blocked | 375×812 下无横向溢出，主操作未被底部导航或安全区遮挡，点击目标可用。 |
| VIEW-430 | E2E / Blocked | 430×932 下无横向溢出，弹层完整可滚动，关闭和提交操作可达。 |
| VIEW-DESKTOP | E2E / Blocked | 1440×900 下内容保持清晰层级，不把移动端底栏拉伸为遮挡内容的宽条。 |
| GEO-ALLOW | E2E / Blocked | 授权定位后发现请求携带当次 `LocationProof`，显示附近结果；精确经纬度不出现在页面或持久化存储。 |
| GEO-DENY | E2E / Blocked | 拒绝定位后显示真实说明；仍可浏览和蹲瓜，埋瓜入口说明需要位置权限，不出现点击无响应。 |
| READ-FIRST | E2E / Blocked | 首次有效吃完后读者获得 1 粒瓜籽，完成次数增加，成功反馈可被辅助技术感知。 |
| READ-5S | E2E / Blocked | 打开成熟瓜不足 5 秒不能完成；满 5 秒后才允许提交完成凭证。 |
| READ-REPEAT | E2E / Blocked | 同一用户重复完成同一颗瓜不再获得瓜籽，界面展示服务端返回的未计数结果。 |
| SQUAT | E2E / Blocked | 可蹲瓜并可取消；状态、`aria-pressed` 与服务端结果一致，失败时恢复原状态。 |
| PLANT-DISTANCE | E2E / Blocked | 与公共地点距离超过 500 米时埋瓜失败，保留输入并显示可恢复的距离错误。 |
| COMMENT-140 | E2E / Blocked | 0 字不能提交，140 字可以提交，141 字不能进入请求；计数与错误不只靠颜色表达。 |
| FIELD-OTHER | E2E / Blocked | 可从瓜作者进入他人瓜田；显示公开 alias、成长阶段和公开瓜，不显示埋瓜入口、精确位置或内部 user id。 |
| MOTION-REDUCE | E2E / Blocked | `prefers-reduced-motion: reduce` 下非必要动画和位移过渡被移除或近乎瞬时，流程反馈仍可见。 |
| A11Y-KEYBOARD | E2E / Blocked | 仅键盘可完成定位后浏览、打开/关闭瓜、蹲瓜、评论；焦点顺序与返回点可预测。 |
| A11Y-NAME | E2E / Blocked | 页面、地标、表单控件、对话框和图标按钮有唯一可访问名称；无重复 id。 |
| A11Y-SR | Manual / Blocked | 使用 NVDA + Chrome 验证定位拒绝、5 秒解锁、首次奖励、重复不奖励和距离失败的播报。 |
| A11Y-DEVICE | Manual / Blocked | 在至少一台 375px 级 iOS/Android 真机验证触摸目标、安全区、软键盘和弹层滚动。 |

## 发布阻断条件

- 任一核心循环用例（`GEO-*`、`READ-*`、`SQUAT`、`PLANT-DISTANCE`、`COMMENT-140`）失败。
- 页面或存储泄露精确坐标、内部 user id、凭证或 service role 信息。
- 拒绝权限、网络失败或不支持能力时出现无反馈操作。
- 375/430 视口无法到达主操作，或 reduced motion 仍有持续性非必要动画。

## 当前基线差异

2026-08-04 的旧版原型尚未接入共享 API，且评论输入为 160 字、吃瓜无 5 秒门槛、没有定位允许/拒绝、蹲瓜、距离校验或他人瓜田流程。因此自动化用例在 V0 功能合并前按 `Blocked` 管理，集成时不得把这些差异改写为预期行为。
