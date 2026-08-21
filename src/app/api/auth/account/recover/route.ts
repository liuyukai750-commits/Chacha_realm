import type { PasswordAccountProvisionResult } from "@/contracts";
import { requireSameOrigin, readJson, route } from "@/server/api";
import { recoverPasswordAccount } from "@/server/auth/password-service";
import { accountPassword, captchaToken, publicId, recoveryCode } from "@/server/auth/validation";
import { object } from "@/server/validation";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return route<PasswordAccountProvisionResult>(async () => {
    requireSameOrigin(request);
    const input = object(await readJson(request, 8_000));
    return recoverPasswordAccount({
      request,
      publicId: publicId(input.publicId),
      recoveryCode: recoveryCode(input.recoveryCode),
      newPassword: accountPassword(input.newPassword),
      captchaToken: captchaToken(input.captchaToken),
    });
  }, () => ({ "Cache-Control": "private, no-store" }));
}
