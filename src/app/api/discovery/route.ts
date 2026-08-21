import type { DiscoveryRequest } from "@/contracts";
import { readJson, route } from "@/server/api";
import { discover } from "@/server/repositories/island-repository";
import { validateLocationProof } from "@/server/security/location";
import { requireSession } from "@/server/supabase/session";
import { cityId, object } from "@/server/validation";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return route(async () => {
    const session = await requireSession();
    const body = object(await readJson(request));
    const input: DiscoveryRequest = {
      ...(body.location === undefined ? {} : { location: validateLocationProof(body.location) }),
      ...(body.selectedCityId === undefined ? {} : { selectedCityId: cityId(body.selectedCityId) }),
    };
    return discover(input, session.accessToken, session.userId);
  });
}
