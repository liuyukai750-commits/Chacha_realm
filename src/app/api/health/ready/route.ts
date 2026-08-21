import { postgresQuery } from "@/server/postgres/client";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store" };

export async function GET() {
  try {
    const result = await postgresQuery<{ ok: number }>("select 1::int as ok");
    if (result.rows[0]?.ok !== 1) throw new Error("readiness query returned no row");
    return Response.json({ status: "ready" }, { headers });
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503, headers });
  }
}
