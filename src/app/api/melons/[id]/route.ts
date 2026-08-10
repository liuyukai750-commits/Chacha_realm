import type { OpenedMelon } from "@/contracts";
import { route } from "@/server/api";
import { openMelon } from "@/server/repositories/island-repository";
import { issueReadToken } from "@/server/security/read-token";
import { requireSession } from "@/server/supabase/session";
import { uuid } from "@/server/validation";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return route<OpenedMelon>(async () => {
    const { id: rawId } = await params;
    const id = uuid(rawId, "id");
    const session = await requireSession();
    const melon = await openMelon(id, session.userId);
    const read = issueReadToken(session.userId, id);
    return { melon, readToken: read.token, completableAt: read.completableAt };
  });
}
