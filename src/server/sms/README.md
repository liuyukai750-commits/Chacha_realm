# Supabase 短信钩子

`POST /api/hooks/supabase/send-sms` 是 Supabase Auth 的 Send SMS HTTP Hook。它先用
Standard Webhooks 验证原始请求签名，再通过腾讯云 SMS 2021-01-11 `SendSms` 接口发送验证码。

上线配置：

1. 在腾讯云短信中创建应用，并审核通过签名与验证码模板。
2. 模板只使用一个变量：`您的验证码为 {1}，5 分钟内有效。`
3. 将 `.env.example` 中的腾讯云配置写入 Vercel 的 Preview 环境，不能提交真实值。
4. 在 Supabase Auth Hooks 中配置 HTTP Hook URL：
   `https://<preview-host>/api/hooks/supabase/send-sms`。
5. 把 Supabase 生成的 Hook Secret 写入同一 Preview 环境的
   `SUPABASE_SEND_SMS_HOOK_SECRET`。

钩子只接受中国大陆 E.164 手机号与 6 位验证码，不记录手机号、验证码、签名请求体或供应商密钥。
腾讯云调用超时为 4 秒，以满足 Supabase Hook 的执行时限。
