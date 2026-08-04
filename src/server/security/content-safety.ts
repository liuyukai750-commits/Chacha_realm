export type ContentSafetyFlag = "contact" | "phone" | "email" | "precise_address" | "illegal_or_doxxing";

const safetyRules: ReadonlyArray<{ flag: ContentSafetyFlag; pattern: RegExp }> = [
  { flag: "contact", pattern: /(微信|威信|vx|v信|qq|扣扣|telegram|whatsapp|手机号|电话|加我)[\s\p{P}]*[a-z0-9_-]{5,}/iu },
  { flag: "phone", pattern: /1[3-9]\d[ -]?\d{4}[ -]?\d{4}/u },
  { flag: "email", pattern: /[\w.%+-]+@[\w.-]+\.[a-z]{2,}/iu },
  { flag: "precise_address", pattern: /(住址|家庭住址|身份证号|门牌号|几栋几单元|\d{1,4}号楼\d{1,4}室)/u },
  { flag: "illegal_or_doxxing", pattern: /(人肉|开盒|身份证|银行卡号|杀人|制毒|贩毒)/u },
];

export function assessContentSafety(...parts: string[]): ContentSafetyFlag[] {
  const content = parts.join("\n");
  return safetyRules.filter(({ pattern }) => pattern.test(content)).map(({ flag }) => flag);
}
