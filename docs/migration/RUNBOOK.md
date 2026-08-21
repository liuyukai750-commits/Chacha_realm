# Supabase → 标准 PostgreSQL 迁移演练

## 目标选择

**推荐：腾讯云托管 PostgreSQL。** 数据库与 Next.js 分离，具备自动备份、监控、恢复和独立扩容，适合作为正式目标。

**临时：Lighthouse 本机 PostgreSQL。** 仅适合短期过渡。当前 2C2G 同时运行 Next.js 与 PostgreSQL，构建、流量尖峰或数据库维护会互相争抢内存；必须配置 Swap、异机加密备份、磁盘告警与恢复演练。

执行 `node scripts/migration/plan.mjs --target=managed` 或 `--target=lighthouse` 只输出 dry-run 计划，不连接数据库。`--execute` 被故意拒绝，防止在尚未完成认证切换和目标验收前误写真实库。

## 演练前门禁

1. 固定迁移 commit 和应用预览版本；暂停 schema 变更。
2. 在源 Supabase **测试环境**应用兼容迁移，确认两个账号都有 `local_auth_credentials`，但不得读取或打印摘要。
3. 保存源项目可恢复备份，并验证恢复到隔离实例。
4. 目标必须为空库、不同主机、TLS 开启；凭据只通过受控环境变量或密钥管理注入。
5. 禁止把连接串、密码、JWT、service-role key 放入命令行、仓库、聊天或日志。
6. `CHACHA_AUTH_HMAC_SECRET` 必须从源环境原样延续，否则既有恢复码全部失效。
7. 切换前必须让仍依赖手机号的账号完成猹号/密码升级；PostgreSQL 模式会明确拒绝手机号 OTP，不会偷偷回连 GoTrue。

## 标准 PostgreSQL 建库顺序

1. 在空目标先执行 `deploy/postgres/standard-postgres-preload.sql`，建立 `auth` 兼容 namespace、最小 `auth.users` 表、`auth.uid()/auth.jwt()` GUC shim 和 restore 所需的无登录角色。这里没有 GoTrue 服务。
2. 从加密导出中先导入每个 Profile 对应的 `auth.users` 最小 identity stub。密码权威只来自 `local_auth_credentials`；不要把 `encrypted_password` 作为目标登录源。
3. 恢复 public schema、函数、触发器和业务数据，保持原 UUID 不变。
4. 执行 `deploy/postgres/standard-postgres-target.sql`，移除 `profiles -> auth.users` 的 Supabase 所有权 FK，收敛 Profile 权威函数，并创建 `chacha_app` 最小权限角色。
5. 由云平台创建独立登录角色（例如 `chacha_runtime`），仅授予 `chacha_app`；把带 `sslmode=verify-full` 的连接串放入服务器密钥环境，不写入仓库或命令日志。
6. 目标首次启动前确认 `local_auth_sessions` 和 `local_auth_security_events` 为空；旧 GoTrue Cookie 不迁移，用户需重新登录。

## 导出与导入顺序

先用 preload 建立 restore 前置兼容层，再恢复现有 schema，最后应用 target SQL；不要把 Supabase migration 在缺少 `auth` namespace/角色的空库中直接顺序执行。

建议流程：

1. 生成源清单：`node scripts/migration/manifest-query.mjs`，在只读连接执行并保存 JSON。
2. 使用 `pg_dump` custom/directory 格式导出；位置锚点与凭据文件必须加密。
3. 在空目标导入静态配置，再导入 `profiles`，随后内容、互动、经济、安全与凭据表。
4. 修复 sequence/identity 当前值（若未来出现 identity 表），执行 `ANALYZE`。
5. 在目标生成同格式清单，以 `node scripts/migration/verify-manifests.mjs source.json target.json` 比较。
6. 对两个账号逐一核验 UUID、`public_id`、昵称、动物、封禁状态、钱包、XP、瓜、评论、蹲瓜和 3×3 瓜田。
7. 验证原猹号和密码可登录；旧 Supabase Session 应失效并要求重新登录。
8. 设置 `CHACHA_BACKEND_PROVIDER=postgres` 时同时验证 DataTransport 与 opaque Session；不存在单独的 `DATA_PROVIDER` 或 `SESSION_PROVIDER` 开关，禁止混合切换。

## 校验门槛

- 所有迁移表 count 与 64 位整表 digest 完全一致。
- 目标仅有两个 Profile，且 UUID / `public_id` / alias 与源一致。
- `profiles.true_seed_count/small_seed_count/experience` 等于账本与现状预期。
- 活动 `field_plants` 每位用户不超过 9，单个 `(owner_id, plot_index, slot_index)` 唯一。
- `melon_location_anchors` 只对应 `nearby_area` 瓜，且未出现在公开 DTO 或普通日志。
- `local_auth_credentials` 数量等于密码账号数；不得在校验输出中出现哈希。
- `local_auth_sessions` 初始为空；切换后新建的 token 只存 HMAC/摘要且支持撤销。
- bcrypt 与 Argon2id 测试账号均能验证；登录失败文案不暴露猹号是否存在。
- session 满足 7 天 idle、30 天 absolute、24 小时轮换、旧 token 重用时整族撤销；事务 actor/JWT context 在提交后为空。

## 切换与回滚

只有演练全部通过后才安排短写入冻结：记录冻结点，执行最终增量，复核清单，切换应用连接，再进行两个账号端到端验证。

至少保留 Supabase 源为只读回滚源。若登录、数据校验、埋瓜、评论或瓜田任一关键路径失败，立即把应用连接切回 Supabase；不要把失败目标的数据反向覆盖源库。回滚后按冻结点处理目标期间产生的少量写入，禁止静默丢弃。

## 2026-08-19 当前状态

- 一次性隔离 Supabase 已完成 30 个 migration、count-only 快照、A/B 权限、并发 actor、事务清理、DTO 等价和回滚探针；未触碰现有 staging/真实用户数据。
- PostgreSQL DataTransport、本地 opaque Session、bcrypt/Argon2id 登录和目标 SQL 已完成本地实现，TypeScript 与定向契约通过。
- Supabase Management API 无权在受管 `auth` schema 建表，因此不能冒充标准 PostgreSQL 目标；失败事务已核对未留下角色或 FK 修改。
- 未创建腾讯云数据库、用户、网络或付费资源。
- 未在独立标准 PostgreSQL 实例实跑 preload/restore/target、Node `pg` 连接、真实登录或全链路业务。
- 未切换应用认证、数据库连接、域名或正式流量。
