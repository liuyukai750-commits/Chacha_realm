const publicValue = (value: string | undefined) => value?.trim() ?? "";

export const siteCompliance = {
  operatorName: publicValue(process.env.NEXT_PUBLIC_OPERATOR_NAME),
  contact: publicValue(process.env.NEXT_PUBLIC_COMPLIANCE_CONTACT) || "support@chacharealm.cn",
  icpNumber: publicValue(process.env.NEXT_PUBLIC_ICP_FILING_NUMBER) || "湘ICP备2026034402号",
  publicSecurityNumber: publicValue(process.env.NEXT_PUBLIC_PUBLIC_SECURITY_FILING_NUMBER) || "湘公网安备43010402003047号",
};

export function publicSecurityRecordCode(value: string): string {
  return value.replace(/\D/g, "");
}
