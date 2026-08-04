import { readJson, requireSameOrigin, route } from "@/server/api";
import { createReport } from "@/server/repositories/island-repository";
import { requireSession } from "@/server/supabase/session";
import { report } from "@/server/validation";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return route(async () => {
    requireSameOrigin(request);
    const session = await requireSession();
    return createReport(report(await readJson(request)), session.accessToken);
  });
}
