import { route } from "@/server/api";
import { requireAdminSession } from "@/server/admin/access";
import { getAdminOverview } from "@/server/admin/overview";

export const dynamic = "force-dynamic";

export async function GET() {
  return route(
    async () => {
      await requireAdminSession();
      return getAdminOverview();
    },
    () => ({
      "Cache-Control": "private, no-store, max-age=0",
      Vary: "Cookie",
    }),
  );
}
