import Link from "next/link";
import styles from "../legal.module.css";

export const metadata = { title: "隐私政策｜猹猹街" };

export default function PrivacyPage() {
  return (
    <main className={styles.page}>
      <article className={styles.article}>
        <Link className={styles.back} href="/">← 返回登录</Link>
        <p className={styles.eyebrow}>CHACHA STREET / PRIVACY</p>
        <h1>隐私政策</h1>
        <p className={styles.status}>上线准备稿 · 2026 年 8 月 14 日。正式开放注册前，仍需补充运营主体、联系方式、数据存储地域及受托处理方清单，并完成法律审核。</p>

        <h2>1. 我们处理哪些信息</h2>
        <ul>
          <li><strong>登录信息：</strong>手机号、验证码结果和登录会话，用于验证身份、找回瓜田与账号安全。</li>
          <li><strong>公开身份：</strong>动物、昵称和猹号；不会公开手机号或内部账号 UUID。</li>
          <li><strong>社区数据：</strong>帖子、评论、点赞、蹲瓜、举报、瓜籽、经验和瓜田状态。</li>
          <li><strong>位置数据：</strong>用户主动触发时的一次性浏览器定位，用于判断模糊附近范围或公共地点资格。原始经纬度不写入业务数据库或普通日志。</li>
          <li><strong>安全数据：</strong>经过 HMAC 处理的手机号与网络地址指纹、请求时间和处置记录，用于限制短信滥用和账号攻击。</li>
        </ul>

        <h2>2. 使用目的与最小化</h2>
        <p>信息仅用于提供登录、内容发现、互动、瓜田成长、安全审核、举报处理和必要的运行维护。手机号不会显示在社区资料中，也不会用于好友搜索或营销通讯。</p>

        <h2>3. Cookie 与保存期限</h2>
        <p>登录令牌保存在 HttpOnly、Secure、SameSite=Lax Cookie 中，正常登录最长保持 30 天并按安全策略刷新。短信防刷指纹按短期安全需要保存；社区数据在账号存续期间保存，注销后按删除流程处理。</p>

        <h2>4. 技术服务商</h2>
        <p>当前技术方案使用 Supabase 提供认证与数据库、Vercel 提供网页托管，并计划使用腾讯云短信发送验证码。正式上线前会核实并公示运营主体、实际数据存储地域、受托处理范围及必要的跨境合规安排。</p>

        <h2>5. 用户权利</h2>
        <p>用户可在账号页查看公开身份、退出登录或申请注销。更正、复制、删除、撤回同意与申诉渠道将在正式上线前随运营者联系方式一并补充。</p>

        <h2>6. 未成年人</h2>
        <p>产品当前不以未成年人为主要服务对象。涉及未成年人信息时将按更严格规则处理；相关年龄确认和监护人机制完成前，不开启面向未成年人的推广。</p>

        <h2>7. 安全与变更</h2>
        <p>我们采用访问控制、服务端校验、最小权限、脱敏日志和速率限制等措施。政策发生实质变化时，会在重新征得必要同意前显著告知。</p>
      </article>
    </main>
  );
}
