import type { PhoneOtpVerifyResult } from "@/contracts";
import { requireSameOrigin, readJson, route } from "@/server/api";
import { verifyPhoneOtp } from "@/server/auth/service";
import { normalizeChinesePhone, otpCode } from "@/server/auth/validation";
import { object } from "@/server/validation";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return route<PhoneOtpVerifyResult>(async () => {
    requireSameOrigin(request);
    const input = object(await readJson(request, 2_000));
    return verifyPhoneOtp(request, normalizeChinesePhone(input.phone), otpCode(input.code));
  }, () => ({ "Cache-Control": "private, no-store" }));
}
