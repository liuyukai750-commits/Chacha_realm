import type { CityId, Coordinates, DistrictId, SpotId } from "@/contracts";

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

export interface PublicSpotRecord {
  readonly id: SpotId;
  readonly cityId: CityId;
  readonly districtId: DistrictId;
  readonly name: string;
  readonly coordinates: GeoPoint;
  readonly verification: "verified" | "prelaunch_review";
}
