import type { CityId, CreateReportRequest, FieldPlotIndex, MelonRevealMode, ReactionType, SafeTopic } from "@/contracts";

import { ApiProblem } from "@/server/api";

const cityIds = new Set<CityId>(["changsha", "beijing", "shanghai", "guangzhou", "shenzhen"]);
const topics = new Set<SafeTopic>(["daily", "work", "relationship", "food", "neighborhood"]);
const reactions = new Set<ReactionType>(["juicy", "wild", "hug", "follow_up"]);
const revealModes = new Set<MelonRevealMode>(["open", "seek_locked"]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiProblem(400, "invalid_request", "请求字段格式无效。 ");
  }
  return value as Record<string, unknown>;
}

export function uuid(value: unknown, field = "id"): string {
  if (typeof value !== "string" || !uuidPattern.test(value)) {
    throw new ApiProblem(400, "invalid_request", `${field} 格式无效。`);
  }
  return value;
}

export function text(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string") throw new ApiProblem(400, "invalid_request", `${field} 格式无效。`);
  const normalized = value.trim();
  if (!normalized || [...normalized].length > maxLength) {
    throw new ApiProblem(400, "invalid_request", `${field} 长度无效。`);
  }
  return normalized;
}

export function optionalText(value: unknown, field: string, maxLength: number): string | undefined {
  if (value === undefined) return undefined;
  return text(value, field, maxLength);
}

export function cityId(value: unknown): CityId | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !cityIds.has(value as CityId)) {
    throw new ApiProblem(400, "invalid_city", "城市参数无效。 ");
  }
  return value as CityId;
}

export function topic(value: unknown): SafeTopic {
  if (typeof value !== "string" || !topics.has(value as SafeTopic)) {
    throw new ApiProblem(400, "invalid_topic", "话题参数无效。 ");
  }
  return value as SafeTopic;
}

export function revealMode(value: unknown): MelonRevealMode {
  if (typeof value !== "string" || !revealModes.has(value as MelonRevealMode)) {
    throw new ApiProblem(400, "invalid_reveal_mode", "瓜的开启方式无效。 ");
  }
  return value as MelonRevealMode;
}

export function fieldPlotIndex(value: unknown): FieldPlotIndex {
  if (!Number.isInteger(value) || (value !== 0 && value !== 1 && value !== 2)) {
    throw new ApiProblem(400, "invalid_plot_index", "土地编号只能是 0、1 或 2。");
  }
  return value as FieldPlotIndex;
}

export function reaction(value: unknown): ReactionType {
  if (typeof value !== "string" || !reactions.has(value as ReactionType)) {
    throw new ApiProblem(400, "invalid_reaction", "反应类型无效。 ");
  }
  return value as ReactionType;
}

export function report(value: unknown): CreateReportRequest {
  const input = object(value);
  const targetTypes: CreateReportRequest["targetType"][] = ["melon", "comment"];
  const reasons: CreateReportRequest["reason"][] = ["privacy", "harassment", "illegal", "spam", "other"];
  if (!targetTypes.includes(input.targetType as CreateReportRequest["targetType"]) || !reasons.includes(input.reason as CreateReportRequest["reason"])) {
    throw new ApiProblem(400, "invalid_report", "举报参数无效。 ");
  }
  return {
    targetType: input.targetType as CreateReportRequest["targetType"],
    targetId: uuid(input.targetId, "targetId"),
    reason: input.reason as CreateReportRequest["reason"],
    details: optionalText(input.details, "details", 500),
  };
}
