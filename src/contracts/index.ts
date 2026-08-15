export type CityId = "changsha" | "beijing" | "shanghai" | "guangzhou" | "shenzhen";

export type DistrictId = string;
export type SpotId = string;

export type VisitorType = "local" | "outsider" | "location_unknown";
export type MelonStatus = "incubating" | "mature" | "archived" | "held" | "removed";
export type DistanceBand = "within_1km" | "within_3km" | "within_8km" | "within_20km" | "remote";
export type SafeTopic = "daily" | "work" | "relationship" | "food" | "neighborhood";
export type MelonRevealMode = "open" | "seek_locked";
export type LegacyReactionType = "juicy" | "wild" | "hug" | "follow_up";
export type ReactionType = "like";
export type ReactionCounts = Partial<Record<ReactionType | LegacyReactionType, number>>;
export type FieldPlantStage = "seedling" | "growing" | "mature";
export type FieldPlotIndex = 0 | 1 | 2;
export type FieldSlotIndex = 0 | 1 | 2;
export type ZonePresence = "unknown" | "remote" | "local";
export type SeekState = "outside" | "near" | "inside_zone" | "found";
export type AccountStatus = "active" | "banned";
export type BurialKind = "nearby_area" | "public_spot";
export type AuthKind = "anonymous" | "password" | "phone";
export type IdentityBadge = "steward";
export type PhoneAuthFlow = "sign_in" | "upgrade";
export type AnimalIdentity = "猹" | "水豚" | "狐狸" | "熊猫" | "青蛙" | "仓鼠";

export interface PasswordAccountRegisterRequest {
  password: string;
  animal: AnimalIdentity;
  displayName: string;
  acceptedTerms: true;
  captchaToken?: string;
}

export interface PasswordAccountLoginRequest {
  publicId: string;
  password: string;
  captchaToken?: string;
}

export interface PasswordAccountRecoverRequest {
  publicId: string;
  recoveryCode: string;
  newPassword: string;
  captchaToken?: string;
}

export interface PasswordAccountProvisionResult {
  session: AnonymousSession;
  recoveryCode: string;
  existingDataPreserved: boolean;
}

export interface Coordinates {
  latitude: number;
  longitude: number;
  accuracyM?: number;
}

export interface LocationProof extends Coordinates {
  capturedAt: string;
  simulated?: boolean;
  simulationLabel?: string;
}

export interface AnonymousSession {
  alias: string;
  animal: string;
  authKind?: AuthKind;
  displayName?: string;
  publicId?: string;
  identityBadge?: IdentityBadge;
  maskedPhone?: string;
  onboardingComplete?: boolean;
  wallet: SeedWallet;
  experience: ExperienceSummary;
  accountStatus?: AccountStatus;
}

export interface SeedWallet {
  smallSeedCount: number;
  trueSeedCount: number;
}

export interface ExperienceSummary {
  total: number;
  fromReads: number;
  fromHarvests: number;
}

export interface PublicSpotSummary {
  id: SpotId;
  cityId: CityId;
  districtId: DistrictId;
  name: string;
}

export type DiscoverySceneContext =
  | { kind: "city_overview" }
  | { kind: "nearby_area" }
  | { kind: "public_spot"; spot: PublicSpotSummary };

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
  burialKind?: BurialKind;
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
  revealMode: MelonRevealMode;
}

export interface MelonDetail extends Omit<MelonPreview, "status"> {
  status: "incubating" | "mature" | "held";
  alias: string;
  animal?: AnimalIdentity;
  displayName?: string;
  publicId?: string;
  identityBadge?: IdentityBadge;
  title: string;
  content: string;
  createdAt: string;
  squatted: boolean;
  squatCount?: number;
  liked?: boolean;
  reactions: ReactionCounts;
}

export interface FieldMelonPreview extends Omit<MelonPreview, "status"> {
  status: "incubating" | "mature" | "held";
}

export interface DiscoveryRequest {
  location?: LocationProof;
  selectedCityId?: CityId;
}

export interface DiscoveryResponse {
  visitorType: VisitorType;
  activeCityId: CityId;
  sceneContext: DiscoverySceneContext;
  items: MelonPreview[];
  localEmpty: boolean;
}

export interface CreateMelonRequest {
  operationId: string;
  burialKind?: BurialKind;
  cityId?: CityId;
  spotId?: SpotId;
  topic: SafeTopic;
  title: string;
  content: string;
  revealMode: MelonRevealMode;
  /** Required for nearby_area only. Public-zone burial is intentionally remote-capable. */
  location?: LocationProof;
}

export interface CreateMelonResult {
  id: string;
  status: "incubating" | "held";
  cityId: CityId;
  maturesAt?: string;
  trueSeedAwarded: boolean;
  wallet: SeedWallet;
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
  smallSeedAwarded: boolean;
  autoConverted: boolean;
  wallet: SeedWallet;
  authorExperienceAwarded: number;
  completedReads: number;
}

export interface ReactionResult {
  active: boolean;
  reactions: ReactionCounts;
}

export interface SquatResult {
  active: boolean;
  squatCount: number;
}

export interface PhoneOtpRequest {
  phone: string;
  acceptedTerms: true;
  captchaToken?: string;
}

export interface PhoneOtpRequestResult {
  sent: true;
  retryAfterSeconds: 60;
  flow: PhoneAuthFlow;
}

export interface PhoneOtpVerifyRequest {
  phone: string;
  code: string;
}

export interface PhoneOtpVerifyResult {
  session: AnonymousSession;
  needsProfile: boolean;
  requiresAccountSwitchConfirmation?: boolean;
  switchProfile?: AccountSwitchPreview;
}

export interface AccountSwitchPreview {
  animal: string;
  displayName?: string;
  publicId?: string;
}

export interface ConfirmPhoneAccountSwitchRequest {
  confirm: boolean;
}

export interface ConfirmPhoneAccountSwitchResult {
  switched: boolean;
  session: AnonymousSession;
  needsProfile: boolean;
}

export interface CompleteProfileRequest {
  animal: AnimalIdentity;
  displayName: string;
}

export interface CompleteProfileResult {
  session: AnonymousSession;
}

export interface LogoutResult {
  loggedOut: true;
}

export interface DeleteAccountRequest {
  confirmation: "DELETE";
}

export interface DeleteAccountResult {
  deleted: true;
}

export interface MelonBasketDismissResult {
  hidden: boolean;
}

export interface DeleteOwnMelonResult {
  deleted: true;
}

export interface PublicFieldPlant {
  plotIndex: FieldPlotIndex;
  slotIndex: FieldSlotIndex;
  stage: FieldPlantStage;
}

export interface FieldPlant extends PublicFieldPlant {
  id: string;
  plantedAt: string;
  maturesAt: string;
}

export interface FieldPlot<TPlant extends PublicFieldPlant = PublicFieldPlant> {
  plotIndex: FieldPlotIndex;
  capacity: 3;
  plants: TPlant[];
}

export interface PublicFieldView {
  alias: string;
  animal: string;
  displayName?: string;
  publicId?: string;
  identityBadge?: IdentityBadge;
  plots: FieldPlot[];
  plantedCount: number;
  matureCount: number;
  melons: FieldMelonPreview[];
}

export interface OwnFieldView extends Omit<PublicFieldView, "plots"> {
  plots: FieldPlot<FieldPlant>[];
  wallet: SeedWallet;
  experience: ExperienceSummary;
  canHarvest: boolean;
  nextMaturesAt?: string;
}

export type FieldView = PublicFieldView | OwnFieldView;

export interface PlantFieldRequest {
  plotIndex: FieldPlotIndex;
  operationId: string;
}

export interface PlantFieldResult {
  plant: FieldPlant;
  wallet: SeedWallet;
  field: OwnFieldView;
}

export interface HarvestFieldResult {
  harvestedCount: 9;
  experienceAwarded: 9;
  experience: ExperienceSummary;
  field: OwnFieldView;
}

export interface SeedLedgerEntry {
  id: string;
  reason:
    | "small_seed_read"
    | "small_seed_exchange"
    | "true_seed_share"
    | "true_seed_plant"
    | "author_read_xp"
    | "field_harvest_xp";
  resource: "small_seed" | "true_seed" | "experience";
  amount: number;
  createdAt: string;
  melonId?: string;
  plantId?: string;
  harvestBatchId?: string;
}

export interface MelonComment {
  id: string;
  melonId: string;
  alias: string;
  displayName?: string;
  publicId?: string;
  identityBadge?: IdentityBadge;
  content: string;
  createdAt: string;
}

export interface MelonCommentsPage {
  items: MelonComment[];
  nextCursor?: string;
}

export type SquatAlertKind = "mature" | "follow_up";

export interface SquatShelfItem {
  melon: MelonPreview;
  squattedAt: string;
  alertKind: SquatAlertKind | null;
  unread: boolean;
}

export interface SquatShelf {
  unreadCount: number;
  items: SquatShelfItem[];
}

export interface VerifyZonePresenceRequest {
  melonId: string;
  /** Required only for nearby_area. Public-zone delivery uses the configured spot centre. */
  location?: LocationProof;
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
