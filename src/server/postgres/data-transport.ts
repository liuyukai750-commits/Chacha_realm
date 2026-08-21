import "server-only";

import { ApiProblem, unavailable } from "@/server/api";
import type { DataTransport } from "@/server/supabase/http";
import { postgresQuery, type PostgresQueryable } from "@/server/postgres/client";

export const ALLOWED_RPC_NAMES = new Set([
  "account_auth_target",
  "account_auth_target_by_user",
  "add_melon_comment",
  "complete_melon_read",
  "complete_profile_for_actor",
  "create_content_report_for_actor",
  "create_melon_v4",
  "delete_own_melon",
  "get_admin_overview",
  "get_city_catalog",
  "get_discovery_candidates_for_visitor_v2",
  "get_field_view_for_actor",
  "get_melon_basket_exclusions",
  "get_melon_comments",
  "get_melon_detail_for_actor",
  "get_melon_presence_target_v2",
  "get_melon_read_policy",
  "get_profile_for_actor",
  "get_squat_shelf_for_actor",
  "harvest_field_for_actor",
  "mark_squat_alert_seen_for_actor",
  "plant_field_melon_for_actor",
  "reserve_account_auth_attempt",
  "reserve_phone_auth_attempt",
  "rotate_account_recovery_secret",
  "set_account_login_credential",
  "set_account_recovery_secret",
  "set_melon_basket_dismissal",
  "set_melon_reaction",
  "set_melon_squat",
]);

export const NAMED_ARGUMENT_PATTERN = /^p_[a-z][a-z0-9_]*$/;
const PUBLIC_SPOT_COLUMNS = new Set([
  "id",
  "city_id",
  "district_id",
  "name",
  "latitude",
  "longitude",
]);

interface PostgresErrorShape {
  code?: string;
  message?: string;
}

function postgresProblem(error: unknown): ApiProblem {
  const value = (error && typeof error === "object" ? error : {}) as PostgresErrorShape;
  const signal = `${value.code ?? ""} ${value.message ?? ""}`;
  if (/account_banned/i.test(signal)) {
    return new ApiProblem(403, "account_banned", "该匿名身份已被暂停写入；举报不会自动触发永久封禁。 ");
  }
  if (/unauthorized|28000|42501/i.test(signal)) {
    return new ApiProblem(401, "unauthorized", "登录状态无效或已过期。 ");
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
  if (/not_available|not_found|P0002/i.test(signal)) {
    return new ApiProblem(404, "not_found", "没有找到可用内容。 ");
  }
  if (/invalid_|22023/i.test(signal)) {
    return new ApiProblem(400, "invalid_request", "请求字段未通过校验。 ");
  }
  return unavailable();
}

function rpcStatement(name: string, input: Record<string, unknown>, serviceRole = false): {
  sql: string;
  values: unknown[];
} {
  if (!ALLOWED_RPC_NAMES.has(name)) throw unavailable();
  const entries = Object.entries(input);
  for (const [argument] of entries) {
    if (!NAMED_ARGUMENT_PATTERN.test(argument)) throw unavailable();
  }
  const valueOffset = serviceRole ? 2 : 1;
  const argumentsSql = entries
    .map(([argument], index) => `${argument} => $${index + valueOffset}`)
    .join(", ");
  const invocation = `public.${name}(${argumentsSql})`;
  if (serviceRole) {
    return {
      sql: `with service_context as materialized (
        select set_config('request.jwt.claims', $1, true) as claims
      )
      select ${invocation} as value from service_context`,
      values: [JSON.stringify({ role: "service_role" }), ...entries.map(([, value]) => value)],
    };
  }
  return {
    sql: `select ${invocation} as value`,
    values: entries.map(([, value]) => value),
  };
}

async function invokeRpc<T>(
  database: PostgresQueryable,
  name: string,
  input: Record<string, unknown>,
  serviceRole = false,
): Promise<T> {
  const statement = rpcStatement(name, input, serviceRole);
  try {
    const result = await database.query<{ value: T }>(statement.sql, statement.values);
    return result.rows[0]?.value as T;
  } catch (error) {
    if (error instanceof ApiProblem) throw error;
    throw postgresProblem(error);
  }
}

function publicSpotQuery(query: string): { sql: string; values: unknown[] } {
  const params = new URLSearchParams(query);
  const selected = params.get("select")?.split(",") ?? [];
  if (!selected.length || selected.some((column) => !PUBLIC_SPOT_COLUMNS.has(column))) {
    throw unavailable();
  }
  if (params.get("active") !== "eq.true") throw unavailable();

  const values: unknown[] = [];
  const filters = ["active = true"];
  const rawId = params.get("id");
  if (rawId) {
    if (!rawId.startsWith("eq.")) throw unavailable();
    const id = decodeURIComponent(rawId.slice(3));
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      throw unavailable();
    }
    values.push(id);
    filters.push(`id = $${values.length}`);
  }

  const rawLimit = params.get("limit");
  let limit = "";
  if (rawLimit !== null) {
    if (rawLimit !== "1") throw unavailable();
    limit = " limit 1";
  }
  return {
    sql: `select ${selected.join(", ")} from public.public_spots where ${filters.join(" and ")}${limit}`,
    values,
  };
}

export function createPostgresDataTransport(database: PostgresQueryable): DataTransport {
  return {
    rpc<T>(name: string, input: Record<string, unknown>): Promise<T> {
      return invokeRpc<T>(database, name, input);
    },
    serviceRpc<T>(name: string, input: Record<string, unknown>): Promise<T> {
      return invokeRpc<T>(database, name, input, true);
    },
    actorRpc<T>(name: string, actorId: string, input: Record<string, unknown>): Promise<T> {
      return invokeRpc<T>(database, name, { ...input, p_actor_id: actorId });
    },
    async selectRows<T>(table: string, query: string): Promise<T> {
      if (table !== "public_spots") throw unavailable();
      const statement = publicSpotQuery(query);
      try {
        const result = await database.query(statement.sql, statement.values);
        return result.rows as T;
      } catch (error) {
        throw postgresProblem(error);
      }
    },
  };
}

export const postgresDataTransport = createPostgresDataTransport({ query: postgresQuery });
