import type { CityId } from "@/contracts";
import type { IslandBootstrap } from "@/components/demo-island-adapter";
import { requireSameOrigin, route } from "@/server/api";
import { discover, getCities, getField, getSquatShelf } from "@/server/repositories/island-repository";
import { createOrResumeAnonymousSessionBundle } from "@/server/supabase/session";

export const dynamic = "force-dynamic";

type TimingName = "auth" | "cities" | "discovery" | "field" | "squats" | "total";

function serverTimingHeader(timings: Partial<Record<TimingName, number>>): string {
  return Object.entries(timings)
    .map(([name, duration]) => `${name};dur=${Math.max(0, duration ?? 0).toFixed(1)}`)
    .join(", ");
}

export async function POST(request: Request) {
  const startedAt = performance.now();
  const timings: Partial<Record<TimingName, number>> = {};
  const timed = async <T>(name: TimingName, work: () => Promise<T>): Promise<T> => {
    const stageStartedAt = performance.now();
    try {
      return await work();
    } finally {
      timings[name] = performance.now() - stageStartedAt;
    }
  };

  return route<IslandBootstrap>(async () => {
    requireSameOrigin(request);
    const { serverSession, publicSession } = await timed("auth", createOrResumeAnonymousSessionBundle);
    const fieldPromise = timed("field", () => getField(null, serverSession.accessToken));
    const squatsPromise = timed("squats", () => getSquatShelf(serverSession.accessToken));
    const citiesPromise = timed("cities", getCities);
    const discoveryPromise = citiesPromise.then((cities) => {
      const selectedCityId: CityId | undefined = cities[0]?.id;
      return timed("discovery", () => discover(
        selectedCityId ? { selectedCityId } : {},
        serverSession.accessToken,
        serverSession.userId,
      ));
    });
    const [cities, discovery, field, squatShelf] = await Promise.all([
      citiesPromise,
      discoveryPromise,
      fieldPromise,
      squatsPromise,
    ]);
    return {
      session: publicSession,
      cities,
      discovery,
      field,
      melonDetails: {},
      squatShelf,
    };
  }, () => {
    timings.total = performance.now() - startedAt;
    return {
      "Server-Timing": serverTimingHeader(timings),
      "Cache-Control": "private, no-store",
    };
  });
}
