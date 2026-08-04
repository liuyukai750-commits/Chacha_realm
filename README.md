# 猹猹岛

一个基于公共地点和模糊距离层级的匿名吃瓜社区。V0 覆盖长沙、北京、上海、广州和深圳，核心循环是吃瓜、留籽、瓜田成长、蹲后续和埋瓜。

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
- `CHACHA_READ_TOKEN_SECRET`，至少 32 个随机字符，仅服务端使用

不要提交 `.env.local`、service role key 或真实用户数据。未配置 Supabase 时，界面会明确说明服务未连接，并允许用户主动进入本地试玩；不会把试玩数据伪装成真实附近内容。

## 数据库初始化

按顺序在目标 Supabase 项目执行：

1. `supabase/migrations/202608040001_v0_schema.sql`
2. `supabase/seed.sql`

Schema 默认启用 RLS。用户精确坐标只参与单次服务端距离判断，不持久化，也不返回其他用户坐标。

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
