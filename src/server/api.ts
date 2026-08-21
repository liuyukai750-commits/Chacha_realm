import { NextResponse } from "next/server";

import type { ApiError } from "@/contracts";

export class ApiProblem extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiProblem";
  }
}

export function apiError(problem: ApiProblem): NextResponse<ApiError> {
  return NextResponse.json(
    { error: { code: problem.code, message: problem.message } },
    { status: problem.status },
  );
}

function applyHeaders(response: NextResponse, responseHeaders?: () => HeadersInit): void {
  if (!responseHeaders) return;
  const headers = new Headers(responseHeaders());
  headers.forEach((value, key) => response.headers.set(key, value));
}

export async function route<T>(
  work: () => Promise<T>,
  responseHeaders?: () => HeadersInit,
): Promise<NextResponse<T | ApiError>> {
  try {
    const response = NextResponse.json(await work());
    applyHeaders(response, responseHeaders);
    return response;
  } catch (error) {
    if (error instanceof ApiProblem) {
      // Log only the status and stable error code. Request bodies, content,
      // tokens and one-time coordinates must never enter application logs.
      console.warn("[api] request rejected", { status: error.status, code: error.code });
      const response = apiError(error);
      applyHeaders(response, responseHeaders);
      return response;
    }
    console.error("[api] internal error", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    const response = apiError(new ApiProblem(500, "internal_error", "服务暂时开小差了，请稍后再试。"));
    applyHeaders(response, responseHeaders);
    return response;
  }
}

export async function readJson(request: Request, maxBytes = 16_384): Promise<unknown> {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new ApiProblem(413, "payload_too_large", "请求内容过大。 ");
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new ApiProblem(413, "payload_too_large", "请求内容过大。 ");
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiProblem(400, "invalid_json", "请求内容不是有效的 JSON。 ");
  }
}

function firstForwardedValue(value: string | null): string | undefined {
  return value?.split(",", 1)[0]?.trim() || undefined;
}

function forwardedRequestOrigin(request: Request): string | undefined {
  const protocol = firstForwardedValue(request.headers.get("x-forwarded-proto"));
  const host = firstForwardedValue(request.headers.get("x-forwarded-host"));
  if ((protocol !== "http" && protocol !== "https") || !host) return undefined;

  try {
    const forwardedUrl = new URL(`${protocol}://${host}`);
    if (forwardedUrl.username || forwardedUrl.password || forwardedUrl.pathname !== "/") return undefined;
    return forwardedUrl.origin;
  } catch {
    return undefined;
  }
}

export function requireSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  const requestOrigin = new URL(request.url).origin;
  const forwardedOrigin = forwardedRequestOrigin(request);
  if (origin && origin !== requestOrigin && origin !== forwardedOrigin) {
    throw new ApiProblem(403, "cross_origin_denied", "跨站写入请求已拒绝。 ");
  }
}

export function unavailable(): ApiProblem {
  return new ApiProblem(503, "service_unavailable", "数据服务尚未配置或暂时不可用。 ");
}
