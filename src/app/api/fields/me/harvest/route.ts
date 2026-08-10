import { requireSameOrigin, route } from "@/server/api";
import { harvestField } from "@/server/repositories/island-repository";
import { requireActiveSession } from "@/server/supabase/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return route(async () => {
    requireSameOrigin(request);
    const session = await requireActiveSession();
    return harvestField(session.accessToken);
  });
}
