import Link from "next/link";
import { siteCompliance } from "@/config/site-compliance";
import styles from "../legal.module.css";

export const metadata = { title: "隐私政策｜猹猹街" };

export default function PrivacyPage() {
  return (
    <main className={styles.page}>
      <article className={styles.article}>
        <Link className={styles.back} href="/">← 返回登录</Link>
        <p className={styles.eyebrow}>CHACHA STREET / PRIVACY</p>
        <h1>隐私政策</h1>
        <p className={styles.status}>更新日期：2026 年 8 月 20 日。本政策说明猹猹街当前实际使用的数据与技术方案。</p>

        <h2>1. 我们处理哪些信息</h2>
        <ul>
          <li><strong>登录信息：</strong>猹号、密码摘要、恢复码摘要和登录会话，用于验证身份、找回瓜田与账号安全；服务端不保存可还原的明文密码或恢复码。</li>
          <li><strong>公开身份：</strong>动物、昵称和猹号；不会公开内部账号 UUID、密码摘要或会话令牌。</li>
          <li><strong>社区数据：</strong>帖子、评论、点赞、蹲瓜、举报、瓜籽、经验和瓜田状态。</li>
          <li><strong>位置数据：</strong>仅在用户主动点击附近浏览、埋瓜或现场评论验证时请求浏览器定位。附近埋瓜的精确坐标会写入仅限服务端访问的位置表，用于执行一公里可见范围和现场资格；坐标不会出现在公开接口、帖子正文、评论或普通运行日志中。</li>
          <li><strong>安全数据：</strong>经过 HMAC 处理的账号与网络地址指纹、请求时间和处置记录，用于限制注册、登录滥用和账号攻击。</li>
        </ul>

        <h2>2. 使用目的与最小化</h2>
        <p>信息仅用于提供登录、内容发现、互动、瓜田成长、安全审核、举报处理和必要的运行维护。定位不会用于持续跟踪、好友搜索、路线展示或营销画像；客户端也不会获得其他用户的精确埋瓜坐标。</p>

        <h2>3. Cookie 与保存期限</h2>
        <p>登录令牌保存在 HttpOnly、Secure、SameSite=Lax Cookie 中，正常登录最长保持 30 天并按安全策略轮换。社区数据及与附近瓜关联的私有坐标在账号和内容存续期间保存；账号注销或相关内容依法删除时按关联删除流程处理。法律法规要求保留的安全处置记录会在必要期限内隔离保存。</p>

        <h2>4. 技术服务商</h2>
        <p>当前网页服务和 PostgreSQL 数据库部署在腾讯云中国大陆资源中，账号认证由猹猹街服务端和 PostgreSQL 完成。启用人机验证时，会使用 Cloudflare Turnstile 处理安全验证信息。运营者为 {siteCompliance.operatorName || "网站备案主体"}。</p>

        <h2>5. 用户权利</h2>
        <p>用户可在账号页查看公开身份、退出登录或申请注销，也可以请求更正、复制或删除依法可处理的信息。联系渠道：<a href={`mailto:${siteCompliance.contact}`}>{siteCompliance.contact}</a>。</p>

        <h2>6. 未成年人</h2>
        <p>产品当前不以未成年人为主要服务对象。涉及未成年人信息时将按更严格规则处理；相关年龄确认和监护人机制完成前，不开启面向未成年人的推广。</p>

        <h2>7. 安全与变更</h2>
        <p>我们采用访问控制、服务端校验、最小权限、脱敏日志和速率限制等措施。政策发生实质变化时，会在重新征得必要同意前显著告知。</p>
      </article>
    </main>
  );
}
