import type {
  AnonymousSession,
  CityId,
  CitySummary,
  CompleteReadRequest,
  CompleteReadResult,
  CreateReportRequest,
  CreateMelonRequest,
  CreateMelonResult,
  DiscoveryRequest,
  DiscoveryResponse,
  DiscoverySceneContext,
  FieldPlant,
  FieldView,
  HarvestFieldResult,
  MelonComment,
  MelonCommentsPage,
  MelonDetail,
  MelonPreview,
  OpenedMelon,
  OwnFieldView,
  PlantFieldRequest,
  PlantFieldResult,
  ReactionType,
  SeekState,
  VerifyZonePresenceRequest,
  ZonePresenceResult,
} from "@/contracts";
import { publicSpots, toPublicSpotSummary } from "@/data/geography";

export interface IslandBootstrap {
  session: AnonymousSession;
  cities: CitySummary[];
  discovery: DiscoveryResponse;
  field: FieldView;
  melonDetails: Record<string, MelonDetail>;
}

export interface IslandAdapter {
  bootstrap(): Promise<IslandBootstrap>;
  discover(request: DiscoveryRequest): Promise<DiscoveryResponse>;
  openMelon(id: string, presenceToken?: string): Promise<OpenedMelon>;
  completeRead(id: string, request: CompleteReadRequest): Promise<CompleteReadResult>;
  setSquat(id: string, active: boolean): Promise<{ active: boolean }>;
  react(id: string, reaction: ReactionType): Promise<Record<ReactionType, number>>;
  comments(id: string, presenceToken?: string): Promise<MelonCommentsPage>;
  verifyZonePresence(request: VerifyZonePresenceRequest): Promise<ZonePresenceResult>;
  comment(id: string, content: string, presenceToken: string): Promise<MelonComment>;
  field(): Promise<FieldView>;
  fieldByAlias(alias: string): Promise<FieldView>;
  plant(request: PlantFieldRequest): Promise<PlantFieldResult>;
  harvest(): Promise<HarvestFieldResult>;
  createMelon(request: CreateMelonRequest): Promise<CreateMelonResult>;
  report(request: CreateReportRequest): Promise<{ accepted: true }>;
}

const changshaSpots = [
  { id: "spot-cs-01", cityId: "changsha" as const, districtId: "furong", name: "五一广场" },
  { id: "spot-cs-02", cityId: "changsha" as const, districtId: "tianxin", name: "杜甫江阁" },
  { id: "spot-cs-03", cityId: "changsha" as const, districtId: "yuelu", name: "岳麓书院" },
];

const configuredDemoSpots = publicSpots.map(toPublicSpotSummary);

const otherCities: Array<[CityId, string]> = [
  ["beijing", "北京"],
  ["shanghai", "上海"],
  ["guangzhou", "广州"],
  ["shenzhen", "深圳"],
];

const cities: CitySummary[] = [
  {
    id: "changsha",
    name: "长沙",
    districts: [{ id: "furong", name: "芙蓉区" }, { id: "tianxin", name: "天心区" }, { id: "yuelu", name: "岳麓区" }],
    spots: configuredDemoSpots.filter((spot) => spot.cityId === "changsha"),
    opening: { cityId: "changsha", status: "gathering", safeMelons: 22, distinctAuthors: 19, distinctSpots: 3, distinctTopics: 3 },
  },
  ...otherCities.map(([id, name], index): CitySummary => ({
    id,
    name,
    districts: [],
    spots: configuredDemoSpots.filter((spot) => spot.cityId === id),
    opening: { cityId: id, status: index < 2 ? "open" : "gathering", safeMelons: 16 + index * 3, distinctAuthors: 13 + index * 2, distinctSpots: 2, distinctTopics: 3 },
  })),
];

const previewSeeds: Array<Omit<MelonPreview, "revealMode">> = [
  { id: "m-001", status: "mature", topic: "work", cityId: "changsha", districtId: "tianxin", spot: changshaSpots[1], distanceBand: "within_1km", completedReads: 18, isRemote: false },
  { id: "m-002", status: "mature", topic: "daily", cityId: "changsha", districtId: "furong", spot: changshaSpots[0], distanceBand: "within_3km", completedReads: 11, isRemote: false },
  { id: "m-004", status: "incubating", topic: "food", cityId: "changsha", districtId: "yuelu", spot: changshaSpots[2], distanceBand: "within_3km", maturesAt: new Date(Date.now() + 78 * 60 * 1000).toISOString(), isRemote: false },
  { id: "m-003", status: "mature", topic: "relationship", cityId: "changsha", districtId: "kaifu", spot: { id: "spot-cs-04", cityId: "changsha", districtId: "kaifu", name: "烈士公园" }, distanceBand: "within_8km", completedReads: 27, isRemote: false },
  { id: "m-005", status: "mature", topic: "neighborhood", cityId: "shanghai", districtId: "xuhui", spot: { id: "spot-sh-01", cityId: "shanghai", districtId: "xuhui", name: "襄阳公园" }, distanceBand: "remote", completedReads: 34, isRemote: true },
  { id: "m-006", status: "mature", topic: "food", cityId: "changsha", districtId: "furong", spot: changshaSpots[0], distanceBand: "within_1km", completedReads: 9, isRemote: false },
  { id: "m-007", status: "incubating", topic: "daily", cityId: "changsha", districtId: "furong", spot: changshaSpots[0], distanceBand: "within_1km", maturesAt: new Date(Date.now() + 31 * 60 * 1000).toISOString(), isRemote: false },
  { id: "m-008", status: "mature", topic: "relationship", cityId: "changsha", districtId: "furong", spot: changshaSpots[0], distanceBand: "within_1km", completedReads: 14, isRemote: false },
  { id: "m-009", status: "mature", topic: "daily", cityId: "changsha", districtId: "furong", spot: changshaSpots[0], distanceBand: "within_1km", completedReads: 6, isRemote: false },
  { id: "m-010", status: "incubating", topic: "work", cityId: "changsha", districtId: "furong", spot: changshaSpots[0], distanceBand: "within_1km", maturesAt: new Date(Date.now() + 54 * 60 * 1000).toISOString(), isRemote: false },
  { id: "m-011", status: "mature", topic: "neighborhood", cityId: "changsha", districtId: "furong", spot: changshaSpots[0], distanceBand: "within_1km", completedReads: 19, isRemote: false },
  { id: "m-012", status: "mature", topic: "work", cityId: "changsha", districtId: "furong", spot: changshaSpots[0], distanceBand: "within_1km", completedReads: 12, isRemote: false },
  { id: "m-013", status: "incubating", topic: "neighborhood", cityId: "changsha", districtId: "furong", spot: changshaSpots[0], distanceBand: "within_1km", maturesAt: new Date(Date.now() + 69 * 60 * 1000).toISOString(), isRemote: false },
  { id: "m-014", status: "mature", topic: "food", cityId: "changsha", districtId: "furong", spot: changshaSpots[0], distanceBand: "within_1km", completedReads: 5, isRemote: false },
  { id: "m-015", status: "incubating", topic: "relationship", cityId: "changsha", districtId: "furong", spot: changshaSpots[0], distanceBand: "within_1km", maturesAt: new Date(Date.now() + 96 * 60 * 1000).toISOString(), isRemote: false },
  { id: "m-016", status: "mature", topic: "daily", cityId: "changsha", districtId: "furong", spot: changshaSpots[0], distanceBand: "within_1km", completedReads: 8, isRemote: false },
];

const previews: MelonPreview[] = previewSeeds.map((melon) => ({
  ...melon,
  revealMode: "open",
}));

const details: Record<string, MelonDetail> = {
  "m-001": { ...previews[0], status: "mature", alias: "戴耳机的水獭", title: "辞职前一晚，我在湘江边坐到了末班车", content: "工牌已经放回抽屉，离职邮件却在草稿箱躺了三个小时。江风把便利店塑料袋吹得哗啦响，我忽然发现，真正舍不得的不是这份工作，而是每天一起吃午饭的人。末班车来时，我终于按下了发送。", createdAt: new Date(Date.now() - 38 * 60 * 1000).toISOString(), squatted: false, reactions: { juicy: 12, wild: 4, hug: 9, follow_up: 6 } },
  "m-002": { ...previews[1], status: "mature", alias: "晚睡小浣熊", title: "便利店阿姨偷偷多塞给我一颗茶叶蛋", content: "今天加班到店里只剩最后一份便当。阿姨认出我，问是不是又没吃晚饭。结账时袋子比平时沉，我走到路口才发现多了一颗热乎的茶叶蛋，纸条上写着：年轻人也要好好吃饭。", createdAt: new Date(Date.now() - 74 * 60 * 1000).toISOString(), squatted: true, reactions: { juicy: 8, wild: 1, hug: 15, follow_up: 3 } },
  "m-003": { ...previews[3], status: "mature", alias: "淋雨的灰兔", title: "我们在同一张长椅上等了三场雨", content: "第一次只是借伞，第二次聊到各自绕远路回家的理由。今晚第三场雨落下来，他把一杯温豆浆放在长椅中间，说下次不下雨也可以见。我们都没有问名字。", createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(), squatted: false, reactions: { juicy: 21, wild: 7, hug: 18, follow_up: 11 } },
  "m-005": { ...previews[4], status: "mature", alias: "晒太阳的狸花", title: "楼道那盏坏了半年的灯，昨晚突然亮了", content: "物业群里吵过很多回，始终没人来修。昨晚回家，看见新搬来的邻居踩着小凳子换灯泡。他说家里老人眼睛不好，楼道亮一点，大家都走得稳。", createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(), squatted: false, reactions: { juicy: 17, wild: 2, hug: 13, follow_up: 5 } },
  "m-006": { ...previews[5], status: "mature", alias: "揣辣椒的松鼠", title: "那家排队小店今天把最后一份留给了夜班人", content: "雨刚停，门口还排着长队。店员从保温柜后面拿出最后一份，说有人下午预付过，让留给穿反光背心的夜班人。大家没有追问是谁，只把门口的位置让开了一点。", createdAt: new Date(Date.now() - 52 * 60 * 1000).toISOString(), squatted: false, reactions: { juicy: 9, wild: 3, hug: 11, follow_up: 4 } },
  "m-008": { ...previews[7], status: "mature", alias: "抱汽水的灰鹭", title: "两个人都绕路，却在同一棵树下碰见", content: "一个说来吹风，一个说只是路过。可他们都带着对方常喝的汽水。树影摇了很久，谁也没先戳破，只约好下次还在这个公开地点见。", createdAt: new Date(Date.now() - 91 * 60 * 1000).toISOString(), squatted: false, reactions: { juicy: 13, wild: 5, hug: 16, follow_up: 7 } },
  "m-009": { ...previews[8], status: "mature", alias: "踩影子的柯基", title: "广场边有人把掉落的花一朵朵摆回树下", content: "风把一地小花吹到台阶上，他蹲下来慢慢捡，说这样保洁阿姨扫地会轻松一点。后来两个小朋友也加入，摆出一条歪歪扭扭的花路。", createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), squatted: false, reactions: { juicy: 7, wild: 1, hug: 10, follow_up: 2 } },
  "m-011": { ...previews[10], status: "mature", alias: "等绿灯的刺猬", title: "修伞摊今天没有收那位学生的钱", content: "旧伞骨断了两根，摊主一边修一边问是不是马上要考试。学生点头，他就摆摆手，说等以后工作了再来照顾生意。旁边的人都假装没有看见他红了眼睛。", createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(), squatted: false, reactions: { juicy: 15, wild: 2, hug: 18, follow_up: 5 } },
  "m-012": { ...previews[11], status: "mature", alias: "关闹钟的海狸", title: "群里最安静的人，替大家挡下了临时加班", content: "会议快结束时又冒出一项急活。平常很少说话的同事先开口，说他今天可以接，但下次请按排期来。屋里安静两秒，随后每个人都把自己的部分认领走了。", createdAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(), squatted: false, reactions: { juicy: 18, wild: 6, hug: 14, follow_up: 8 } },
  "m-014": { ...previews[13], status: "mature", alias: "闻面包的垂耳兔", title: "打烊前的面包被分成了很多小袋", content: "店员把当天没卖完的面包分装好，交给几位晚归的环卫工。有人问能不能付钱，她说这是今天最后一项工作，请大家帮忙让它按时完成。", createdAt: new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString(), squatted: false, reactions: { juicy: 8, wild: 1, hug: 12, follow_up: 3 } },
  "m-016": { ...previews[15], status: "mature", alias: "追晚霞的獾", title: "陌生人替摔倒的骑手守了十分钟的车", content: "骑手去附近处理擦伤，路边的人就轮流看着电动车和餐箱。十分钟后他跑回来，连声道谢。大家只说快去吧，餐还热着。", createdAt: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(), squatted: false, reactions: { juicy: 10, wild: 2, hug: 15, follow_up: 4 } },
};

let session: AnonymousSession = {
  alias: "戴耳机的水獭",
  animal: "水獭",
  wallet: { smallSeedCount: 0, trueSeedCount: 0 },
  experience: { total: 0, fromReads: 0, fromHarvests: 0 },
};
const emptyPlots = (): OwnFieldView["plots"] => ([0, 1, 2] as const).map((plotIndex) => ({ plotIndex, capacity: 3 as const, plants: [] }));
let fieldView: OwnFieldView = {
  alias: session.alias,
  animal: session.animal,
  plots: emptyPlots(),
  plantedCount: 0,
  matureCount: 0,
  melons: [],
  wallet: session.wallet,
  experience: session.experience,
  canHarvest: false,
};
let dailyReadRewards = 0;
let dailyShareRewarded = false;
let rewardDate = chinaDateKey();
const readTokens = new Map<string, { melonId: string; completableAt: number }>();
const completed = new Set<string>();
const commentStore: Record<string, MelonComment[]> = {
  "m-001": [
    { id: "c-001", melonId: "m-001", alias: "抱书的海狸", content: "按下发送的那一刻，你已经在往前走了。", createdAt: new Date(Date.now() - 21 * 60 * 1000).toISOString() },
    { id: "c-002", melonId: "m-001", alias: "搭末班车的白鼬", content: "同样坐过那班车。江风很大，但决定会慢慢变轻。", createdAt: new Date(Date.now() - 13 * 60 * 1000).toISOString() },
    { id: "c-003", melonId: "m-001", alias: "背帆布包的喜鹊", content: "先吃饭，再睡一觉。明天会是新的工作日，也是你的新一天。", createdAt: new Date(Date.now() - 7 * 60 * 1000).toISOString() },
  ],
  "m-006": [
    { id: "c-006-1", melonId: "m-006", alias: "夜跑的小熊猫", content: "我大概知道是哪家店。谢谢那位没留下名字的人。", createdAt: new Date(Date.now() - 28 * 60 * 1000).toISOString() },
    { id: "c-006-2", melonId: "m-006", alias: "撑黄伞的河狸", content: "这种小事会让一整晚都亮一点。", createdAt: new Date(Date.now() - 18 * 60 * 1000).toISOString() },
  ],
};
const presenceTokens = new Map<string, { expiresAt: number; spotId: string; seekState: SeekState }>();
const seekAttempts = new Map<string, number>();
const plantOperations = new Map<string, PlantFieldResult>();
const createOperations = new Map<string, CreateMelonResult>();
let lastDemoScene: DiscoverySceneContext | null = null;

const delay = async <T>(value: T, ms = 120): Promise<T> => new Promise((resolve) => window.setTimeout(() => resolve(value), ms));
const copy = <T>(value: T): T => typeof structuredClone === "function"
  ? structuredClone(value)
  : JSON.parse(JSON.stringify(value)) as T;

function refreshDemoField() {
  const now = Date.now();
  const plots = fieldView.plots.map((plot) => ({
    ...plot,
    plants: plot.plants.map((plant) => {
      const age = now - new Date(plant.plantedAt).getTime();
      const stage: FieldPlant["stage"] = now >= new Date(plant.maturesAt).getTime() ? "mature" : age >= 4 * 60 * 60 * 1000 ? "growing" : "seedling";
      return { ...plant, stage };
    }),
  }));
  const plants = plots.flatMap((plot) => plot.plants);
  const matureCount = plants.filter((plant) => plant.stage === "mature").length;
  const nextMaturesAt = plants.filter((plant) => plant.stage !== "mature").map((plant) => plant.maturesAt).sort()[0];
  fieldView = { ...fieldView, plots, plantedCount: plants.length, matureCount, ...(nextMaturesAt ? { nextMaturesAt } : { nextMaturesAt: undefined }), canHarvest: plants.length === 9 && matureCount === 9 };
}

function chinaDateKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function refreshDailyRewards() {
  const today = chinaDateKey();
  if (today === rewardDate) return;
  rewardDate = today;
  dailyReadRewards = 0;
  dailyShareRewarded = false;
}

function discoveryFor(cityId: CityId, located: boolean): DiscoveryResponse {
  const localItems = previews.filter((item) => item.cityId === cityId);
  const items = localItems.length ? [...localItems, ...previews.filter((item) => item.isRemote).slice(0, 1)] : previews.filter((item) => item.status === "mature").map((item) => ({ ...item, distanceBand: "remote" as const, isRemote: true }));
  const rememberedScene = located && lastDemoScene && (lastDemoScene.kind !== "public_spot" || lastDemoScene.spot.cityId === cityId) ? lastDemoScene : null;
  return {
    visitorType: located ? "local" : "location_unknown",
    activeCityId: cityId,
    sceneContext: located ? rememberedScene ?? { kind: "nearby_area" } : { kind: "city_overview" },
    items,
    localEmpty: localItems.length === 0,
  };
}

export const demoIslandAdapter: IslandAdapter = {
  async bootstrap() {
    refreshDemoField();
    return delay(copy({ session, cities, discovery: discoveryFor("changsha", false), field: fieldView, melonDetails: details }));
  },
  async discover(request) {
    return delay(copy(discoveryFor(request.selectedCityId ?? "changsha", Boolean(request.location))));
  },
  async openMelon(id) {
    const melon = details[id];
    if (!melon) throw new Error("这颗瓜还没有成熟。稍后再来听听。" );
    const readToken = `demo-read-${id}-${Date.now()}`;
    const completableAt = Date.now() + 5000;
    readTokens.set(readToken, { melonId: id, completableAt });
    return delay(copy({ melon, readToken, completableAt: new Date(completableAt).toISOString() }));
  },
  async completeRead(id, request) {
    refreshDailyRewards();
    const token = readTokens.get(request.readToken);
    if (!token || token.melonId !== id) throw new Error("阅读凭证已失效，请重新打开这颗瓜。" );
    if (Date.now() < token.completableAt) throw new Error("再读一会儿，瓜籽会在 5 秒后留下。" );
    if (details[id]?.alias === session.alias) throw new Error("自己的瓜可以回看，但不能靠自读领取瓜籽。" );
    const counted = !completed.has(id);
    let smallSeedAwarded = false;
    let autoConverted = false;
    if (counted) {
      completed.add(id);
      const authorExperienceAwarded = 1;
      if (dailyReadRewards < 5) {
        dailyReadRewards += 1;
        smallSeedAwarded = true;
        const nextSmall = session.wallet.smallSeedCount + 1;
        autoConverted = nextSmall === 5;
        session = {
          ...session,
          wallet: autoConverted
            ? { smallSeedCount: 0, trueSeedCount: session.wallet.trueSeedCount + 1 }
            : { ...session.wallet, smallSeedCount: nextSmall },
        };
      }
      return delay({ counted, smallSeedAwarded, autoConverted, wallet: session.wallet, authorExperienceAwarded, completedReads: (details[id]?.completedReads ?? 0) + 1 });
    }
    return delay({ counted, smallSeedAwarded, autoConverted, wallet: session.wallet, authorExperienceAwarded: 0, completedReads: details[id]?.completedReads ?? 0 });
  },
  async setSquat(id, active) {
    if (details[id]) details[id] = { ...details[id], squatted: active };
    return delay({ active });
  },
  async react(id, reaction) {
    const melon = details[id];
    if (!melon) throw new Error("没有找到这颗瓜。" );
    melon.reactions = { ...melon.reactions, [reaction]: melon.reactions[reaction] + 1 };
    return delay(copy(melon.reactions));
  },
  async comments(id) {
    return delay(copy({ items: commentStore[id] ?? [] }));
  },
  async verifyZonePresence(request) {
    const attempt = (seekAttempts.get(request.spotId) ?? 0) + 1;
    seekAttempts.set(request.spotId, attempt);
    const states = ["outside", "near", "inside_zone", "found"] as const;
    const seekState = states[Math.min(attempt - 1, states.length - 1)];
    const local = seekState === "inside_zone" || seekState === "found";
    const token = local ? `demo-presence-${request.spotId}-${Date.now()}` : undefined;
    if (token) presenceTokens.set(token, { expiresAt: Date.now() + 15 * 60 * 1000, spotId: request.spotId, seekState });
    return delay(copy({
      presence: local ? "local" : "remote",
      seekState,
      ...(token ? { presenceToken: token, expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString() } : {}),
    }));
  },
  async comment(id, content, presenceToken) {
    const presence = presenceTokens.get(presenceToken);
    if (!presence || presence.expiresAt <= Date.now()) throw new Error("现场凭证已过期。草稿还在，重新感应后可以继续发送。");
    const comment: MelonComment = { id: `demo-comment-${Date.now()}`, melonId: id, alias: session.alias, content, createdAt: new Date().toISOString() };
    commentStore[id] = [...(commentStore[id] ?? []), comment];
    return delay(copy(comment));
  },
  async field() {
    refreshDemoField();
    return delay(copy(fieldView));
  },
  async fieldByAlias(alias) {
    const melons = previews.filter((melon) => details[melon.id]?.alias === alias);
    return delay(copy({ alias, animal: alias.includes("兔") ? "兔" : "小动物", plots: emptyPlots(), plantedCount: 0, matureCount: 0, melons }));
  },
  async plant(request) {
    const previous = plantOperations.get(request.operationId);
    if (previous) return delay(copy(previous));
    const { plotIndex } = request;
    if (session.wallet.trueSeedCount < 1) throw new Error("还没有真瓜籽。认真吃完 5 颗瓜，或分享今天第一颗原创瓜，就能得到。" );
    const plot = fieldView.plots.find((item) => item.plotIndex === plotIndex);
    if (!plot || plot.plants.length >= 3) throw new Error("这片地已经种满 3 个瓜了，换一片地试试。" );
    const slotIndex = ([0, 1, 2] as const).find((slot) => !plot.plants.some((plant) => plant.slotIndex === slot));
    if (slotIndex === undefined) throw new Error("这片地已经种满了。" );
    const now = Date.now();
    const plant = { id: `demo-plant-${now}`, plotIndex, slotIndex, plantedAt: new Date(now).toISOString(), maturesAt: new Date(now + 12 * 60 * 60 * 1000).toISOString(), stage: "seedling" as const };
    const wallet = { ...session.wallet, trueSeedCount: session.wallet.trueSeedCount - 1 };
    session = { ...session, wallet };
    const plots = fieldView.plots.map((item) => item.plotIndex === plotIndex ? { ...item, plants: [...item.plants, plant] } : item);
    fieldView = { ...fieldView, plots, plantedCount: fieldView.plantedCount + 1, nextMaturesAt: plant.maturesAt, wallet };
    const result = { plant, wallet, field: fieldView };
    plantOperations.set(request.operationId, copy(result));
    return delay(copy(result));
  },
  async harvest() {
    const matureCount = fieldView.plots.flatMap((plot) => plot.plants).filter((plant) => new Date(plant.maturesAt).getTime() <= Date.now()).length;
    if (fieldView.plantedCount !== 9 || matureCount !== 9) throw new Error("九个瓜全部成熟后才能一键收瓜。" );
    const experience = { ...session.experience, total: session.experience.total + 9, fromHarvests: session.experience.fromHarvests + 9 };
    session = { ...session, experience };
    fieldView = { ...fieldView, plots: emptyPlots(), plantedCount: 0, matureCount: 0, nextMaturesAt: undefined, experience, canHarvest: false };
    return delay(copy({ harvestedCount: 9 as const, experienceAwarded: 9 as const, experience, field: fieldView }));
  },
  async createMelon(request) {
    refreshDailyRewards();
    const previous = createOperations.get(request.operationId);
    if (previous) return delay(copy(previous));
    const id = `demo-melon-${Date.now()}`;
    const burialKind = request.burialKind ?? "public_spot";
    const cityId = request.cityId ?? "changsha";
    const city = cities.find((item) => item.id === cityId);
    const spot = burialKind === "nearby_area"
      ? { id: `demo-nearby-${cityId}`, cityId, districtId: city?.districts[0]?.id ?? `${cityId}-nearby`, name: "附近生活圈" }
      : cities.flatMap((item) => item.spots).find((item) => item.id === request.spotId);
    if (!spot) throw new Error("这个公共地点暂时不能埋瓜。" );
    lastDemoScene = burialKind === "nearby_area" ? { kind: "nearby_area" } : { kind: "public_spot", spot };
    const preview: MelonPreview = { id, status: "incubating", burialKind, topic: request.topic, cityId: spot.cityId, districtId: spot.districtId, spot, distanceBand: "within_1km", maturesAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), isRemote: false, revealMode: request.revealMode };
    const trueSeedAwarded = !dailyShareRewarded;
    dailyShareRewarded = true;
    const wallet = trueSeedAwarded ? { ...session.wallet, trueSeedCount: session.wallet.trueSeedCount + 1 } : session.wallet;
    session = { ...session, wallet };
    previews.unshift(preview);
    fieldView = { ...fieldView, wallet, melons: [preview, ...fieldView.melons] };
    const result: CreateMelonResult = { id, status: "incubating", maturesAt: preview.maturesAt, trueSeedAwarded, wallet };
    createOperations.set(request.operationId, copy(result));
    return delay<CreateMelonResult>(copy(result));
  },
  async report() {
    return delay({ accepted: true as const });
  },
};
