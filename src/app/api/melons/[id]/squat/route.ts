import { ApiProblem, readJson, requireSameOrigin, route } from "@/server/api";
import { setSquat } from "@/server/repositories/island-repository";
import { requireSession } from "@/server/supabase/session";
import { object, uuid } from "@/server/validation";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return route(async () => {
    requireSameOrigin(request);
    const { id: rawId } = await params;
    const id = uuid(rawId, "id");
    const session = await requireSession();
    const body = object(await readJson(request));
    if (typeof body.active !== "boolean") throw new ApiProblem(400, "invalid_request", "active 必须是布尔值。 ");
    return setSquat(id, body.active, session.accessToken);
  });
}
