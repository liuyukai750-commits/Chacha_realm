import "server-only";

import { ApiProblem, unavailable } from "@/server/api";
import { getSupabaseConfig } from "@/server/supabase/config";

interface SupabaseErrorBody {
  code?: string;
  error_code?: string;
  message?: string;
  msg?: string;
}

async function responseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function mapSupabaseError(status: number, body: unknown): ApiProblem {
  const error = (body && typeof body === "object" ? body : {}) as SupabaseErrorBody;
  const signal = `${error.code ?? ""} ${error.error_code ?? ""} ${error.message ?? ""} ${error.msg ?? ""}`;
  if (status === 401 || status === 403 || /unauthorized|invalid.*jwt|jwt.*expired/i.test(signal)) {
    return new ApiProblem(401, "unauthorized", "匿名会话无效或已过期。 ");
  }
  if (/rate_limited/i.test(signal)) return new ApiProblem(429, "rate_limited", "操作太频繁，请稍后再试。 ");
  if (/content_held/i.test(signal)) return new ApiProblem(422, "content_held", "内容需要安全复核，暂未公开。 ");
  if (/not_available|not_found|P0002/i.test(signal)) return new ApiProblem(404, "not_found", "没有找到可用内容。 ");
  if (/invalid_|22023/i.test(signal)) return new ApiProblem(400, "invalid_request", "请求字段未通过校验。 ");
  return unavailable();
}

export async function supabaseFetch<T>(
  path: string,
  init: RequestInit = {},
  accessToken?: string,
): Promise<T> {
  const config = getSupabaseConfig();
  if (!config) throw unavailable();
  let response: Response;
  try {
    response = await fetch(`${config.url}${path}`, {
      ...init,
      cache: "no-store",
      signal: init.signal ?? AbortSignal.timeout(8_000),
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${accessToken ?? config.anonKey}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw unavailable();
  }
  const body = await responseBody(response);
  if (!response.ok) throw mapSupabaseError(response.status, body);
  return body as T;
}

export function rpc<T>(name: string, input: Record<string, unknown>, accessToken?: string): Promise<T> {
  return supabaseFetch<T>(`/rest/v1/rpc/${name}`, { method: "POST", body: JSON.stringify(input) }, accessToken);
}

export function selectRows<T>(table: string, query: string, accessToken?: string): Promise<T> {
  return supabaseFetch<T>(`/rest/v1/${table}?${query}`, { method: "GET" }, accessToken);
}
