# 猹猹街 V1 瓜田闭环验收清单

状态说明：`Automated` 表示可由当前测试套件验证；`Integration` 需要真实 Supabase；`Manual` 需要真机或辅助技术人工检查。

| ID | 层级 | 验收结果 |
|---|---|---|
| FIELD-EMPTY | Automated | 新账号显示三片空地、0/9、小籽 0、真籽 0、XP 0。 |
| READ-1-4 | Automated | 每日前 1—4 次有效吃完只增加小瓜籽。 |
| READ-5 | Automated | 第 5 颗小籽在同一结果中变为小籽 0、真籽 +1。 |
| READ-6 | Automated | 第 6 次仍计有效阅读和作者 XP，但读者不再获得籽。 |
| READ-IDEMPOTENT | Automated + Integration | 自读、重复、并发重放不发资源；每位不同读者首次有效吃完只给作者 1 XP。 |
| READ-CHINA-DAY | Automated + Integration | 每日上限只按 `Asia/Shanghai` 零点重置。 |
| SHARE-FIRST | Automated + Integration | 每日首颗进入孵化的安全原创瓜奖励 1 真籽；后续、held、失败和幂等重放不奖励。 |
| FIELD-PLANT | Automated + Integration | 选择整片土地并确认后，服务端占用下一空位且恰好扣 1 真籽。 |
| FIELD-CAPACITY | Automated + Integration | 三片地各最多 3 个，总数最多 9 个；满地不扣籽，不出现第 10 个瓜。 |
| FIELD-12H | Automated + Integration | 11:59:59.999 仍未成熟，满 12 小时由服务端时间判定成熟。 |
| FIELD-HARVEST | Automated + Integration | 9 个瓜全部成熟才可收；并发只成功一次，清空土地并恰好 +9 XP。 |
| FIELD-OTHER | Automated | 他人田只展示公开土地、游戏瓜和帖子，不返回或展示钱包、XP、播种、收获。 |
| FIELD-VIEWPORT | Automated | 375px、430px 和桌面三片土地完整可见，至少 44px，不被底部导航遮挡。 |
| FIELD-MOTION | Automated + Manual | reduced motion 改为短淡入/数字播报；真机触感缺失不影响流程。 |
| FIELD-DAY-NIGHT | Automated + Manual | 昼夜场景都保留三片地热区，状态精灵与热区不漂移。 |

## 发布阻断条件

- 任何路径可能多发真籽、重复加 XP、扣籽不落植物或出现第 10 个瓜。
- 成熟状态依赖浏览器倒计时而非服务端时间。
- 公开瓜田响应包含钱包、经验或本人操作权限。
- 375px、430px 任一土地触控区小于 44px，或被底部导航遮挡。
- 无真籽、满地、未全熟、网络失败时出现点击无反馈。

## 当前验证边界

E2E 使用 HTTP fixture 验证界面与契约；migration 静态测试验证事务结构，但不能替代真实 Supabase 上的并发事务、RLS 和北京时间跨日集成测试。iOS、Android、鸿蒙与屏幕阅读器仍需上线前真机验收。
