import "server-only";

import { ApiProblem, unavailable } from "@/server/api";
import { getSupabaseAdminConfig, getSupabaseConfig } from "@/server/supabase/config";

interface SupabaseErrorBody {
  code?: string;
  error_code?: string;
  message?: string;
  msg?: string;
}

function requestHeaders(
  apikey: string,
  init: RequestInit,
  accessToken?: string,
): HeadersInit {
  return {
    apikey,
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    ...(init.body ? { "Content-Type": "application/json" } : {}),
    ...init.headers,
  };
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
  if (/account_banned/i.test(signal)) {
    return new ApiProblem(403, "account_banned", "该匿名身份已被暂停写入；举报不会自动触发永久封禁。 ");
  }
  if (status === 401 || status === 403 || /unauthorized|invalid.*jwt|jwt.*expired/i.test(signal)) {
    return new ApiProblem(401, "unauthorized", "匿名会话无效或已过期。 ");
  }
  if (/rate_limited/i.test(signal)) return new ApiProblem(429, "rate_limited", "操作太频繁，请稍后再试。 ");
  if (/content_held/i.test(signal)) return new ApiProblem(422, "content_held", "内容需要安全复核，暂未公开。 ");
  if (/insufficient_true_seeds/i.test(signal)) {
    return new ApiProblem(409, "insufficient_true_seeds", "真瓜籽不足，先去吃瓜或分享一颗安全原创瓜吧。");
  }
  if (/field_plot_full/i.test(signal)) {
    return new ApiProblem(409, "field_plot_full", "这片土地已经种满了，请换一片土地。");
  }
  if (/field_not_ready/i.test(signal)) {
    return new ApiProblem(409, "field_not_ready", "九颗瓜全部成熟后才能一键收瓜。");
  }
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
      headers: requestHeaders(config.publishableKey, init, accessToken),
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

export async function serviceRpc<T>(name: string, input: Record<string, unknown>): Promise<T> {
  const config = getSupabaseAdminConfig();
  if (!config) throw unavailable();
  let response: Response;
  try {
    response = await fetch(`${config.url}/rest/v1/rpc/${name}`, {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
      body: JSON.stringify(input),
      headers: {
        apikey: config.secretKey,
        ...(config.secretKeySource === "legacy_service_role" ? { Authorization: `Bearer ${config.secretKey}` } : {}),
        "Content-Type": "application/json",
      },
    });
  } catch {
    throw unavailable();
  }
  const body = await responseBody(response);
  if (!response.ok) throw mapSupabaseError(response.status, body);
  return body as T;
}

export function selectRows<T>(table: string, query: string, accessToken?: string): Promise<T> {
  return supabaseFetch<T>(`/rest/v1/${table}?${query}`, { method: "GET" }, accessToken);
}
