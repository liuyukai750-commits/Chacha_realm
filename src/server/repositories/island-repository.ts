import "server-only";

import type {
  CityId,
  CitySummary,
  CompleteReadResult,
  CreateMelonRequest,
  CreateMelonResult,
  CreateReportRequest,
  DiscoveryRequest,
  DiscoveryResponse,
  FieldStage,
  FieldView,
  MelonComment,
  MelonCommentsPage,
  MelonDetail,
  MelonPreview,
  ReactionType,
  VisitorType,
} from "@/contracts";
import { ApiProblem } from "@/server/api";
import { decodeCommentCursor, encodeCommentCursor } from "@/server/repositories/comment-cursor";
import { distanceMeters, toDistanceBand } from "@/server/security/location";
import { requireSafeSeek } from "@/server/security/seek";
import { rpc, selectRows, serviceRpc } from "@/server/supabase/http";

interface PublicSpotRow {
  id: string;
  city_id: CityId;
  district_id: string;
  name: string;
  latitude: number;
  longitude: number;
}

interface DiscoveryCandidate extends Omit<MelonPreview, "distanceBand" | "isRemote"> {
  spotLatitude: number;
  spotLongitude: number;
  createdAt: string;
}

interface RawFieldView {
  alias: string;
  animal: string;
  seedCount: number;
  melons: MelonPreview[];
}

function fieldStage(seedCount: number): { stage: FieldStage; nextStageAt?: number } {
  if (seedCount >= 21) return { stage: "ripe_melon" };
  if (seedCount >= 12) return { stage: "green_melon", nextStageAt: 21 };
  if (seedCount >= 7) return { stage: "flower", nextStageAt: 12 };
  if (seedCount >= 3) return { stage: "vine", nextStageAt: 7 };
  if (seedCount >= 1) return { stage: "sprout", nextStageAt: 3 };
  return { stage: "bare", nextStageAt: 1 };
}

async function publicSpots(accessToken: string): Promise<PublicSpotRow[]> {
  return selectRows<PublicSpotRow[]>(
    "public_spots",
    "select=id,city_id,district_id,name,latitude,longitude&active=eq.true",
    accessToken,
  );
}

function nearestSpot(location: { latitude: number; longitude: number }, spots: PublicSpotRow[]): { spot: PublicSpotRow; distanceM: number } | null {
  let nearest: { spot: PublicSpotRow; distanceM: number } | null = null;
  for (const spot of spots) {
    const distanceM = distanceMeters(location, { latitude: spot.latitude, longitude: spot.longitude });
    if (!nearest || distanceM < nearest.distanceM) nearest = { spot, distanceM };
  }
  return nearest;
}

export async function getCities(): Promise<CitySummary[]> {
  return rpc<CitySummary[]>("get_city_catalog", {});
}

export async function discover(
  input: DiscoveryRequest,
  accessToken: string,
): Promise<DiscoveryResponse> {
  const [candidates, spots] = await Promise.all([
    rpc<DiscoveryCandidate[]>("get_discovery_candidates", {}, accessToken),
    publicSpots(accessToken),
  ]);
  const nearest = input.location ? nearestSpot(input.location, spots) : null;
  const visitorType: VisitorType = !input.location ? "location_unknown" : nearest && nearest.distanceM <= 50_000 ? "local" : "outsider";
  const activeCityId: CityId = input.selectedCityId ?? nearest?.spot.city_id ?? "changsha";
  const activeDistrictId = nearest?.spot.city_id === activeCityId ? nearest.spot.district_id : undefined;

  const items = candidates
    .map((candidate) => {
      const distanceM = input.location
        ? distanceMeters(input.location, { latitude: candidate.spotLatitude, longitude: candidate.spotLongitude })
        : Number.POSITIVE_INFINITY;
      const distanceBand = toDistanceBand(distanceM);
      const preview: MelonPreview = {
        id: candidate.id,
        status: candidate.status,
        topic: candidate.topic,
        cityId: candidate.cityId,
        districtId: candidate.districtId,
        spot: candidate.spot,
        distanceBand,
        ...(candidate.maturesAt ? { maturesAt: candidate.maturesAt } : {}),
        ...(candidate.completedReads !== undefined ? { completedReads: candidate.completedReads } : {}),
        ...(candidate.title ? { title: candidate.title } : {}),
        ...(typeof candidate.commentCount === "number" ? { commentCount: candidate.commentCount } : {}),
        isRemote: candidate.cityId !== activeCityId,
      };
      const priority = activeDistrictId && candidate.districtId === activeDistrictId ? 0 : candidate.cityId === activeCityId ? 1 : 2;
      return { preview, priority, distanceM, createdAt: Date.parse(candidate.createdAt) };
    })
    .sort((a, b) => a.priority - b.priority || a.distanceM - b.distanceM || b.createdAt - a.createdAt)
    .map(({ preview }) => preview);

  return {
    visitorType,
    activeCityId,
    items,
    localEmpty: !items.some((item) => item.cityId === activeCityId),
  };
}

export async function createMelon(input: CreateMelonRequest, accessToken: string): Promise<CreateMelonResult> {
  const evaluated = requireSafeSeek(input.spotId, input.location);
  if (evaluated.seekState !== "found") {
    throw new ApiProblem(403, "outside_spot_radius", "只有定位误差范围完整落在公共地点 500 米内才能埋瓜。 ");
  }
  return rpc<CreateMelonResult>(
    "create_melon",
    { p_spot_id: input.spotId, p_topic: input.topic, p_title: input.title, p_content: input.content },
    accessToken,
  );
}

export async function openMelon(melonId: string, accessToken: string): Promise<MelonDetail> {
  const detail = await rpc<MelonDetail | null>("get_melon_detail", { p_melon_id: melonId }, accessToken);
  if (!detail) throw new ApiProblem(404, "not_found", "这个瓜尚未成熟或已不可用。 ");
  return detail;
}

export function completeRead(melonId: string, accessToken: string): Promise<CompleteReadResult> {
  return rpc<CompleteReadResult>("complete_melon_read", { p_melon_id: melonId }, accessToken);
}

export function setSquat(melonId: string, active: boolean, accessToken: string): Promise<{ active: boolean }> {
  return rpc("set_melon_squat", { p_melon_id: melonId, p_active: active }, accessToken);
}

export function setReaction(melonId: string, reaction: ReactionType, accessToken: string): Promise<Record<ReactionType, number>> {
  return rpc("set_melon_reaction", { p_melon_id: melonId, p_reaction: reaction }, accessToken);
}

export async function getComments(melonId: string, cursorValue: string | null, limit: number): Promise<MelonCommentsPage> {
  const cursor = decodeCommentCursor(cursorValue);
  const rows = await rpc<MelonComment[]>("get_melon_comments", {
    p_melon_id: melonId,
    p_cursor_created_at: cursor?.createdAt ?? null,
    p_cursor_id: cursor?.id ?? null,
    p_limit: limit + 1,
  });
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return {
    items,
    ...(rows.length > limit && last ? { nextCursor: encodeCommentCursor(last) } : {}),
  };
}

interface AddCommentRpcResult {
  held: boolean;
  comment?: MelonComment;
}

export async function addComment(
  melonId: string,
  spotId: string,
  content: string,
  actorId: string,
): Promise<MelonComment> {
  const result = await serviceRpc<AddCommentRpcResult>(
    "add_melon_comment",
    { p_actor_id: actorId, p_melon_id: melonId, p_spot_id: spotId, p_content: content },
  );
  if (result.held || !result.comment) {
    throw new ApiProblem(422, "content_held", "内容需要安全复核，暂未公开。 ");
  }
  return result.comment;
}

export async function getField(alias: string | null, accessToken: string): Promise<FieldView> {
  const field = await rpc<RawFieldView | null>("get_field_view", { p_alias: alias }, accessToken);
  if (!field) throw new ApiProblem(404, "not_found", "没有找到这片瓜田。 ");
  const stage = fieldStage(field.seedCount);
  return {
    alias: field.alias,
    animal: field.animal,
    progress: { seedCount: field.seedCount, stage: stage.stage, ...(stage.nextStageAt ? { nextStageAt: stage.nextStageAt } : {}) },
    melons: field.melons,
  };
}

export function createReport(input: CreateReportRequest, accessToken: string): Promise<{ accepted: true }> {
  return rpc(
    "create_content_report",
    {
      p_target_type: input.targetType,
      p_target_id: input.targetId,
      p_reason: input.reason,
      p_details: input.details ?? null,
    },
    accessToken,
  );
}
