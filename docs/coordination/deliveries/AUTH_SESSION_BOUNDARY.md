# 认证与会话解耦交付报告

交付日期：2026-08-19
来源任务：`01a01600-f38c-7af2-9513-f8f1f1d09a69`
实现 worktree：`C:\Users\Lenovo\.codex\worktrees\254b\chacha_island`
基线：`f535fcdcb5f462bf9fb605afbf938b15fc95d424`

## 状态

- 本地实现完成，未 commit、未 push、未部署、未连接或修改真实数据库/云资源。
- 该 worktree 只有两个文件变化：
  - `src/server/supabase/session.ts`
  - `src/server/auth/session-boundary.test.mjs`（新增）

## 改动范围

- 在现有 Supabase 会话文件内拆出 `SessionStore`（Cookie 持久化）、`AuthSessionProvider`（令牌校验、刷新、Profile）与 `SessionService`（路由语义）三层。
- 新增 `createSessionService(store, provider)` 组合点；现有 `supabaseSessionService` 是默认实现，`activeSessionService` 是未来本地 opaque session 的单一替换点。
- GoTrue 的 `access_token / refresh_token / expires_in` 先规范化为 `SessionCredentials`，再进入 `SessionStore`，避免未来本地实现伪装成 Supabase 响应。
- 保持现有导出函数、路由、DTO、Cookie 名 `chacha_at / chacha_rt` 和 Supabase 路径不变。

## 契约变化

- 新增导出接口：`SessionProfile`、`StoredSessionTokens`、`SessionCredentials`、`SessionStore`、`ResolvedSession`、`AuthSessionProvider`、`SessionService`。
- 新增导出：`cookieSessionStore`、`supabaseAuthSessionProvider`、`createSessionService`、`supabaseSessionService`。
- 现有 `saveAuthSession / clearAuthSession / getOptionalSession / requireSession / publicSessionFor / requireActiveSession / createOrResumeAnonymousSession*` 签名不变。
- 本地 opaque adapter 需实现 `SessionStore + AuthSessionProvider`，或直接提供 `SessionService`；业务路由无需变化。
- `ServerSession.accessToken` 暂时保留，供当前 PostgREST/RPC bearer 使用。待 `DataTransport` 切换到 PostgreSQL 后，应由总控协调改为 provider-neutral credential/actor context，不能在本批提前修改。

## 已验证

- 57/57 认证、会话、密码、旧账号升级、恢复码、迁移定向测试通过。
- 最终补丁后又执行 21/21 会话与认证契约，全部通过。
- ESLint（两个变更文件）通过。
- 完整同源依赖下 TypeScript `--noEmit` 等价检查通过。
- `git diff --check` 通过。
- 覆盖：`HttpOnly`、生产 `Secure`、`SameSite=Lax`、`Path=/`、30 天 refresh；本地无 renewal token 时删除旧 refresh Cookie；刷新 token 必须由 `SessionStore` 轮换。
- 旧手机号/永久账号升级继续校验相同 `userId` 与 `existingDataPreserved=true`；恢复失败回滚旧恢复码摘要。

## 未验证

- 未连接 `local_auth_sessions / local_auth_credentials`，未执行 bcrypt 校验或真实 opaque token 签发、轮换与撤销。
- 未连接真实 Supabase/PostgreSQL，未执行真实账号登录、真实 Cookie、真实恢复码或真实瓜田数据验证。
- 未跑浏览器 E2E、production build 或 `qa:smoke`；本次只有服务器会话 seam、定向测试、TypeScript 与 ESLint。
- 交付任务自己的 worktree 中没有 `MIGRATION_REVIEW.md`；集成时必须以总控基线中的审查文档重新核对。

## 风险

- 本批只建立 seam，不代表本地会话已经上线。
- `AuthSessionResponse` 与 GoTrue 调用仍存在于 Supabase adapter/认证服务；切换必须与本地 `PasswordAuthRepository` 及数据库 actor 安全上下文同批验收。
- 活跃 GoTrue refresh token 不迁移，正式切换仍将要求用户重新登录。
- `CHACHA_AUTH_HMAC_SECRET` 必须连续，否则旧恢复码失效。
- 在 DataTransport 和数据库安全上下文完成前，禁止单独替换 `SessionService`，否则现有 RPC bearer/actor 语义会断裂。

## 建议集成顺序

1. 总控只读审查该 worktree 的两个文件及 diff。
2. 先集成 session seam 与定向测试，默认实现继续使用 Supabase。
3. 集成 DataTransport seam，仍保留 Supabase 默认实现。
4. 完成显式 actor 与最小权限数据库安全上下文。
5. 实现本地 `PasswordAuthRepository + opaque SessionStore/AuthSessionProvider`，用隔离 PostgreSQL 验证 UUID、猹号、瓜田和恢复码不变。
6. 最后同时切换 `activeSessionService` 与 DataTransport，并执行预发布 E2E、迁移核对和回滚演练。

## 总控裁决建议

该交付可进入代码审查，但只能标记为“会话替换边界完成”。不得标记为“本地认证完成”“已去 Supabase”或“可生产切换”。
