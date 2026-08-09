# 猹猹王国 V0 共享契约

此文件和 `src/contracts/index.ts` 是跨任务接口真源，仅由总控修改。工作任务不得自行改变字段含义。

## 发现顺序

`same_district -> same_city -> remote_city`。客户端只接收 `DistanceBand`，不接收其他用户或瓜的精确坐标。

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
| `POST /api/melons/:id/reactions` | `{ reaction: ReactionType }` | 反应计数 |
| `POST /api/melons/:id/comments` | `{ content: string }` | `MelonComment` |
| `GET /api/fields/me` | 无 | `FieldView` |
| `GET /api/fields/:alias` | alias | `FieldView` |
| `POST /api/reports` | `CreateReportRequest` | `{ accepted: true }` |

所有时间使用 ISO 8601 字符串。所有错误返回 `{ error: { code, message } }`。动态路由在 Next.js 16 中必须 await `params`。

## 隐私不变量

- 精确位置只允许存在于 `/api/discovery` 和 `/api/melons` 的请求生命周期。
- 数据库只保存公共地点坐标，不保存用户移动轨迹。
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
