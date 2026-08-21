import type {
  ApiError,
  CompleteReadResult,
  CreateMelonResult,
  CreateReportRequest,
  DeleteOwnMelonResult,
  DiscoveryResponse,
  FieldView,
  HarvestFieldResult,
  MelonComment,
  MelonBasketDismissResult,
  MelonCommentsPage,
  OpenedMelon,
  PlantFieldRequest,
  PlantFieldResult,
  ReactionResult,
  SquatResult,
  SquatShelf,
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
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 12_000);
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      credentials: "same-origin",
      cache: "no-store",
      signal: init?.signal ?? controller.signal,
      headers: hasBody ? { "content-type": "application/json" } : init?.headers,
    });
  } catch {
    if (!init?.signal && controller.signal.aborted) {
      throw new IslandHttpError(408, "request_timeout", "街上的信号有点慢，本次操作没有确认成功，请重试。");
    }
    throw new IslandHttpError(503, "network_error", "网络连接中断了，请检查信号后重试。");
  } finally {
    window.clearTimeout(timeout);
  }
  const payload = await response.json().catch(() => null) as T | ApiError | null;
  if (!response.ok) {
    const problem = payload && typeof payload === "object" && "error" in payload ? (payload as ApiError).error : null;
    throw new IslandHttpError(response.status, problem?.code ?? "http_error", problem?.message ?? "街上的信号中断了，请稍后重试。" );
  }
  if (payload === null) throw new IslandHttpError(response.status, "invalid_response", "街上送回了无法辨认的消息。" );
  return payload as T;
}

export const httpIslandAdapter: IslandAdapter = {
  async bootstrap(): Promise<IslandBootstrap> {
    return requestJson<IslandBootstrap>("/api/bootstrap", { method: "POST" });
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
  dismissFromBasket(id, hidden) {
    return requestJson<MelonBasketDismissResult>(`/api/melons/${encodeURIComponent(id)}/dismiss`, { method: "POST", body: JSON.stringify({ hidden }) });
  },
  deleteOwnMelon(id) {
    return requestJson<DeleteOwnMelonResult>(`/api/melons/${encodeURIComponent(id)}`, { method: "DELETE" });
  },
  setSquat(id, active) {
    return requestJson<SquatResult>(`/api/melons/${encodeURIComponent(id)}/squat`, { method: "POST", body: JSON.stringify({ active }) });
  },
  squatShelf() {
    return requestJson<SquatShelf>("/api/squats");
  },
  markSquatSeen(id) {
    return requestJson<{ seen: true }>(`/api/squats/${encodeURIComponent(id)}/seen`, { method: "POST" });
  },
  react(id, reaction, active) {
    return requestJson<ReactionResult>(`/api/melons/${encodeURIComponent(id)}/reactions`, { method: "POST", body: JSON.stringify({ reaction, active }) });
  },
  comments(id, presenceToken) {
    return requestJson<MelonCommentsPage>(`/api/melons/${encodeURIComponent(id)}/comments?limit=20`, presenceToken ? { headers: { "x-chacha-presence-token": presenceToken } } : undefined);
  },
  verifyZonePresence(input) {
    return requestJson<ZonePresenceResult>("/api/presence/verify", { method: "POST", body: JSON.stringify(input) });
  },
  comment(id, content, presenceToken) {
    return requestJson<MelonComment>(`/api/melons/${encodeURIComponent(id)}/comments`, { method: "POST", body: JSON.stringify({ content, ...(presenceToken ? { presenceToken } : {}) }) });
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
