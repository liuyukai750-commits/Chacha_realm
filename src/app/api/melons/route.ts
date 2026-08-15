import type { CreateMelonRequest } from "@/contracts";
import { readJson, requireSameOrigin, route } from "@/server/api";
import { createMelon } from "@/server/repositories/island-repository";
import { validateLocationProof } from "@/server/security/location";
import { requireActiveSession } from "@/server/supabase/session";
import { burialKind, object, revealMode, text, topic, uuid } from "@/server/validation";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return route(async () => {
    requireSameOrigin(request);
    const session = await requireActiveSession();
    const body = object(await readJson(request));
    const kind = burialKind(body.burialKind ?? "public_spot");
    const base = {
      operationId: uuid(body.operationId, "operationId"),
      topic: topic(body.topic),
      title: text(body.title, "title", 60),
      content: text(body.content, "content", 1000),
      revealMode: revealMode(body.revealMode),
    };
    const input: CreateMelonRequest = kind === "nearby_area"
      ? { ...base, burialKind: "nearby_area", location: validateLocationProof(body.location) }
      : { ...base, burialKind: "public_spot", spotId: uuid(body.spotId, "spotId") };
    return createMelon(input, session.userId);
  });
}
