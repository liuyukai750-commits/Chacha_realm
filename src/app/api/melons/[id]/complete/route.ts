import { readJson, requireSameOrigin, route } from "@/server/api";
import { completeRead } from "@/server/repositories/island-repository";
import { verifyReadToken } from "@/server/security/read-token";
import { requireActiveSession } from "@/server/supabase/session";
import { object, text, uuid } from "@/server/validation";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return route(async () => {
    requireSameOrigin(request);
    const { id: rawId } = await params;
    const id = uuid(rawId, "id");
    const session = await requireActiveSession();
    const body = object(await readJson(request));
    const readToken = text(body.readToken, "readToken", 4096);
    verifyReadToken(readToken, session.userId, id);
    return completeRead(id, session.userId);
  });
}
