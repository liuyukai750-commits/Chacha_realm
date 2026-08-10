import type { PlantFieldRequest } from "@/contracts";
import { readJson, requireSameOrigin, route } from "@/server/api";
import { plantField } from "@/server/repositories/island-repository";
import { requireActiveSession } from "@/server/supabase/session";
import { fieldPlotIndex, object, uuid } from "@/server/validation";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return route(async () => {
    requireSameOrigin(request);
    const session = await requireActiveSession();
    const body = object(await readJson(request));
    const input: PlantFieldRequest = {
      plotIndex: fieldPlotIndex(body.plotIndex),
      operationId: uuid(body.operationId, "operationId"),
    };
    return plantField(input.plotIndex, input.operationId, session.accessToken);
  });
}
