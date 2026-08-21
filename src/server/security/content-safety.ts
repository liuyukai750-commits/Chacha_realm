export type ContentSafetyFlag =
  | "contact"
  | "phone"
  | "email"
  | "precise_address"
  | "personal_identifier"
  | "real_name"
  | "sexual_harassment"
  | "identifiable_allegation"
  | "illegal_or_doxxing";

const commonSurname = "赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜谢邹喻柏水窦章云苏潘葛奚范彭郎鲁韦昌马苗凤花方俞任袁柳鲍史唐费廉岑薛雷贺倪汤滕殷罗毕郝邬安常乐于时傅皮卞齐康伍余元卜顾孟平黄和穆萧尹姚邵湛汪祁毛禹狄米贝明臧计伏成戴宋茅庞熊纪舒屈项祝董梁杜阮蓝闵席季麻强贾路娄危江童颜郭梅林刁钟徐邱骆高夏蔡田樊胡凌霍虞万";
const contextualRealName = `(?:(?:真名|实名|本名|身份证姓名|姓名)(?:叫|是|为|[:：])?[\\s，,]*[\\p{Script=Han}]{2,4}|(?:同事|老板|老师|医生|店员|邻居|经理|主管|房东|中介)(?:叫|是|为|[:：])?[\\s]*[${commonSurname}][\\p{Script=Han}]{1,2}|[${commonSurname}][\\p{Script=Han}]{1,2}(?:老师|医生|经理|老板|同学|女士|先生))`;

const safetyRules: ReadonlyArray<{ flag: ContentSafetyFlag; pattern: RegExp }> = [
  { flag: "contact", pattern: /(微信|威信|vx|v信|qq|扣扣|telegram|whatsapp|手机号|电话|加我)[\s\p{P}]*[a-z0-9_-]{5,}/iu },
  { flag: "phone", pattern: /(?:^|[^\d])1[3-9]\d[ -]?\d{4}[ -]?\d{4}(?:[^\d]|$)/u },
  { flag: "email", pattern: /[\w.%+-]+@[\w.-]+\.[a-z]{2,}/iu },
  { flag: "precise_address", pattern: /(住址|家庭住址|身份证号|门牌号|几栋几单元|\d{1,4}号楼\d{1,4}室)/u },
  { flag: "personal_identifier", pattern: /(?:\d{17}[\dXx]|(?:银行卡|卡号)[\s:：-]*\d{16,19})/u },
  { flag: "real_name", pattern: new RegExp(contextualRealName, "u") },
  { flag: "sexual_harassment", pattern: /(约炮|裸照|发.{0,6}裸照|想睡你|摸你胸|强奸你|口交|性交|性器官)/u },
  {
    flag: "identifiable_allegation",
    pattern: new RegExp(`${contextualRealName}.{0,24}(?:诈骗|猥亵|强奸|出轨|偷窃|吸毒|卖淫|嫖娼)`, "u"),
  },
  { flag: "illegal_or_doxxing", pattern: /(人肉|开盒|身份证|银行卡号|杀人|制毒|贩毒)/u },
];

export function assessContentSafety(...parts: string[]): ContentSafetyFlag[] {
  const content = parts.join("\n");
  return safetyRules.filter(({ pattern }) => pattern.test(content)).map(({ flag }) => flag);
}
