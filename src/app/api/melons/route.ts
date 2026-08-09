import type { CreateMelonRequest } from "@/contracts";
import { readJson, requireSameOrigin, route } from "@/server/api";
import { createMelon } from "@/server/repositories/island-repository";
import { validateLocationProof } from "@/server/security/location";
import { requireActiveSession } from "@/server/supabase/session";
import { object, text, topic, uuid } from "@/server/validation";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return route(async () => {
    requireSameOrigin(request);
    const session = await requireActiveSession();
    const body = object(await readJson(request));
    const input: CreateMelonRequest = {
      spotId: uuid(body.spotId, "spotId"),
      topic: topic(body.topic),
      title: text(body.title, "title", 60),
      content: text(body.content, "content", 1000),
      location: validateLocationProof(body.location),
    };
    return createMelon(input, session.accessToken);
  });
}
