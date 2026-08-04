import type { CityId, Coordinates, DistanceBand, DistrictId, SpotId, VisitorType } from "../../contracts";

export type LocationUnavailableReason =
  | "permission_denied"
  | "position_unavailable"
  | "timeout"
  | "unsupported"
  | "insecure_context";

export type LocationResult =
  | {
      readonly kind: "located";
      readonly visitorType: "local";
      readonly cityId: CityId;
      readonly districtId?: DistrictId;
    }
  | {
      readonly kind: "outsider";
      readonly visitorType: "outsider";
      readonly reason: "outside_supported_cities";
    }
  | {
      readonly kind: "unavailable";
      readonly visitorType: "location_unknown";
      readonly reason: LocationUnavailableReason | "low_accuracy";
      readonly accuracyM?: number;
    };

export type BurialEligibility =
  | {
      readonly eligible: true;
      readonly spotId: SpotId;
      readonly distanceM: number;
    }
  | {
      readonly eligible: false;
      readonly reason: "unknown_spot" | "low_accuracy" | "outside_500m" | LocationUnavailableReason;
      readonly distanceM?: number;
      readonly accuracyM?: number;
    };

export interface DiscoveryCandidate {
  readonly id: string;
  readonly cityId: CityId;
  readonly districtId: DistrictId;
  readonly coordinates: Coordinates;
}

export interface RankedDiscoveryCandidate<T extends DiscoveryCandidate> {
  readonly id: T["id"];
  readonly distanceBand: DistanceBand;
  readonly isRemote: boolean;
  readonly source: "same_district" | "same_city" | "remote_city";
}

export interface DiscoveryPoolResult<T> {
  readonly visitorType: VisitorType;
  readonly items: readonly T[];
  readonly localEmpty: boolean;
}
