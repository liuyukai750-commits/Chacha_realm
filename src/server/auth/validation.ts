import type { AnimalIdentity } from "@/contracts";
import { ApiProblem } from "@/server/api";

export const ANIMAL_IDENTITIES: readonly AnimalIdentity[] = [
  "猹",
  "水豚",
  "狐狸",
  "熊猫",
  "青蛙",
  "仓鼠",
];

const animalSet = new Set<string>(ANIMAL_IDENTITIES);
const nicknamePattern = /^[\u4E00-\u9FFFA-Za-z0-9]{1,6}$/u;
export const STEWARD_DISPLAY_NAME = "猹猹国王";
const blockedNicknameSignals = [
  /官方|客服|管理员|系统|平台|猹猹街/iu,
  /政府|公安|警察/iu,
  /微信|微商|加我|手机|电话|QQ|VX|HTTP|WWW|\.COM|\.CN/iu,
  /色情|约炮|卖淫|嫖娼|强奸|操你|肏|傻逼|死妈/iu,
  /赌博|博彩|代开发票|洗钱|毒品/iu,
];

export function normalizeChinesePhone(value: unknown): string {
  if (typeof value !== "string") {
    throw new ApiProblem(400, "invalid_phone", "请输入有效的中国大陆手机号。");
  }
  let normalized = value.normalize("NFKC").replace(/[\s-]/g, "");
  if (normalized.startsWith("0086")) normalized = `+86${normalized.slice(4)}`;
  else if (!normalized.startsWith("+86")) normalized = `+86${normalized}`;
  if (!/^\+861[3-9]\d{9}$/.test(normalized)) {
    throw new ApiProblem(400, "invalid_phone", "请输入有效的中国大陆手机号。");
  }
  return normalized;
}

export function otpCode(value: unknown): string {
  if (typeof value !== "string" || !/^\d{6}$/.test(value.normalize("NFKC"))) {
    throw new ApiProblem(400, "invalid_otp", "请输入 6 位短信验证码。");
  }
  return value.normalize("NFKC");
}

export function captchaToken(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length < 8 || value.length > 4096) {
    throw new ApiProblem(400, "invalid_captcha", "人机验证信息无效，请重试。");
  }
  return value;
}

export function animalIdentity(value: unknown): AnimalIdentity {
  if (typeof value !== "string" || !animalSet.has(value)) {
    throw new ApiProblem(400, "invalid_animal", "请选择可用的动物身份。");
  }
  return value as AnimalIdentity;
}

export function displayName(value: unknown): string {
  if (typeof value !== "string") {
    throw new ApiProblem(400, "invalid_display_name", "昵称需为 1—6 个汉字、英文字母或数字。");
  }
  const normalized = value.normalize("NFKC").trim();
  if (!nicknamePattern.test(normalized)) {
    throw new ApiProblem(400, "invalid_display_name", "昵称需为 1—6 个汉字、英文字母或数字。");
  }
  if (normalized === STEWARD_DISPLAY_NAME) {
    throw new ApiProblem(422, "display_name_reserved", "这个昵称属于猹猹街主理人，请换一个。");
  }
  if (blockedNicknameSignals.some((pattern) => pattern.test(normalized))) {
    throw new ApiProblem(422, "display_name_held", "这个昵称暂时不能使用，请换一个。");
  }
  return normalized;
}

export function deletionConfirmation(value: unknown): "DELETE" {
  if (value !== "DELETE") {
    throw new ApiProblem(400, "confirmation_required", "请确认注销账号后再继续。");
  }
  return "DELETE";
}

const publicIdPattern = /^CC-[0-9A-HJKMNP-TV-Z]{8}$/;
const recoveryCodePattern = /^[0-9A-HJKMNP-TV-Z]{16}$/;

export function publicId(value: unknown): string {
  if (typeof value !== "string") {
    throw new ApiProblem(400, "invalid_public_id", "请输入正确的猹号。" );
  }
  const normalized = value.normalize("NFKC").trim().toUpperCase();
  if (!publicIdPattern.test(normalized)) {
    throw new ApiProblem(400, "invalid_public_id", "猹号格式应为 CC- 加 8 位字符。" );
  }
  return normalized;
}

export function accountPassword(value: unknown): string {
  if (typeof value !== "string") {
    throw new ApiProblem(400, "invalid_password", "密码需为 8—64 个字符。" );
  }
  const normalized = value.normalize("NFKC");
  if (
    normalized.length < 8
    || normalized.length > 64
    || normalized !== normalized.trim()
    || /[\u0000-\u001F\u007F\u200B-\u200D\uFEFF]/u.test(normalized)
  ) {
    throw new ApiProblem(400, "invalid_password", "密码需为 8—64 个字符，不能含首尾空格或隐藏字符。" );
  }
  return normalized;
}

export function recoveryCode(value: unknown): string {
  if (typeof value !== "string") {
    throw new ApiProblem(400, "invalid_recovery_code", "请输入完整的恢复码。" );
  }
  const normalized = value.normalize("NFKC").toUpperCase().replace(/[\s-]/g, "");
  if (!recoveryCodePattern.test(normalized)) {
    throw new ApiProblem(400, "invalid_recovery_code", "恢复码格式不正确。" );
  }
  return normalized;
}
