# 猹猹王国 V0 验收清单

状态说明：`E2E / Passed` 表示本地自动化已通过，`Manual / Pending` 表示仍需真实设备或人工辅助技术验证。每个条目都应在发布候选版本上重新执行。

| ID | 状态 | 验收结果 |
|---|---|---|
| VIEW-375 | E2E / Passed | 375×812 下无横向溢出，主操作未被底部导航或安全区遮挡，点击目标可用。 |
| VIEW-430 | E2E / Passed | 430×932 下无横向溢出，弹层完整可滚动，关闭和提交操作可达。 |
| VIEW-DESKTOP | E2E / Passed | 1440×900 下内容保持清晰层级，不把移动端底栏拉伸为遮挡内容的宽条。 |
| GEO-ALLOW | E2E / Passed | 授权定位后发现请求携带当次 `LocationProof`，显示附近结果；精确经纬度不出现在页面或持久化存储。 |
| GEO-DENY | E2E / Passed | 拒绝定位后显示真实说明；仍可浏览和蹲瓜，埋瓜入口说明需要位置权限，不出现点击无响应。 |
| READ-FIRST | E2E / Passed | 首次有效吃完后读者获得 1 粒瓜籽，完成次数增加，成功反馈可被辅助技术感知。 |
| READ-5S | E2E / Passed | 打开成熟瓜不足 5 秒不能完成；满 5 秒后才允许提交完成凭证。 |
| READ-REPEAT | E2E / Passed | 同一用户重复完成同一颗瓜不再获得瓜籽，界面展示服务端返回的未计数结果。 |
| SQUAT | E2E / Passed | 可蹲瓜并可取消；状态、`aria-pressed` 与服务端结果一致，失败时恢复原状态。 |
| PLANT-DISTANCE | E2E / Passed | 与公共地点距离超过 500 米时埋瓜失败，保留输入并显示可恢复的距离错误。 |
| COMMENT-140 | E2E / Passed | 0 字不能提交，140 字可以提交，141 字不能进入请求；计数与错误不只靠颜色表达。 |
| FIELD-OTHER | E2E / Passed | 可从瓜作者进入他人瓜田；显示公开 alias、成长阶段和公开瓜，不显示埋瓜入口、精确位置或内部 user id。 |
| MOTION-REDUCE | E2E / Passed | `prefers-reduced-motion: reduce` 下非必要动画和位移过渡被移除或近乎瞬时，流程反馈仍可见。 |
| A11Y-KEYBOARD | E2E / Passed | 仅键盘可完成定位后浏览、打开/关闭瓜、蹲瓜、评论；焦点顺序与返回点可预测。 |
| A11Y-NAME | E2E / Passed | 页面、地标、表单控件、对话框和图标按钮有唯一可访问名称；无重复 id。 |
| PLACE-SCENE | E2E / Passed | 地点微缩场景贯穿发现、吃瓜和埋瓜，并明确说明不是实景地图。 |
| PLACE-PRIVACY | E2E / Passed | 公司、医院和酒店类场景不展示具体机构名称。 |
| PLACE-NIGHT | E2E / Passed | 夜间保留场景轮廓和亮窗，核心操作仍然可达。 |
| A11Y-SR | Manual / Pending | 使用 NVDA + Chrome 验证定位拒绝、5 秒解锁、首次奖励、重复不奖励和距离失败的播报。 |
| A11Y-DEVICE | Manual / Pending | 在至少一台 375px 级 iOS/Android 真机验证触摸目标、安全区、软键盘和弹层滚动。 |

## 发布阻断条件

- 任一核心循环用例（`GEO-*`、`READ-*`、`SQUAT`、`PLANT-DISTANCE`、`COMMENT-140`）失败。
- 页面或存储泄露精确坐标、内部 user id、凭证或 service role 信息。
- 拒绝权限、网络失败或不支持能力时出现无反馈操作。
- 375/430 视口无法到达主操作，或 reduced motion 仍有持续性非必要动画。

## 当前验证边界

自动化使用模拟 HTTP 契约验证本地候选版，不能代替真实 Supabase、真实定位、NVDA 或手机真机验收。
