export type CityId = "changsha" | "beijing" | "shanghai" | "guangzhou" | "shenzhen";

export type DistrictId = string;
export type SpotId = string;

export type VisitorType = "local" | "outsider" | "location_unknown";
export type MelonStatus = "incubating" | "mature" | "archived" | "held" | "removed";
export type DistanceBand = "within_1km" | "within_3km" | "within_8km" | "within_20km" | "remote";
export type SafeTopic = "daily" | "work" | "relationship" | "food" | "neighborhood";
export type ReactionType = "juicy" | "wild" | "hug" | "follow_up";
export type FieldStage = "bare" | "sprout" | "vine" | "flower" | "green_melon" | "ripe_melon";
export type ZonePresence = "unknown" | "remote" | "local";
export type SeekState = "outside" | "near" | "inside_zone" | "found";
export type AccountStatus = "active" | "banned";

export interface Coordinates {
  latitude: number;
  longitude: number;
  accuracyM?: number;
}

export interface LocationProof extends Coordinates {
  capturedAt: string;
}

export interface AnonymousSession {
  alias: string;
  animal: string;
  seedCount: number;
  accountStatus?: AccountStatus;
}

export interface PublicSpotSummary {
  id: SpotId;
  cityId: CityId;
  districtId: DistrictId;
  name: string;
}

export interface CityOpeningState {
  cityId: CityId;
  status: "gathering" | "countdown" | "open";
  safeMelons: number;
  distinctAuthors: number;
  distinctSpots: number;
  distinctTopics: number;
  opensAt?: string;
}

export interface CitySummary {
  id: CityId;
  name: string;
  districts: Array<{ id: DistrictId; name: string }>;
  spots: PublicSpotSummary[];
  opening: CityOpeningState;
}

export interface MelonPreview {
  id: string;
  status: "incubating" | "mature";
  topic: SafeTopic;
  cityId: CityId;
  districtId: DistrictId;
  spot: PublicSpotSummary;
  distanceBand: DistanceBand;
  maturesAt?: string;
  completedReads?: number;
  title?: string;
  commentCount?: number;
  isRemote: boolean;
}

export interface MelonDetail extends MelonPreview {
  status: "mature";
  alias: string;
  title: string;
  content: string;
  createdAt: string;
  squatted: boolean;
  reactions: Record<ReactionType, number>;
}

export interface DiscoveryRequest {
  location?: LocationProof;
  selectedCityId?: CityId;
}

export interface DiscoveryResponse {
  visitorType: VisitorType;
  activeCityId: CityId;
  items: MelonPreview[];
  localEmpty: boolean;
}

export interface CreateMelonRequest {
  spotId: SpotId;
  topic: SafeTopic;
  title: string;
  content: string;
  location: LocationProof;
}

export interface CreateMelonResult {
  id: string;
  status: "incubating" | "held";
  maturesAt?: string;
}

export interface OpenedMelon {
  melon: MelonDetail;
  readToken: string;
  completableAt: string;
}

export interface CompleteReadRequest {
  readToken: string;
}

export interface CompleteReadResult {
  counted: boolean;
  readerSeedAwarded: boolean;
  authorSeedAwarded: boolean;
  readerSeedCount: number;
  completedReads: number;
}

export interface FieldProgress {
  seedCount: number;
  stage: FieldStage;
  nextStageAt?: number;
}

export interface FieldView {
  alias: string;
  animal: string;
  progress: FieldProgress;
  melons: MelonPreview[];
}

export interface SeedLedgerEntry {
  id: string;
  reason: "read_complete" | "author_read";
  amount: 1;
  createdAt: string;
  melonId: string;
}

export interface MelonComment {
  id: string;
  melonId: string;
  alias: string;
  content: string;
  createdAt: string;
}

export interface MelonCommentsPage {
  items: MelonComment[];
  nextCursor?: string;
}

export interface VerifyZonePresenceRequest {
  spotId: SpotId;
  location: LocationProof;
}

export interface ZonePresenceResult {
  presence: Exclude<ZonePresence, "unknown">;
  seekState: SeekState;
  presenceToken?: string;
  expiresAt?: string;
}

export interface CreateCommentRequest {
  content: string;
  presenceToken: string;
}

export interface CreateReportRequest {
  targetType: "melon" | "comment";
  targetId: string;
  reason: "privacy" | "harassment" | "illegal" | "spam" | "other";
  details?: string;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
  };
}
