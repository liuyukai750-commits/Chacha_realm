# 猹猹街迁移总控 Handoff（2026-08-19）

## 接手目标

继续完成一次性隔离数据库演练，验证 migration、A/B 账号权限隔离、actor/security context、事务泄漏、账号快照完整性与回滚。通过后再继续标准 PostgreSQL 与本地 Session 演练。

禁止操作当前生产 Supabase、真实用户数据、DNS、正式部署和生产域名。需要购买或创建腾讯云 PostgreSQL 或其他付费资源前必须暂停并向用户申请授权。未经授权不得 commit、push 或部署。

## 当前代码基线与工作区

- 工作区：`C:\Users\Lenovo\.codex\worktrees\a045\chacha_island`
- 基线提交：`f535fcdcb5f462bf9fb605afbf938b15fc95d424`
- 当前为 detached HEAD，所有迁移改动均未提交。
- 三个本地替换缝已建立：`SessionService/SessionStore`、`DataTransport`、数据库显式 actor/security context。
- Supabase 仍是默认 provider；不得宣称本地认证、标准 PostgreSQL 或生产切换已完成。
- 本地验证已通过：Node 207/207、TypeScript、ESLint、Next.js 16.3 production build。

主要未提交文件：

- `src/server/supabase/session.ts`
- `src/server/supabase/http.ts`
- `src/server/repositories/island-repository.ts`
- `src/server/auth/service.ts`
- `src/server/auth/password-service.ts`
- 相关 bootstrap/fields/squats/reports routes
- `supabase/migrations/202608190001_migration_boundary_hardening.sql`
- `tests/migration-boundary-hardening.test.mjs`
- `src/server/auth/session-boundary.test.mjs`
- `docs/migration/INTEGRATION_STRATEGY.md`

不要覆盖或重置这些未知/未提交改动。

## 隔离 Supabase 资源

已获得用户授权创建一次性免费隔离测试数据库；未使用 Docker Desktop。

- 专用组织：`Chacha Migration Rehearsal 20260819`
- organization slug：`unvjpfzxsfrydltwvgif`
- 专用项目：`chacha-migration-rehearsal-20260819`
- project ref：`zwgfwmmjnlpwhfshvcdq`
- region：`ap-southeast-1`
- 状态创建时为：`ACTIVE_HEALTHY`
- 本地 `supabase/.temp/project-ref` 已链接到上述 ref。

明确未触碰的现有项目：

- `chacha-street-staging`
- ref：`iuiddnnjhnwrgqocxzhx`

严禁把 CLI 重新 link 到该现有 staging 项目。开始任何远端命令前先执行 `supabase projects list`，确认只有 `zwgfwmmjnlpwhfshvcdq` 的 `linked` 为 `true`。

CLI 已通过官方登录流程授权，固定使用 `npx --yes supabase@2.114.0`。不得输出、复制或写入仓库任何 access token、API key、数据库密码。

## 已完成的远端步骤

1. 在隔离项目执行了第一阶段 migration：
   - 从 `202608040001_v0_schema.sql`
   - 到 `202608180001_standard_postgres_auth_compat.sql`
   - 共 29 个 SQL migration，CLI 返回成功。
2. `202608190001_migration_boundary_hardening.sql` 在第一阶段被临时移出后已恢复到原路径；文件当前存在。
3. 在隔离 Auth 中创建了两个虚构账号，无真实手机号、位置或内容：
   - A user id：`39840fce-1848-4177-a62a-bc12e0c98a85`
   - A private login：`11111111-1111-4111-8111-111111111111@accounts.chachajie.invalid`
   - B user id：`cf3ee70d-7c6a-4e83-9cd2-c3ecf0ec93cc`
   - B private login：`22222222-2222-4222-8222-222222222222@accounts.chachajie.invalid`
4. 两条 `account_login_credentials` 映射已成功写入。
5. 曾尝试用 `example.invalid` 直接写登录映射，被现有 check constraint 正确拒绝；随后改为合规的 `accounts.chachajie.invalid` 私有句柄。该失败没有写入映射。

## 中断点

最后一个命令是：

```powershell
npx --yes supabase@2.114.0 db push --linked --dry-run --yes
```

该命令在用户中断后退出，属于 dry-run，预期不会修改数据库；但接手会话必须自行核对 migration history，不能只依赖预期。

`202608190001_migration_boundary_hardening.sql` 尚未确认已应用。接手后第一步必须只读验证：

```powershell
npx --yes supabase@2.114.0 projects list --output json
npx --yes supabase@2.114.0 migration list --linked
npx --yes supabase@2.114.0 db push --linked --dry-run --yes
```

预期 dry-run 只能列出 `202608190001_migration_boundary_hardening.sql`。如果目标 ref、linked 状态或 migration 列表不符，立即停止。

## 后续建议顺序

1. 核对 linked ref 和 migration history。
2. dry-run 确认只剩 `202608190001`。
3. 应用 `202608190001`，记录真实 SQL 结果。
4. 用 count-only 查询验证 `local_auth_snapshot_audit()`：
   - `emailMismatch = 0`
   - `unsupportedHash = 0`
   - `missingAuthUser = 0`
   - `missingSnapshot = 0`
   - `staleSnapshot = 0`
   - `orphanSnapshot = 0`
   - 不得输出 hash、login handle 或 token。
5. 执行 A/B 权限矩阵：
   - service-side explicit actor wrapper A 只能看到/修改 A 的私有状态；B 同理。
   - anon/authenticated 不得执行 `app_private.set_actor_context` 或 `*_for_actor` wrappers。
   - caller input 不得覆盖 server actor。
   - `p_is_anonymous` 只能来自已验证 SessionService。
6. 验证事务泄漏：每个事务结束后 `current_setting('app.actor_id', true)`、JWT GUC 不得串到下一个事务；并发 A/B 不串号。
7. 验证旧 RPC 与显式 actor wrapper 的 DTO/业务结果等价。
8. 回滚演练只能针对此一次性项目：优先事务内 apply/rollback 或删除并重建隔离项目；不得对现有 staging/生产执行 reset。
9. 完成后删除一次性项目及专用组织，删除前再次核对 ref。
10. 隔离 Supabase 全绿后再开发标准 PostgreSQL native schema/adapter 与本地 opaque Session；创建任何付费 PostgreSQL 前暂停请求用户授权。

## 已知风险

- 当前 actor bridge 同时设置 `app.actor_id` 与 Supabase JWT GUC；现有业务 RPC 主要仍读取 `auth.uid()/auth.jwt()`。它只是 source-side bridge，尚不是标准 PostgreSQL actor 实现。
- `DataTransport.selectRows` 仍保留 PostgREST query-string 形状；标准 PG adapter 需要内部翻译，不能把当前 seam 宣称为 PG adapter 完成。
- 代码与 `202608190001`、Supabase admin secret 是不可拆分的发布门槛；只部署代码会让 bootstrap、瓜田、蹲瓜架等路径失败。
- 不要运行仓库的 `npm run qa:db`，除非已再次确认 linked ref；它会连接远端项目。

## 验收与回报格式

每次只汇报：结论、风险、真实验证、下一步。明确区分：

- 代码边界已建立
- 隔离数据库已演练
- 标准 PostgreSQL adapter 已演练
- 本地 Session 已演练
- 已部署/已迁移

这些状态不得混写或提前宣称。

## 2026-08-19 接管续跑结果

原总控会话中断后，迁移工作已在 `D:\chacha_island\.codex-worktrees\iphone-ui-field-fix` 继续；主工作区 `D:\chacha_island` 未被覆盖或重置。

- 已确认只有隔离项目 `zwgfwmmjnlpwhfshvcdq` 处于 linked 状态，现有 staging `iuiddnnjhnwrgqocxzhx` 未触碰。
- `202608190001_migration_boundary_hardening.sql` 已在隔离项目成功应用；migration history 共 30 条。
- `local_auth_snapshot_audit()` 的不一致、缺失、孤儿、过期和不支持 hash 计数均为 0；两个虚构密码账号快照存在。
- A/B 私有数据权限、匿名与 authenticated 拒绝、service-role actor wrapper、并发事务 actor/JWT 清理、旧新 RPC DTO 等价和事务内 DDL rollback 均已通过。
- 标准目标 SQL 无法在 Supabase 托管项目内演练，因为托管 `auth` schema 不授予所需 DDL 权限；失败事务未留下角色或约束改动。这是目标平台限制，不是标准 PostgreSQL 脚本已经验证失败。
- 已实现原生 PostgreSQL `DataTransport`、本地密码认证、仅存 SHA-256 摘要的 opaque Session、token 轮换/闲置与绝对过期/重用撤销，以及标准 PostgreSQL preload/target SQL。
- `CHACHA_BACKEND_PROVIDER` 作为原子切换；`postgres` 模式不暗中混用 Supabase Auth，手机号 OTP 明确返回不支持。
- 本地验证：Node tests 229/229、全仓 ESLint、`tsc --noEmit`、Next.js 16.3 production build 全部通过；`git diff --check` 无错误。

当前唯一阻塞是标准 PostgreSQL 的真实恢复与端到端演练。按用户约束，创建腾讯云上海区付费测试实例前必须暂停并获得明确授权；尚未购买、创建、部署或迁移任何付费/生产资源。
