# 迁腾讯云 + 去 Supabase 迁移审查结论（Claude 只读审查，供 Codex 读取）

审查日期：2026-08-19
审查人：Claude（只读，未修改任何文件）
结论性质：评审意见，非实现指令。

## 0. 前提（Codex 必须先知道）

当前主工作区 `D:\chacha_island` 在分支 `codex/chacha-kingdom-v0`（HEAD `d5f149b`）。
本次迁移相关代码**全部**在 worktree `D:\chacha_island\.codex-worktrees\iphone-ui-field-fix\`，分支 `codex/preview`（HEAD `f535fcd`），领先 main **40+ commit**，merge-base 即 `d5f149b`。

主工作区只有两个目标文件是旧版：
- `src/server/supabase/session.ts`（匿名-only 旧版）
- `src/server/repositories/island-repository.ts`（还在调用 `create_melon` / `get_discovery_candidates` 旧 RPC 名）

以下路径**只存在于 codex/preview worktree**：
- `src/server/auth/`（11 文件）
- `docs/migration/`、`docs/deployment/TENCENT_LIGHTHOUSE.md`
- `deploy/tencent/`（env / nginx / systemd）、`scripts/deploy/`、`scripts/migration/`
- `supabase/migrations/202608180001_standard_postgres_auth_compat.sql`

> 若审的是"当前仓库"，迁移代码本身还没合入。整块工作未合入 `codex/chacha-kingdom-v0`，需要显式决定合入策略。

## 1. 现在是否必须重构

分两件事，结论不同：

| 事项 | 是否必须重构 | 依据 |
|---|---|---|
| Vercel → 腾讯云部署 | **否** | `TENCENT_LIGHTHOUSE.md` 明确保留 Supabase 悉尼作过渡后端，与认证/库解耦，可独立落地 |
| Supabase → 标准 PostgreSQL（库+认证） | **是，否则直接失效** | 同时依赖 GoTrue `/auth/v1/*`、PostgREST RPC、`auth.uid()/auth.jwt()`、RLS 角色、`profiles.id references auth.users(id)` 触发器。只做 pg_dump 导入，登录和几乎所有 RPC 立刻挂 |

现状：迁移工作目前只完成了"源侧兼容层 + 一个不完整的 seam"，**尚未切换到本地认证**。

## 2. 必须重构的最小范围（三处边界，非重写）

把三处 Supabase 耦合各自收敛成可替换边界：

**(a) 会话/身份边界 — `src/server/supabase/session.ts`（未 seam）**
硬编码 GoTrue：`/auth/v1/user|token|signup|otp|verify|logout|admin/users`。
需改为服务端签发/校验/轮换 opaque token，落到已设计好的 `local_auth_sessions` 表。
`src/server/auth/password-repository.ts`（`PasswordAuthRepository` 接口）是正确 seam 范例，但 session.ts 本身还没 seam。

**(b) 传输边界 — `src/server/supabase/http.ts`（未 seam）**
全部数据访问经由 `rpc()` / `serviceRpc()` / `selectRows()` 三函数，而这三者是 PostgREST 形状（`/rest/v1/rpc/*`、`/rest/v1/<table>?select=...`、`apikey` 头）。
切标准 PG 时把三者实现换成 `pg` 驱动（或自托管 PostgREST 兼容层）。
**关键：`island-repository.ts` 已全部经由这三函数，故仓库层不需要重写。**

**(c) DB 安全上下文 — SQL 层（最重、最易低估）**
`auth.uid()/auth.jwt()` 分布在 **19 个迁移文件**；RLS 依赖 `anon/authenticated/service_role`；`auth.users` 有新用户触发器。
需改为显式 actor 参数的 `security definer` 函数，或本地 session 中间件在事务内 set role/set_config，并配最小权限应用角色。**不能简单关 RLS。**

一句话：**最小范围 = `session.ts` + `http.ts` + `config.ts` + 一批 `auth.uid()/auth.jwt()` 的 SQL 函数。`island-repository.ts` 与所有路由/DTO 不动。**

## 3. 不要重构的部分

- 前端全部：`src/components/*`、`chacha-island.tsx`、`city-visuals.ts`、demo 适配器、`src/app/*`。
- 领域/纯逻辑：`src/domain/*`、`src/contracts/*`、`src/server/validation.ts`、`security/` 里不碰 Supabase 的纯函数（location、seek、discovery-scene）。
- 仓库层业务编排：`island-repository.ts` 的距离/排序/scene-context/评论 cursor 编解码。
- API 契约/DTO：路由返回形状、`get_current_profile()` 对外 JSON 结构不变，客户端不感知。
- 数据语义：UUID、`public_id`、钱包/XP/流水、瓜/评论/蹲瓜/瓜田不变量——只迁移不改写。

## 4. 推荐执行顺序

1. **先落腾讯云 standalone 部署**（保留 Supabase）——唯一不依赖认证重构、风险最低，先解决 Vercel→腾讯云。
2. **补全传输 seam**：让 `http.ts` + `session.ts` 成为仅有的两个"认识 Supabase"文件，各加接口（模仿 `PasswordAuthRepository`），使 `pg` 实现可插入。
3. **在 Supabase 上先去掉 `auth.uid()/auth.jwt()`**：RPC 改显式 actor 参数或 `security definer` + 事务内 set role（身份仍用 GoTrue）。
4. **引入本地会话存储**，登录流切 `local_auth_sessions` + `local_auth_credentials`（bcrypt 校验）。先在源库跑 `202608180001` 快照密码哈希。
5. **切换传输层**（PostgREST → `pg`），跑 `plan.mjs` dry-run（`--execute` 已被拒绝）、`verify-manifests.mjs`，短写入冻结 + 终量同步 + 切换。

## 5. 最大风险（按严重度）

1. **恢复码 HMAC 密钥连续性**：恢复码用 `CHACHA_AUTH_HMAC_SECRET` 做 HMAC，迁移时必须原样沿用，否则所有旧恢复码静默作废。
2. **密码哈希快照不完整**：`202608180001` 只复制 bcrypt（`~ '^[$]2[aby][$][0-9]{2}[$].{53}$'`），且要求 `account_login_credentials.login_email = auth.users.email` 精确相等。argon2id 哈希或邮箱不匹配的密码账号会被**静默跳过**，切库后无法登录。表允许 `argon2id` 但快照只抄 bcrypt——真实缺口，需补校验/告警。
3. **`auth.uid()/auth.jwt()` 19 文件广度**：最大机械改造面与正确性风险。关 RLS 而无等价 app 角色 = 数据泄露。
4. **会话强制失效**：活跃 GoTrue refresh token 故意不迁移，切库即全员强制下线，需重新登录的用户沟通与验证。
5. **`get_current_profile()` 漂移**：`202608180001` 里重定义的版本仍 `join auth.users` 且 `where p.id = auth.uid()`，仍是 Supabase 兼容函数，非"去 Supabase 后"函数。该函数在 `202608040001` / `202608090001` / `202608100001` / `202608140002` / `202608180001` 反复 `create or replace`，切库前必须收敛为一份唯一权威定义。
6. **过程风险**：整块 40+ commit 在 `codex/preview` 未合入 main，需显式合入策略。

## 6. 对"只做后端边界重构，不重写猹猹街"的裁定

**同意，但边界是三条缝、其中一条在 SQL 里（TS 之外）：**
1. 会话/身份（GoTrue）——只 seam 一半（`PasswordAuthRepository` 有，session.ts 没有）；
2. 数据传输（PostgREST）——`http.ts` 三函数未 seam；
3. DB 安全上下文（`auth.uid()/auth.jwt()`、RLS 角色、`auth.users` 触发器）——在 19 个迁移文件里，纯 DB 工作。

正确表述应为：**"把三处 Supabase 耦合收敛成三个可替换边界，不重写业务。"** 方向对、文档对风险的自我认知到位，需补的是把 seam 从"密码路径"推广到"会话 + 传输 + DB 安全上下文"三处，并先落掉与认证解耦的腾讯云部署。

## 7. 建议 Codex 下一步（可选，非指令）

- [ ] 补 `local_auth_credentials` 快照对 argon2id/邮箱不匹配账号的检测与告警（避免静默漏账号）。
- [ ] 收敛 `get_current_profile()` 为一份权威定义，消除跨迁移 `create or replace` 漂移。
- [ ] 为 `session.ts` / `http.ts` 各落一个接口（对齐 `PasswordAuthRepository` 范式），作为 PG 适配点。
- [ ] 明确"迁移代码合入 main 的分支/PR 路径"。
