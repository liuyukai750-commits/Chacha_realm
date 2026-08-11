export type LocatedSceneKind = "city_overview" | "nearby_area" | "public_spot";

export interface DiscoveryVisibilityItem {
  burialKind: "nearby_area" | "public_spot";
  distanceBand: "within_1km" | "within_3km" | "within_8km" | "within_20km" | "remote";
  spotId: string;
}

export interface DiscoveryVisibilityContext {
  hasLocation: boolean;
  sceneKind: LocatedSceneKind;
  activeSpotId?: string;
}

/**
 * Keeps located discovery strict: a normal 1 km life circle only sees melons
 * buried into that life circle, while a public landmark only sees its own
 * landmark melons. City-wide fallback is reserved for browsing without a
 * location proof.
 */
export function isDiscoveryItemVisible(
  context: DiscoveryVisibilityContext,
  item: DiscoveryVisibilityItem,
): boolean {
  if (!context.hasLocation) return item.burialKind === "public_spot";
  if (item.distanceBand !== "within_1km") return false;
  if (context.sceneKind === "nearby_area") return item.burialKind === "nearby_area";
  if (context.sceneKind === "public_spot") {
    return item.burialKind === "public_spot" && item.spotId === context.activeSpotId;
  }
  return false;
}
