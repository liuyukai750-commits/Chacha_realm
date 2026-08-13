import { ApiProblem, readJson, requireSameOrigin, route } from "@/server/api";
import { setMelonBasketDismissal } from "@/server/repositories/island-repository";
import { requireActiveSession } from "@/server/supabase/session";
import { object, uuid } from "@/server/validation";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return route(async () => {
    requireSameOrigin(request);
    const { id: rawId } = await params;
    const id = uuid(rawId, "id");
    const session = await requireActiveSession();
    const body = object(await readJson(request));
    if (typeof body.hidden !== "boolean") throw new ApiProblem(400, "invalid_request", "hidden 必须是布尔值。");
    return setMelonBasketDismissal(id, body.hidden, session.userId);
  });
}
