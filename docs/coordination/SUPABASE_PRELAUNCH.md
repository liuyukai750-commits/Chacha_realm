# Supabase 发布前接入计划

更新时间：2026-08-10

本文档是首轮封闭内测的无密钥交接清单。真实 Supabase key、OTP 服务商密钥、OAuth client secret、数据库密码、Cookie、浏览器存储和用户数据不得发送到聊天，也不得提交进仓库。

## 1. 最小稳定身份方案

### 问题

当前 V1 代码使用 Supabase anonymous auth，并把 `chacha_at` / `chacha_rt` 存在 httpOnly cookie。这个方案适合低摩擦试玩，但不能作为稳定风控边界：用户清除浏览器数据后会获得新的匿名 Supabase 用户，从而绕过基于 `profiles.account_status` 的匿名封禁。

### 三种方案比较

| 方案 | 改动 | 抗封禁绕过能力 | 用户摩擦 | 运营风险 | 封闭内测适配度 |
|---|---|---:|---:|---:|---:|
| 邀请码 + 稳定账号 | 先校验邀请码，再把 profile 绑定到持久登录主体。 | 如果只绑定匿名账号则中；绑定手机/OAuth 后高。 | 低到中。 | 低，邀请码可撤销、可限量。 | 推荐作为默认闸门。 |
| 手机 OTP | 用户用短信验证码登录，封禁绑定手机号主体。 | 高，但换号仍可绕过。 | 中。 | 中到高，有短信成本、送达率和手机号隐私处理。 | 小规模本地内测最强。 |
| OAuth | 用户用 Apple/Google/微信等 provider 登录，封禁绑定 provider subject。 | 中到高，取决于 provider 账号成本。 | 低。 | 中，需要回调、真机和部分 provider 审核。 | 不收手机号时的次优选择。 |

### 推荐

首轮封闭内测推荐 **邀请码 + 稳定账号**。稳定账号 provider 优先选 **手机 OTP**，前提是内测用户接受手机号收集；如果产品希望降低隐私摩擦，则改用 **邀请码 + OAuth**。

前台身份继续匿名：界面只展示系统生成的 alias/animal，不展示手机号、邮箱、OAuth 昵称、头像或社交关系。不要采用“邀请码 + 纯 anonymous auth”作为封禁方案，因为被封用户清 cookie 后仍可消耗另一个邀请码回流。

### 对现有 schema/API 的最小改动

保留 `profiles.id = auth.users.id` 和 `profiles.account_status` 作为封禁执行点。

| 区域 | 最小新增 |
|---|---|
| Supabase Auth | 内测环境只开启一个稳定 provider：phone OTP 或 OAuth。稳定登录跑通后，再关闭开放 anonymous signup。 |
| 表 | 新增 `invite_codes(code_hash, status, max_redemptions, redeemed_count, expires_at, created_at)` 和 `invite_redemptions(invite_code_id, user_id, redeemed_at)`；邀请码只存 hash。 |
| Profiles | 可选新增 `signup_gate text default 'invite'`、`identity_provider text`、`stable_subject_hash text`。如果 Supabase Auth 已稳定保证 provider subject 唯一，`stable_subject_hash` 可后置。 |
| RLS/RPC | 新增 service-role RPC `redeem_invite(p_actor_id uuid, p_code text)`，或由 Next API 在服务端校验邀请码；继续禁止 anon/authenticated 直接写受保护表。 |
| API | 替换或扩展 `POST /api/session/anonymous` 为 `POST /api/session/start`：只有稳定 auth + 邀请码兑换完成后返回 profile。demo mode 保持本地试玩。 |
| 封禁行为 | 所有写接口继续走 `requireActiveSession()`；封禁仍写入 `profiles.account_status`；审核后台封禁稳定 profile，而不是浏览器 cookie。 |

迁移策略应先增量：先加入邀请码表和 API，在测试环境保留 anonymous 兼容；真机登录、邀请兑换和封禁演练通过后，再把内测环境切到强制稳定账号 + 邀请码。

## 2. 安全 Supabase 测试项目接入清单

### 需要配置的变量

这些值只能放在本地 `.env.local`、CI secret store 或托管平台环境变量里：

| 变量 | 用途 | 暴露规则 |
|---|---|---|
| `SUPABASE_URL` | 服务端路由连接 Supabase。 | 不是密钥，但除非有意公开，不要贴到公共 issue 或聊天。 |
| `SUPABASE_PUBLISHABLE_KEY` | 新 Supabase publishable API key，服务端调用公开/登录态 Supabase API。未登录请求只放 `apikey`；有用户 access token 时才发送 `Authorization: Bearer <user JWT>`。 | 设计上可公开，但本项目当前仍建议只放托管环境变量。预发布不使用 legacy anon JWT。 |
| `SUPABASE_SECRET_KEY` | 新 Supabase secret API key，服务端专用，执行审核、评论写入、读瓜完成、瓜详情和其他 actor-bound RPC。 | 绝密。只放 `apikey`，不得作为 Bearer，不得发聊天、不得加 `NEXT_PUBLIC_*`、不得提交。预发布不使用 legacy service role JWT。 |
| `CHACHA_READ_TOKEN_SECRET` | 5 秒读瓜完成凭证 HMAC。 | 绝密，至少 32 个随机字符。 |
| `CHACHA_PRESENCE_TOKEN_SECRET` | 15 分钟附近评论资格凭证 HMAC。 | 绝密，必须与 `CHACHA_READ_TOKEN_SECRET` 不同。 |
| `CHACHA_LOCATION_HMAC_SECRET` | 仅供旧版 HMAC cell 数据兼容；执行精确锚点迁移后不再参与发现或权限判断。 | 若旧部署仍配置则继续保密；新环境不依赖此值。 |

绝不能提交或发送到聊天：真实 `.env` / `.env.local`、Supabase secret key、legacy service role key、access token、数据库连接串、带凭据的迁移输出、浏览器数据、Cookie、含 key 截图、生产日志、用户个人数据。

### 迁移执行顺序

先在全新的预发布 Supabase 测试项目执行：

1. `supabase/migrations/202608040001_v0_schema.sql`
2. `supabase/migrations/202608090001_presence_comments_moderation.sql`
3. `supabase/migrations/202608090002_melon_reveal_mode.sql`
4. `supabase/migrations/202608100001_field_economy_v1.sql`
5. 按文件名顺序执行后续迁移，至少包含 `202608100002_nearby_life_circle_burial.sql`、`202608150003_precise_burial_anchors.sql` 及其间所有版本。
6. 如测试项目需要内置城市/行政区/公共地点目录，再执行 `supabase/seed.sql`

当前迁移都是 forward migration。回滚点应使用 Supabase 项目备份、分支或一次性测试项目 reset；每个迁移前记录 checkpoint。不要在生产项目执行，直到单独测试项目通过下面的真实数据库验收。

### 真实数据库验收步骤

至少使用两个真实浏览器会话和一个 service-role-only 测试脚本验证：

1. 匿名会话或稳定内测登录只创建一个 profile，公开响应不暴露 Supabase user id。
2. RLS 拒绝 anon/authenticated 直接写受保护表。
3. authenticated 直接执行 `create_melon` 被拒绝；Next 服务端路径通过 service role + actor binding 成功。
4. 每天第一颗安全原创瓜奖励 1 颗真瓜籽；held/rejected 内容不奖励。
5. 同一 Asia/Shanghai 日期内 5 次有效读瓜把小瓜籽精确兑换成 1 颗真瓜籽。
6. 5 秒前完成读瓜被拒绝；带签名凭证且到达 5 秒后成功；同一读者/瓜只计一次。
7. 同一个 `operationId` 播种幂等；真瓜籽不足时播种被拒绝。
8. 9 株 active 瓜必须服务端时间满 12 小时才能收获；提前收获失败；并发收获只发一次 XP 并归档 9 株瓜。
9. `GET /api/fields/:alias` 不返回钱包、精确种植状态、XP 来源、操作权限或 Supabase id。
10. 附近文字评论必须携带绑定匿名会话和公共地点的 15 分钟 presence proof；远程用户只能读评论、轻反应和蹲后续。
11. 被封 profile 不能埋瓜、完成读瓜、评论、举报、蹲后续/反应、播种或收获；公开阅读仍可用。
12. 审核动作有审计记录；举报不会自动永久封禁。

## 3. 下一批可并行任务

| 任务 | 依赖 | 可并行对象 | 产出 |
|---|---|---|---|
| 预发布部署准备 | 第一阶段分支被选为部署源；测试 Supabase 环境变量已具备。 | 真机验收准备、审核封禁演练脚本。 | 托管环境变量映射、build 命令、回滚 URL/版本、冒烟脚本。 |
| iPhone Safari 真机验收 | 预发布 URL、测试 Supabase 项目、可测试定位点。 | Android/鸿蒙验收、审核演练。 | 登录、定位、软键盘、5 秒读瓜、播种/收获、减少动态矩阵。 |
| Android Chrome 真机验收 | 预发布 URL、测试 Supabase 项目。 | iPhone/鸿蒙验收、审核演练。 | 同上，并补 Android 权限、后台/恢复记录。 |
| 鸿蒙浏览器真机验收 | 预发布 URL、测试 Supabase 项目。 | iPhone/Android 验收、审核演练。 | 能力降级矩阵和浏览器专属阻塞。 |
| 审核封禁演练 | 测试用户、测试内容、service-role-only 管理脚本。 | 登录可用后的设备验收。 | held、举报、封禁、解封、只读状态、审计记录证据。 |
| 稳定身份闸门实现 | 手机 OTP 或 OAuth 决策；provider 凭据进入安全环境。 | 不需要 auth redirect URL 的预发布准备。 | 增量迁移、session API 更新、邀请码兑换测试、不展示 PII。 |

## 4. 建议执行顺序

1. 决定内测稳定身份 provider：手机号可接受则选 phone OTP；隐私摩擦优先则选 OAuth。
2. 创建一次性 Supabase 测试项目，把六个必需变量放入本地/托管 secret storage。
3. 按时间戳执行迁移，只在测试项目执行 seed。
4. 完成真实数据库验收清单后再邀请内测用户。
5. 准备预发布部署，不接生产数据，不做真实用户迁移。
6. 预发布 URL 出来后，并行执行 iPhone、Android、鸿蒙真机验收和审核封禁演练。
