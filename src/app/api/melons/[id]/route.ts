import type { OpenedMelon } from "@/contracts";
import { route } from "@/server/api";
import { openMelon } from "@/server/repositories/island-repository";
import { requireMelonRevealAccess } from "@/server/security/melon-reveal";
import { issueReadToken } from "@/server/security/read-token";
import { requireSession } from "@/server/supabase/session";
import { uuid } from "@/server/validation";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return route<OpenedMelon>(async () => {
    const { id: rawId } = await params;
    const id = uuid(rawId, "id");
    const session = await requireSession();
    const melon = await openMelon(id, session.userId);
    requireMelonRevealAccess(melon, session.userId, request.headers.get("x-chacha-presence-token"));
    const read = issueReadToken(session.userId, id);
    return { melon, readToken: read.token, completableAt: read.completableAt };
  });
}
