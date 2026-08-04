import { route } from "@/server/api";
import { createOrResumeAnonymousSession } from "@/server/supabase/session";

export const dynamic = "force-dynamic";

export async function POST() {
  return route(() => createOrResumeAnonymousSession());
}
