import { NextResponse } from "next/server";

import {
  SmsConfigurationError,
  SmsDeliveryError,
  sendTencentOtp,
} from "@/server/sms/tencent";
import {
  SmsHookVerificationError,
  verifySupabaseSmsHook,
} from "@/server/sms/supabase-hook";

export const dynamic = "force-dynamic";

const MAX_HOOK_BYTES = 16_384;

function errorResponse(status: number, message: string) {
  return NextResponse.json(
    { error: { http_code: status, message } },
    { status, headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function POST(request: Request) {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_HOOK_BYTES) {
    return errorResponse(413, "SMS hook payload is too large");
  }

  const rawPayload = await request.text();
  if (new TextEncoder().encode(rawPayload).byteLength > MAX_HOOK_BYTES) {
    return errorResponse(413, "SMS hook payload is too large");
  }

  try {
    const secret = process.env.SUPABASE_SEND_SMS_HOOK_SECRET;
    if (!secret) throw new SmsConfigurationError();
    const { phone, otp } = verifySupabaseSmsHook(rawPayload, request.headers, secret);
    await sendTencentOtp(phone, otp);
    return new NextResponse(null, {
      status: 200,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof SmsHookVerificationError) {
      return errorResponse(401, "SMS hook signature or payload is invalid");
    }
    if (error instanceof SmsConfigurationError) {
      return errorResponse(503, "SMS service is not configured");
    }
    if (error instanceof SmsDeliveryError) {
      return errorResponse(502, "SMS provider rejected the request");
    }
    console.error("[sms-hook] unexpected failure", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    return errorResponse(500, "SMS service failed unexpectedly");
  }
}
