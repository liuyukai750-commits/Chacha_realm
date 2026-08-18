# Supabase 依赖盘点

## 结论

当前系统不是“普通 PostgreSQL 加几张表”，而是同时依赖 Supabase Auth、PostgREST RPC、RLS 会话语义和 `service_role`。只导出 `public` 数据并导入另一台 PostgreSQL，登录和部分 RPC 会立即失效。

## 账号真源

- `auth.users.id` 是内部账号 UUID；`public.profiles.id` 通过外键复用同一个 UUID。
- `profiles.public_id` 是不可枚举的公开猹号，`alias / display_name / animal / identity_badge` 是公开身份。
- `account_login_credentials` 只保存随机内部邮箱映射，不保存密码哈希。
- 真正的密码哈希与 refresh token 由 Supabase Auth/GoTrue 管理。
- `account_recovery_credentials` 保存恢复码 HMAC；HMAC 密钥来自服务端环境，迁移时必须安全沿用，否则旧恢复码全部失效。
- `202608180001_standard_postgres_auth_compat.sql` 只为密码账号复制 bcrypt 哈希，并预建本地会话撤销表；不会切换现有登录流。

活跃 Supabase refresh token 不迁移。切换后两个测试账号使用原猹号和原密码重新登录；UUID、猹号和业务数据不变。

## 需要完整保留的数据

| 数据域 | 表 | 关键不变量 |
|---|---|---|
| 地点配置 | `cities`, `districts`, `public_spots` | 五城 ID 与地点 UUID 不变 |
| 身份与经济 | `profiles`, `seed_ledger`, `economy_ledger` | UUID、`public_id`、钱包、XP 与流水一致 |
| 内容 | `melons`, `melon_location_anchors`, `melon_create_operations` | 瓜 UUID、作者、成熟时间、私有锚点一致 |
| 互动 | `melon_completions`, `squats`, `reactions`, `comments`, `melon_basket_dismissals` | 唯一约束与时间顺序一致 |
| 瓜田 | `field_plants`, `field_harvests` | 3×3 活动槽与收获批次一致 |
| 安全 | `reports`, `moderation_cases`, `account_moderation_actions` | 封禁状态与证据摘要一致 |
| 登录兼容 | `account_login_credentials`, `account_recovery_credentials`, `local_auth_credentials` | 原猹号/密码可重新登录 |

验证码、登录频率窗口、本地会话与安全事件是短期运行状态，切换时清空，不作为用户数据迁移。

## Supabase 耦合点

1. `profiles.id references auth.users(id)` 以及 `auth.users` 新用户触发器。
2. 多个函数通过 `auth.uid()`、`auth.jwt()` 获取当前身份。
3. RLS policy 使用 `anon`、`authenticated`、`service_role` 和 `auth.uid()`。
4. Next.js Session 层调用 `/auth/v1/user`、`/auth/v1/token` 与 `/rest/v1/rpc/*`。
5. `get_current_profile()` 等函数连接 `auth.users` 读取手机号或判断认证类型。
6. service-role 函数承担位置、评论、经济流水、审核与管理员汇总。

因此目标 PostgreSQL 上线前必须完成两件事：应用认证边界改为本地猹号会话；数据库调用要么继续通过兼容 API 设置事务 actor，要么把剩余 `auth.uid()/auth.jwt()` RPC 改成显式 actor 参数并只允许服务端角色调用。

当前 Next.js 运行时直接使用的 RPC 包括：

- 身份：`get_current_profile`, `complete_current_profile`, `reserve_phone_auth_attempt`, `reserve_account_auth_attempt`, `account_auth_target`, `account_auth_target_by_user`, `set_account_login_credential`, `set_account_recovery_secret`, `rotate_account_recovery_secret`。
- 发现与内容：`get_city_catalog`, `get_discovery_candidates_for_visitor_v2`, `get_melon_basket_exclusions`, `create_melon_v4`, `get_melon_detail_for_actor`, `get_melon_read_policy`, `complete_melon_read`。
- 互动：`set_melon_squat`, `get_squat_shelf`, `mark_squat_alert_seen`, `set_melon_reaction`, `get_melon_comments`, `add_melon_comment`, `set_melon_basket_dismissal`, `delete_own_melon`。
- 位置与瓜田：`get_melon_presence_target_v2`, `get_field_view`, `plant_field_melon`, `harvest_field`。
- 治理：`create_content_report`, `get_admin_overview`。

RLS 已覆盖所有核心和私密表。配置表仅向 `anon/authenticated` 开放有限读取；Profile、钱包、互动、举报、审核、位置锚点、认证凭据和会话默认拒绝。迁往标准 PostgreSQL 后，不能简单关闭 RLS；应创建最小权限应用角色，并让本地 Session 中间件在事务内设置 actor，或全部走显式 actor 的 `security definer` 服务函数。

## 隐私边界

- `melon_location_anchors` 是唯一允许保存发布瞬间精确坐标的业务表，导出文件必须加密、限制访问并在验收后销毁。
- 不导出手机号明文到业务表，不输出密码哈希、恢复码 HMAC、session digest 或坐标到普通日志。
- 校验清单只保存表名、行数和不可逆整表摘要，不保存行内容。
