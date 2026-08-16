import "server-only";

import { unstable_cache } from "next/cache";

import { cities } from "@/data/geography";
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
  ReactionResult,
  ReactionType,
  SquatResult,
  SquatShelf,
  VisitorType,
} from "@/contracts";
import { ApiProblem } from "@/server/api";
import { decodeCommentCursor, encodeCommentCursor } from "@/server/repositories/comment-cursor";
import { isDiscoveryItemVisible } from "@/server/repositories/discovery-visibility";
import { isInsidePublicSpotScene } from "@/server/security/discovery-scene";
import { distanceMeters, toDistanceBand } from "@/server/security/location";
import { resolveSupportedCityForBurial } from "@/server/security/location-city";
import { resolveVisitorLocation } from "@/features/discovery/location";
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
  distanceMeters?: number;
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

async function fetchCities(): Promise<CitySummary[]> {
  return rpc<CitySummary[]>("get_city_catalog", {});
}

async function activePublicSpot(spotId: string): Promise<PublicSpotRow | null> {
  const rows = await selectRows<PublicSpotRow[]>(
    "public_spots",
    `select=id,city_id,district_id,name,latitude,longitude&id=eq.${encodeURIComponent(spotId)}&active=eq.true&limit=1`,
  );
  return rows[0] ?? null;
}

const getCachedCities = unstable_cache(fetchCities, ["chacha-city-catalog-v1"], {
  revalidate: 60,
  tags: ["chacha-city-catalog"],
});

export async function getCities(): Promise<CitySummary[]> {
  return getCachedCities();
}

export async function discover(
  input: DiscoveryRequest,
  accessToken: string,
  actorId: string,
): Promise<DiscoveryResponse> {
  const spots = await publicSpots(accessToken);
  const locationResult = resolveVisitorLocation({ location: input.location });
  const usableLocation = locationResult.kind === "located" ? input.location : undefined;
  const nearest = usableLocation ? nearestSpot(usableLocation, spots) : null;
  const visitorType: VisitorType = input.location ? locationResult.visitorType : "location_unknown";
  const activeCityId: CityId = locationResult.kind === "located"
    ? locationResult.cityId
    : input.selectedCityId ?? cities[0]?.id ?? "changsha";
  const activeDistrictId = nearest?.spot.city_id === activeCityId ? nearest.spot.district_id : undefined;
  const sceneContext = discoverySceneContext(usableLocation, nearest);
  const [candidates, basketExclusions] = await Promise.all([
    serviceRpc<DiscoveryCandidate[]>(
      "get_discovery_candidates_for_visitor_v2",
      {
        p_city_id: activeCityId,
        p_latitude: usableLocation?.latitude ?? null,
        p_longitude: usableLocation?.longitude ?? null,
      },
    ),
    serviceRpc<string[]>("get_melon_basket_exclusions", { p_actor_id: actorId }),
  ]);
  const excludedIds = new Set(basketExclusions);

  const items = candidates
    .filter((candidate) => !excludedIds.has(candidate.id))
    .map((candidate) => {
      const candidateBurialKind = candidate.burialKind ?? "public_spot";
      const distanceM = typeof candidate.distanceMeters === "number"
        ? candidate.distanceMeters
        : Number.POSITIVE_INFINITY;
      const distanceBand = toDistanceBand(distanceM);
      const preview: MelonPreview = {
        id: candidate.id,
        status: candidate.status,
        ...(candidate.animal ? { animal: candidate.animal } : {}),
        ...(candidate.displayName ? { displayName: candidate.displayName } : {}),
        burialKind: candidateBurialKind,
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
        revealMode: "open",
      };
      const priority = activeDistrictId && candidate.districtId === activeDistrictId ? 0 : candidate.cityId === activeCityId ? 1 : 2;
      return { preview, priority, distanceM, createdAt: Date.parse(candidate.createdAt) };
    })
    .filter((item) => isDiscoveryItemVisible(
      {
        hasLocation: Boolean(usableLocation),
        sceneKind: sceneContext.kind,
        ...(sceneContext.kind === "public_spot" ? { activeSpotId: sceneContext.spot.id } : {}),
      },
      {
        burialKind: item.preview.burialKind ?? "public_spot",
        distanceBand: item.preview.distanceBand,
        spotId: item.preview.spot.id,
      },
    ))
    .sort((a, b) => a.priority - b.priority || a.distanceM - b.distanceM || b.createdAt - a.createdAt)
    .map(({ preview }) => preview);

  return {
    visitorType,
    activeCityId,
    sceneContext,
    items,
    localEmpty: !items.some((item) => item.cityId === activeCityId),
  };
}

export async function createMelon(input: CreateMelonRequest, actorId: string): Promise<CreateMelonResult> {
  const nearbyBurial = input.burialKind === "nearby_area";
  if (!input.location) {
    throw new ApiProblem(400, "invalid_location", "埋瓜需要本次手机定位。 ");
  }

  const spot = nearbyBurial ? null : input.spotId ? await activePublicSpot(input.spotId) : null;
  if (!nearbyBurial && !input.spotId) {
    throw new ApiProblem(400, "invalid_spot", "公共地点埋瓜需要有效地点。");
  }
  if (!nearbyBurial && !spot) {
    throw new ApiProblem(400, "invalid_spot", "该公共地点尚未开放。");
  }

  const locatedCityId = resolveSupportedCityForBurial(input.location);
  if (!nearbyBurial && spot!.city_id !== locatedCityId) {
    throw new ApiProblem(403, "public_spot_city_mismatch", "公共地点只能选择当前所在城市。 ");
  }
  const cityId = nearbyBurial ? locatedCityId : spot!.city_id;
  const result = await serviceRpc<Omit<CreateMelonResult, "cityId">>(
    "create_melon_v4",
    {
      p_actor_id: actorId,
      p_operation_id: input.operationId,
      p_burial_kind: nearbyBurial ? "nearby_area" : "public_spot",
      p_city_id: cityId,
      p_spot_id: nearbyBurial ? null : input.spotId,
      p_latitude: nearbyBurial ? input.location!.latitude : null,
      p_longitude: nearbyBurial ? input.location!.longitude : null,
      p_topic: input.topic,
      p_title: input.title,
      p_content: input.content,
      p_reveal_mode: "open",
    },
  );
  return { ...result, cityId };
}

export async function openMelon(melonId: string, actorId: string): Promise<MelonDetail> {
  const detail = await serviceRpc<(Omit<MelonDetail, "revealMode"> & { revealMode?: MelonRevealMode }) | null>(
    "get_melon_detail_for_actor",
    { p_melon_id: melonId, p_actor_id: actorId },
  );
  if (!detail) throw new ApiProblem(404, "not_found", "这个瓜尚未成熟或已不可用。 ");
  return { ...detail, revealMode: "open" };
}

export function completeRead(melonId: string, actorId: string): Promise<CompleteReadResult> {
  return serviceRpc<CompleteReadResult>("complete_melon_read", {
    p_actor_id: actorId,
    p_melon_id: melonId,
  });
}

export function setSquat(melonId: string, active: boolean, actorId: string): Promise<SquatResult> {
  return serviceRpc("set_melon_squat", { p_actor_id: actorId, p_melon_id: melonId, p_active: active });
}

export function getSquatShelf(accessToken: string): Promise<SquatShelf> {
  return rpc<SquatShelf>("get_squat_shelf", {}, accessToken);
}

export function markSquatAlertSeen(melonId: string, accessToken: string): Promise<{ seen: true }> {
  return rpc<{ seen: true }>("mark_squat_alert_seen", { p_melon_id: melonId }, accessToken);
}

export function setReaction(melonId: string, reaction: ReactionType, active: boolean, actorId: string): Promise<ReactionResult> {
  return serviceRpc("set_melon_reaction", { p_actor_id: actorId, p_melon_id: melonId, p_reaction: reaction, p_active: active });
}

export function setMelonBasketDismissal(melonId: string, hidden: boolean, actorId: string) {
  return serviceRpc<{ hidden: boolean }>("set_melon_basket_dismissal", {
    p_actor_id: actorId,
    p_melon_id: melonId,
    p_hidden: hidden,
  });
}

export function deleteOwnMelon(melonId: string, actorId: string) {
  return serviceRpc<{ deleted: true }>("delete_own_melon", {
    p_actor_id: actorId,
    p_melon_id: melonId,
  });
}

export interface MelonPresenceTarget {
  burialKind: "nearby_area" | "public_spot";
  withinOneKm: boolean;
}

export async function getMelonPresenceTarget(
  melonId: string,
  actorId: string,
  location: NonNullable<CreateMelonRequest["location"]>,
): Promise<MelonPresenceTarget> {
  const target = await serviceRpc<MelonPresenceTarget | null>("get_melon_presence_target_v2", {
    p_actor_id: actorId,
    p_melon_id: melonId,
    p_latitude: location.latitude,
    p_longitude: location.longitude,
  });
  if (!target) throw new ApiProblem(404, "not_found", "这个瓜尚未成熟或已不可用。 ");
  return target;
}

export interface MelonReadPolicy {
  burialKind: "nearby_area" | "public_spot";
  isOwner: boolean;
}

export async function getMelonReadPolicy(melonId: string, actorId: string): Promise<MelonReadPolicy> {
  const policy = await serviceRpc<MelonReadPolicy | null>("get_melon_read_policy", {
    p_actor_id: actorId,
    p_melon_id: melonId,
  });
  if (!policy) throw new ApiProblem(404, "not_found", "这个瓜尚未成熟或已不可用。 ");
  return policy;
}

export async function getComments(
  melonId: string,
  cursorValue: string | null,
  limit: number,
): Promise<MelonCommentsPage> {
  const cursor = decodeCommentCursor(cursorValue);
  const rows = await serviceRpc<MelonComment[]>("get_melon_comments", {
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
  content: string,
  actorId: string,
): Promise<MelonComment> {
  const result = await serviceRpc<AddCommentRpcResult>(
    "add_melon_comment",
    { p_actor_id: actorId, p_melon_id: melonId, p_content: content },
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
