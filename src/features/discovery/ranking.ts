import type { CityId, Coordinates, DistrictId, VisitorType } from "@/contracts";
import { distanceBandForMeters, haversineDistanceM } from "@/lib/geo";
import type {
  DiscoveryCandidate,
  DiscoveryPoolResult,
  RankedDiscoveryCandidate,
} from "./types";

export interface RankDiscoveryInput<T extends DiscoveryCandidate> {
  readonly candidates: readonly T[];
  readonly location: Coordinates;
  readonly activeCityId: CityId;
  readonly districtId?: DistrictId;
}

interface CandidateWithDistance<T extends DiscoveryCandidate> {
  readonly candidate: T;
  readonly distanceM: number;
}

export function rankDiscoveryCandidates<T extends DiscoveryCandidate>(
  input: RankDiscoveryInput<T>,
): readonly RankedDiscoveryCandidate<T>[] {
  const withDistances: CandidateWithDistance<T>[] = input.candidates.map((candidate) => ({
    candidate,
    distanceM: haversineDistanceM(input.location, candidate.coordinates),
  }));

  const sortByDistanceThenId = (left: CandidateWithDistance<T>, right: CandidateWithDistance<T>) =>
    left.distanceM - right.distanceM || left.candidate.id.localeCompare(right.candidate.id);

  const sameDistrict = withDistances
    .filter(
      ({ candidate }) =>
        input.districtId !== undefined &&
        candidate.cityId === input.activeCityId &&
        candidate.districtId === input.districtId,
    )
    .sort(sortByDistanceThenId);
  const sameCity = withDistances
    .filter(
      ({ candidate }) =>
        candidate.cityId === input.activeCityId && candidate.districtId !== input.districtId,
    )
    .sort(sortByDistanceThenId);
  const remoteCity = withDistances
    .filter(({ candidate }) => candidate.cityId !== input.activeCityId)
    .sort(sortByDistanceThenId);

  const expose = (
    values: readonly CandidateWithDistance<T>[],
    source: RankedDiscoveryCandidate<T>["source"],
  ): RankedDiscoveryCandidate<T>[] =>
    values.map(({ candidate, distanceM }) => ({
      id: candidate.id,
      distanceBand: source === "remote_city" ? "remote" : distanceBandForMeters(distanceM),
      isRemote: source === "remote_city",
      source,
    }));

  return [
    ...expose(sameDistrict, "same_district"),
    ...expose(sameCity, "same_city"),
    ...expose(remoteCity, "remote_city"),
  ];
}

export interface FillDiscoveryPoolsInput<T extends { readonly id: string }> {
  readonly sameDistrict: readonly T[];
  readonly sameCity: readonly T[];
  readonly remoteCity: readonly T[];
  readonly limit: number;
  readonly visitorType: VisitorType;
}

export function fillDiscoveryPools<T extends { readonly id: string }>(
  input: FillDiscoveryPoolsInput<T>,
): DiscoveryPoolResult<T> {
  if (!Number.isInteger(input.limit) || input.limit < 0) {
    throw new RangeError("Discovery limit must be a non-negative integer.");
  }

  const items: T[] = [];
  const seen = new Set<string>();
  const append = (pool: readonly T[]) => {
    for (const item of pool) {
      if (items.length >= input.limit) return;
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      items.push(item);
    }
  };

  append(input.sameDistrict);
  append(input.sameCity);
  append(input.remoteCity);

  return {
    visitorType: input.visitorType,
    items,
    localEmpty: input.sameDistrict.length === 0 && input.sameCity.length === 0,
  };
}
