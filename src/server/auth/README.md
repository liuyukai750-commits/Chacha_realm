# 认证运行边界

## 当前入口：猹号 + 密码

- 新注册、登录、恢复和旧账号原地升级都不调用短信接口。
- 旧永久账号在有效会话内设置密码时保持原 Supabase UUID，因此瓜田、瓜籽、帖子、评论和蹲瓜不迁移也不复制。
- 16 位恢复码只在创建、升级或恢复成功后展示一次；数据库只保存带服务端密钥的摘要。
- `account_login_credentials` 是当前 Supabase 适配器的私有登录句柄映射。未来切换标准 PostgreSQL 时，由 `PasswordAuthRepository` 对接 `local_auth_credentials`、`local_auth_sessions` 和 `local_auth_security_events`，API 与公开 DTO 不变。
- 登录状态通过 `HttpOnly + SameSite=Lax` Cookie 保存；生产环境使用 `Secure`，刷新凭据最长保留 30 天。

## 未来兼容：手机号 OTP

应用只调用 Supabase Auth 的 Phone OTP 接口，不直接持有腾讯云短信密钥，也不会在开发环境伪造“短信已发送”。上线前需在目标 Supabase 项目完成：

1. 启用 Phone Provider，并将中国大陆号码作为 E.164（`+86...`）处理。
2. 配置 Supabase **Send SMS Hook**，由受控的服务端 Hook 调用腾讯云短信；腾讯云签名和模板必须先审核通过。
3. 在 Supabase Auth 中配置 OTP 有效期、发送频率限制和 CAPTCHA。前端取得 CAPTCHA token 后，通过 `captchaToken` 传入 `/api/auth/phone/request`。
4. Vercel 服务端配置独立的 `CHACHA_AUTH_HMAC_SECRET`（至少 32 个字符）。它用于恢复码、账号/IP 摘要及兼容期短时流程签名，不得暴露给浏览器。

## 猹号凭据细节

- 新用户由服务端创建 Supabase 永久用户，公开登录名是随机 `CC-XXXXXXXX` 猹号；内部邮箱仅作为 Supabase Auth 凭据，不进入公开 DTO 或普通日志。
- 旧匿名用户在原 `auth.users.id` 上补齐密码身份，因此瓜田、瓜籽、帖子、评论和蹲瓜无需迁移。
- 16 位恢复码只向用户展示一次，数据库只保存 HMAC 摘要；每次找回成功后旧码立即作废并换发新码。
- 生产开启 `CHACHA_CAPTCHA_REQUIRED=true` 时必须同时配置 `NEXT_PUBLIC_TURNSTILE_SITE_KEY` 和 `TURNSTILE_SECRET_KEY`。
- 手机 OTP 路由暂时保留为未来兼容入口，但登录页不调用；没有企业短信资质时不得开启手机号流程。

数据库的 `auth_phone_attempts` 只保存 HMAC 摘要、动作和时间，不保存手机号或 IP 原文。普通应用日志也不得打印请求体、手机号、验证码、Cookie 或 Supabase token。

## 上线门禁

- **不要在只完成本地测试后开启登录闸门。** Supabase 当前同时记录了两项与匿名账号绑定手机号有关的平台边界：启用 Auth Hook 时，匿名账号的 `phone_change` 可能因 Hook 收到 `new_phone` 而返回 `Invalid payload`；多个未完成流程留下相同 `phone_change` 时，验证码还可能命中错误的用户记录。预发布环境必须使用一个真实旧匿名账号跑通“发送验证码 → 验证 → UUID 不变 → 原瓜田仍在”，并建立定期清除过期 `auth.users.phone_change` 的受控运维流程。没有完成这两项时，保持 `AUTH_GATE_ENABLED=false`。

- 设置 `CHACHA_CAPTCHA_REQUIRED=true` 后，`POST /api/auth/phone/request` 必须携带有效格式的 `captchaToken`，否则服务端会在调用 Supabase 前返回 `captcha_required`。测试环境可以暂不设置；生产环境应在 CAPTCHA 前端接通后开启。
- 旧匿名瓜田绑定一个已注册手机号时，验证码通过不会立即覆盖当前匿名 Cookie。服务端只会写入一个 5 分钟有效、HttpOnly、AES-256-GCM 加密的待切换 Cookie；前端必须调用 `POST /api/auth/phone/confirm` 并提交 `{ "confirm": true }` 后才切换到已有账号。提交 `false`、超时或 Cookie 被篡改都不会覆盖匿名瓜田。
- `CHACHA_AUTH_HMAC_SECRET` 同时派生待切换 Cookie 的加密密钥。轮换该密钥会使尚未确认的短期流程失效，但不会影响已经登录的账号数据。
