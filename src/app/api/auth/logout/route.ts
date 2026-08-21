import type { LogoutResult } from "@/contracts";
import { requireSameOrigin, route } from "@/server/api";
import { logout } from "@/server/auth/service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return route<LogoutResult>(async () => {
    requireSameOrigin(request);
    await logout();
    return { loggedOut: true };
  }, () => ({ "Cache-Control": "private, no-store" }));
}
