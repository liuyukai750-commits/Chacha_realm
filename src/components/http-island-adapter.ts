import type {
  AnonymousSession,
  ApiError,
  CitySummary,
  CompleteReadResult,
  CreateMelonResult,
  CreateReportRequest,
  DiscoveryResponse,
  FieldView,
  HarvestFieldResult,
  MelonComment,
  MelonCommentsPage,
  OpenedMelon,
  OwnFieldView,
  PlantFieldRequest,
  PlantFieldResult,
  ReactionType,
  ZonePresenceResult,
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
    headers: hasBody ? { "content-type": "application/json" } : init?.headers,
  });
  const payload = await response.json().catch(() => null) as T | ApiError | null;
  if (!response.ok) {
    const problem = payload && typeof payload === "object" && "error" in payload ? (payload as ApiError).error : null;
    throw new IslandHttpError(response.status, problem?.code ?? "http_error", problem?.message ?? "街上的信号中断了，请稍后重试。" );
  }
  if (payload === null) throw new IslandHttpError(response.status, "invalid_response", "街上送回了无法辨认的消息。" );
  return payload as T;
}

function emptyField(session: AnonymousSession): OwnFieldView {
  return {
    alias: session.alias,
    animal: session.animal,
    plots: ([0, 1, 2] as const).map((plotIndex) => ({ plotIndex, capacity: 3, plants: [] })),
    plantedCount: 0,
    matureCount: 0,
    melons: [],
    wallet: session.wallet,
    experience: session.experience,
    canHarvest: false,
  };
}

export const httpIslandAdapter: IslandAdapter = {
  async bootstrap(): Promise<IslandBootstrap> {
    const [session, cities] = await Promise.all([
      requestJson<AnonymousSession>("/api/session/anonymous", { method: "POST" }),
      requestJson<CitySummary[]>("/api/cities"),
    ]);
    const selectedCityId = cities[0]?.id;
    const discovery = await requestJson<DiscoveryResponse>("/api/discovery", { method: "POST", body: JSON.stringify(selectedCityId ? { selectedCityId } : {}) });
    return { session, cities, discovery, field: emptyField(session), melonDetails: {} };
  },
  discover(request) {
    return requestJson<DiscoveryResponse>("/api/discovery", { method: "POST", body: JSON.stringify(request) });
  },
  openMelon(id, presenceToken) {
    return requestJson<OpenedMelon>(`/api/melons/${encodeURIComponent(id)}`, presenceToken ? { headers: { "x-chacha-presence-token": presenceToken } } : undefined);
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
  comments(id, presenceToken) {
    return requestJson<MelonCommentsPage>(`/api/melons/${encodeURIComponent(id)}/comments?limit=20`, presenceToken ? { headers: { "x-chacha-presence-token": presenceToken } } : undefined);
  },
  verifyZonePresence(input) {
    return requestJson<ZonePresenceResult>("/api/presence/verify", { method: "POST", body: JSON.stringify(input) });
  },
  comment(id, content, presenceToken) {
    return requestJson<MelonComment>(`/api/melons/${encodeURIComponent(id)}/comments`, { method: "POST", body: JSON.stringify({ content, presenceToken }) });
  },
  field() {
    return requestJson<FieldView>("/api/fields/me");
  },
  fieldByAlias(alias) {
    return requestJson<FieldView>(`/api/fields/${encodeURIComponent(alias)}`);
  },
  plant(input: PlantFieldRequest) {
    return requestJson<PlantFieldResult>("/api/fields/me/plant", { method: "POST", body: JSON.stringify(input) });
  },
  harvest() {
    return requestJson<HarvestFieldResult>("/api/fields/me/harvest", { method: "POST" });
  },
  createMelon(input) {
    return requestJson<CreateMelonResult>("/api/melons", { method: "POST", body: JSON.stringify(input) });
  },
  report(input: CreateReportRequest) {
    return requestJson<{ accepted: true }>("/api/reports", { method: "POST", body: JSON.stringify(input) });
  },
};
