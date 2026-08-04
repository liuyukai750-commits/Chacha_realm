import type {
  AnonymousSession,
  ApiError,
  CitySummary,
  CompleteReadResult,
  CreateMelonResult,
  DiscoveryResponse,
  FieldView,
  MelonComment,
  MelonDetail,
  OpenedMelon,
  ReactionType,
} from "@/contracts";
import type { IslandAdapter, IslandBootstrap } from "./demo-island-adapter";

export class IslandHttpError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = "IslandHttpError";
  }
}

export function isExplicitServiceUnavailable(error: unknown): error is IslandHttpError {
  return error instanceof IslandHttpError && error.status === 503 && error.code === "service_unavailable";
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const hasBody = init?.body !== undefined;
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    cache: "no-store",
    headers: hasBody ? { "content-type": "application/json" } : undefined,
  });
  const payload = await response.json().catch(() => null) as T | ApiError | null;
  if (!response.ok) {
    const problem = payload && typeof payload === "object" && "error" in payload ? (payload as ApiError).error : null;
    throw new IslandHttpError(response.status, problem?.code ?? "http_error", problem?.message ?? "岛上的信号中断了，请稍后重试。" );
  }
  if (payload === null) throw new IslandHttpError(response.status, "invalid_response", "岛上返回了无法辨认的消息。" );
  return payload as T;
}

async function readDetails(discovery: DiscoveryResponse): Promise<Record<string, MelonDetail>> {
  const opened = await Promise.all(
    discovery.items
      .filter((melon) => melon.status === "mature")
      .map((melon) => requestJson<OpenedMelon>(`/api/melons/${encodeURIComponent(melon.id)}`)),
  );
  return Object.fromEntries(opened.map(({ melon }) => [melon.id, melon]));
}

function emptyField(session: AnonymousSession): FieldView {
  const stage = session.seedCount >= 21 ? "ripe_melon" : session.seedCount >= 12 ? "green_melon" : session.seedCount >= 7 ? "flower" : session.seedCount >= 3 ? "vine" : session.seedCount >= 1 ? "sprout" : "bare";
  const nextStageAt = [1, 3, 7, 12, 21].find((goal) => goal > session.seedCount);
  return { alias: session.alias, animal: session.animal, progress: { seedCount: session.seedCount, stage, ...(nextStageAt ? { nextStageAt } : {}) }, melons: [] };
}

export const httpIslandAdapter: IslandAdapter = {
  async bootstrap(): Promise<IslandBootstrap> {
    const [session, cities] = await Promise.all([
      requestJson<AnonymousSession>("/api/session/anonymous", { method: "POST" }),
      requestJson<CitySummary[]>("/api/cities"),
    ]);
    const selectedCityId = cities[0]?.id;
    const discovery = await requestJson<DiscoveryResponse>("/api/discovery", { method: "POST", body: JSON.stringify(selectedCityId ? { selectedCityId } : {}) });
    const melonDetails = await readDetails(discovery);
    return { session, cities, discovery, field: emptyField(session), melonDetails };
  },
  discover(request) {
    return requestJson<DiscoveryResponse>("/api/discovery", { method: "POST", body: JSON.stringify(request) });
  },
  openMelon(id) {
    return requestJson<OpenedMelon>(`/api/melons/${encodeURIComponent(id)}`);
  },
  completeRead(id, input) {
    return requestJson<CompleteReadResult>(`/api/melons/${encodeURIComponent(id)}/complete`, { method: "POST", body: JSON.stringify(input) });
  },
  setSquat(id, active) {
    return requestJson<{ active: boolean }>(`/api/melons/${encodeURIComponent(id)}/squat`, { method: "POST", body: JSON.stringify({ active }) });
  },
  react(id, reaction) {
    return requestJson<Record<ReactionType, number>>(`/api/melons/${encodeURIComponent(id)}/reactions`, { method: "POST", body: JSON.stringify({ reaction }) });
  },
  comments() {
    return Promise.resolve<MelonComment[]>([]);
  },
  comment(id, content) {
    return requestJson<MelonComment>(`/api/melons/${encodeURIComponent(id)}/comments`, { method: "POST", body: JSON.stringify({ content }) });
  },
  field() {
    return requestJson<FieldView>("/api/fields/me");
  },
  fieldByAlias(alias) {
    return requestJson<FieldView>(`/api/fields/${encodeURIComponent(alias)}`);
  },
  createMelon(input) {
    return requestJson<CreateMelonResult>("/api/melons", { method: "POST", body: JSON.stringify(input) });
  },
};
