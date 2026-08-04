import { route } from "@/server/api";
import { getCities } from "@/server/repositories/island-repository";

export const dynamic = "force-dynamic";

export async function GET() {
  return route(() => getCities());
}
