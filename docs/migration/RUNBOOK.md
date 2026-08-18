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

## 导出与导入顺序

先用现有迁移在空目标创建 extension、enum、table、index、constraint 和函数兼容层，再按 `scripts/migration/catalog.mjs` 的外键顺序复制数据。迁移文件不得直接在标准 PostgreSQL 原样执行，除非目标已具备 `auth` 兼容层与角色；正式方案应由认证任务提供去 Supabase 化后的目标 schema。

建议流程：

1. 生成源清单：`node scripts/migration/manifest-query.mjs`，在只读连接执行并保存 JSON。
2. 使用 `pg_dump` custom/directory 格式导出；位置锚点与凭据文件必须加密。
3. 在空目标导入静态配置，再导入 `profiles`，随后内容、互动、经济、安全与凭据表。
4. 修复 sequence/identity 当前值（若未来出现 identity 表），执行 `ANALYZE`。
5. 在目标生成同格式清单，以 `node scripts/migration/verify-manifests.mjs source.json target.json` 比较。
6. 对两个账号逐一核验 UUID、`public_id`、昵称、动物、封禁状态、钱包、XP、瓜、评论、蹲瓜和 3×3 瓜田。
7. 验证原猹号和密码可登录；旧 Supabase Session 应失效并要求重新登录。

## 校验门槛

- 所有迁移表 count 与 64 位整表 digest 完全一致。
- 目标仅有两个 Profile，且 UUID / `public_id` / alias 与源一致。
- `profiles.true_seed_count/small_seed_count/experience` 等于账本与现状预期。
- 活动 `field_plants` 每位用户不超过 9，单个 `(owner_id, plot_index, slot_index)` 唯一。
- `melon_location_anchors` 只对应 `nearby_area` 瓜，且未出现在公开 DTO 或普通日志。
- `local_auth_credentials` 数量等于密码账号数；不得在校验输出中出现哈希。
- `local_auth_sessions` 初始为空；切换后新建的 token 只存 HMAC/摘要且支持撤销。

## 切换与回滚

只有演练全部通过后才安排短写入冻结：记录冻结点，执行最终增量，复核清单，切换应用连接，再进行两个账号端到端验证。

至少保留 Supabase 源为只读回滚源。若登录、数据校验、埋瓜、评论或瓜田任一关键路径失败，立即把应用连接切回 Supabase；不要把失败目标的数据反向覆盖源库。回滚后按冻结点处理目标期间产生的少量写入，禁止静默丢弃。

## 当前明确未执行

- 未连接、读取或修改真实 Supabase。
- 未创建腾讯云数据库、用户、网络或付费资源。
- 未导出两个账号的任何真实记录或凭据。
- 未切换应用认证、数据库连接、域名或正式流量。
