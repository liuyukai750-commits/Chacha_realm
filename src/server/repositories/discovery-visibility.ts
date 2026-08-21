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
 * The database already scopes candidates to the active city. Public-zone
 * melons stay readable throughout that city; private nearby melons are only
 * returned for a located visitor inside their fixed one-kilometre radius.
 */
export function isDiscoveryItemVisible(
  context: DiscoveryVisibilityContext,
  item: DiscoveryVisibilityItem,
): boolean {
  if (item.burialKind === "public_spot") return true;
  return context.hasLocation && item.distanceBand === "within_1km";
}
