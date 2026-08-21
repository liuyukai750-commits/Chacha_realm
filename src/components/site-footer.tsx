import Image from "next/image";
import { publicSecurityRecordCode, siteCompliance } from "@/config/site-compliance";

export function SiteFooter() {
  const securityCode = publicSecurityRecordCode(siteCompliance.publicSecurityNumber);
  if (!siteCompliance.icpNumber && !siteCompliance.publicSecurityNumber) return null;

  return (
    <footer className="site-footer" aria-label="网站备案信息">
      <span>© {new Date().getFullYear()} 猹猹街</span>
      {siteCompliance.icpNumber && (
        <a href="https://beian.miit.gov.cn/" target="_blank" rel="noreferrer">
          {siteCompliance.icpNumber}
        </a>
      )}
      {siteCompliance.publicSecurityNumber && (
        <a
          href={`https://beian.mps.gov.cn/#/query/webSearch?code=${securityCode}`}
          target="_blank"
          rel="noreferrer"
        >
          <Image
            src="/public-security-filing.png"
            alt=""
            aria-hidden="true"
            width={20}
            height={20}
          />
          {siteCompliance.publicSecurityNumber}
        </a>
      )}
    </footer>
  );
}
