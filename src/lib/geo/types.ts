import type { CityId, Coordinates, DistrictId, SpotId } from "../../contracts";

export interface GeoPoint extends Coordinates {
  readonly latitude: number;
  readonly longitude: number;
}

export type GeoRing = readonly GeoPoint[];

export interface GeoBoundary {
  readonly outer: GeoRing;
  readonly holes?: readonly GeoRing[];
}

export interface DistrictGeography {
  readonly id: DistrictId;
  readonly name: string;
  readonly boundaries?: readonly GeoBoundary[];
}

export interface CityGeography {
  readonly id: CityId;
  readonly name: string;
  readonly boundaries: readonly GeoBoundary[];
  readonly districts: readonly DistrictGeography[];
}

export type PublicSpotCategory =
  | "public_square"
  | "public_park"
  | "cultural_venue"
  | "hospital"
  | "hotel"
  | "company"
  | "private_property"
  | "other";

export interface SeekSafetyMetadata {
  readonly category: PublicSpotCategory;
  readonly publicAccess: "open_public_space" | "public_entrance" | "restricted_or_private";
  readonly status: "allowed" | "review_required" | "blocked";
  readonly reason?:
    | "arrival_point_unverified"
    | "public_access_unverified"
    | "sensitive_place"
    | "private_property"
    | "restricted_access";
}

export interface PublicSpotRecord {
  readonly id: SpotId;
  readonly cityId: CityId;
  readonly districtId: DistrictId;
  readonly name: string;
  readonly coordinates: GeoPoint;
  readonly verification: "verified" | "prelaunch_review";
  readonly seekSafety: SeekSafetyMetadata;
}
