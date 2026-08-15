import type { MelonCommentsPage } from "@/contracts";
import { ApiProblem, readJson, requireSameOrigin, route } from "@/server/api";
import { addComment, getComments } from "@/server/repositories/island-repository";
import { requirePresenceCredential } from "@/server/security/presence";
import { requireActiveSession, requireSession } from "@/server/supabase/session";
import { object, text, uuid } from "@/server/validation";

export const dynamic = "force-dynamic";

function pageLimit(value: string | null): number {
  if (value === null) return 20;
  if (!/^\d+$/.test(value)) throw new ApiProblem(400, "invalid_limit", "limit 必须是 1 到 50 的整数。 ");
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 50) {
    throw new ApiProblem(400, "invalid_limit", "limit 必须是 1 到 50 的整数。 ");
  }
  return parsed;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return route<MelonCommentsPage>(async () => {
    const { id: rawId } = await params;
    const id = uuid(rawId, "id");
    const session = await requireSession();
    const url = new URL(request.url);
    return getComments(
      id,
      url.searchParams.get("cursor"),
      pageLimit(url.searchParams.get("limit")),
      session.accessToken,
    );
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return route(async () => {
    requireSameOrigin(request);
    const { id: rawId } = await params;
    const id = uuid(rawId, "id");
    const session = await requireActiveSession();
    const body = object(await readJson(request));
    const content = text(body.content, "content", 140);
    const presenceToken = text(body.presenceToken, "presenceToken", 2_048);
    requirePresenceCredential(presenceToken, session.userId, { spotId: id });
    return addComment(id, content, session.userId);
  });
}
