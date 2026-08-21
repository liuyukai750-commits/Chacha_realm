import type { PhoneOtpRequestResult } from "@/contracts";
import { ApiProblem, requireSameOrigin, readJson, route } from "@/server/api";
import { requestPhoneOtp } from "@/server/auth/service";
import { captchaToken, normalizeChinesePhone } from "@/server/auth/validation";
import { object } from "@/server/validation";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return route<PhoneOtpRequestResult>(async () => {
    requireSameOrigin(request);
    const input = object(await readJson(request, 5_000));
    if (input.acceptedTerms !== true) {
      throw new ApiProblem(400, "terms_required", "请先阅读并同意用户协议和隐私政策。");
    }
    return requestPhoneOtp(
      request,
      normalizeChinesePhone(input.phone),
      captchaToken(input.captchaToken),
    );
  }, () => ({ "Cache-Control": "private, no-store" }));
}
