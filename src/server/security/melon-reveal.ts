import "server-only";

import type { MelonDetail } from "@/contracts";
import { ApiProblem } from "@/server/api";
import { requirePresenceCredential } from "@/server/security/presence";

export function requireMelonRevealAccess(
  melon: MelonDetail,
  userId: string,
  presenceToken: string | null,
): void {
  if (melon.revealMode === "open") return;
  if (!presenceToken) {
    throw new ApiProblem(403, "seek_required", "这颗密藏大瓜必须到现场顺藤摸瓜后才能揭开。 ");
  }
  requirePresenceCredential(presenceToken, userId, { spotId: melon.spot.id, requireFound: true });
}
