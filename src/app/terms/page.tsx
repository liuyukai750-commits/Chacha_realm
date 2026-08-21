import Link from "next/link";
import { siteCompliance } from "@/config/site-compliance";
import styles from "../legal.module.css";

export const metadata = { title: "用户协议｜猹猹街" };

export default function TermsPage() {
  return (
    <main className={styles.page}>
      <article className={styles.article}>
        <Link className={styles.back} href="/">← 返回登录</Link>
        <p className={styles.eyebrow}>CHACHA STREET / TERMS</p>
        <h1>用户协议</h1>
        <p className={styles.status}>更新日期：2026 年 8 月 20 日。使用、注册或继续访问前，请阅读并同意本协议和隐私政策。</p>

        <h2>1. 服务是什么</h2>
        <p>猹猹街提供基于城市和模糊附近范围的匿名故事发布、浏览、评论、点赞、蹲后续及瓜田成长功能。匿名是对其他用户匿名，不代表可以规避平台审核或法律责任。</p>

        <h2>2. 账号与匿名身份</h2>
        <ul>
          <li>用户使用猹号、密码和恢复码管理账号；密码和恢复码应由本人妥善保管，社区内只展示动物、昵称和猹号。</li>
          <li>请勿冒用他人身份、使用真实姓名或发布可识别个人的信息。</li>
          <li>账号仅限本人使用，不得买卖、出借或以自动化方式批量注册。</li>
        </ul>

        <h2>3. 内容边界</h2>
        <p>不得发布造谣诽谤、人肉搜索、精确住址、联系方式、色情低俗、仇恨骚扰、违法交易、诈骗引流或其他违法和侵害他人权益的内容。平台可依据风险程度采取隐藏、删除、限制功能、冻结或注销账号等措施。</p>

        <h2>4. 举报与处置</h2>
        <p>用户可举报帖子和评论。平台会结合内容、上下文、历史记录和申诉材料处理，不承诺所有举报都立即成立。涉及紧急人身安全时，请直接联系当地公安或急救机构。</p>

        <h2>5. 账号退出与注销</h2>
        <p>用户可在账号页退出或申请注销。注销会进入删除流程；法律法规要求保留的安全与处置记录，将在必要期限内隔离保存。</p>

        <h2>6. 版本与联系</h2>
        <p>功能规则调整会在页面公示。运营者为 {siteCompliance.operatorName || "网站备案主体"}；客服、申诉和隐私请求可发送至 <a href={`mailto:${siteCompliance.contact}`}>{siteCompliance.contact}</a>。争议应先友好协商；无法解决时，依法向有管辖权的人民法院处理。</p>
      </article>
    </main>
  );
}
