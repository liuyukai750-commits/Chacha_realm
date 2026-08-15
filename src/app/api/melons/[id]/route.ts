import type { OpenedMelon } from "@/contracts";
import { requireSameOrigin, route } from "@/server/api";
import { deleteOwnMelon, getMelonReadPolicy, openMelon } from "@/server/repositories/island-repository";
import { requirePresenceCredential } from "@/server/security/presence";
import { issueReadToken } from "@/server/security/read-token";
import { requireSession } from "@/server/supabase/session";
import { uuid } from "@/server/validation";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return route<OpenedMelon>(async () => {
    const { id: rawId } = await params;
    const id = uuid(rawId, "id");
    const session = await requireSession();
    const policy = await getMelonReadPolicy(id, session.userId);
    if (policy.burialKind === "nearby_area" && !policy.isOwner) {
      requirePresenceCredential(request.headers.get("x-chacha-presence-token") ?? "", session.userId, { spotId: id });
    }
    const melon = await openMelon(id, session.userId);
    const read = issueReadToken(session.userId, id);
    return { melon, readToken: read.token, completableAt: read.completableAt };
  });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return route(async () => {
    requireSameOrigin(request);
    const { id: rawId } = await params;
    const id = uuid(rawId, "id");
    const session = await requireSession();
    return deleteOwnMelon(id, session.userId);
  });
}
