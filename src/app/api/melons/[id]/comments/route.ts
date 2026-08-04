import { readJson, requireSameOrigin, route } from "@/server/api";
import { addComment } from "@/server/repositories/island-repository";
import { assessContentSafety } from "@/server/security/content-safety";
import { requireSession } from "@/server/supabase/session";
import { object, text, uuid } from "@/server/validation";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return route(async () => {
    requireSameOrigin(request);
    const { id: rawId } = await params;
    const id = uuid(rawId, "id");
    const session = await requireSession();
    const body = object(await readJson(request));
    const content = text(body.content, "content", 140);
    assessContentSafety(content);
    return addComment(id, content, session.accessToken);
  });
}
