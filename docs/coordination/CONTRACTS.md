# 猹猹街 V1 共享契约

此文件和 `src/contracts/index.ts` 是跨任务接口真源，仅由总控修改。工作任务不得自行改变字段含义。

## 发现顺序

`same_district -> same_city -> remote_city`。客户端只接收 `DistanceBand`，不接收其他用户或瓜的精确坐标。

普通发现只返回发布未满 48 小时的瓜。每个公共地点最多返回按 `createdAt` 倒序排列的最新 25 颗；开启定位后，当前位置 1 公里内的附近生活圈瓜合计最多返回最新 25 颗。该窗口不删除瓜，也不限制已蹲用户的蹲瓜篮或瓜主自己的瓜田。

## HTTP 接口

| 接口 | 输入 | 输出 |
|---|---|---|
| `POST /api/session/anonymous` | 无 | `AnonymousSession` |
| `GET /api/cities` | 无 | `CitySummary[]` |
| `POST /api/discovery` | `DiscoveryRequest` | `DiscoveryResponse` |
| `POST /api/melons` | `CreateMelonRequest` | `CreateMelonResult` |
| `GET /api/melons/:id` | melon id | `OpenedMelon`，含短时阅读凭证 |
| `POST /api/melons/:id/complete` | `CompleteReadRequest` | `CompleteReadResult` |
| `POST /api/melons/:id/squat` | `{ active: boolean }` | `{ active: boolean }` |
| `GET /api/squats` | 无 | `SquatShelf`，按未读成熟、已成熟、孵化中排序 |
| `POST /api/squats/:id/seen` | melon id | `{ seen: true }` |
| `POST /api/melons/:id/reactions` | `{ reaction: ReactionType }` | 反应计数 |
| `POST /api/melons/:id/comments` | `CreateCommentRequest` | `MelonComment` |
| `GET /api/melons/:id/comments?cursor=&limit=20` | melon id、可选游标 | `MelonCommentsPage` |
| `POST /api/presence/verify` | `VerifyZonePresenceRequest` | `ZonePresenceResult` |
| `GET /api/fields/me` | 无 | `FieldView` |
| `GET /api/fields/:alias` | alias | `FieldView` |
| `POST /api/fields/me/plant` | `{ plotIndex: 0 \| 1 \| 2, operationId: UUID }` | `PlantFieldResult`；同一 operationId 重试返回首次结果 |
| `POST /api/fields/me/harvest` | 无 | `HarvestFieldResult` |
| `POST /api/reports` | `CreateReportRequest` | `{ accepted: true }` |

所有时间使用 ISO 8601 字符串。所有错误返回 `{ error: { code, message } }`。动态路由在 Next.js 16 中必须 await `params`。

## V1 瓜籽与瓜田不变量

- `SeedWallet` 只含小瓜籽与真瓜籽；小瓜籽范围恒为 `0..4`，第 5 次当日有效吃瓜在同一事务中自动换成 1 颗真瓜籽。
- 每日边界统一使用 `Asia/Shanghai`。每天第一颗进入 `incubating` 的安全原创瓜奖励 1 颗真瓜籽；`held` 与失败请求不奖励。
- 瓜田固定 3 片地，每片 3 个活动位。游戏瓜不关联帖子，服务端以 `plantedAt / maturesAt` 判定 12 小时成长。
- 九瓜全部成熟才允许一次性收获；收获归档本批九瓜并恰好增加 9 XP。
- 每位不同读者第一次有效吃完一颗瓜，为作者增加 1 XP；自读、重复与无效阅读不增加。
- `GET /api/fields/:alias` 不返回钱包、经验、精确种植/成熟时间或操作权限；只有 `GET /api/fields/me` 返回 `OwnFieldView`。

评论写入必须携带仍有效的位置凭证。凭证绑定登录会话与具体瓜，默认 15 分钟过期，不包含原始经纬度。公区瓜对所属城市全域开放读、吃、轻反应和蹲瓜，距离公共地点中心 1 公里内才可评论；附近瓜只有距离其私有固定锚点 1 公里内才可发现、打开、读取评论和发表评论。

蹲瓜提醒 V1 只提供站内成熟提醒：服务端按数据库时间即时计算瓜是否成熟；用户回到页面、重新聚焦或打开“听瓜”时刷新。已经成熟后才蹲的瓜视为已知状态，不制造未读。`SquatAlertKind` 预留 `follow_up`，但在作者追加后续能力上线前服务端只产生 `mature`，不得伪造系统推送或后续事件。

## 隐私不变量

- 当前定位只允许存在于位置相关请求生命周期；不得保存用户移动轨迹。
- 附近瓜仅保存发布瞬间的单个固定坐标，且只能存在于 RLS 默认拒绝、仅 service role 可访问的私有锚点表。该坐标不得进入公开 DTO、普通日志或客户端存储。
- 公开对象使用 alias，不返回 Supabase user id。
- 完成阅读由服务端签发的短时凭证验证；同一用户和瓜只计一次。
- service role key 只能进入服务端环境。

## 所有权

- 总控：`docs/coordination/**`、`src/contracts/**`、根级配置和 lockfile。
- 游戏循环：`src/domain/**`。
- 数据安全：`supabase/**`、`src/server/**`、`src/app/api/**`。
- 趣味界面：除 `src/app/api/**` 外的 `src/app/**`、`src/components/**`、`public/**`。
- 地理发现：`src/features/discovery/**`、`src/lib/geo/**`、`src/data/**`。
- 质量验收：`tests/**` 及测试专用配置；依赖修改向总控申请。
