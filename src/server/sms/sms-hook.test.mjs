import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import { Webhook } from "standardwebhooks";

import {
  isSuccessfulTencentResponse,
  sendTencentOtp,
} from "./tencent.ts";
import {
  SmsHookVerificationError,
  verifySupabaseSmsHook,
} from "./supabase-hook.ts";

const secret = randomBytes(32).toString("base64");
const hookSecret = `v1,whsec_${secret}`;

function signedRequest(payload) {
  const raw = JSON.stringify(payload);
  const date = new Date();
  const id = "msg_auth_sms_1";
  const webhook = new Webhook(`whsec_${secret}`);
  return {
    raw,
    headers: new Headers({
      "webhook-id": id,
      "webhook-timestamp": String(Math.floor(date.getTime() / 1000)),
      "webhook-signature": webhook.sign(id, date, raw),
    }),
  };
}

test("verifies a signed Supabase SMS payload without changing phone or OTP", () => {
  const request = signedRequest({
    user: { phone: "+8613800138000" },
    sms: { otp: "561166" },
  });
  assert.deepEqual(verifySupabaseSmsHook(request.raw, request.headers, hookSecret), {
    phone: "+8613800138000",
    otp: "561166",
  });
});

test("rejects invalid signatures and malformed phone payloads", () => {
  const request = signedRequest({ user: { phone: "13800138000" }, sms: { otp: "561166" } });
  assert.throws(
    () => verifySupabaseSmsHook(request.raw, request.headers, hookSecret),
    SmsHookVerificationError,
  );
  request.headers.set("webhook-signature", "v1,invalid");
  assert.throws(
    () => verifySupabaseSmsHook(request.raw, request.headers, hookSecret),
    SmsHookVerificationError,
  );
});

test("accepts only one successful Tencent Cloud send status", () => {
  assert.equal(isSuccessfulTencentResponse({ SendStatusSet: [{ Code: "Ok" }] }), true);
  assert.equal(isSuccessfulTencentResponse({ SendStatusSet: [] }), false);
  assert.equal(isSuccessfulTencentResponse({ SendStatusSet: [{ Code: "Failed" }] }), false);
});

test("sends only the OTP template variable and rejects provider failures", async () => {
  const calls = [];
  const config = {
    secretId: "secret-id",
    secretKey: "secret-key",
    sdkAppId: "1400000000",
    signName: "猹猹街",
    templateId: "123456",
    region: "ap-guangzhou",
  };
  const client = {
    async SendSms(input) {
      calls.push(input);
      return { SendStatusSet: [{ Code: "Ok" }] };
    },
  };
  await sendTencentOtp("+8613800138000", "561166", config, client);
  assert.deepEqual(calls, [
    {
      PhoneNumberSet: ["+8613800138000"],
      SmsSdkAppId: "1400000000",
      SignName: "猹猹街",
      TemplateId: "123456",
      TemplateParamSet: ["561166"],
    },
  ]);

  await assert.rejects(
    sendTencentOtp("+8613800138000", "561166", config, {
      async SendSms() {
        return { SendStatusSet: [{ Code: "Failed" }] };
      },
    }),
  );
});
