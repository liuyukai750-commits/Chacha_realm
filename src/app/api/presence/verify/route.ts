import type { ZonePresenceResult } from "@/contracts";
import { readJson, requireSameOrigin, route } from "@/server/api";
import { getMelonPresenceTarget, nearbyCellIdForLocation } from "@/server/repositories/island-repository";
import { validateLocationProof } from "@/server/security/location";
import { resolveSupportedCityForBurial } from "@/server/security/location-city";
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
    const melonId = uuid(body.melonId, "melonId");
    const location = validateLocationProof(body.location);
    const target = await getMelonPresenceTarget(melonId, session.userId);
    if (target.burialKind === "nearby_area") {
      const resolvedCityId = resolveSupportedCityForBurial(location);
      const local = resolvedCityId === target.nearbyCityId
        && nearbyCellIdForLocation(resolvedCityId, location) === target.nearbyCellId;
      if (!local) return { presence: "remote", seekState: "outside" };
      const credential = createPresenceCredential(session.userId, melonId, "zone");
      return { presence: "local", seekState: "inside_zone", presenceToken: credential.token, expiresAt: credential.expiresAt };
    }
    if (!target.spotId) return { presence: "remote", seekState: "outside" };
    const evaluated = requireSafeSeek(target.spotId, location);

    const local = evaluated.seekState === "inside_zone" || evaluated.seekState === "found";
    if (!local) return { presence: "remote", seekState: evaluated.seekState };

    const credential = createPresenceCredential(
      session.userId,
      melonId,
      evaluated.seekState === "found" ? "found" : "zone",
    );
    return {
      presence: "local",
      seekState: evaluated.seekState,
      presenceToken: credential.token,
      expiresAt: credential.expiresAt,
    };
  });
}
