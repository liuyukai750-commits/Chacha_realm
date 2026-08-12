import { requireSameOrigin, route } from "@/server/api";
import { markSquatAlertSeen } from "@/server/repositories/island-repository";
import { requireActiveSession } from "@/server/supabase/session";
import { uuid } from "@/server/validation";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return route(async () => {
    requireSameOrigin(request);
    const { id: rawId } = await params;
    const id = uuid(rawId, "id");
    const session = await requireActiveSession();
    return markSquatAlertSeen(id, session.accessToken);
  });
}
