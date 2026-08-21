import { sms } from "tencentcloud-sdk-nodejs-sms";

const CHINESE_PHONE = /^\+861[3-9]\d{9}$/;
const SIX_DIGIT_OTP = /^\d{6}$/;

export interface TencentSmsConfig {
  secretId: string;
  secretKey: string;
  sdkAppId: string;
  signName: string;
  templateId: string;
  region: string;
}

interface SendStatus {
  Code?: string;
}

interface SendResponse {
  SendStatusSet?: SendStatus[];
}

export interface TencentSmsClient {
  SendSms(input: {
    PhoneNumberSet: string[];
    SmsSdkAppId: string;
    SignName: string;
    TemplateId: string;
    TemplateParamSet: string[];
  }): Promise<SendResponse>;
}

export class SmsConfigurationError extends Error {
  constructor() {
    super("SMS provider is not configured");
    this.name = "SmsConfigurationError";
  }
}

export class SmsDeliveryError extends Error {
  constructor() {
    super("SMS provider rejected the request");
    this.name = "SmsDeliveryError";
  }
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new SmsConfigurationError();
  return value;
}

export function getTencentSmsConfig(): TencentSmsConfig {
  return {
    secretId: requiredEnv("TENCENTCLOUD_SECRET_ID"),
    secretKey: requiredEnv("TENCENTCLOUD_SECRET_KEY"),
    sdkAppId: requiredEnv("TENCENT_SMS_SDK_APP_ID"),
    signName: requiredEnv("TENCENT_SMS_SIGN_NAME"),
    templateId: requiredEnv("TENCENT_SMS_TEMPLATE_ID"),
    region: process.env.TENCENT_SMS_REGION?.trim() || "ap-guangzhou",
  };
}

export function createTencentSmsClient(config: TencentSmsConfig): TencentSmsClient {
  const Client = sms.v20210111.Client;
  return new Client({
    credential: {
      secretId: config.secretId,
      secretKey: config.secretKey,
    },
    region: config.region,
    profile: {
      signMethod: "TC3-HMAC-SHA256",
      httpProfile: {
        endpoint: "sms.tencentcloudapi.com",
        protocol: "https://",
        reqMethod: "POST",
        reqTimeout: 4,
      },
    },
  });
}

export function isSuccessfulTencentResponse(response: SendResponse): boolean {
  return response.SendStatusSet?.length === 1 && response.SendStatusSet[0]?.Code === "Ok";
}

export async function sendTencentOtp(
  phone: string,
  otp: string,
  config = getTencentSmsConfig(),
  client: TencentSmsClient = createTencentSmsClient(config),
): Promise<void> {
  if (!CHINESE_PHONE.test(phone) || !SIX_DIGIT_OTP.test(otp)) {
    throw new SmsDeliveryError();
  }

  let response: SendResponse;
  try {
    response = await client.SendSms({
      PhoneNumberSet: [phone],
      SmsSdkAppId: config.sdkAppId,
      SignName: config.signName,
      TemplateId: config.templateId,
      TemplateParamSet: [otp],
    });
  } catch {
    throw new SmsDeliveryError();
  }

  if (!isSuccessfulTencentResponse(response)) {
    throw new SmsDeliveryError();
  }
}
