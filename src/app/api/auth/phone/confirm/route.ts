import type { ConfirmPhoneAccountSwitchResult } from "@/contracts";
import { ApiProblem, requireSameOrigin, readJson, route } from "@/server/api";
import { confirmPhoneAccountSwitch } from "@/server/auth/service";
import { object } from "@/server/validation";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return route<ConfirmPhoneAccountSwitchResult>(async () => {
    requireSameOrigin(request);
    const input = object(await readJson(request, 1_000));
    if (typeof input.confirm !== "boolean") {
      throw new ApiProblem(400, "confirmation_required", "请选择是否进入已有瓜田。");
    }
    return confirmPhoneAccountSwitch(input.confirm);
  }, () => ({ "Cache-Control": "private, no-store" }));
}
