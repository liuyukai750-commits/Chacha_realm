# 猹猹街

一个基于公共地点和模糊距离层级的匿名吃瓜社区。V1 覆盖长沙、北京、上海、广州和深圳，核心循环是吃瓜、五籽合一、三片地播种、蹲后续和埋瓜。

## 本地运行

需要 Node.js 20+。首次运行：

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

打开 `http://localhost:3000`。

真实模式需要在 `.env.local` 中填写新的 Supabase 项目配置：

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`，仅服务端使用，绝不能提交或暴露给浏览器
- `CHACHA_READ_TOKEN_SECRET`，至少 32 个随机字符，仅服务端使用
- `CHACHA_PRESENCE_TOKEN_SECRET`，至少 32 个随机字符，必须不同于 `CHACHA_READ_TOKEN_SECRET`

不要提交 `.env.local`、service role key、HMAC secrets、浏览器数据或真实用户数据。未配置 Supabase 时，界面会明确说明服务未连接，并允许用户主动进入本地试玩；不会把试玩数据伪装成真实附近内容。

## 数据库初始化

按顺序在目标 Supabase 项目执行：

1. `supabase/migrations/202608040001_v0_schema.sql`
2. `supabase/migrations/202608090001_presence_comments_moderation.sql`
3. `supabase/migrations/202608090002_melon_reveal_mode.sql`
4. `supabase/migrations/202608100001_field_economy_v1.sql`
5. `supabase/seed.sql`

Schema 默认启用 RLS。用户精确坐标只参与单次服务端距离判断，不持久化，也不返回其他用户坐标。

发布前 Supabase 接入、回滚点和真实数据库验收见 `docs/coordination/SUPABASE_PRELAUNCH.md`。

## 验证

```powershell
npx tsc --noEmit
npm run lint
npm run build
npm run test:e2e
```

Playwright 默认使用 `127.0.0.1:3107` 启动短生命周期生产服务，避免占用常见的 3000 端口。领域、地理和安全测试的独立命令见 `tests/README.md`。

## 项目文档

- 产品规则：`docs/PRODUCT_SPEC.md`
- API 与共享类型：`docs/coordination/CONTRACTS.md`
- 设计和架构决策：`docs/coordination/DECISIONS.md`
- 并行任务恢复：`docs/coordination/RECOVERY.md`

当前仓库只交付本地候选版，尚未部署。真实 Supabase、真实手机定位和生产环境需要分别验收。
