import type { AnonymousSession } from "@/contracts";
import { route } from "@/server/api";
import { getOptionalSession, publicSessionFor } from "@/server/supabase/session";

export const dynamic = "force-dynamic";

type AuthSessionState =
  | { status: "required"; required: true; needsProfile: true }
  | {
      status: "anonymous" | "authenticated";
      session: AnonymousSession;
      needsProfile: boolean;
    };

export async function GET() {
  return route<AuthSessionState>(async () => {
    const serverSession = await getOptionalSession();
    if (!serverSession) return { status: "required", required: true, needsProfile: true };
    const session = await publicSessionFor(serverSession);
    return {
      status: serverSession.isAnonymous ? "anonymous" : "authenticated",
      session,
      needsProfile: !session.onboardingComplete,
    };
  }, () => ({ "Cache-Control": "private, no-store" }));
}
