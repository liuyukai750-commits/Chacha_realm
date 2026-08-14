import type { CompleteProfileResult } from "@/contracts";
import { requireSameOrigin, readJson, route } from "@/server/api";
import { completeProfile } from "@/server/auth/service";
import { animalIdentity, displayName } from "@/server/auth/validation";
import { object } from "@/server/validation";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return route<CompleteProfileResult & { profile: CompleteProfileResult["session"] }>(async () => {
    requireSameOrigin(request);
    const input = object(await readJson(request, 2_000));
    const session = await completeProfile(displayName(input.displayName), animalIdentity(input.animal));
    return { session, profile: session };
  }, () => ({ "Cache-Control": "private, no-store" }));
}
