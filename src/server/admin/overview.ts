import "server-only";

import type { AdminOverview } from "@/contracts/admin";
import { parseAdminOverview } from "@/server/admin/parse-overview";
import { serviceRpc } from "@/server/supabase/http";

export async function getAdminOverview(): Promise<AdminOverview> {
  const result = await serviceRpc<unknown>("get_admin_overview", {});
  return parseAdminOverview(result);
}
