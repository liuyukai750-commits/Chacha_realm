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
  DiscoverySceneContext,
  FieldPlotIndex,
  FieldView,
  HarvestFieldResult,
  MelonComment,
  MelonCommentsPage,
  MelonDetail,
  MelonPreview,
  MelonRevealMode,
  OwnFieldView,
  PlantFieldResult,
  PublicFieldView,
  ReactionType,
  VisitorType,
} from "@/contracts";
import { ApiProblem } from "@/server/api";
import { decodeCommentCursor, encodeCommentCursor } from "@/server/repositories/comment-cursor";
import { isInsidePublicSpotScene } from "@/server/security/discovery-scene";
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

function discoverySceneContext(
  location: DiscoveryRequest["location"],
  nearest: { spot: PublicSpotRow; distanceM: number } | null,
): DiscoverySceneContext {
  if (!location) return { kind: "city_overview" };
  const accuracyM = Math.max(0, location.accuracyM ?? 0);
  if (!nearest || !isInsidePublicSpotScene(nearest.distanceM, accuracyM)) {
    return { kind: "nearby_area" };
  }
  return {
    kind: "public_spot",
    spot: {
      id: nearest.spot.id,
      cityId: nearest.spot.city_id,
      districtId: nearest.spot.district_id,
      name: nearest.spot.name,
    },
  };
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
        revealMode: candidate.revealMode ?? "open",
      };
      const priority = activeDistrictId && candidate.districtId === activeDistrictId ? 0 : candidate.cityId === activeCityId ? 1 : 2;
      return { preview, priority, distanceM, createdAt: Date.parse(candidate.createdAt) };
    })
    .sort((a, b) => a.priority - b.priority || a.distanceM - b.distanceM || b.createdAt - a.createdAt)
    .map(({ preview }) => preview);

  return {
    visitorType,
    activeCityId,
    sceneContext: discoverySceneContext(input.location, nearest),
    items,
    localEmpty: !items.some((item) => item.cityId === activeCityId),
  };
}

export async function createMelon(input: CreateMelonRequest, actorId: string): Promise<CreateMelonResult> {
  const evaluated = requireSafeSeek(input.spotId, input.location);
  if (evaluated.seekState !== "found") {
    throw new ApiProblem(403, "outside_spot_radius", "只有定位误差范围完整落在公共地点 500 米内才能埋瓜。 ");
  }
  return serviceRpc<CreateMelonResult>(
    "create_melon",
    {
      p_actor_id: actorId,
      p_spot_id: input.spotId,
      p_topic: input.topic,
      p_title: input.title,
      p_content: input.content,
      p_reveal_mode: input.revealMode,
    },
  );
}

export async function openMelon(melonId: string, actorId: string): Promise<MelonDetail> {
  const detail = await serviceRpc<(Omit<MelonDetail, "revealMode"> & { revealMode?: MelonRevealMode }) | null>(
    "get_melon_detail_for_actor",
    { p_melon_id: melonId, p_actor_id: actorId },
  );
  if (!detail) throw new ApiProblem(404, "not_found", "这个瓜尚未成熟或已不可用。 ");
  return { ...detail, revealMode: detail.revealMode ?? "open" };
}

export function completeRead(melonId: string, actorId: string): Promise<CompleteReadResult> {
  return serviceRpc<CompleteReadResult>("complete_melon_read", {
    p_actor_id: actorId,
    p_melon_id: melonId,
  });
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

export function getField(alias: null, accessToken: string): Promise<OwnFieldView>;
export function getField(alias: string, accessToken: string): Promise<PublicFieldView>;
export async function getField(alias: string | null, accessToken: string): Promise<FieldView> {
  const field = await rpc<FieldView | null>("get_field_view", { p_alias: alias }, accessToken);
  if (!field) throw new ApiProblem(404, "not_found", "没有找到这片瓜田。 ");
  return field;
}

export function plantField(
  plotIndex: FieldPlotIndex,
  operationId: string,
  accessToken: string,
): Promise<PlantFieldResult> {
  return rpc<PlantFieldResult>(
    "plant_field_melon",
    { p_plot_index: plotIndex, p_operation_id: operationId },
    accessToken,
  );
}

export function harvestField(accessToken: string): Promise<HarvestFieldResult> {
  return rpc<HarvestFieldResult>("harvest_field", {}, accessToken);
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
