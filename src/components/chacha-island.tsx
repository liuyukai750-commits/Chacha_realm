"use client";

/*
THESIS: 城市匿名故事是一层可被走近的信号，不是儿童农场换皮。
OWN-WORLD: 半真实城市场景、石墨与雾白界面、酸橙定位信号、暖橙成熟信号、细边界与低饱和材质。
STORY: 用户先看到附近瓜区，直接吃日常小瓜；值得寻找的大瓜必须顺藤摸瓜，到达后才揭示并参与评论。
FIRST VIEWPORT: 城市日夜场景占据主舞台，瓜区状态叠在下缘，吃瓜、顺藤摸瓜和埋瓜保持单手可达。
FORM: 移动城市观察站；以场景层、信号层和情报列表取代圆形农田与卡通水果。
*/

import {
  type CSSProperties,
  type FormEvent,
  type ReactNode,
  type TouchEvent,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import Image from "next/image";
import { AmbientAudio } from "@/components/ambient-audio/ambient-audio";
import { AnimalAvatar } from "@/components/auth-gate";
import type {
  AnimalIdentity,
  CityId,
  CompleteReadResult,
  CreateMelonRequest,
  CreateMelonResult,
  CreateReportRequest,
  DiscoverySceneContext,
  DistanceBand,
  FieldPlant,
  FieldMelonPreview,
  FieldPlotIndex,
  FieldView,
  HarvestFieldResult,
  LocationProof,
  MelonComment,
  MelonCommentsPage,
  MelonPreview,
  OpenedMelon,
  OwnFieldView,
  ReactionType,
  SafeTopic,
  SeekState,
  SquatShelf,
  SquatShelfItem,
  ZonePresenceResult,
} from "@/contracts";
import { demoIslandAdapter, type IslandAdapter, type IslandBootstrap } from "./demo-island-adapter";
import { httpIslandAdapter } from "./http-island-adapter";
import { BurySheetV1 } from "./bury-sheet-v1";
import { getCityVisual, getSpotScene } from "./city-visuals";
import { IdentityBadge } from "./identity-badge";
import {
  CheckIcon,
  ChevronIcon,
  CloseIcon,
  FieldIcon,
  LocationIcon,
  MessageIcon,
  PlusIcon,
  RadarIcon,
  SeedIcon,
  SproutIcon,
  SunIcon,
} from "./icons";

const topicName: Record<SafeTopic, string> = {
  daily: "日常",
  work: "职场",
  relationship: "关系",
  food: "吃喝",
  neighborhood: "邻里",
};

const distanceName: Record<DistanceBand, string> = {
  within_1km: "同一瓜区",
  within_3km: "附近瓜区",
  within_8km: "同城",
  within_20km: "同城稍远",
  remote: "远方",
};

const reactionMeta: Array<[ReactionType, string, string]> = [
  ["like", "点赞", "♡"],
];

const seekCopy: Record<SeekState, { label: string; hint: string; notice: string }> = {
  outside: { label: "还没摸到藤", hint: "还在瓜区外，可以继续远方围观。", notice: "顺藤摸瓜：目前在瓜区外，仍可远方围观" },
  near: { label: "摸到藤了", hint: "正在靠近公共地点，没有路线和精确距离。", notice: "顺藤摸瓜：正在靠近公共地点" },
  inside_zone: { label: "已进入瓜区", hint: "现场评论凭证已点亮，有效期很短。", notice: "叶语感应完成：已进入瓜区" },
  found: { label: "摸到这颗瓜", hint: "这里只确认公共地点，不显示任何人的位置。", notice: "顺藤摸瓜：已经找到这颗瓜" },
};

type LandmarkKind = "pavilion" | "temple" | "pearl" | "canton" | "skyline" | "meadow";
type DiscoveryScope = "nearby" | "city";
type BuryFeedback = Pick<CreateMelonResult, "id" | "status" | "trueSeedAwarded" | "cityId"> & {
  burialKind: NonNullable<CreateMelonRequest["burialKind"]>;
};

async function refreshOwnFieldAfterCreate(adapter: IslandAdapter): Promise<FieldView> {
  const delays = [0, 600, 1_800];
  let lastError: unknown;
  for (const delay of delays) {
    if (delay) await new Promise((resolve) => window.setTimeout(resolve, delay));
    try {
      return await adapter.field();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

const demoNearbyCoordinates = {
  latitude: 28.195397,
  longitude: 112.976869,
  accuracyM: 18,
} as const;

const cityLandmarks: Record<CityId, { name: string; atmosphere: string; kind: LandmarkKind }> = {
  changsha: { name: "天心阁", atmosphere: "橘洲晴风", kind: "pavilion" },
  beijing: { name: "天坛", atmosphere: "古树晴空", kind: "temple" },
  shanghai: { name: "东方明珠", atmosphere: "江风与天际线", kind: "pearl" },
  guangzhou: { name: "广州塔", atmosphere: "珠江暖风", kind: "canton" },
  shenzhen: { name: "深圳湾", atmosphere: "海风步道", kind: "skyline" },
};

const fallbackLandmark = { name: "树桥草坡", atmosphere: "晴日田埂", kind: "meadow" } satisfies { name: string; atmosphere: string; kind: LandmarkKind };

export function ChachaIsland() {
  const [islandAdapter, setIslandAdapter] = useState<IslandAdapter>(httpIslandAdapter);
  const [mode, setMode] = useState<"live" | "demo">("live");
  const [dayPhase, setDayPhase] = useState<"day" | "night">("day");
  const [model, setModel] = useState<IslandBootstrap | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [tab, setTab] = useState<"radar" | "field">("radar");
  const [opened, setOpened] = useState<OpenedMelon | null>(null);
  const [openedComments, setOpenedComments] = useState<Promise<MelonCommentsPage> | undefined>();
  const [openedAsOwner, setOpenedAsOwner] = useState(false);
  const [viewedField, setViewedField] = useState<FieldView | null>(null);
  const [quickSquats, setQuickSquats] = useState<string[]>([]);
  const [squatBusyIds, setSquatBusyIds] = useState<string[]>([]);
  const [zonePresence, setZonePresence] = useState<Record<string, ZonePresenceResult>>({});
  const [openingMelon, setOpeningMelon] = useState(false);
  const [locatingNearby, setLocatingNearby] = useState(false);
  const [discoveryScope, setDiscoveryScope] = useState<DiscoveryScope>("city");
  const [showCities, setShowCities] = useState(false);
  const [showBury, setShowBury] = useState(false);
  const [showSquatShelf, setShowSquatShelf] = useState(false);
  const [buryFeedback, setBuryFeedback] = useState<BuryFeedback | null>(null);
  const [notice, setNotice] = useState("定位未开启 · 正在浏览公开瓜场");
  const commentsPrefetchRef = useRef(new Map<string, Promise<MelonCommentsPage>>());
  const modelReady = model !== null;

  const prefetchComments = (melonId: string, presenceToken?: string) => {
    const existing = commentsPrefetchRef.current.get(melonId);
    if (existing) return existing;
    const request = islandAdapter.comments(melonId, presenceToken);
    commentsPrefetchRef.current.set(melonId, request);
    void request.catch(() => {
      if (commentsPrefetchRef.current.get(melonId) === request) commentsPrefetchRef.current.delete(melonId);
    });
    return request;
  };

  const closeOpenedMelon = () => {
    if (opened) commentsPrefetchRef.current.delete(opened.melon.id);
    setOpened(null);
    setOpenedComments(undefined);
    setOpenedAsOwner(false);
  };

  useLayoutEffect(() => {
    const syncDayPhase = () => {
      const beijingHour = Number(new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Shanghai",
        hour: "2-digit",
        hour12: false,
      }).format(new Date()));
      setDayPhase(beijingHour >= 6 && beijingHour < 18 ? "day" : "night");
    };
    syncDayPhase();
    const timer = window.setInterval(syncDayPhase, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    let settled = false;
    const timeout = window.setTimeout(() => {
      if (!active || settled) return;
      settled = true;
      setLoadError(new Error("实时瓜场连接超时，可以重试或先进入本地试玩。"));
    }, 10_000);
    islandAdapter.bootstrap().then(
      (value) => {
        if (!active || settled) return;
        settled = true;
        window.clearTimeout(timeout);
        setLoadError(null);
        setModel(value);
        setQuickSquats(value.squatShelf.items.map((item) => item.melon.id));
      },
      (error) => {
        if (!active || settled) return;
        settled = true;
        window.clearTimeout(timeout);
        setLoadError(error);
      },
    );
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [islandAdapter, retryKey]);

  useEffect(() => {
    if (!modelReady) return;
    let active = true;
    const sync = () => {
      if (document.visibilityState !== "visible") return;
      void islandAdapter.squatShelf().then(
        (squatShelf) => active && setModel((current) => current ? { ...current, squatShelf } : current),
        () => undefined,
      );
    };
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("focus", sync);
    const timer = window.setInterval(sync, 60_000);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("focus", sync);
      window.clearInterval(timer);
    };
  }, [islandAdapter, modelReady]);

  const activeCity = model?.cities.find((city) => city.id === model.discovery.activeCityId);
  const writesBlocked = model?.session.accountStatus === "banned";
  const citySelectionRequestRef = useRef(0);
  const lastLocatedProofRef = useRef<LocationProof | null>(null);

  const selectCity = async (cityId: CityId) => {
    if (!model) return;
    const requestId = ++citySelectionRequestRef.current;
    const discovery = await islandAdapter.discover({ selectedCityId: cityId });
    if (requestId !== citySelectionRequestRef.current) return;
    setModel({ ...model, discovery });
    setDiscoveryScope("city");
    setShowCities(false);
    setNotice(`已切到${model.cities.find((city) => city.id === cityId)?.name ?? "这座城"}公开瓜场 · 未使用精确位置`);
  };

  const locate = async () => {
    if (!model) return;
    setLocatingNearby(true);
    try {
      const location = mode === "demo"
        ? { ...demoNearbyCoordinates, capturedAt: new Date().toISOString() }
        : await requestLocationProof();
      lastLocatedProofRef.current = location;
      const discovery = await islandAdapter.discover({ location });
      const nearbyCount = nearbyItemsForScene(discovery.items).length;
      setModel({ ...model, discovery });
      setDiscoveryScope("nearby");
      setNotice(mode === "demo"
        ? `已模拟附近 1 公里 · ${nearbyCount} 颗示例瓜 · 未读取电脑位置`
        : nearbyCount > 0 ? `附近 1 公里已打开 · 找到 ${nearbyCount} 颗瓜` : "附近 1 公里暂时没瓜 · 不会自动扩大范围");
    } catch (error) {
      setDiscoveryScope("city");
      setNotice(messageFrom(error));
    } finally {
      setLocatingNearby(false);
    }
  };

  const seekZone = async (melonId: string) => {
    const location = await requestLocationProof();
    lastLocatedProofRef.current = location;
    const result = await islandAdapter.verifyZonePresence({ melonId, location });
    setZonePresence((current) => ({ ...current, [melonId]: result }));
    setNotice(seekCopy[result.seekState].notice);
    if (result.seekState === "found" && "vibrate" in navigator) navigator.vibrate?.(18);
    return result;
  };

  const openMelon = async (preview: MelonPreview, presenceToken?: string): Promise<boolean> => {
    if (preview.status === "incubating") {
      setNotice(`这颗瓜还在长，约 ${formatCountdown(preview.maturesAt)} 后成熟`);
      return false;
    }
    setOpeningMelon(true);
    try {
      let accessToken = presenceToken;
      if (preview.burialKind === "nearby_area" && !accessToken) {
        const cachedLocation = lastLocatedProofRef.current;
        const cachedAt = cachedLocation ? Date.parse(cachedLocation.capturedAt) : Number.NaN;
        const location = cachedLocation && Number.isFinite(cachedAt) && cachedAt >= Date.now() - 4 * 60 * 1_000
          ? cachedLocation
          : await requestLocationProof();
        lastLocatedProofRef.current = location;
        const presence = await islandAdapter.verifyZonePresence({ melonId: preview.id, location });
        if (presence.presence !== "local" || !presence.presenceToken) {
          throw new Error("这颗附近瓜只在埋瓜点 1 公里内开放。");
        }
        setZonePresence((current) => ({ ...current, [preview.id]: presence }));
        accessToken = presence.presenceToken;
      }
      setOpenedAsOwner(false);
      setOpenedComments(prefetchComments(preview.id, accessToken));
      setOpened(await islandAdapter.openMelon(preview.id, accessToken));
      return true;
    } catch (error) {
      setNotice(messageFrom(error));
      return false;
    } finally {
      setOpeningMelon(false);
    }
  };

  const finishRead = (melonId: string, result: CompleteReadResult) => {
    setModel((current) => {
      if (!current) return current;
      const field = "wallet" in current.field ? { ...current.field, wallet: result.wallet } : current.field;
      return {
        ...current,
        session: { ...current.session, wallet: result.wallet },
        field,
        discovery: {
          ...current.discovery,
          items: current.discovery.items.filter((melon) => melon.id !== melonId),
        },
      };
    });
    setNotice(!result.counted
      ? "这颗瓜已经吃过 · 本次不重复奖励"
      : result.autoConverted
      ? "五粒小瓜籽聚在一起 · 真瓜籽 +1，去瓜田选择土地种下"
      : result.smallSeedAwarded ? "这颗瓜吃完了 · 小瓜籽 +1" : "阅读已记下 · 今天不再发小瓜籽");
  };

  const dismissBasketMelon = async (melon: MelonPreview) => {
    setModel((current) => current ? {
      ...current,
      discovery: { ...current.discovery, items: current.discovery.items.filter((item) => item.id !== melon.id) },
    } : current);
    try {
      await islandAdapter.dismissFromBasket(melon.id, true);
      setNotice("已从瓜篮移出 · 如果蹲过，这颗瓜仍会留在蹲瓜架");
    } catch (error) {
      setModel((current) => current && !current.discovery.items.some((item) => item.id === melon.id) ? {
        ...current,
        discovery: { ...current.discovery, items: [melon, ...current.discovery.items] },
      } : current);
      setNotice(messageFrom(error));
    }
  };

  const deleteOwnedMelon = async (melon: FieldMelonPreview) => {
    try {
      await islandAdapter.deleteOwnMelon(melon.id);
      setModel((current) => {
        if (!current) return current;
        const field = { ...current.field, melons: current.field.melons.filter((item) => item.id !== melon.id) };
        return {
          ...current,
          field,
          discovery: { ...current.discovery, items: current.discovery.items.filter((item) => item.id !== melon.id) },
        };
      });
      setNotice("这颗瓜已删除 · 之前获得的瓜籽不会被收回");
    } catch (error) {
      setNotice(messageFrom(error));
      throw error;
    }
  };

  const createMelon = async (input: Omit<CreateMelonRequest, "location">) => {
    const location = mode === "demo"
      ? { ...demoNearbyCoordinates, capturedAt: new Date().toISOString(), simulated: true, simulationLabel: "demo_nearby_life_circle" }
      : await requestLocationProof();
    lastLocatedProofRef.current = location;
    const result = await islandAdapter.createMelon({ ...input, location });

    // The create transaction is the source of truth. Reflect it before any
    // secondary refresh so a slow discovery request cannot hide a successful
    // publish or its wallet reward on mobile networks.
    setShowBury(false);
    setBuryFeedback({ id: result.id, status: result.status, trueSeedAwarded: result.trueSeedAwarded, cityId: result.cityId, burialKind: input.burialKind ?? "public_spot" });
    setModel((current) => {
      if (!current) return current;
      const field = "wallet" in current.field
        ? { ...current.field, wallet: result.wallet }
        : current.field;
      return { ...current, field, session: { ...current.session, wallet: result.wallet } };
    });
    const resultCityName = model?.cities.find((city) => city.id === result.cityId)?.name ?? "真实所在城市";
    setNotice(result.status === "held"
      ? "瓜已收到 · 内容正在安全复核，暂不发放真瓜籽"
      : result.trueSeedAwarded
      ? `瓜埋好了 · 已归入${resultCityName} · 安全原创奖励真瓜籽 +1`
      : `瓜埋好了 · 已归入${resultCityName} · 重复提交不会重复发放真瓜籽`);

    void refreshOwnFieldAfterCreate(islandAdapter).then(
      (field) => setModel((current) => current ? {
        ...current,
        field,
        session: { ...current.session, wallet: result.wallet },
      } : current),
      () => setNotice(result.trueSeedAwarded
        ? `瓜已埋好，已归入${resultCityName}，真瓜籽 +1 · 瓜田列表暂时没刷新，可点击重试`
        : `瓜已埋好，已归入${resultCityName} · 瓜田列表暂时没刷新，可点击重试`),
    );

    const nearbyBurial = input.burialKind === "nearby_area";
    void islandAdapter.discover(nearbyBurial ? { location } : { selectedCityId: result.cityId }).then(
      (discovery) => {
        setModel((current) => current ? { ...current, discovery } : current);
        setDiscoveryScope(nearbyBurial && discovery.visitorType === "local" ? "nearby" : "city");
      },
      () => undefined,
    );
  };

  const openOwnedMelon = async (preview: FieldMelonPreview) => {
    setOpeningMelon(true);
    try {
      setOpenedAsOwner(true);
      if (preview.status === "mature") setOpenedComments(prefetchComments(preview.id));
      setOpened(await islandAdapter.openMelon(preview.id));
    } catch (error) {
      setOpenedAsOwner(false);
      setNotice(messageFrom(error));
    } finally {
      setOpeningMelon(false);
    }
  };

  const applySquatLocally = (id: string, active: boolean) => {
    setQuickSquats((current) => active ? [...new Set([...current, id])] : current.filter((value) => value !== id));
    setModel((current) => {
      if (!current) return current;
      const existingItems = current.squatShelf.items;
      if (!active) {
        return {
          ...current,
          squatShelf: {
            unreadCount: existingItems.some((item) => item.melon.id === id && item.unread)
              ? Math.max(0, current.squatShelf.unreadCount - 1)
              : current.squatShelf.unreadCount,
            items: existingItems.filter((item) => item.melon.id !== id),
          },
        };
      }
      if (existingItems.some((item) => item.melon.id === id)) return current;
      const melon = current.discovery.items.find((item) => item.id === id);
      if (!melon) return current;
      return {
        ...current,
        squatShelf: {
          ...current.squatShelf,
          items: [{ melon, squattedAt: new Date().toISOString(), alertKind: null, unread: false }, ...existingItems],
        },
      };
    });
  };

  const quickSquat = async (id: string) => {
    if (writesBlocked) return setNotice("当前匿名身份已被封禁，只能阅读公开内容。申诉入口即将开放。");
    if (squatBusyIds.includes(id)) return;
    const active = !(model?.squatShelf.items.some((item) => item.melon.id === id) ?? quickSquats.includes(id));
    setSquatBusyIds((current) => [...new Set([...current, id])]);
    applySquatLocally(id, active);
    try {
      const result = await islandAdapter.setSquat(id, active);
      if (result.active !== active) applySquatLocally(id, result.active);
      setNotice(result.active ? "已放进蹲瓜架 · 成熟后会在听瓜入口亮起提醒" : "已经从蹲瓜架移除");
      void islandAdapter.squatShelf().then((squatShelf) => {
        setModel((current) => current ? { ...current, squatShelf } : current);
        setQuickSquats(squatShelf.items.map((item) => item.melon.id));
      }, () => undefined);
    } catch (error) {
      applySquatLocally(id, !active);
      setNotice(messageFrom(error));
    } finally {
      setSquatBusyIds((current) => current.filter((value) => value !== id));
    }
  };

  const refreshSquatShelf = async () => {
    try {
      const squatShelf = await islandAdapter.squatShelf();
      setModel((current) => current ? { ...current, squatShelf } : current);
      setQuickSquats(squatShelf.items.map((item) => item.melon.id));
    } catch (error) {
      setNotice(messageFrom(error));
    }
  };

  const syncReaderSquat = (id: string, active: boolean) => {
    applySquatLocally(id, active);
    void refreshSquatShelf();
  };

  const openSquattedMelon = async (item: SquatShelfItem) => {
    if (item.melon.status !== "mature") {
      setNotice(`还在土里长 · 约 ${formatCountdown(item.melon.maturesAt)} 后成熟`);
      return;
    }
    setOpeningMelon(true);
    try {
      const openedSuccessfully = await openMelon(item.melon);
      if (!openedSuccessfully) return;
      setShowSquatShelf(false);
      if (item.unread) {
        void islandAdapter.markSquatSeen(item.melon.id).then(() => {
          setModel((current) => current ? {
            ...current,
            squatShelf: {
              unreadCount: Math.max(0, current.squatShelf.unreadCount - 1),
              items: current.squatShelf.items.map((shelfItem) => shelfItem.melon.id === item.melon.id
                ? { ...shelfItem, unread: false, alertKind: null }
                : shelfItem),
            },
          } : current);
        }, () => undefined);
      }
    } catch (error) {
      setNotice(messageFrom(error));
    } finally {
      setOpeningMelon(false);
    }
  };

  const viewField = async (alias: string) => {
    try {
      const field = await islandAdapter.fieldByAlias(alias);
      setViewedField(field);
      setOpened(null);
      setOpenedComments(undefined);
      setTab("field");
    } catch (error) {
      setNotice(messageFrom(error));
    }
  };

  const showOwnField = async () => {
    setViewedField(null);
    setTab("field");
    try {
      const field = await islandAdapter.field();
      setModel((current) => current ? {
        ...current,
        field,
        session: "wallet" in field ? { ...current.session, wallet: field.wallet } : current.session,
      } : current);
    } catch (error) {
      setNotice(messageFrom(error));
    }
  };

  if (loadError) return <IslandUnavailable error={loadError} onRetry={() => { setLoadError(null); setRetryKey((value) => value + 1); }} onDemo={() => { setMode("demo"); setModel(null); setLoadError(null); setIslandAdapter(demoIslandAdapter); }} />;
  if (!model || !activeCity) return <IslandLoading />;

  return (
    <div className="sunny-shell" data-day-phase={dayPhase}>
      {mode === "demo" && <div className="demo-banner" role="note"><strong>本地试玩</strong><span>示例数据只留在当前页面，不会上传或保存。</span></div>}
      <header className="topbar">
        <button className="brand" onClick={() => setTab("radar")} aria-label="回到瓜域雷达">
          <Image className="brand-avatar" src="/brand/chacha-king-avatar.webp" width={96} height={96} loading="eager" alt="" />
          <span><strong>猹猹街</strong><small>CHACHA STREET</small></span>
        </button>
        <div className="topbar-actions">
          <button className="city-switch" onClick={() => setShowCities(true)} aria-label={`当前城市${activeCity.name}，切换城市`}>
            <LocationIcon /><span>{activeCity.name}</span><ChevronIcon />
          </button>
          <AmbientAudio />
          <span className="seed-count" aria-label={`拥有 ${model.session.wallet.trueSeedCount} 粒真瓜籽`}><SeedIcon />{model.session.wallet.trueSeedCount}</span>
        </div>
      </header>

      <main className="island-main">
        {writesBlocked && <div className="account-readonly" role="status"><strong>当前为只读状态</strong><span>匿名身份已被封禁，仍可读瓜和查看公开评论。申诉入口即将开放。</span></div>}
        {!opened && !showBury && !showCities && <div className="live-notice" role="status"><span aria-hidden="true" />{notice}</div>}
        {buryFeedback && !opened && !showBury && !showCities && <section className="bury-success-panel" aria-label="埋瓜结果">
          <div role="status" aria-live="polite">
            <strong>{buryFeedback.status === "held" ? "瓜已送去安全复核" : "这颗瓜已经埋好"}</strong>
            <p>{buryFeedback.status === "held"
              ? "复核通过前不会公开，也不会发放真瓜籽。"
              : buryFeedback.trueSeedAwarded
              ? `${buryFeedback.burialKind === "nearby_area" ? "已固定在发布位置" : "已投递到所选公区"}，并奖励 1 颗真瓜籽。`
              : `${buryFeedback.burialKind === "nearby_area" ? "已固定在发布位置" : "已投递到所选公区"}；重复提交不会重复发放真瓜籽。`}</p>
          </div>
          <div>
            <button type="button" onClick={async () => { setBuryFeedback(null); await showOwnField(); }}>
              <FieldIcon />{buryFeedback.trueSeedAwarded ? "去瓜田种下" : "查看我埋下的瓜"}
            </button>
            <button type="button" aria-label="关闭埋瓜结果" onClick={() => setBuryFeedback(null)}><CloseIcon /></button>
          </div>
        </section>}
        {tab === "radar" ? (
          <RadarView
            key={`${activeCity.id}-${discoveryScope}`}
            items={model.discovery.items}
            details={model.melonDetails}
            quickSquats={quickSquats}
            squatBusyIds={squatBusyIds}
            cityId={activeCity.id}
            cityName={activeCity.name}
            dayPhase={dayPhase}
            demoMode={mode === "demo"}
            sceneContext={model.discovery.sceneContext}
            visitorLocated={model.discovery.visitorType !== "location_unknown"}
            scope={discoveryScope}
            locatingNearby={locatingNearby}
            openingMelon={openingMelon}
            onLocate={locate}
            onCityBrowse={() => {
              setDiscoveryScope("city");
              setNotice(`正在浏览${activeCity.name}城市瓜区 · 附近范围已关闭`);
            }}
            onOpen={openMelon}
            onSquat={quickSquat}
            onDismiss={dismissBasketMelon}
            onRefresh={async () => {
              if (discoveryScope === "nearby") return locate();
              const discovery = await islandAdapter.discover({ selectedCityId: model.discovery.activeCityId });
              setModel({ ...model, discovery });
              setNotice("雷达已重听 · 同区、同城、远方依次排好");
            }}
            readOnly={writesBlocked}
          />
        ) : (
          <MyField
            field={viewedField ?? model.field}
            isOwn={!viewedField}
            onBury={() => setShowBury(true)}
            onOpen={openOwnedMelon}
            onDelete={deleteOwnedMelon}
            onPlant={async (plotIndex, operationId) => {
              const result = await islandAdapter.plant({ plotIndex, operationId });
              setModel((current) => current ? { ...current, field: result.field, session: { ...current.session, wallet: result.wallet } } : current);
              setNotice("真瓜籽已经种下 · 12 小时后自然成熟");
              return result.field;
            }}
            onRefresh={async () => {
              const field = await islandAdapter.field();
              if (!("wallet" in field)) throw new Error("暂时没有取到自己的瓜田数据。" );
              setModel((current) => current ? { ...current, field } : current);
              return field;
            }}
            onHarvest={() => islandAdapter.harvest()}
            onHarvested={(result) => {
              setModel((current) => current ? { ...current, field: result.field, session: { ...current.session, experience: result.experience } } : current);
              setNotice("九个瓜已经收好 · XP +9");
            }}
          />
        )}
      </main>

      <nav className="bottom-dock" aria-label="主要导航">
        <button className={tab === "radar" ? "active" : ""} onClick={() => { setTab("radar"); setShowSquatShelf(true); void refreshSquatShelf(); }} aria-current={tab === "radar" ? "page" : undefined} aria-label={`听瓜，蹲瓜架${model.squatShelf.unreadCount ? `有 ${model.squatShelf.unreadCount} 条未读` : "没有未读"}`}><span className="dock-icon"><RadarIcon />{model.squatShelf.unreadCount > 0 && <b className="squat-unread-badge" aria-hidden="true">{Math.min(model.squatShelf.unreadCount, 9)}</b>}</span><span>听瓜</span></button>
        {viewedField ? <button className="bury-button field-return" onClick={() => setViewedField(null)}><FieldIcon /><span>回我的田</span></button> : <button className="bury-button" onClick={() => setShowBury(true)} disabled={writesBlocked} aria-label={writesBlocked ? "当前只读，不能埋瓜" : "埋瓜"}>{writesBlocked ? <CloseIcon /> : <PlusIcon />}<span>{writesBlocked ? "只读" : "埋瓜"}</span></button>}
        <button className={tab === "field" ? "active" : ""} onClick={showOwnField} aria-current={tab === "field" ? "page" : undefined}><FieldIcon /><span>瓜田</span></button>
      </nav>

      {opened && (openedAsOwner
        ? <OwnerMelonReader adapter={islandAdapter} opened={opened} prefetchedComments={openedComments} onClose={closeOpenedMelon} />
        : <MelonReader adapter={islandAdapter} opened={opened} prefetchedComments={openedComments} onClose={closeOpenedMelon} onFinished={finishRead} onViewField={viewField} onSeek={seekZone} onSquatChanged={syncReaderSquat} readOnly={writesBlocked} initialPresence={zonePresence[opened.melon.id]} />)}
      {showCities && <CityPicker model={model} onClose={() => setShowCities(false)} onSelect={selectCity} />}
      {showSquatShelf && <SquatShelfSheet shelf={model.squatShelf} busy={openingMelon} onClose={() => setShowSquatShelf(false)} onOpen={openSquattedMelon} onCancel={quickSquat} />}
      {showBury && !writesBlocked && <BurySheetV1 key={activeCity.id} spots={activeCity.spots} cityName={activeCity.name} demoMode={mode === "demo"} onClose={() => setShowBury(false)} onCreate={createMelon} />}
    </div>
  );
}

function SwipeActionRow({ children, actionLabel, actionAriaLabel, onAction, destructive = false }: {
  children: ReactNode;
  actionLabel: string;
  actionAriaLabel: string;
  onAction: () => Promise<void>;
  destructive?: boolean;
}) {
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const suppressContentClickUntil = useRef(0);

  const start = (event: TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    if (!touch) return;
    touchStart.current = { x: touch.clientX, y: touch.clientY };
  };
  const end = (event: TouchEvent<HTMLDivElement>) => {
    const origin = touchStart.current;
    const touch = event.changedTouches[0];
    touchStart.current = null;
    if (!origin || !touch) return;
    const dx = touch.clientX - origin.x;
    const dy = touch.clientY - origin.y;
    if (Math.abs(dx) < 36 || Math.abs(dx) <= Math.abs(dy)) return;
    suppressContentClickUntil.current = Date.now() + 450;
    setRevealed(dx < 0);
    setFailed(false);
  };
  const perform = async () => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      await onAction();
      setRevealed(false);
    } catch {
      setFailed(true);
      setRevealed(true);
    } finally {
      setBusy(false);
    }
  };

  return <div className={`swipe-action-row ${revealed ? "is-revealed" : ""}`} onTouchStart={start} onTouchEnd={end}>
    <div
      className="swipe-action-content"
      onClickCapture={(event) => {
        if (Date.now() < suppressContentClickUntil.current) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        if (revealed) {
          event.preventDefault();
          event.stopPropagation();
          setRevealed(false);
        }
      }}
    >{children}</div>
    <button
      type="button"
      className={`swipe-row-action ${destructive ? "is-destructive" : ""}`}
      onClick={() => void perform()}
      onFocus={() => setRevealed(true)}
      disabled={busy}
      aria-label={actionAriaLabel}
    >{busy ? "处理中" : failed ? "重试" : actionLabel}</button>
  </div>;
}

function StoryFocus({ melon, authorName, fieldLookup, onViewField }: {
  melon: OpenedMelon["melon"];
  authorName: string;
  fieldLookup?: string;
  onViewField?: (lookup: string) => void;
}) {
  const animal: AnimalIdentity = melon.animal ?? "猹";
  return <section className="story-focus" aria-labelledby={`story-title-${melon.id}`}>
    <header className="story-focus-header">
      <span className="story-focus-label">标题</span>
      <h2 id={`story-title-${melon.id}`}>{melon.title}</h2>
      <div className="story-author">
        <AnimalAvatar animal={animal} size="medium" />
        <p><small>瓜主</small><strong>{authorName} <IdentityBadge badge={melon.identityBadge} /></strong></p>
      </div>
    </header>
    <div className="story-focus-body"><p>{melon.content}</p></div>
    <footer className="story-focus-footer">
      <span>{topicName[melon.topic]}瓜 · {getSpotScene(melon.spot).displayName}</span>
      <time dateTime={melon.createdAt}>{formatRelativeTime(melon.createdAt)}</time>
      {fieldLookup && onViewField && <a href={`/fields/${encodeURIComponent(fieldLookup)}`} onClick={(event) => { event.preventDefault(); onViewField(fieldLookup); }}>看 {authorName} 的瓜田</a>}
    </footer>
  </section>;
}

function RadarView({ items, details, quickSquats, squatBusyIds, cityId, cityName, dayPhase, demoMode, sceneContext, visitorLocated, scope, locatingNearby, openingMelon, onLocate, onCityBrowse, onOpen, onSquat, onDismiss, onRefresh, readOnly }: {
  items: MelonPreview[];
  details: IslandBootstrap["melonDetails"];
  quickSquats: string[];
  squatBusyIds: string[];
  cityId: CityId;
  cityName: string;
  dayPhase: "day" | "night";
  demoMode: boolean;
  sceneContext: DiscoverySceneContext;
  visitorLocated: boolean;
  scope: DiscoveryScope;
  locatingNearby: boolean;
  openingMelon: boolean;
  onLocate: () => void;
  onCityBrowse: () => void;
  onOpen: (melon: MelonPreview, presenceToken?: string) => void;
  onSquat: (id: string) => void;
  onDismiss: (melon: MelonPreview) => Promise<void>;
  onRefresh: () => void;
  readOnly: boolean;
}) {
  const [topic, setTopic] = useState<SafeTopic | "all">("all");
  const [basketOpen, setBasketOpen] = useState(true);
  const [selectedSpotId, setSelectedSpotId] = useState<string | null>(null);
  const cityItems = items.filter((melon) => melon.cityId === cityId && (melon.burialKind ?? "public_spot") === "public_spot");
  const nearbyItems = nearbyItemsForScene(items);
  const scopedItems = scope === "nearby" ? nearbyItems : cityItems;
  const spotGroups = Array.from(scopedItems.reduce((groups, melon) => {
    const group = groups.get(melon.spot.id) ?? [];
    group.push(melon);
    groups.set(melon.spot.id, group);
    return groups;
  }, new Map<string, MelonPreview[]>()).values()).sort((left, right) => right.length - left.length);
  const activeSpotId = spotGroups.some((group) => group[0]?.spot.id === selectedSpotId) ? selectedSpotId : spotGroups[0]?.[0]?.spot.id;
  const zoneItems = spotGroups.find((group) => group[0]?.spot.id === activeSpotId) ?? [];
  const filteredItems = newestFirst(topic === "all" ? zoneItems : zoneItems.filter((melon) => melon.topic === topic));
  const zoneSpot = zoneItems[0]?.spot;
  const zoneScene = zoneSpot ? getSpotScene(zoneSpot) : null;
  const matureCount = filteredItems.filter((melon) => melon.status === "mature").length;
  const incubatingCount = filteredItems.length - matureCount;
  const effectiveSceneKind = scope === "city" ? "city_overview" : sceneContext.kind;
  const showingNearbyArea = effectiveSceneKind === "nearby_area";
  const cityVisual = getCityVisual(cityId);
  const sceneImage = showingNearbyArea
    ? dayPhase === "day" ? "/scenes/nearby-neighborhood-day-v1.webp" : "/scenes/nearby-neighborhood-night-v1.webp"
    : cityVisual.sceneImages[dayPhase];
  const sceneLabel = showingNearbyArea
    ? "普通生活街区瓜域场景：附近 1 公里，但尚未进入公共地标范围"
    : effectiveSceneKind === "public_spot" && sceneContext.kind === "public_spot"
      ? `${cityName}${getSpotScene(sceneContext.spot).displayName}公共地标瓜域场景：已进入公共地点附近，远景为${cityVisual.landmarkLabel}`
      : `${cityName}城市瓜域总览场景：${cityVisual.landmarkLabel}`;

  const selectZone = (spotId: string) => {
    setSelectedSpotId(spotId);
    setTopic("all");
  };
  const openBasketFromRadar = () => {
    if (filteredItems.length === 0) return;
    setBasketOpen(true);
    window.requestAnimationFrame(() => document.getElementById("basket-title")?.scrollIntoView({ block: "start" }));
  };
  return (
    <>
      <section className="radar-intro" aria-labelledby="radar-title">
        <div className="discovery-scope" role="group" aria-label="吃瓜范围">
          <button className={scope === "nearby" ? "active" : ""} onClick={onLocate} aria-pressed={scope === "nearby"} disabled={locatingNearby}>
            <LocationIcon /><span><strong>{locatingNearby ? "正在定位" : demoMode ? "模拟附近 1km" : "附近 1km"}</strong><small>{visitorLocated ? `${nearbyItems.length} 颗瓜` : demoMode ? "不读取真实位置" : "需要本次定位"}</small></span>
          </button>
          <button className={scope === "city" ? "active" : ""} onClick={onCityBrowse} aria-pressed={scope === "city"}>
            <RadarIcon /><span><strong>城市瓜区</strong><small>{cityItems.length} 颗公开瓜</small></span>
          </button>
        </div>
        <p className="utility-label"><SunIcon /> {scope === "nearby" ? "附近 1 公里" : "城市瓜区"} · {cityName}</p>
        <div className="radar-intro-layout">
          <div className="radar-intro-copy">
            <h1 id="radar-title">{scope === "nearby" ? <>1公里内，<em>正在冒瓜。</em></> : <>这座城的动静，<em>正在浮现。</em></>}</h1>
            <button className={scope === "nearby" ? "location-calibrated" : "location-callout"} onClick={onLocate} aria-label={scope === "nearby" ? demoMode ? "刷新模拟附近1公里" : "刷新附近1公里" : demoMode ? "模拟附近1公里" : "开启附近1公里"} disabled={locatingNearby}>
              {scope === "nearby" ? <CheckIcon /> : <LocationIcon />}
              <span><strong>{locatingNearby ? demoMode ? "正在载入示例范围" : "正在获取本次位置" : scope === "nearby" ? demoMode ? "正在模拟 1 公里" : "只看附近 1 公里" : demoMode ? "模拟附近 1 公里" : "开启附近 1 公里"}</strong><small>{demoMode ? "本地试玩不读取真实位置" : scope === "nearby" ? "不会扩大范围 · 精确位置不保存" : "拒绝后仍可继续浏览城市瓜区"}</small></span>
            </button>
          </div>
        </div>
      </section>

      <section className="zone-console" aria-label="瓜区控制台">
        <div className="zone-heading">
          <div><span className="zone-kicker">{scope === "nearby" ? "附近 1km 瓜棚" : "公共地点瓜棚"}</span><h2>{zoneScene?.displayName ?? (scope === "nearby" ? "附近暂时安静" : `${cityName}瓜区`)}</h2></div>
          <strong>{filteredItems.length} 颗瓜</strong>
        </div>
        {scope === "nearby" && scopedItems.length === 0 ? <div className="nearby-empty" role="status">
          <RadarIcon /><strong>1 公里内暂时没有瓜</strong><span>这里不会偷偷扩大距离。可以回城市瓜区看看，或者去公共地点附近埋下第一颗。</span><button onClick={onCityBrowse}>看看城市瓜区</button>
        </div> : <>
        {spotGroups.length > 1 && <div className="zone-switcher" role="group" aria-label="切换公共地点瓜区">{spotGroups.map((group) => {
          const spot = group[0].spot;
          return <button key={spot.id} className={spot.id === activeSpotId ? "active" : ""} onClick={() => selectZone(spot.id)} aria-pressed={spot.id === activeSpotId}>{getSpotScene(spot).displayName}<small>{group.length}</small></button>;
        })}</div>}
        <div className="topic-filter" role="group" aria-label="按单一话题筛选">
          <button className={topic === "all" ? "active" : ""} onClick={() => setTopic("all")} aria-pressed={topic === "all"}>全部</button>
          {(Object.keys(topicName) as SafeTopic[]).map((key) => <button key={key} className={topic === key ? "active" : ""} onClick={() => setTopic(key)} aria-pressed={topic === key}>{topicName[key]}</button>)}
        </div>
        </>}
      </section>

      <section className={`radar-stage city-${cityId}${showingNearbyArea ? " is-nearby-area" : ""}`} data-testid="radar-surface" data-scene-context={effectiveSceneKind} aria-label={`${sceneLabel}。只展示瓜量总览，没有坐标，不用于导航`} aria-busy={openingMelon}>
        <Image
          className="urban-scene-image"
          src={sceneImage}
          alt=""
          fill
          sizes="(max-width: 759px) 100vw, 530px"
          priority
        />
        <div className="urban-scene-shade" aria-hidden="true" />
        <div className="scene-context-badge"><span>{showingNearbyArea ? "普通附近" : effectiveSceneKind === "public_spot" ? "地标附近" : "城市瓜区"}</span><strong>{showingNearbyArea ? "1km 生活圈" : effectiveSceneKind === "public_spot" && sceneContext.kind === "public_spot" ? getSpotScene(sceneContext.spot).displayName : cityName}</strong></div>
        <div className="radar-grid" aria-hidden="true"><i /><i /><i /><span className="radar-sweep" /></div>
        <CityIsland cityId={cityId} cityName={cityName} radar />
        <div className="radar-origin" aria-hidden="true"><span>猹</span><i /></div>
        <div className="ring-label ring-one">瓜区</div><div className="ring-label ring-two">附近</div><div className="ring-label ring-three">同城</div>
      </section>

      <button
        type="button"
        className={`radar-summary-signal ${filteredItems.length ? "has-melons" : "is-empty"}`}
        onClick={openBasketFromRadar}
        disabled={filteredItems.length === 0}
        aria-label={filteredItems.length ? `瓜区总览：${filteredItems.length}颗瓜，点开挑选` : "瓜区总览：暂时没有瓜"}
      >
        <span className="radar-summary-count"><strong>{filteredItems.length}</strong><small>颗瓜</small></span>
        <span className="radar-summary-copy"><small>{scope === "nearby" ? "附近生活圈" : zoneScene?.displayName ?? `${cityName}瓜区`}</small><strong>{filteredItems.length ? "打开瓜篮，挑一颗吃" : "这片瓜区暂时安静"}</strong><em>{matureCount} 颗成熟 · {incubatingCount} 颗孵化中</em></span>
        {filteredItems.length > 0 && <ChevronIcon />}
      </button>

      <section className="radar-legend" aria-label="雷达说明">
        <span><i className="legend-mature" />成熟 {matureCount}</span><span><i className="legend-sleep" />孵化中 {incubatingCount}</span>
        <button onClick={onRefresh}>重新听一圈 <RadarIcon /></button>
      </section>
      <section className={`melon-basket ${basketOpen ? "is-open" : ""}`} aria-labelledby="basket-title">
        <button className="basket-handle" onClick={() => setBasketOpen((open) => !open)} aria-expanded={basketOpen} aria-controls="basket-content">
          <span aria-hidden="true"><i /><i /><i /></span>
          <span><strong id="basket-title">瓜篮</strong><small>{basketOpen ? "收起稳定列表" : `展开 ${filteredItems.length} 颗瓜`}</small></span>
          <ChevronIcon />
        </button>
        <div id="basket-content" className="basket-content" hidden={!basketOpen}>
          {filteredItems.length ? filteredItems.map((melon) => {
            const detail = details[melon.id];
            const squatted = quickSquats.includes(melon.id);
            const squatBusy = squatBusyIds.includes(melon.id);
            const scene = getSpotScene(melon.spot);
            const displayTitle = detail?.title ?? melon.title ?? (melon.status === "mature" ? `一颗成熟的${topicName[melon.topic]}瓜` : `${topicName[melon.topic]}孵化瓜`);
            const authorName = detail?.displayName ?? detail?.alias ?? melon.displayName ?? "匿名小动物";
            const authorAnimal: AnimalIdentity = detail?.animal ?? melon.animal ?? "猹";
            return <SwipeActionRow key={melon.id} actionLabel="不看了" actionAriaLabel={`从瓜篮移出${displayTitle}`} onAction={() => onDismiss(melon)}>
            <article className={`basket-row ${melon.status}`} aria-label={displayTitle}>
              <span className="basket-author-avatar"><AnimalAvatar animal={authorAnimal} size="small" /></span>
              <div className="basket-copy">
                <div className="basket-author-line"><strong className="basket-author-name">{authorName}</strong><span>{topicName[melon.topic]}瓜 · {scene.displayName}</span></div>
                <h3>{storyTitle(displayTitle)}</h3>
                {melon.status === "mature"
                  ? <p><MelonTimestamp value={melon.createdAt} /> · {distanceName[melon.distanceBand]} · {melon.commentCount ?? 0} 条评论</p>
                  : <p className="basket-incubation"><MelonTimestamp value={melon.createdAt} /> · 正在孵化，{formatCountdown(melon.maturesAt)} 后成熟</p>}
              </div>
              <div className="basket-actions">
                {melon.status === "mature" ? <>
                  <button className="basket-primary" onClick={() => onOpen(melon)}>{melon.isRemote ? "远方围观" : "直接吃"}</button>
                  {!readOnly && <button onClick={() => onSquat(melon.id)} disabled={squatBusy} aria-busy={squatBusy} aria-pressed={squatted} aria-label={`${squatted ? "取消" : "添加"}蹲瓜`}>{squatted ? "已蹲瓜" : "蹲瓜"}</button>}
                </> : <button className="basket-primary" onClick={() => onSquat(melon.id)} disabled={readOnly || squatBusy} aria-busy={squatBusy} aria-pressed={squatted} aria-label={readOnly ? "只读" : `${squatted ? "取消" : "添加"}蹲瓜`}>{readOnly ? "只读" : squatted ? "已蹲瓜" : "蹲瓜"}</button>}
              </div>
            </article>
            </SwipeActionRow>;
          }) : <div className="basket-empty"><SproutIcon /><strong>这个话题暂时没有瓜</strong><span>换一个话题，或稍后再听一听。</span></div>}
        </div>
      </section>
      <DevPreviewCards />
    </>
  );
}

function nearbyItemsForScene(
  items: readonly MelonPreview[],
): MelonPreview[] {
  return items.filter((melon) => melon.distanceBand === "within_1km");
}

function DevPreviewCards() {
  return (
    <section className="dev-preview-grid" aria-label="待开发的社区栏目">
      <article className="dev-preview-card">
        <span className="utility-label">READ ONLY / NEXT</span>
        <h2>今日瓜王</h2>
        <p>待开发。上线后只展示前三，按有效吃完、点赞及安全权重综合，不做纯热度冲榜。</p>
      </article>
      <article className="dev-preview-card">
        <span className="utility-label">PUBLIC ONLY / NEXT</span>
        <h2>名人猹·公开事件</h2>
        <p>待开发。只讨论公开可核验信息；当前不接接口、不伪造榜单、不显示虚假数据。</p>
      </article>
    </section>
  );
}

function MyField({ field, isOwn, onBury, onOpen, onDelete, onPlant, onRefresh, onHarvest, onHarvested }: {
  field: FieldView;
  isOwn: boolean;
  onBury: () => void;
  onOpen: (preview: FieldMelonPreview) => Promise<void>;
  onDelete: (preview: FieldMelonPreview) => Promise<void>;
  onPlant: (plotIndex: FieldPlotIndex, operationId: string) => Promise<OwnFieldView>;
  onRefresh: () => Promise<OwnFieldView>;
  onHarvest: () => Promise<HarvestFieldResult>;
  onHarvested: (result: HarvestFieldResult) => void;
}) {
  const fieldOwnerName = field.displayName ?? field.alias;
  const [selectedPlot, setSelectedPlot] = useState<FieldPlotIndex | null>(null);
  const [plantOperationId, setPlantOperationId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newPlantId, setNewPlantId] = useState<string | null>(null);
  const [harvesting, setHarvesting] = useState(false);
  const [clock, setClock] = useState(() => Date.now());
  const ownField = isOwn && "wallet" in field ? field : null;
  const visualMatureCount = field.plots.flatMap((plot) => plot.plants).filter((plant) => plant.stage === "mature").length;
  const visuallyHarvestable = Boolean(ownField?.canHarvest);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!ownField?.nextMaturesAt) return;
    const delay = Math.max(1_000, new Date(ownField.nextMaturesAt).getTime() - Date.now() + 1_000);
    const timer = window.setTimeout(() => {
      onRefresh().catch((caught) => setError(messageFrom(caught)));
    }, delay);
    return () => window.clearTimeout(timer);
  }, [onRefresh, ownField?.nextMaturesAt]);

  const plantSelected = async () => {
    if (selectedPlot === null || !ownField) return;
    const operationId = plantOperationId ?? createOperationId();
    if (!plantOperationId) setPlantOperationId(operationId);
    setBusy(true); setError(null);
    try {
      const updated = await onPlant(selectedPlot, operationId);
      const newest = updated.plots.flatMap((plot) => plot.plants).sort((a, b) => b.plantedAt.localeCompare(a.plantedAt))[0];
      setNewPlantId(newest?.id ?? null);
      setSelectedPlot(null);
      setPlantOperationId(null);
      window.setTimeout(() => setNewPlantId(null), 1100);
      if ("vibrate" in navigator) navigator.vibrate?.(16);
    } catch (caught) { setError(messageFrom(caught)); }
    finally { setBusy(false); }
  };

  const harvestAll = async () => {
    if (!ownField || !visuallyHarvestable) return;
    setBusy(true); setError(null);
    try {
      const result = await onHarvest();
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!reduceMotion) {
        setHarvesting(true);
        await new Promise((resolve) => window.setTimeout(resolve, 620));
      }
      onHarvested(result);
      if ("vibrate" in navigator) navigator.vibrate?.([18, 35, 18]);
    } catch (caught) { setError(messageFrom(caught)); }
    finally { setBusy(false); setHarvesting(false); }
  };

  return (
    <section className="field-view" aria-labelledby="field-title" aria-label={isOwn ? "我的瓜田" : `${fieldOwnerName}的瓜田`}>
      <p className="utility-label"><SproutIcon /> {isOwn ? "MY THREE PATCHES" : "VISITING PATCH"}</p>
      <h1 id="field-title">{isOwn ? <>我的瓜田，<em>九个坑，慢慢长。</em></> : <>{fieldOwnerName} <IdentityBadge badge={field.identityBadge} /> <em>的瓜田</em></>}</h1>

      {ownField && <div className="field-ledger" aria-label="瓜田资产">
        <div><span>田里</span><strong>{field.plantedCount}<small>/9</small></strong></div>
        <div><span>小瓜籽</span><strong>{ownField.wallet.smallSeedCount}<small>/5</small></strong></div>
        <div><span>真瓜籽</span><strong>{ownField.wallet.trueSeedCount}</strong></div>
        <div><span>XP</span><strong>{ownField.experience.total}</strong></div>
      </div>}

      <div className={`field-illustration field-v1 ${harvesting ? "is-harvesting" : ""}`} data-testid="field-stage" aria-label={`三片瓜田，已经种下 ${field.plantedCount} 个瓜`}>
        <div className="field-sun" /><div className="field-soil" />
        {field.plots.map((plot) => {
          const full = plot.plants.length >= plot.capacity;
          const canSelect = Boolean(ownField && ownField.wallet.trueSeedCount > 0 && !full && !busy);
          const className = `field-plot-hotspot plot-${plot.plotIndex + 1} ${selectedPlot === plot.plotIndex ? "selected" : ""} ${canSelect ? "plantable" : ""}`;
          if (!isOwn) return <div className={`${className} is-public`} key={plot.plotIndex} aria-label={`第${plot.plotIndex + 1}片土地、${plot.plants.length}/3`}><span>第{plot.plotIndex + 1}片</span><strong>{plot.plants.length}/3</strong></div>;
          return <button
            type="button"
            className={className}
            key={plot.plotIndex}
            aria-label={`第${plot.plotIndex + 1}片土地、${plot.plants.length}/3`}
            aria-pressed={selectedPlot === plot.plotIndex}
            disabled={!isOwn || full || busy || (ownField?.wallet.trueSeedCount ?? 0) < 1}
            onClick={() => {
              if (selectedPlot !== plot.plotIndex) setPlantOperationId(createOperationId());
              setSelectedPlot(plot.plotIndex);
            }}
          >
            <span>第{plot.plotIndex + 1}片</span><strong>{plot.plants.length}/3</strong>
          </button>;
        })}
        {field.plots.flatMap((plot) => plot.plants).map((plant) => {
          const ownPlant = isFieldPlant(plant) ? plant : null;
          const maturesAt = ownPlant?.maturesAt;
          const mature = plant.stage === "mature";
          const remaining = maturesAt ? Math.max(0, new Date(maturesAt).getTime() - clock) : null;
          const stage = mature ? "mature" : plant.stage;
          return <span
            key={`${plant.plotIndex}-${plant.slotIndex}`}
            className={`field-crop plot-${plant.plotIndex + 1} slot-${plant.slotIndex + 1} ${stage} ${ownPlant?.id === newPlantId ? "just-planted" : ""}`}
            role="img"
            aria-label={mature ? `第${plant.plotIndex + 1}片土地的成熟瓜` : remaining === null ? `第${plant.plotIndex + 1}片土地的成长中瓜苗` : `第${plant.plotIndex + 1}片土地的瓜苗，还需 ${formatDuration(remaining)}`}
          ><i /><b>{mature ? "熟了" : remaining === null ? "成长中" : formatDuration(remaining)}</b></span>;
        })}
        <div className="field-scene-status"><span>{field.plantedCount === 0 ? "藤蔓在等第一颗籽" : `${visualMatureCount} 个瓜已成熟`}</span><strong>{field.plantedCount}/9 · 三片土地</strong></div>
      </div>

      {ownField && <div className="field-cycle-card">
        <div><span>吃 5 颗瓜</span><i aria-hidden="true">→</i><span>1 颗真瓜籽</span><i aria-hidden="true">→</i><span>种 12 小时</span></div>
        <p>{ownField.nextMaturesAt ? `下一颗约 ${formatDuration(Math.max(0, new Date(ownField.nextMaturesAt).getTime() - clock))} 后成熟。` : "吃瓜攒籽，或者分享今天第一颗原创瓜，然后选一片土地种下。"}</p>
        {visuallyHarvestable
          ? <button className="harvest-all" onClick={harvestAll} disabled={busy}>{busy ? "正在收瓜…" : "一键收瓜 · +9 XP"}</button>
          : <small>{field.plantedCount === 9 ? `还差 ${9 - visualMatureCount} 个瓜成熟` : `再种 ${9 - field.plantedCount} 个，集齐后一起收`}</small>}
        <div className="xp-source"><span>阅读所得 {ownField.experience.fromReads} XP</span><span>收获所得 {ownField.experience.fromHarvests} XP</span></div>
      </div>}

      {!isOwn && <p className="visiting-field-note">串门只能看这片地长到哪儿；瓜籽、XP 和种植操作只有瓜田主人能看到。</p>}

      {selectedPlot !== null && ownField && <aside className="field-plant-confirm" role="dialog" aria-label="确认播种">
        <div><span>第 {selectedPlot + 1} 片土地</span><strong>消耗 1 颗真瓜籽</strong></div>
        <button onClick={() => { setSelectedPlot(null); setPlantOperationId(null); }}>取消</button>
        <button className="confirm" onClick={plantSelected} disabled={busy}>{busy ? "正在破土…" : "种在这里"}</button>
      </aside>}
      {error && <p className="form-error field-error" role="alert">{error}</p>}

      <section className="my-melons" aria-labelledby="my-melons-title">
        <header><div><h2 id="my-melons-title">{isOwn ? "我埋下的瓜" : `${fieldOwnerName} 埋下的瓜`}</h2></div>{isOwn && <button onClick={onBury}><PlusIcon />再埋一个故事</button>}</header>
        {field.melons.length ? <div className="field-plots">{newestFirst(field.melons).map((melon) => {
          const title = melon.title ?? `一颗${topicName[melon.topic]}瓜`;
          const animal = normalizeAnimalIdentity(melon.animal ?? field.animal);
          return isOwn
          ? <SwipeActionRow key={melon.id} actionLabel="删除" actionAriaLabel={`删除${topicName[melon.topic]}瓜`} destructive onAction={async () => {
              if (!window.confirm("删除后，其他人将不能再看到这颗瓜；已获得的瓜籽不会收回。确定删除吗？")) return;
              await onDelete(melon);
            }}><button type="button" className="field-melon-card" onClick={() => void onOpen(melon)} aria-label={`查看${title}的正文和评论`}><span className="field-melon-avatar"><AnimalAvatar animal={animal} size="small" /></span><div><strong>{storyTitle(title)}</strong><MelonTimestamp value={melon.createdAt} /></div><ChevronIcon /></button></SwipeActionRow>
          : <article key={melon.id}><span className="field-melon-avatar"><AnimalAvatar animal={animal} size="small" /></span><div><strong>{storyTitle(title)}</strong><MelonTimestamp value={melon.createdAt} /></div></article>;
        })}</div> : isOwn ? <button className="empty-plot" onClick={onBury}><SproutIcon /><strong>这里还没有埋过故事</strong><span>可以埋在附近生活圈或公共地点</span></button> : <div className="empty-plot is-static"><SproutIcon /><strong>这里还没有公开的瓜</strong><span>过阵子再来串门</span></div>}
      </section>
    </section>
  );
}

function SquatShelfSheet({ shelf, busy, onClose, onOpen, onCancel }: {
  shelf: SquatShelf;
  busy: boolean;
  onClose: () => void;
  onOpen: (item: SquatShelfItem) => void;
  onCancel: (id: string) => void;
}) {
  const mature = newestFirst(shelf.items.filter((item) => item.melon.status === "mature"), (item) => item.melon.createdAt ?? item.squattedAt);
  const growing = newestFirst(shelf.items.filter((item) => item.melon.status === "incubating"), (item) => item.melon.createdAt ?? item.squattedAt);
  return <Sheet title="我的蹲瓜架" subtitle="成熟提醒只在猹猹街站内出现，不会发系统推送" onClose={onClose} wide>
    <section className="squat-shelf" aria-label="蹲瓜提醒">
      <header><span><strong>{shelf.unreadCount}</strong><small>刚成熟</small></span><p>回来逛街时自动检查成熟状态。<br />作者追加后续会在后续版本接入同一架子。</p></header>
      {shelf.items.length === 0 ? <div className="squat-shelf-empty"><SproutIcon /><strong>架子还是空的</strong><span>遇到还在孵化的瓜，点“蹲瓜”就会收进这里。</span></div> : <>
        {mature.length > 0 && <div className="squat-shelf-group"><h3>已经成熟 <span>{mature.length}</span></h3>{mature.map((item) => <article className={item.unread ? "is-unread" : ""} key={item.melon.id}>
          <button className="squat-shelf-main" onClick={() => onOpen(item)} disabled={busy}>
            <span className="squat-shelf-avatar"><AnimalAvatar animal={item.melon.animal ?? "猹"} size="small" /></span>
            <span><small>{item.melon.displayName ?? "匿名小动物"}{item.unread ? " · 刚成熟" : ""}</small><strong>{storyTitle(item.melon.title ?? "这颗瓜已经可以吃了")}</strong><em><MelonTimestamp value={item.melon.createdAt ?? item.squattedAt} />{typeof item.melon.commentCount === "number" ? ` · ${item.melon.commentCount} 条评论` : ""}</em></span>
            <ChevronIcon />
          </button>
          <button className="squat-shelf-remove" onClick={() => onCancel(item.melon.id)} aria-label={`取消蹲守${item.melon.title ?? "这颗瓜"}`}>移除</button>
        </article>)}</div>}
        {growing.length > 0 && <div className="squat-shelf-group is-growing"><h3>还在土里长 <span>{growing.length}</span></h3>{growing.map((item) => <article key={item.melon.id}>
          <button className="squat-shelf-main" onClick={() => onOpen(item)}>
            <span className="squat-shelf-avatar"><AnimalAvatar animal={item.melon.animal ?? "猹"} size="small" /></span>
            <span><small>{item.melon.displayName ?? "匿名小动物"}</small><strong>{storyTitle(item.melon.title ?? `一颗${topicName[item.melon.topic]}瓜`)}</strong><em><MelonTimestamp value={item.melon.createdAt ?? item.squattedAt} /> · 约 {formatCountdown(item.melon.maturesAt)} 后成熟</em></span>
          </button>
          <button className="squat-shelf-remove" onClick={() => onCancel(item.melon.id)} aria-label="取消蹲守这颗孵化中的瓜">移除</button>
        </article>)}</div>}
      </>}
    </section>
  </Sheet>;
}

function OwnerMelonReader({ adapter, opened, prefetchedComments, onClose }: { adapter: IslandAdapter; opened: OpenedMelon; prefetchedComments?: Promise<MelonCommentsPage>; onClose: () => void }) {
  const [comments, setComments] = useState<MelonComment[]>([]);
  const [loading, setLoading] = useState(opened.melon.status === "mature");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (opened.melon.status !== "mature") return;
    let active = true;
    (prefetchedComments ?? adapter.comments(opened.melon.id)).then(
      (page) => { if (active) setComments(page.items); },
      (caught) => { if (active) setError(messageFrom(caught)); },
    ).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [adapter, opened.melon.id, opened.melon.status, prefetchedComments]);

  const statusCopy = opened.melon.status === "held"
    ? "安全复核中 · 只有你能看到原文，暂不公开或发放真瓜籽"
    : opened.melon.status === "incubating"
    ? `正在孵化 · 约 ${formatCountdown(opened.melon.maturesAt)} 后公开`
    : "已经成熟 · 下方是吃瓜猹留下的公开回声";

  const authorName = opened.melon.displayName ?? opened.melon.alias;

  return <Sheet title="我的瓜详情" subtitle="正文与公开评论" onClose={onClose} wide>
    <article className="owner-melon-reader">
      <div className={`owner-melon-status is-${opened.melon.status}`} role="status"><strong>{statusCopy}</strong></div>
      <StoryFocus melon={opened.melon} authorName={authorName} />
      <div className="owner-melon-stats" aria-label="这颗瓜的数据"><span>吃完 <strong>{opened.melon.completedReads ?? 0}</strong> 只猹</span>{reactionMeta.map(([key, label]) => <span key={key}>{label} <strong>{opened.melon.reactions[key]}</strong></span>)}</div>
      <section className="comments owner-comments" aria-labelledby="owner-comments-title">
        <header><div><span>公开回声</span><h3 id="owner-comments-title">吃瓜猹的评论</h3></div><strong>{comments.length}</strong></header>
        {opened.melon.status !== "mature" ? <p className="comment-empty">这颗瓜公开成熟后，吃瓜猹的评论会显示在这里。</p> : loading ? <div className="comment-loading" aria-label="正在加载评论"><i/><i/><i/></div> : comments.length ? <div className="comment-list">{comments.map((item) => <article key={item.id}><strong>{item.displayName ?? item.alias} <IdentityBadge badge={item.identityBadge} /></strong><div className="comment-tools"><time dateTime={item.createdAt}>{formatRelativeTime(item.createdAt)}</time><ReportControl adapter={adapter} targetType="comment" targetId={item.id} label="举报评论" /></div><p>{item.content}</p></article>)}</div> : <p className="comment-empty">还没有公开评论。有人吃瓜并留言后会出现在这里。</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
      </section>
    </article>
  </Sheet>;
}

function MelonReader({ adapter, opened, prefetchedComments, onClose, onFinished, onViewField, onSeek, onSquatChanged, readOnly, initialPresence }: { adapter: IslandAdapter; opened: OpenedMelon; prefetchedComments?: Promise<MelonCommentsPage>; onClose: () => void; onFinished: (melonId: string, result: CompleteReadResult) => void; onViewField: (alias: string) => void; onSeek: (melonId: string) => Promise<ZonePresenceResult>; onSquatChanged: (melonId: string, active: boolean) => void; readOnly: boolean; initialPresence?: ZonePresenceResult }) {
  const authorName = opened.melon.displayName ?? opened.melon.alias;
  const fieldLookup = opened.melon.publicId ?? opened.melon.alias;
  const [elapsed, setElapsed] = useState(0);
  const [finished, setFinished] = useState(false);
  const [completionResult, setCompletionResult] = useState<CompleteReadResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [squatted, setSquatted] = useState(opened.melon.squatted);
  const [squatCount, setSquatCount] = useState(opened.melon.squatCount ?? 0);
  const [reactions, setReactions] = useState(opened.melon.reactions);
  const [liked, setLiked] = useState(Boolean(opened.melon.liked));
  const [interactionBusy, setInteractionBusy] = useState<"like" | "squat" | null>(null);
  const [interactionError, setInteractionError] = useState<string | null>(null);

  useEffect(() => {
    const start = window.performance.now();
    const timer = window.setInterval(() => setElapsed(Math.min(5000, window.performance.now() - start)), 100);
    return () => window.clearInterval(timer);
  }, []);

  const ready = elapsed >= 5000;
  const complete = async () => {
    setBusy(true); setError(null);
    try {
      const result = await adapter.completeRead(opened.melon.id, { readToken: opened.readToken });
      setFinished(true);
      setCompletionResult(result);
      onFinished(opened.melon.id, result);
    } catch (caught) { setError(messageFrom(caught)); }
    finally { setBusy(false); }
  };

  const toggleSquat = async () => {
    if (interactionBusy) return;
    const priorActive = squatted;
    const priorCount = squatCount;
    const nextActive = !priorActive;
    setInteractionBusy("squat");
    setInteractionError(null);
    setSquatted(nextActive);
    setSquatCount(Math.max(0, priorCount + (nextActive ? 1 : -1)));
    try {
      const result = await adapter.setSquat(opened.melon.id, nextActive);
      setSquatted(result.active);
      setSquatCount(result.squatCount);
      onSquatChanged(opened.melon.id, result.active);
    } catch (caught) {
      setSquatted(priorActive);
      setSquatCount(priorCount);
      setInteractionError(messageFrom(caught));
    } finally {
      setInteractionBusy(null);
    }
  };

  const react = async (reaction: ReactionType) => {
    if (interactionBusy) return;
    const priorActive = liked;
    const priorReactions = reactions;
    const nextActive = !priorActive;
    setInteractionBusy("like");
    setInteractionError(null);
    setLiked(nextActive);
    setReactions({ ...priorReactions, like: Math.max(0, (priorReactions.like ?? 0) + (nextActive ? 1 : -1)) });
    try {
      const result = await adapter.react(opened.melon.id, reaction, nextActive);
      setLiked(result.active);
      setReactions(result.reactions);
    } catch (caught) {
      setLiked(priorActive);
      setReactions(priorReactions);
      setInteractionError(messageFrom(caught));
    } finally {
      setInteractionBusy(null);
    }
  };

  return (
    <Sheet title="吃瓜详情" subtitle={`${getSpotScene(opened.melon.spot).displayName} · 正文与评论`} onClose={onClose} wide>
      <article className="melon-reader">
        <StoryFocus melon={opened.melon} authorName={authorName} fieldLookup={fieldLookup} onViewField={onViewField} />
        <div className="reader-meta"><span>{topicName[opened.melon.topic]}瓜</span><span>{distanceName[opened.melon.distanceBand]}</span><span><MessageIcon /> 评论在正文下方</span></div>
        <ReportControl adapter={adapter} targetType="melon" targetId={opened.melon.id} label="举报这颗瓜" />
        <div className="read-finish">
          {completionResult?.autoConverted && <span className="seed-convert-burst" aria-hidden="true"><i/><i/><i/><i/><i/><b>真</b></span>}
          <div className="read-clock" role="status" aria-live="polite" aria-label={completionResult ? readRewardLabel(completionResult) : ready ? "已经阅读 5 秒，可以完成吃瓜" : `还需阅读 ${Math.ceil((5000 - elapsed) / 1000)} 秒`}><span style={{ "--progress": `${elapsed / 50}%` } as CSSProperties}>{ready ? <CheckIcon /> : Math.ceil((5000 - elapsed) / 1000)}</span><p><strong>{completionResult ? readRewardLabel(completionResult) : ready ? "可以完成吃瓜" : "别急着划走"}</strong><small>{completionResult ? `小瓜籽 ${completionResult.wallet.smallSeedCount}/5 · 真瓜籽 ${completionResult.wallet.trueSeedCount}` : ready ? "完成后今日有效次数会由服务端判定" : "读满 5 秒，才算认真吃完"}</small></p></div>
          <button className={finished ? `finish-button finished ${completionResult?.smallSeedAwarded ? "seed-launch" : ""}` : "finish-button"} aria-label="完成吃瓜" onClick={complete} disabled={!ready || busy || finished}>{finished ? <><CheckIcon /> {completionResult ? readRewardLabel(completionResult) : "已吃完"}</> : busy ? "正在留籽…" : "完成吃瓜"}</button>
          {error && <p className="form-error" role="alert">{error}</p>}
        </div>
        {!readOnly && <div className="reader-interactions"><div className="reaction-row" aria-label="点赞与蹲后续">{reactionMeta.map(([key, label, glyph]) => <button key={key} onClick={() => react(key)} disabled={Boolean(interactionBusy)} aria-busy={interactionBusy === "like"} aria-pressed={liked} aria-label={`${liked ? "取消点赞" : label}，当前 ${reactions[key] ?? 0} 次`}><span aria-hidden="true">{glyph}</span>{liked ? "已点赞" : label}<small>{reactions[key] ?? 0}</small></button>)}<button onClick={toggleSquat} disabled={Boolean(interactionBusy)} aria-busy={interactionBusy === "squat"} aria-pressed={squatted} aria-label={`${squatted ? "取消蹲后续" : "蹲后续"}，当前 ${squatCount} 人`}><span aria-hidden="true">⌛</span>{squatted ? "已蹲后续" : "蹲后续"}<small>{squatCount}</small></button></div>{interactionError && <p className="form-error interaction-error" role="alert">{interactionError}</p>}</div>}
        {readOnly && <p className="readonly-note">当前匿名身份只能阅读，不能轻反应、蹲瓜或评论。申诉入口即将开放。</p>}
        <InlineComments adapter={adapter} melon={opened.melon} prefetchedComments={prefetchedComments} onSeek={onSeek} readOnly={readOnly} initialPresence={initialPresence} />
      </article>
    </Sheet>
  );
}

function InlineComments({ adapter, melon, prefetchedComments, onSeek, readOnly, initialPresence }: { adapter: IslandAdapter; melon: OpenedMelon["melon"]; prefetchedComments?: Promise<MelonCommentsPage>; onSeek: (melonId: string) => Promise<ZonePresenceResult>; readOnly: boolean; initialPresence?: ZonePresenceResult }) {
  const [comments, setComments] = useState<MelonComment[]>([]);
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [draftReady, setDraftReady] = useState(false);
  const [presence, setPresence] = useState<ZonePresenceResult | null>(initialPresence ?? null);
  const [seeking, setSeeking] = useState(false);
  const draftKey = `chacha-comment-draft:${melon.id}`;

  useEffect(() => {
    let active = true;
    (prefetchedComments ?? adapter.comments(melon.id, initialPresence?.presenceToken)).then(
      (value) => { if (active) setComments(value.items); },
      (caught) => { if (active) setError(messageFrom(caught)); },
    ).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [adapter, initialPresence?.presenceToken, melon.id, prefetchedComments]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try { setContent(window.sessionStorage.getItem(draftKey) ?? ""); }
      catch { /* Private browsing may block storage. In-memory draft still works. */ }
      setDraftReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [draftKey]);

  useEffect(() => {
    if (!draftReady) return;
    try {
      if (content) window.sessionStorage.setItem(draftKey, content);
      else window.sessionStorage.removeItem(draftKey);
    } catch { /* Keep the in-memory draft when storage is unavailable. */ }
  }, [content, draftKey, draftReady]);

  const seek = async () => {
    setSeeking(true); setError(null);
    try { setPresence(await onSeek(melon.id)); }
    catch (caught) { setError(messageFrom(caught)); }
    finally { setSeeking(false); }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const comment = content.trim();
    if (!comment || !presence?.presenceToken) return;
    setBusy(true); setError(null);
    try {
      const created = await adapter.comment(melon.id, comment, presence.presenceToken);
      setComments((current) => [created, ...current]);
      setContent("");
    } catch (caught) {
      setError(`${messageFrom(caught)} 草稿已保留。`);
      setPresence(null);
    }
    finally { setBusy(false); }
  };

  const canComment = presence?.presence === "local" && Boolean(presence.presenceToken);
  return <section className="comments inline-comments" aria-labelledby="comments-title">
    <header><div><span>公开回声</span><h3 id="comments-title">评论</h3></div><strong>{comments.length}</strong></header>
    {loading ? <div className="comment-loading" aria-label="正在加载评论"><i /><i /><i /></div> : comments.length ? <div className="comment-list">{comments.map((item) => <article key={item.id}><strong>{item.displayName ?? item.alias} <IdentityBadge badge={item.identityBadge} /></strong><div className="comment-tools"><time dateTime={item.createdAt}>{formatRelativeTime(item.createdAt)}</time><ReportControl adapter={adapter} targetType="comment" targetId={item.id} label="举报评论" /></div><p>{item.content}</p></article>)}</div> : <p className="comment-empty">还没有公开评论。远方围观者也能看到之后的全部回声。</p>}
    <div className={`comment-gate ${canComment ? "is-local" : ""}`}>
      <div className="comment-gate-copy"><LocationIcon /><p><strong>{readOnly ? "当前为只读状态" : canComment ? "现场凭证已点亮" : "远方围观模式"}</strong><small>{readOnly ? "仍可阅读全部公开评论。申诉入口即将开放。" : canComment ? "可以留下 140 字以内的平铺评论。" : "可读全部评论、轻反应和蹲瓜，不显示评论输入框。"}</small></p></div>
      {!readOnly && !canComment && <button onClick={seek} disabled={seeking}>{seeking ? "正在验证" : presence ? "重新验证位置" : "验证现场评论资格"}</button>}
      {presence && <p className="presence-result" role="status"><strong>{seekCopy[presence.seekState].label}</strong>{seekCopy[presence.seekState].hint}</p>}
    </div>
    {!readOnly && canComment && <form onSubmit={submit}>
      <label htmlFor={`comment-content-${melon.id}`}>评论内容</label>
      <textarea id={`comment-content-${melon.id}`} value={content} onChange={(event) => setContent(event.target.value)} maxLength={140} enterKeyHint="send" placeholder="写一句公开回声" />
      <div><small>{content.length}/140</small><button disabled={!content.trim() || busy}>{busy ? "发送中" : "发表评论"}</button></div>
      <p className="comment-rules">不要写真实姓名、联系方式、具体门牌或能认出某个人的信息。禁止造谣和开黄腔。不支持回复、@、私信或好友关系。凭证过期或发送失败时，草稿会保留。</p>
    </form>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </section>;
}

const reportReasons: Array<[CreateReportRequest["reason"], string]> = [
  ["privacy", "泄露隐私"], ["harassment", "骚扰攻击"], ["illegal", "违法内容"], ["spam", "垃圾引流"], ["other", "其他"],
];

function ReportControl({ adapter, targetType, targetId, label }: { adapter: IslandAdapter; targetType: CreateReportRequest["targetType"]; targetId: string; label: string }) {
  const reasonId = useId();
  const detailsId = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<CreateReportRequest["reason"]>("privacy");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setResult(null);
    try {
      await adapter.report({ targetType, targetId, reason, ...(details.trim() ? { details: details.trim() } : {}) });
      setResult("已收到，进入审核");
      setOpen(false);
    } catch (error) { setResult(messageFrom(error)); }
    finally { setBusy(false); }
  };

  return <div className="report-control">
    <button type="button" className="report-trigger" onClick={() => setOpen((value) => !value)} aria-expanded={open}>{label}</button>
    {open && <form className="report-form" onSubmit={submit}>
      <label htmlFor={reasonId}>举报理由</label>
      <select id={reasonId} value={reason} onChange={(event) => setReason(event.target.value as CreateReportRequest["reason"])}>{reportReasons.map(([value, copy]) => <option key={value} value={value}>{copy}</option>)}</select>
      <label htmlFor={detailsId}>补充说明（可选）</label>
      <textarea id={detailsId} value={details} onChange={(event) => setDetails(event.target.value)} maxLength={160} placeholder="请勿填写新的个人信息" />
      <div><small>{details.length}/160</small><button disabled={busy}>{busy ? "提交中" : "提交举报"}</button></div>
    </form>}
    {result && <span className="report-result" role="status">{result}</span>}
  </div>;
}

function CityPicker({ model, onClose, onSelect }: { model: IslandBootstrap; onClose: () => void; onSelect: (city: CityId) => void }) {
  return <Sheet title="换一个城市瓜域逛逛" subtitle="五城地标是象征景观，不是导航地图" onClose={onClose}><div className="city-list">{model.cities.map((city) => {
    const landmark = cityLandmarks[city.id] ?? fallbackLandmark;
    return <button key={city.id} onClick={() => onSelect(city.id)} className={city.id === model.discovery.activeCityId ? "selected" : ""} aria-label={`${city.name}城市瓜域，象征地标${landmark.name}，${city.opening.status === "open" ? "城门已开" : `${city.opening.safeMelons}/30 颗安全瓜`}`}><CityIsland cityId={city.id} cityName={city.name} compact /><span className="city-copy"><strong>{city.name}</strong><small>{landmark.name} · {landmark.atmosphere}</small><small>{city.opening.status === "open" ? "城门已开" : `${city.opening.safeMelons}/30 颗安全瓜`}</small></span>{city.id === model.discovery.activeCityId && <i>正在逛</i>}<ChevronIcon /></button>;
  })}</div><p className="privacy-copy"><LocationIcon />定位被拒绝时仍可按城市浏览和蹲瓜；只有埋瓜需要在公共地点附近完成一次距离验证。</p></Sheet>;
}

function CityIsland({ cityId, cityName, radar = false, compact = false }: { cityId: CityId; cityName: string; radar?: boolean; compact?: boolean }) {
  const landmark = cityLandmarks[cityId] ?? fallbackLandmark;
  return (
    <div className={`city-island landmark-${landmark.kind}${radar ? " is-radar" : ""}${compact ? " is-compact" : ""}`} role={radar ? "img" : undefined} aria-label={radar ? `${cityName}城市瓜域象征地标：${landmark.name}，${landmark.atmosphere}。没有坐标，不用于导航。` : undefined} aria-hidden={compact || undefined}>
      <span className="island-grass" aria-hidden="true" />
      <span className="landmark-glyph" aria-hidden="true"><i /><i /><i /><b /></span>
      {radar && <span className="landmark-caption"><strong>{landmark.name}</strong><small>象征景观 · 非导航</small></span>}
    </div>
  );
}

function Sheet({ title, subtitle, onClose, children, wide = false, stealth = false }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode; wide?: boolean; stealth?: boolean }) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const focusTimer = window.setTimeout(() => closeRef.current?.focus(), 0);
    const handleKeyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") return onClose();
      if (event.key !== "Tab") return;
      const focusable = Array.from(sheetRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex='-1'])") ?? []);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handleKeyboard);
    document.body.classList.add("modal-open");
    return () => { window.clearTimeout(focusTimer); document.removeEventListener("keydown", handleKeyboard); document.body.classList.remove("modal-open"); previous?.focus(); };
  }, [onClose]);
  const sheetClass = `sheet${wide ? " wide" : ""}${stealth ? " stealth-sheet" : ""}`;
  return <div className="sheet-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section ref={sheetRef} className={sheetClass} role="dialog" aria-modal="true" aria-labelledby={titleId}><div className="sheet-handle" aria-hidden="true"/><header className="sheet-header"><div><h2 id={titleId}>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button ref={closeRef} onClick={onClose} aria-label="关闭"><CloseIcon /></button></header><div className="sheet-body">{children}</div></section></div>;
}

function IslandLoading() {
  return <main className="island-loading" aria-label="正在听街上的动静"><div><i/><i/><span>猹</span></div><p>正在听街上的动静…</p></main>;
}

function IslandUnavailable({ error, onRetry, onDemo }: { error: unknown; onRetry: () => void; onDemo?: () => void }) {
  return <main className="island-unavailable"><div className="unavailable-sun" aria-hidden="true"><span>!</span></div><h1>瓜田信号没接上</h1><p role="alert">{messageFrom(error)}</p><div><button onClick={onRetry}>重新连接</button>{onDemo && <button className="demo-entry" onClick={onDemo}>进入本地试玩</button>}</div>{onDemo && <small>本地试玩使用明确标注的示例数据，不代表真实附近内容，也不会上传或保存。</small>}</main>;
}

function requestLocationProof(): Promise<LocationProof> {
  return new Promise((resolve, reject) => {
    if (!window.isSecureContext) return reject(new Error("当前页面不是安全连接，不能读取位置。仍可按城市继续浏览。" ));
    if (!("geolocation" in navigator)) return reject(new Error("当前浏览器不支持定位。仍可按城市继续浏览。" ));
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracyM: position.coords.accuracy,
        // Safari may reuse a provider timestamp even when maximumAge is zero.
        // The proof is created when this callback receives the position; the
        // coordinates themselves are never persisted or written to logs.
        capturedAt: new Date().toISOString(),
      }),
      (error) => reject(new Error(error.code === error.PERMISSION_DENIED ? "定位已拒绝 · 已保留城市浏览，埋瓜需要本次定位" : "这次没有取到位置 · 可以重试或继续按城市浏览" )),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 },
    );
  });
}

function formatCountdown(value?: string) {
  if (!value) return "一会儿";
  const minutes = Math.max(1, Math.ceil((new Date(value).getTime() - Date.now()) / 60000));
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  return `${hours} 小时 ${minutes % 60} 分`;
}

function formatDuration(milliseconds: number) {
  const minutes = Math.max(0, Math.ceil(milliseconds / 60_000));
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}小时${rest}分` : `${hours}小时`;
}

function createOperationId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function isFieldPlant(plant: { plotIndex: FieldPlotIndex; slotIndex: number; stage: string }): plant is FieldPlant {
  return "id" in plant && "plantedAt" in plant && "maturesAt" in plant;
}

function readRewardLabel(result: CompleteReadResult) {
  if (result.autoConverted) return "五籽合一 · 真瓜籽 +1";
  if (result.smallSeedAwarded) return "完成吃瓜 · 小瓜籽 +1";
  if (result.counted) return "完成吃瓜 · 今日小籽已领完";
  return "已经吃过 · 不重复奖励";
}

function formatRelativeTime(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}

function normalizeAnimalIdentity(value: string): AnimalIdentity {
  return (["猹", "水豚", "狐狸", "熊猫", "青蛙", "仓鼠"] as const).includes(value as AnimalIdentity)
    ? value as AnimalIdentity
    : "猹";
}

function storyTitle(value: string) {
  const trimmed = value.trim().replace(/^\[|\]$/g, "");
  return `[${trimmed}]`;
}

function newestFirst<T extends { createdAt?: string }>(items: T[]): T[];
function newestFirst<T>(items: T[], createdAt: (item: T) => string | undefined): T[];
function newestFirst<T extends { createdAt?: string }>(items: T[], createdAt: (item: T) => string | undefined = (item) => item.createdAt): T[] {
  return items.map((item, index) => ({ item, index, time: Date.parse(createdAt(item) ?? "") }))
    .sort((left, right) => {
      const leftTime = Number.isFinite(left.time) ? left.time : Number.NEGATIVE_INFINITY;
      const rightTime = Number.isFinite(right.time) ? right.time : Number.NEGATIVE_INFINITY;
      return rightTime - leftTime || left.index - right.index;
    })
    .map(({ item }) => item);
}

function formatMelonTimestamp(value?: string) {
  if (!value || !Number.isFinite(Date.parse(value))) return "时间待同步";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function MelonTimestamp({ value }: { value?: string }) {
  return <time className="melon-timestamp" dateTime={value}>{formatMelonTimestamp(value)}</time>;
}

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "这次没有成功，请稍后再试。";
}
