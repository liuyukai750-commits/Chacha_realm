import { route } from "@/server/api";
import { getField } from "@/server/repositories/island-repository";
import { requireSession } from "@/server/supabase/session";
import { text } from "@/server/validation";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ alias: string }> }) {
  return route(async () => {
    const { alias: rawAlias } = await params;
    const alias = text(rawAlias, "alias", 40);
    const session = await requireSession();
    return getField(alias, session.accessToken);
  });
}
