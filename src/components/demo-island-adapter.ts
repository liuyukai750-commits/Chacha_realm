import type {
  AnonymousSession,
  CityId,
  CitySummary,
  CompleteReadRequest,
  CompleteReadResult,
  CreateMelonRequest,
  CreateMelonResult,
  DiscoveryRequest,
  DiscoveryResponse,
  FieldView,
  MelonComment,
  MelonDetail,
  MelonPreview,
  OpenedMelon,
  ReactionType,
} from "@/contracts";

export interface IslandBootstrap {
  session: AnonymousSession;
  cities: CitySummary[];
  discovery: DiscoveryResponse;
  field: FieldView;
}

export interface IslandAdapter {
  bootstrap(): Promise<IslandBootstrap>;
  discover(request: DiscoveryRequest): Promise<DiscoveryResponse>;
  openMelon(id: string): Promise<OpenedMelon>;
  completeRead(id: string, request: CompleteReadRequest): Promise<CompleteReadResult>;
  setSquat(id: string, active: boolean): Promise<{ active: boolean }>;
  react(id: string, reaction: ReactionType): Promise<Record<ReactionType, number>>;
  comments(id: string): Promise<MelonComment[]>;
  comment(id: string, content: string): Promise<MelonComment>;
  field(): Promise<FieldView>;
  createMelon(request: CreateMelonRequest): Promise<CreateMelonResult>;
}

const changshaSpots = [
  { id: "spot-cs-01", cityId: "changsha" as const, districtId: "furong", name: "五一广场" },
  { id: "spot-cs-02", cityId: "changsha" as const, districtId: "tianxin", name: "杜甫江阁" },
  { id: "spot-cs-03", cityId: "changsha" as const, districtId: "yuelu", name: "岳麓书院" },
];

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
    spots: changshaSpots,
    opening: { cityId: "changsha", status: "gathering", safeMelons: 22, distinctAuthors: 19, distinctSpots: 3, distinctTopics: 3 },
  },
  ...otherCities.map(([id, name], index): CitySummary => ({
    id,
    name,
    districts: [],
    spots: [],
    opening: { cityId: id, status: index < 2 ? "open" : "gathering", safeMelons: 16 + index * 3, distinctAuthors: 13 + index * 2, distinctSpots: 2, distinctTopics: 3 },
  })),
];

const previews: MelonPreview[] = [
  { id: "m-001", status: "mature", topic: "work", cityId: "changsha", districtId: "tianxin", spot: changshaSpots[1], distanceBand: "within_1km", completedReads: 18, isRemote: false },
  { id: "m-002", status: "mature", topic: "daily", cityId: "changsha", districtId: "furong", spot: changshaSpots[0], distanceBand: "within_3km", completedReads: 11, isRemote: false },
  { id: "m-004", status: "incubating", topic: "food", cityId: "changsha", districtId: "yuelu", spot: changshaSpots[2], distanceBand: "within_3km", maturesAt: new Date(Date.now() + 78 * 60 * 1000).toISOString(), isRemote: false },
  { id: "m-003", status: "mature", topic: "relationship", cityId: "changsha", districtId: "kaifu", spot: { id: "spot-cs-04", cityId: "changsha", districtId: "kaifu", name: "烈士公园" }, distanceBand: "within_8km", completedReads: 27, isRemote: false },
  { id: "m-005", status: "mature", topic: "neighborhood", cityId: "shanghai", districtId: "xuhui", spot: { id: "spot-sh-01", cityId: "shanghai", districtId: "xuhui", name: "襄阳公园" }, distanceBand: "remote", completedReads: 34, isRemote: true },
];

const details: Record<string, MelonDetail> = {
  "m-001": { ...previews[0], status: "mature", alias: "戴耳机的水獭", title: "辞职前一晚，我在湘江边坐到了末班车", content: "工牌已经放回抽屉，离职邮件却在草稿箱躺了三个小时。江风把便利店塑料袋吹得哗啦响，我忽然发现，真正舍不得的不是这份工作，而是每天一起吃午饭的人。末班车来时，我终于按下了发送。", createdAt: new Date(Date.now() - 38 * 60 * 1000).toISOString(), squatted: false, reactions: { juicy: 12, wild: 4, hug: 9, follow_up: 6 } },
  "m-002": { ...previews[1], status: "mature", alias: "晚睡小浣熊", title: "便利店阿姨偷偷多塞给我一颗茶叶蛋", content: "今天加班到店里只剩最后一份便当。阿姨认出我，问是不是又没吃晚饭。结账时袋子比平时沉，我走到路口才发现多了一颗热乎的茶叶蛋，纸条上写着：年轻人也要好好吃饭。", createdAt: new Date(Date.now() - 74 * 60 * 1000).toISOString(), squatted: true, reactions: { juicy: 8, wild: 1, hug: 15, follow_up: 3 } },
  "m-003": { ...previews[3], status: "mature", alias: "淋雨的灰兔", title: "我们在同一张长椅上等了三场雨", content: "第一次只是借伞，第二次聊到各自绕远路回家的理由。今晚第三场雨落下来，他把一杯温豆浆放在长椅中间，说下次不下雨也可以见。我们都没有问名字。", createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(), squatted: false, reactions: { juicy: 21, wild: 7, hug: 18, follow_up: 11 } },
  "m-005": { ...previews[4], status: "mature", alias: "晒太阳的狸花", title: "楼道那盏坏了半年的灯，昨晚突然亮了", content: "物业群里吵过很多回，始终没人来修。昨晚回家，看见新搬来的邻居踩着小凳子换灯泡。他说家里老人眼睛不好，楼道亮一点，大家都走得稳。", createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(), squatted: false, reactions: { juicy: 17, wild: 2, hug: 13, follow_up: 5 } },
};

let session: AnonymousSession = { alias: "戴耳机的水獭", animal: "水獭", seedCount: 7 };
let fieldView: FieldView = { alias: session.alias, animal: session.animal, progress: { seedCount: 7, stage: "flower", nextStageAt: 12 }, melons: [] };
const readTokens = new Map<string, { melonId: string; completableAt: number }>();
const completed = new Set<string>();
const commentStore: Record<string, MelonComment[]> = {
  "m-001": [{ id: "c-001", melonId: "m-001", alias: "抱书的海狸", content: "按下发送的那一刻，你已经在往前走了。", createdAt: new Date(Date.now() - 21 * 60 * 1000).toISOString() }],
};

const delay = async <T>(value: T, ms = 120): Promise<T> => new Promise((resolve) => window.setTimeout(() => resolve(value), ms));
const copy = <T>(value: T): T => structuredClone(value);

function discoveryFor(cityId: CityId, located: boolean): DiscoveryResponse {
  const localItems = previews.filter((item) => item.cityId === cityId);
  const items = localItems.length ? [...localItems, ...previews.filter((item) => item.isRemote).slice(0, 1)] : previews.filter((item) => item.status === "mature").map((item) => ({ ...item, distanceBand: "remote" as const, isRemote: true }));
  return { visitorType: located ? "local" : "location_unknown", activeCityId: cityId, items, localEmpty: localItems.length === 0 };
}

export const demoIslandAdapter: IslandAdapter = {
  async bootstrap() {
    return delay(copy({ session, cities, discovery: discoveryFor("changsha", false), field: fieldView }));
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
    const token = readTokens.get(request.readToken);
    if (!token || token.melonId !== id) throw new Error("阅读凭证已失效，请重新打开这颗瓜。" );
    if (Date.now() < token.completableAt) throw new Error("再读一会儿，瓜籽会在 5 秒后留下。" );
    const counted = !completed.has(id);
    if (counted) {
      completed.add(id);
      session = { ...session, seedCount: session.seedCount + 1 };
      fieldView = { ...fieldView, progress: { ...fieldView.progress, seedCount: session.seedCount } };
    }
    return delay({ counted, readerSeedAwarded: counted, authorSeedAwarded: counted, readerSeedCount: session.seedCount, completedReads: (details[id]?.completedReads ?? 0) + (counted ? 1 : 0) });
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
    return delay(copy(commentStore[id] ?? []));
  },
  async comment(id, content) {
    const comment: MelonComment = { id: `demo-comment-${Date.now()}`, melonId: id, alias: session.alias, content, createdAt: new Date().toISOString() };
    commentStore[id] = [...(commentStore[id] ?? []), comment];
    return delay(copy(comment));
  },
  async field() {
    return delay(copy(fieldView));
  },
  async createMelon(request) {
    const id = `demo-melon-${Date.now()}`;
    const spot = cities.flatMap((city) => city.spots).find((item) => item.id === request.spotId);
    if (!spot) throw new Error("这个公共地点暂时不能埋瓜。" );
    const preview: MelonPreview = { id, status: "incubating", topic: request.topic, cityId: spot.cityId, districtId: spot.districtId, spot, distanceBand: "within_1km", maturesAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), isRemote: false };
    fieldView = { ...fieldView, melons: [preview, ...fieldView.melons] };
    return delay<CreateMelonResult>({ id, status: "incubating", maturesAt: preview.maturesAt });
  },
};
