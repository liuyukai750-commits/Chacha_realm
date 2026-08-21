# 迁移边界集成策略

## 固定基线

- 唯一集成来源是 `codex/preview`；不直接合入正式分支。
- SessionService、DataTransport 与数据库 actor/security context 均先保持 Supabase 默认 adapter 可运行。
- UI、Route Handler、DTO、UUID、猹号、钱包、瓜田、位置隐私和权限语义冻结。

## 集成顺序

1. 先加入迁移边界失败测试。
2. 集成 SessionService/SessionStore seam，默认仍为 Supabase。
3. 集成 DataTransport seam，默认仍为 Supabase。
4. 在一次性测试 Supabase 应用账号快照审计与显式 actor 前向 migration。
5. 在隔离标准 PostgreSQL 演练本地 Session、数据导入和等价权限。
6. 完整运行 `npm run qa:smoke`、五城矩阵、权限对抗、关键截图和真机验收。

代码与第 4 步 migration 是一个不可拆分的发布门槛：Preview 必须同时具备新 RPC、
服务端 admin secret 和对应代码，否则 bootstrap、瓜田与蹲瓜架可能返回 503。

## 性能基线

- 在现有稳定 Preview 与候选 Preview 使用同一账号、同一网络、同一数据样本各测至少 20 次。
- 记录首次打开、bootstrap、瓜篮/蹲瓜架、瓜详情与评论读取的 p50/p95；同时记录 bootstrap 的 auth、field、squats `Server-Timing` 分段。
- 候选版本不得增加客户端请求数量，不得以减少返回字段、跳过权限检查或关闭位置隐私换取速度。
- 任一核心路径 p95 明显回退时停止集成，回到对应 adapter/SQL 门槛定位；阈值在取得首轮实测数据后冻结，不凭空设定。

## 回滚

- 边界阶段按批次还原 adapter 变更，现有 Vercel Preview 与 Supabase 保持可用。
- 数据库 migration 只先进入可重置的测试项目；失败时重建测试项目，不反向覆盖源库。
- 切换本地认证前重新冻结写入、刷新账号快照，并要求 exact-set、freshness、orphan 审计全部为零。
- 本地 Session 与 PostgreSQL transport 必须同批切换、同批回滚，不能留下混合 actor 语义。
- 未经用户明确授权，不 commit、不 push、不部署、不修改真实数据库、DNS或正式域名。
