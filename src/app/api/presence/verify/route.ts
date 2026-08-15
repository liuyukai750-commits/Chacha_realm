import type { ZonePresenceResult } from "@/contracts";
import { readJson, requireSameOrigin, route } from "@/server/api";
import { getMelonPresenceTarget } from "@/server/repositories/island-repository";
import { validateLocationProof } from "@/server/security/location";
import { createPresenceCredential } from "@/server/security/presence";
import { requireActiveSession } from "@/server/supabase/session";
import { object, uuid } from "@/server/validation";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return route<ZonePresenceResult>(async () => {
    requireSameOrigin(request);
    const session = await requireActiveSession();
    const body = object(await readJson(request));
    const melonId = uuid(body.melonId, "melonId");
    const location = validateLocationProof(body.location);
    const target = await getMelonPresenceTarget(melonId, session.userId, location);
    if (!target.withinOneKm) return { presence: "remote", seekState: "outside" };

    const credential = createPresenceCredential(session.userId, melonId, "zone");
    return {
      presence: "local",
      seekState: "inside_zone",
      presenceToken: credential.token,
      expiresAt: credential.expiresAt,
    };
  });
}
