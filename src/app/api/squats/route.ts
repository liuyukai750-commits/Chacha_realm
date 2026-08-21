import { route } from "@/server/api";
import { getSquatShelf } from "@/server/repositories/island-repository";
import { requireSession } from "@/server/supabase/session";

export const dynamic = "force-dynamic";

export async function GET() {
  return route(async () => {
    const session = await requireSession();
    return getSquatShelf(session.userId);
  });
}
