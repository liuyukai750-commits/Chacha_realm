import type { ZonePresenceResult } from "@/contracts";
import { readJson, requireSameOrigin, route } from "@/server/api";
import { validateLocationProof } from "@/server/security/location";
import { createPresenceCredential } from "@/server/security/presence";
import { requireSafeSeek } from "@/server/security/seek";
import { requireActiveSession } from "@/server/supabase/session";
import { object, uuid } from "@/server/validation";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return route<ZonePresenceResult>(async () => {
    requireSameOrigin(request);
    const session = await requireActiveSession();
    const body = object(await readJson(request));
    const spotId = uuid(body.spotId, "spotId");
    const location = validateLocationProof(body.location);
    const evaluated = requireSafeSeek(spotId, location);

    const local = evaluated.seekState === "inside_zone" || evaluated.seekState === "found";
    if (!local) return { presence: "remote", seekState: evaluated.seekState };

    const credential = createPresenceCredential(session.userId, evaluated.spotId);
    return {
      presence: "local",
      seekState: evaluated.seekState,
      presenceToken: credential.token,
      expiresAt: credential.expiresAt,
    };
  });
}
