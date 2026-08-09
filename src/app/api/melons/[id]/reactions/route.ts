import { readJson, requireSameOrigin, route } from "@/server/api";
import { setReaction } from "@/server/repositories/island-repository";
import { requireActiveSession } from "@/server/supabase/session";
import { object, reaction, uuid } from "@/server/validation";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return route(async () => {
    requireSameOrigin(request);
    const { id: rawId } = await params;
    const id = uuid(rawId, "id");
    const session = await requireActiveSession();
    const body = object(await readJson(request));
    return setReaction(id, reaction(body.reaction), session.accessToken);
  });
}
