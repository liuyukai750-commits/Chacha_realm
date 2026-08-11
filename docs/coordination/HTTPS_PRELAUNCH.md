# HTTPS 预发布与手机定位运行条件清单

更新时间：2026-08-11

本文档只覆盖预发布准备和只读审计，不代表已经部署、绑定域名、修改云资源或配置真实环境变量。冻结基线：`a0fe8f4d423f798a94d2b35e2ce464dea94cbb9d`。

## 1. 构建与托管前提

- Next.js 版本：`16.3.0`，当前项目使用 App Router 与 Route Handlers。
- 本地验证命令：`npm run build`。在 Windows 受限沙箱中可能于 TypeScript 阶段出现 `spawn EPERM`；非沙箱权限下已通过。
- 托管形态：需要支持 Node.js 的 Next.js 服务端运行时，不能作为纯静态站发布，因为 `/api/**`、匿名 session、Supabase RPC、presence token、评论写入和瓜田接口都依赖服务端 Route Handlers。
- Vercel 建议配置：Framework Preset 选择 Next.js，Build Command `npm run build`，Install Command `npm install` 或平台默认 npm install，Output Directory 留空使用 Next 默认产物。
- 其他 HTTPS 平台：必须确认支持 Next.js 16 App Router、动态 Route Handlers、httpOnly cookie、Node `crypto` HMAC、服务端运行时环境变量和同源 API 请求。
- 不要在预发布连接生产 Supabase 项目；preview/staging/prod 应使用不同 Supabase 项目或至少不同数据库分支、不同 Auth 配置和不同 HMAC secrets。

## 2. 环境变量隔离

| 变量 | preview | staging | prod | 暴露规则 |
|---|---|---|---|---|
| `SUPABASE_URL` | 预发布 Supabase URL | 准生产 Supabase URL | 生产 Supabase URL | 当前代码服务端读取；不是密钥，但不要随意贴到公开聊天或 issue。 |
| `SUPABASE_PUBLISHABLE_KEY` | 预发布 publishable key | 准生产 publishable key | 生产 publishable key | 新 `sb_publishable` 只作为 `apikey` 使用；未登录请求不发送 Bearer。旧 `SUPABASE_ANON_KEY` 仅为本地兼容回退。 |
| `SUPABASE_SECRET_KEY` | 预发布 secret key | 准生产 secret key | 生产 secret key | 新 `sb_secret` 只作为 `apikey` 使用；server-only，绝不能作为 Bearer、加 `NEXT_PUBLIC_*` 或提交。旧 `SUPABASE_SERVICE_ROLE_KEY` 仅为本地兼容回退。 |
| `CHACHA_READ_TOKEN_SECRET` | preview 专用随机值 | staging 专用随机值 | prod 专用随机值 | server-only，至少 32 个随机字符。 |
| `CHACHA_PRESENCE_TOKEN_SECRET` | preview 专用随机值 | staging 专用随机值 | prod 专用随机值 | server-only，至少 32 个随机字符，必须不同于 read secret。 |
| `CHACHA_LOCATION_HMAC_SECRET` | preview 专用随机值 | staging 专用随机值 | prod 专用随机值 | server-only，用于附近生活圈 cell HMAC，必须不同于其他 secret。 |

当前代码也兼容 `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`、`SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` 作为 Supabase 配置回退，但预发布默认不要使用 legacy JWT key。Next.js 会把 `NEXT_PUBLIC_*` 在构建时内联进浏览器 bundle，后续 promote 同一个构建产物时不会自动读取目标环境的新值。

隔离原则：

- preview：每个 PR 或候选分支可连接一次性 Supabase 测试项目；允许重置数据，不接真实用户。
- staging：只给内部真机验收和审核演练使用；数据可长期保留但必须可清理，禁止和 prod 共用 service role key 与 HMAC secrets。
- prod：只在 staging 的 RLS、权限、真机定位、审核封禁和回滚验证通过后配置。
- 三套环境的 Supabase Auth redirect URL、allowed origins、cookie 域、邀请/登录 provider 凭据必须分别配置。

## 3. HTTPS 与 iOS Safari 定位条件

真实定位依赖浏览器 Geolocation API。代码在请求定位前检查 `window.isSecureContext`，因此预发布 URL 必须是 HTTPS；本地 `localhost` / `127.0.0.1` 可用于开发，但不能替代手机真机验收。

iOS Safari 验收前提：

- 使用 `https://` 预发布域名打开，证书链有效且页面不是 iframe 内的非授权上下文。
- 定位必须由用户主动点击触发，例如“附近 1km”“验证现场评论资格”或“提交埋瓜”。
- 用户曾拒绝定位时，需要到 iOS 设置或浏览器站点权限中恢复；页面只能提示重试，不能绕过系统权限。
- `getCurrentPosition` 当前配置为 `maximumAge: 0`、`timeout: 8000`、`enableHighAccuracy: false`，每次附近刷新、现场评论资格验证或提交埋瓜都会请求一次即时位置。
- 权限拒绝、超时、不支持定位或非安全上下文时，应保留城市瓜区、远程围观、轻反应、蹲后续等无需现场位置的能力。

## 4. HTTPS 下的端到端依赖

### 附近 1km

链路：用户点击附近按钮 -> 浏览器返回一次性 `LocationProof` -> `POST /api/discovery` -> 服务端验证坐标格式、精度和 5 分钟有效期 -> Supabase 读取候选瓜和公共地点 -> 返回 `DistanceBand` 与 `DiscoverySceneContext`。

依赖：

- HTTPS 安全上下文和浏览器定位权限。
- `SUPABASE_URL`、`SUPABASE_PUBLISHABLE_KEY` 可用。
- 若存在 `nearby_area` 瓜，必须配置 `CHACHA_LOCATION_HMAC_SECRET`，否则无法生成访问者附近 cell；未配置时附近生活圈瓜不会展示，附近生活圈埋瓜会 503。
- Supabase 已执行迁移和公共地点 seed，且 `public_spots.active=true`。

失败回退：

- 定位拒绝、超时或非 HTTPS：停留或回到城市瓜区，不自动扩大到更远范围。
- 数据服务未配置：显示服务不可用，并允许本地试玩模式。
- 位置过期或精度超过 1000m：要求重新获取位置，不保存原始经纬度。

### 提交时一次性定位

链路：用户提交埋瓜 -> 浏览器本次取位置 -> `POST /api/melons` -> 服务端验证 `LocationProof` -> nearby_area 写入 HMAC cell，public_spot 需完整落在公共地点 500m 内 -> service role RPC 写入。

依赖：

- HTTPS、安全上下文、用户手势触发定位。
- `SUPABASE_SECRET_KEY`、`CHACHA_LOCATION_HMAC_SECRET`。
- public_spot 埋瓜还依赖公共地点目录与 `requireSafeSeek` 判定。

失败回退：

- 用户拒绝定位：保留草稿或表单内容，继续允许城市浏览。
- 不在公共地点 500m 内：拒绝 public_spot 埋瓜，但不泄露精确距离。
- `CHACHA_LOCATION_HMAC_SECRET` 缺失：nearby_area 埋瓜返回 503，应在发布前阻断。

### 评论 presence

链路：用户打开瓜详情 -> 远程可读评论 -> 用户点击验证现场评论资格 -> `POST /api/presence/verify` -> 服务端验证位置与公共地点 -> 签发绑定 `userId + spotId + level` 的 15 分钟 HMAC token -> `POST /api/melons/:id/comments` 校验 token 后写入评论。

依赖：

- HTTPS 与定位权限。
- `CHACHA_PRESENCE_TOKEN_SECRET`。
- 活跃 session、未封禁 profile、评论对应公共地点仍存在。

失败回退：

- remote/outside：继续允许读评论、轻反应和蹲后续，不显示文字评论输入框。
- token 过期或无效：保留评论草稿，要求重新验证位置。
- 用户被封禁：只读公开内容。

## 5. 日志脱敏要求

禁止记录或上报：

- 原始 `latitude` / `longitude`、浏览器 `position` 对象、定位截图、移动轨迹。
- `SUPABASE_SECRET_KEY`、legacy service role key、publishable/anon key、HMAC secrets、access token、refresh token、Cookie、presence token、read token。
- Supabase user id、手机号、OAuth subject、邮箱、真实昵称和其他 PII。
- 带凭据的迁移输出、生产日志原文或含 key 截图。

允许记录的最小诊断字段：

- API 错误码、HTTP status、环境名、commit SHA、匿名请求 id。
- 定位失败类别：`not_secure_context`、`permission_denied`、`timeout`、`unsupported`、`stale_location`、`location_too_imprecise`。
- 距离结果只能记录离散语义：`nearby_area`、`public_spot`、`city_overview`、`inside_zone`、`found`、`outside`，不得记录精确距离或坐标。

## 6. 建议部署路径

1. 用 `origin/codex/chacha-street-release-wrap` 的 `a0fe8f4` 创建 Vercel Preview，不绑定自定义域名，不接生产 Supabase。
2. 配置 preview 专用 Supabase 项目与六个环境变量，执行迁移和可选 seed。
3. 运行 `npm run build`、`npx tsc --noEmit`、`npm run lint`，再用预发布 URL 做两台手机真机冒烟。
4. staging 复用相同代码路径，但使用独立 Supabase 和独立 secrets，补全 Auth provider、邀请闸门、审核封禁演练。
5. prod 只在 staging 验收清单通过后配置环境变量与域名；发布前保留上一版本 URL/部署 id 作为回滚点。

## 7. 需用户提供的最小信息

- 选择托管平台：Vercel 或其他支持 Next.js 16 Node runtime 的 HTTPS 平台。
- preview/staging/prod 三套 Supabase 项目或数据库分支信息，由用户自行填入平台 secret storage，不在聊天中发送真实 key。
- 内测稳定身份 provider 决策：phone OTP 或 OAuth，以及对应 redirect URL 白名单。
- 预发布测试地点：至少一个可到达公共地点，覆盖 inside_zone、found、outside、定位拒绝四种场景。
- 是否需要自定义预发布域名；若需要，必须等用户明确授权后再绑定。

## 8. 验证清单

- `npm run build` 通过，并记录 commit SHA 与部署 URL。
- `npx tsc --noEmit` 通过。
- `npm run lint` 通过。
- `/api/session/anonymous` 在 HTTPS 预发布 URL 下设置 secure httpOnly cookie。
- `/api/discovery` 在拒绝定位时不扩大范围；在允许定位时只返回 `DistanceBand` 和场景语义，不返回坐标。
- nearby_area 埋瓜在 `CHACHA_LOCATION_HMAC_SECRET` 存在时成功，缺失时发布前阻断。
- public_spot 埋瓜只有 500m found 条件通过才成功。
- presence token 15 分钟过期，过期后评论失败且草稿保留。
- 远程用户可读评论、轻反应、蹲后续，但不能发表文字评论。
- iOS Safari、Android Chrome、鸿蒙浏览器分别验证 HTTPS 定位权限、软键盘、前后台恢复和拒绝权限回退。
