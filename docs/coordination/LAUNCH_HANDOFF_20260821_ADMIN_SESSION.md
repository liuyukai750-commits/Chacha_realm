# 猹猹街上线收尾交接：主理人会话修复

更新时间：2026-08-21
当前工作区：`D:\chacha_island\.codex-worktrees\iphone-ui-field-fix`
远程服务器：腾讯云 CVM `ubuntu@122.51.95.156`
当前测试域名：`https://test.chacharealm.cn`
当前正式域名：`https://chacharealm.cn`

## 当前结论

> 2026-08-21 后续更新：根因最终确认为标准 PostgreSQL 传输没有为
> `serviceRpc` 设置 Supabase RPC 原本具备的 `service_role` 会话声明。
> 生产数据库函数因此抛出 `service_role_required`（SQLSTATE `42501`），再被
> API 映射成 `401`，页面才误显示“请先登录”。修复已在应用传输层发布并重启
> `chacha-street`：服务端数据库实测返回 `result_type: object`，test/正式域名
> `/api/health/ready` 均为 `200`。仍需主理人账号在真实手机上刷新驾驶舱完成最终 UI 验收。

正式域名已接入 HTTPS，`test.chacharealm.cn` 和 `chacharealm.cn` 均指向同一台服务器和同一套 Next.js 服务。用户已确认普通账号登录恢复正常。

当前未完成项是：主理人账号 `CC-2C19A479` 登录后点击“主理人驾驶舱”，页面仍显示“请先登录主理人账号”。这不是白名单问题，而是主理人页/API 没稳定拿到登录会话 Cookie。

## 已完成的重要部署/配置

1. PostgreSQL 已迁移到腾讯云 PostgreSQL v18。
2. 测试域名 `test.chacharealm.cn` 已可访问。
3. 正式域名 `chacharealm.cn` 已配置：
   - A 记录指向 `122.51.95.156`
   - HTTPS 证书已申请成功，证书路径在远程：
     - `/etc/letsencrypt/live/chacharealm.cn/fullchain.pem`
     - `/etc/letsencrypt/live/chacharealm.cn/privkey.pem`
   - HTTP 自动跳 HTTPS 已启用。
4. Nginx 动态页面缓存策略已调整为 `no-store`，静态资源保留长期缓存。
5. 登录门禁已开启。
6. 登录 bug 已修复并部署：`@node-rs/argon2` 改为 lazy import 后，用户确认账号密码可登录。
7. 主理人白名单已设置：
   - `CHACHA_ADMIN_PUBLIC_IDS=CC-2C19A479`
   - 远程只读诊断已确认该环境变量生效。

## 当前主理人问题证据

用户截图显示主理人页文案：

- “账本已合上”
- “请先登录主理人账号”
- “当前会话还没有登录。完成登录后，再回到这里查看城市汇总。”

代码对应：

- `src/components/admin/admin-dashboard.tsx`
  - `/api/admin/overview` 返回 `401` 时显示上述未登录状态。
  - `403` 才是“没有权限/不在白名单”。

因此当前问题是 `401 unauthorized`，不是 `403 forbidden`。

## 本地已做但尚未发布的修复

已修改以下文件：

1. `src/components/auth-gate.tsx`
   - `requestJson()` 的 `fetch` 选项增加：
     - `credentials: "same-origin"`
   - 目的：登录、会话、登出、恢复等登录门禁请求显式携带同站 Cookie，减少手机/内置浏览器/跳转后的 Cookie 不稳定。

2. `src/app/admin/page.tsx`
   - 原来直接渲染：
     - `<AdminDashboard />`
   - 改为：
     - `<AuthGate required><AdminDashboard /></AuthGate>`
   - 目的：主理人页先经过登录门禁，再读取驾驶舱；如果会话缺失，直接进入登录流程，而不是显示死胡同。

3. `tests/auth-system-contract.test.mjs`
   - 新增契约测试，验证：
     - 登录门禁请求显式 `credentials: "same-origin"`
     - 主理人页由 `AuthGate required` 包裹。

## 已完成本地验证

执行过：

```powershell
node --test tests\auth-system-contract.test.mjs
```

结果：17/17 PASS。

执行过生产构建和打包：

```powershell
powershell.exe -ExecutionPolicy Bypass -File scripts\deploy\build-standalone.ps1 -SkipQa -AllowDirty
```

结果：成功。

生成产物：

- `artifacts\chacha-street-f535fcdcb5f4.tar.gz`
- `artifacts\chacha-street-f535fcdcb5f4.tar.gz.sha256`

SHA256：

```text
8f72c255d8bf82c3f7fd1cceaa9adfc591e19887d62d810a75e40a185c4d78ee
```

已准备发布脚本：

- `artifacts\run-install-admin-session-fix-release.ps1`

发布脚本会：

1. 上传新包、sha256 和 `scripts/deploy/install-release.sh`
2. 在远程执行安装
3. 创建 release id：
   - `admin-session-cookie-fix-<timestamp>`
4. 重启 `chacha-street`

## 下一步需要用户明确授权

发布会同时影响：

- `https://test.chacharealm.cn`
- `https://chacharealm.cn`

并会重启 `chacha-street` 服务。

新会话里请先让用户确认这句话：

```text
同意发布主理人会话修复到 test 和正式域名并重启 chacha-street 服务
```

获得授权后，运行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process powershell.exe -ArgumentList '-NoExit','-ExecutionPolicy','Bypass','-File','D:\chacha_island\.codex-worktrees\iphone-ui-field-fix\artifacts\run-install-admin-session-fix-release.ps1'"
```

用户需要在弹出的 PowerShell 窗口输入 SSH 密码两次。密码输入时不显示字符是正常现象。

## 发布后验收

发布完成后让用户执行：

1. 打开 `https://chacharealm.cn`
2. 使用 `CC-2C19A479` 登录
3. 点击“主理人驾驶舱”
4. 预期：
   - 不再显示“请先登录主理人账号”
   - 如果账号确实在白名单内，应显示主理人城市汇总
   - 如果仍有问题：
     - `401`：会话 Cookie 仍未被 API 读取
     - `403`：身份不满足主理人条件，需检查账号状态、登录方式、onboarding 状态、publicId 白名单

## 注意事项

- 当前工作区很脏，包含大量历史迁移、部署、DNS、备案、UI 和测试脚本改动。不要使用 `git reset --hard` 或覆盖用户工作。
- 不要删除 `artifacts/` 里的发布脚本和已生成 tar 包，除非用户明确要求。
- 不要再次修改 DNS/HTTPS/Nginx/数据库/环境变量，除非用户明确授权。
- 如果要继续诊断主理人问题，优先只读查看日志，不要直接改 DB。
- 当前线上普通登录已由用户确认可用，不要回退到旧构建。
