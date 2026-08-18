# 腾讯云轻量服务器部署手册（暂不绑定正式域名）

本手册只准备部署资产，不代表已经登录、修改或部署到腾讯云。首轮目标是在上海轻量服务器上运行一个可回滚的 Next.js 测试实例；Vercel preview 继续作为固定验收入口，正式域名和 DNS 在服务器验收通过前保持不变。

## 1. 架构与边界

```text
手机浏览器 -> Nginx (80/443) -> Next.js standalone (127.0.0.1:3000)
                                      |
                                      +-> 过渡期 Supabase（悉尼）
```

- Nginx 是唯一公网入口；Node.js 只监听 `127.0.0.1:3000`。
- 单机部署使用 systemd 和持久磁盘，不引入 Docker、PM2、Redis 或多实例协调。
- 数据库和账号迁移是另一项高风险工作；本部署不会迁库、改 RLS 或复制用户数据。
- 非 Vercel 构建会启用 `output: "standalone"` 并生成 `.next/standalone`；Vercel 构建保持平台默认输出，避免与其构建收尾流程冲突。

## 2. 部署前只读审计

先把 `scripts/deploy/preflight-tencent.sh` 上传到服务器并运行：

```bash
bash preflight-tencent.sh
```

脚本只读取系统、容量、端口、防火墙和现有路径，不创建文件、不安装软件、不重启服务。人工同时确认：

- 当前系统是受支持的 Ubuntu/Debian，Node.js 为 20+。
- 至少约 2 GiB RAM、10 GiB 可用磁盘；建议 2 GiB Swap。
- 80/443 未被未知服务占用，3000 不对公网开放。
- 腾讯云防火墙仅开放 SSH（限制来源更佳）、80、443。
- 记录现有 Nginx、systemd、证书和 `/srv/chacha-street` 状态，避免覆盖其他应用。
- 时间同步正常，服务器时区可为 UTC；业务北京时间由代码明确处理。

## 3. 2C2G 运行策略

- 本地或 CI 构建 standalone；不要在 2 GiB 服务器上执行 `npm ci`/`next build`。
- Node.js 上限为 1024 MiB；systemd 软/硬限制为 1200/1500 MiB。
- Nginx、journald 和系统保留剩余内存。Swap 只用于突发保护，不是常态容量。
- 若只读审计发现没有 Swap，可在人工确认 `/swapfile` 未被占用后配置 2 GiB：

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
swapon --show
```

验证无误后再将 `/swapfile none swap sw 0 0` 写入 `/etc/fstab`。不要重复写入，也不要在磁盘不足时操作。

## 4. 构建发布包（开发机）

正式发布默认要求干净工作区和完整 smoke gate：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/deploy/build-standalone.ps1
```

它依次运行 `qa:smoke`、`next build`、补齐 `public` 和 `.next/static`、检查敏感文件，再生成：

```text
artifacts/chacha-street-<git-sha>.tar.gz
artifacts/chacha-street-<git-sha>.tar.gz.sha256
```

`NEXT_PUBLIC_SITE_URL` 和 `NEXT_PUBLIC_TURNSTILE_SITE_KEY` 会在构建时写入浏览器 bundle，必须在构建前确定测试值；其他 server-only 变量在服务器环境文件中配置。

## 5. 服务器目录和权限（需单独授权后执行）

```text
/srv/chacha-street/releases/<release-id>/  不可变发布目录
/srv/chacha-street/current                指向当前版本的软链接
/srv/chacha-street/shared/cache           Next.js 单机持久缓存
/etc/chacha-street/chacha-street.env      0600 的运行时环境变量
```

创建专用系统用户 `chacha`，禁止交互登录。将 `deploy/tencent/systemd/chacha-street.service` 安装到 `/etc/systemd/system/`，真实环境文件从 `deploy/tencent/env/chacha-street.env.example` 复制后在服务器本地填写，绝不上传回仓库或聊天。

## 6. 原子发布与自动回滚

上传 tar.gz 和同名 `.sha256` 后，用提交 SHA 作为 release id：

```bash
sudo bash scripts/deploy/install-release.sh /absolute/path/chacha-street-<sha>.tar.gz <sha>
```

安装脚本会验证 SHA256 和压缩包路径、解压到新目录、切换 `current`、重启 systemd，并循环请求 `http://127.0.0.1:3000/`。20 秒内不健康时自动把软链接切回上一版本并重启。它不会自动删除旧版本，便于审计和手工回滚。

手工观察：

```bash
systemctl status chacha-street --no-pager
journalctl -u chacha-street -n 200 --no-pager
curl --fail --max-time 5 http://127.0.0.1:3000/
```

日志进入 journald，使用 Ubuntu 默认日志轮转；Nginx 使用发行版默认 `/etc/logrotate.d/nginx`。不得记录 Cookie、密钥、精确坐标或手机号。

## 7. Nginx 与 HTTPS 分阶段启用

1. 首轮只安装 `chacha-street-bootstrap.conf`，通过 IP 或本地 hosts 映射测试，不改正式 DNS。
2. 确认 Node 仅监听 loopback，Nginx 的 `/nginx-healthz` 和真实首页均可访问。
3. 完成登录、定位、埋瓜、吃瓜、评论、瓜田、后台和跨端验收。
4. 只有收到明确的域名切换授权后，才替换 `chacha-street-https.conf.example` 的 `example.invalid`，申请证书并启用 80 -> 443 跳转。

Nginx 已禁用代理缓冲，保留 App Router streaming；`/_next/static` 设置 immutable 长缓存，动态页面和 API 仍由 Next.js 的私有缓存头控制。

## 8. 健康、性能和容量门槛

- 首次启动和每次发布后：本机首页 20 秒内返回 2xx/3xx。
- 连续观察 30 分钟：service 无重启循环，Swap 不持续增长，内存未触及 1500 MiB。
- 手机真实数据网测试：首页、登录、城市切换和静态资源可加载。
- 详情和评论的跨境 Supabase 延迟仍可能存在；部署上海只消除“中国 -> 美国”的绕路，不等于数据库已迁国内。
- 当内存、CPU、日志或并发接近单机上限时先扩容，不在同一 2C2G 实例上叠加 PostgreSQL。

## 9. 发布门禁

在任何正式域名、DNS 或生产切换之前必须满足：

- 本地 `node scripts/deploy/validate-assets.mjs`、`npm run qa:smoke`、`npm run build` 通过。
- standalone 中存在 `server.js`、`public`、`.next/static`，且不包含 `.env`、私钥或证书。
- 服务器只读预检无 failure，warning 已逐条处理或记录。
- 服务器环境变量权限为 0600，四个 HMAC secret 彼此不同。
- 使用固定测试入口完成 iPhone、Android、鸿蒙关键路径验收。
- 已演练一次失败健康检查的自动回滚或等价的手工回滚。
- 明确授权后才允许改 DNS、申请正式证书或停止 Vercel production。

## 10. Vercel preview 保留策略

- `codex/preview` 和固定 Vercel preview URL 继续用于体验回归，不改 alias，不把正式域名指向新服务器。
- 腾讯云发布包来自明确的 Git SHA；同一 SHA 可同时由 Vercel preview 和 standalone 验证。
- 腾讯云出现问题时切回上一 release；Vercel preview 不参与生产数据写入切换，也不作为数据库回滚工具。
