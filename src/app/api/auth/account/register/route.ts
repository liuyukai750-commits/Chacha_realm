import type { PasswordAccountProvisionResult } from "@/contracts";
import { ApiProblem, requireSameOrigin, readJson, route } from "@/server/api";
import { registerPasswordAccount } from "@/server/auth/password-service";
import { accountPassword, animalIdentity, captchaToken, displayName } from "@/server/auth/validation";
import { object } from "@/server/validation";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return route<PasswordAccountProvisionResult>(async () => {
    requireSameOrigin(request);
    const input = object(await readJson(request, 8_000));
    if (input.acceptedTerms !== true) {
      throw new ApiProblem(400, "terms_required", "请先阅读并同意用户协议和隐私政策。" );
    }
    return registerPasswordAccount({
      request,
      password: accountPassword(input.password),
      animal: animalIdentity(input.animal),
      displayName: displayName(input.displayName),
      captchaToken: captchaToken(input.captchaToken),
    });
  }, () => ({ "Cache-Control": "private, no-store" }));
}
