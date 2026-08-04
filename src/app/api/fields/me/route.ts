import { route } from "@/server/api";
import { getField } from "@/server/repositories/island-repository";
import { requireSession } from "@/server/supabase/session";

export const dynamic = "force-dynamic";

export async function GET() {
  return route(async () => {
    const session = await requireSession();
    return getField(null, session.accessToken);
  });
}
