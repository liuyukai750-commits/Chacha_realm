import type { DeleteAccountResult } from "@/contracts";
import { requireSameOrigin, readJson, route } from "@/server/api";
import { deleteCurrentAccount } from "@/server/auth/service";
import { deletionConfirmation } from "@/server/auth/validation";
import { object } from "@/server/validation";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return route<DeleteAccountResult>(async () => {
    requireSameOrigin(request);
    const input = object(await readJson(request, 1_000));
    deletionConfirmation(input.confirmation);
    await deleteCurrentAccount();
    return { deleted: true };
  }, () => ({ "Cache-Control": "private, no-store" }));
}
