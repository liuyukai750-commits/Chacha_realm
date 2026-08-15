import "server-only";

import { ApiProblem } from "@/server/api";
import { publicSessionFor, requireSession, type ServerSession } from "@/server/supabase/session";
import { isAllowedAdminIdentity, parseAdminPublicIds } from "@/server/admin/access-policy";

export async function requireAdminSession(): Promise<ServerSession> {
  const session = await requireSession();
  const identity = await publicSessionFor(session);
  const allowlist = parseAdminPublicIds(process.env.CHACHA_ADMIN_PUBLIC_IDS);

  if (session.isAnonymous || !isAllowedAdminIdentity(identity, allowlist)) {
    throw new ApiProblem(403, "admin_forbidden", "当前身份无权查看主理人后台。");
  }
  return session;
}
