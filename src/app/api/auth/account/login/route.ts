import type { AnonymousSession } from "@/contracts";
import { requireSameOrigin, readJson, route } from "@/server/api";
import { loginPasswordAccount } from "@/server/auth/password-service";
import { accountPassword, captchaToken, publicId } from "@/server/auth/validation";
import { object } from "@/server/validation";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return route<{ session: AnonymousSession }>(async () => {
    requireSameOrigin(request);
    const input = object(await readJson(request, 8_000));
    return loginPasswordAccount({
      request,
      publicId: publicId(input.publicId),
      password: accountPassword(input.password),
      captchaToken: captchaToken(input.captchaToken),
    });
  }, () => ({ "Cache-Control": "private, no-store" }));
}
