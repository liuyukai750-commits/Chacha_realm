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
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import Image from "next/image";
import type {
  CityId,
  CityOpeningState,
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
  MelonPreview,
  OpenedMelon,
  OwnFieldView,
  PublicSpotSummary,
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
  ["juicy", "有汁", "◒"],
  ["wild", "离谱", "≋"],
  ["hug", "抱抱", "⌒"],
  ["follow_up", "蹲后续", "…"],
];

const seekCopy: Record<SeekState, { label: string; hint: string; notice: string }> = {
  outside: { label: "还没摸到藤", hint: "还在瓜区外，可以继续远方围观。", notice: "顺藤摸瓜：目前在瓜区外，仍可远方围观" },
  near: { label: "摸到藤了", hint: "正在靠近公共地点，没有路线和精确距离。", notice: "顺藤摸瓜：正在靠近公共地点" },
  inside_zone: { label: "已进入瓜区", hint: "现场评论凭证已点亮，有效期很短。", notice: "叶语感应完成：已进入瓜区" },
  found: { label: "摸到这颗瓜", hint: "这里只确认公共地点，不显示任何人的位置。", notice: "顺藤摸瓜：已经找到这颗瓜" },
};

type LandmarkKind = "pavilion" | "temple" | "pearl" | "canton" | "skyline" | "meadow";
type DiscoveryScope = "nearby" | "city";
type BuryFeedback = Pick<CreateMelonResult, "id" | "status" | "trueSeedAwarded">;

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
  const [phasePreference, setPhasePreference] = useState<"auto" | "day" | "night">(() => {
    if (typeof window === "undefined") return "auto";
    const saved = window.localStorage.getItem("chacha-phase-preference");
    return saved === "day" || saved === "night" ? saved : "auto";
  });
  const [model, setModel] = useState<IslandBootstrap | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [tab, setTab] = useState<"radar" | "field">("radar");
  const [opened, setOpened] = useState<OpenedMelon | null>(null);
  const [openedAsOwner, setOpenedAsOwner] = useState(false);
  const [viewedField, setViewedField] = useState<FieldView | null>(null);
  const [quickSquats, setQuickSquats] = useState<string[]>([]);
  const [zonePresence, setZonePresence] = useState<Record<string, ZonePresenceResult>>({});
  const [openingMelon, setOpeningMelon] = useState(false);
  const [locatingNearby, setLocatingNearby] = useState(false);
  const [discoveryScope, setDiscoveryScope] = useState<DiscoveryScope>("city");
  const [showCities, setShowCities] = useState(false);
  const [showBury, setShowBury] = useState(false);
  const [showSquatShelf, setShowSquatShelf] = useState(false);
  const [buryFeedback, setBuryFeedback] = useState<BuryFeedback | null>(null);
  const [notice, setNotice] = useState("定位未开启 · 正在浏览公开瓜场");
  const modelReady = model !== null;

  useLayoutEffect(() => {
    const syncDayPhase = () => {
      if (phasePreference !== "auto") return setDayPhase(phasePreference);
      const localHour = new Date().getHours();
      setDayPhase(localHour >= 6 && localHour < 18 ? "day" : "night");
    };
    syncDayPhase();
    if (phasePreference !== "auto") return;
    const timer = window.setInterval(syncDayPhase, 60_000);
    return () => window.clearInterval(timer);
  }, [phasePreference]);

  const toggleDayPhase = () => {
    const next = dayPhase === "day" ? "night" : "day";
    window.localStorage.setItem("chacha-phase-preference", next);
    setPhasePreference(next);
  };

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
      const discovery = await islandAdapter.discover({ location, selectedCityId: model.discovery.activeCityId });
      const nearbyCount = nearbyItemsForScene(discovery.items, discovery.sceneContext).length;
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

  const seekZone = async (spotId: string) => {
    const location = await requestLocationProof();
    const result = await islandAdapter.verifyZonePresence({ spotId, location });
    setZonePresence((current) => ({ ...current, [spotId]: result }));
    setNotice(seekCopy[result.seekState].notice);
    if (result.seekState === "found" && "vibrate" in navigator) navigator.vibrate?.(18);
    return result;
  };

  const openMelon = async (preview: MelonPreview, presenceToken?: string) => {
    if (preview.status === "incubating") {
      setNotice(`这颗瓜还在长，约 ${formatCountdown(preview.maturesAt)} 后成熟`);
      return;
    }
    setOpeningMelon(true);
    try {
      setOpenedAsOwner(false);
      setOpened(await islandAdapter.openMelon(preview.id, presenceToken));
    } catch (error) {
      setNotice(messageFrom(error));
    } finally {
      setOpeningMelon(false);
    }
  };

  const finishRead = async (result: CompleteReadResult) => {
    if (!model) return;
    const field = "wallet" in model.field ? { ...model.field, wallet: result.wallet } : model.field;
    setModel({ ...model, session: { ...model.session, wallet: result.wallet }, field });
    setNotice(!result.counted
      ? "这颗瓜已经吃过 · 本次不重复奖励"
      : result.autoConverted
      ? "五粒小瓜籽聚在一起 · 真瓜籽 +1"
      : result.smallSeedAwarded ? "这颗瓜吃完了 · 小瓜籽 +1" : "阅读已记下 · 今天不再发小瓜籽");
  };

  const createMelon = async (input: Omit<CreateMelonRequest, "location">) => {
    const location = mode === "demo"
      ? { ...demoNearbyCoordinates, capturedAt: new Date().toISOString(), simulated: true, simulationLabel: input.burialKind === "public_spot" ? "demo_public_spot_arrival" : "demo_nearby_life_circle" }
      : await requestLocationProof();
    const result = await islandAdapter.createMelon({ ...input, location });

    // The create transaction is the source of truth. Reflect it before any
    // secondary refresh so a slow discovery request cannot hide a successful
    // publish or its wallet reward on mobile networks.
    setShowBury(false);
    setBuryFeedback({ id: result.id, status: result.status, trueSeedAwarded: result.trueSeedAwarded });
    setModel((current) => {
      if (!current) return current;
      const field = "wallet" in current.field
        ? { ...current.field, wallet: result.wallet }
        : current.field;
      return { ...current, field, session: { ...current.session, wallet: result.wallet } };
    });
    setNotice(result.status === "held"
      ? "瓜已收到 · 内容正在安全复核，暂不发放真瓜籽"
      : result.trueSeedAwarded
      ? "瓜埋好了 · 今日首颗安全原创奖励真瓜籽 +1"
      : "瓜埋好了 · 今天的首发真瓜籽奖励已经领过");

    void refreshOwnFieldAfterCreate(islandAdapter).then(
      (field) => setModel((current) => current ? {
        ...current,
        field,
        session: { ...current.session, wallet: result.wallet },
      } : current),
      () => setNotice(result.trueSeedAwarded
        ? "瓜已埋好，真瓜籽 +1 · 瓜田列表暂时没刷新，可点击重试"
        : "瓜已埋好 · 瓜田列表暂时没刷新，可点击重试"),
    );

    const selectedCityId = input.cityId ?? model?.discovery.activeCityId;
    if (selectedCityId) {
      void islandAdapter.discover({ location, selectedCityId }).then(
        (discovery) => {
          setModel((current) => current ? { ...current, discovery } : current);
          setDiscoveryScope("nearby");
        },
        () => undefined,
      );
    }
  };

  const openOwnedMelon = async (preview: FieldMelonPreview) => {
    setOpeningMelon(true);
    try {
      setOpenedAsOwner(true);
      setOpened(await islandAdapter.openMelon(preview.id));
    } catch (error) {
      setOpenedAsOwner(false);
      setNotice(messageFrom(error));
    } finally {
      setOpeningMelon(false);
    }
  };

  const quickSquat = async (id: string) => {
    if (writesBlocked) return setNotice("当前匿名身份已被封禁，只能阅读公开内容。申诉入口即将开放。");
    const active = !(model?.squatShelf.items.some((item) => item.melon.id === id) ?? quickSquats.includes(id));
    try {
      const result = await islandAdapter.setSquat(id, active);
      setQuickSquats((current) => result.active ? [...new Set([...current, id])] : current.filter((value) => value !== id));
      const squatShelf = await islandAdapter.squatShelf();
      setModel((current) => current ? { ...current, squatShelf } : current);
      setQuickSquats(squatShelf.items.map((item) => item.melon.id));
      setNotice(result.active ? "已放进蹲瓜架 · 成熟后会在听瓜入口亮起提醒" : "已经从蹲瓜架移除");
    } catch (error) { setNotice(messageFrom(error)); }
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

  const openSquattedMelon = async (item: SquatShelfItem) => {
    if (item.melon.status !== "mature") {
      setNotice(`还在土里长 · 约 ${formatCountdown(item.melon.maturesAt)} 后成熟`);
      return;
    }
    setOpeningMelon(true);
    try {
      const openedMelon = await islandAdapter.openMelon(item.melon.id);
      setOpenedAsOwner(false);
      setOpened(openedMelon);
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
      setModel((current) => current ? { ...current, field } : current);
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
          <button className="phase-mode-toggle" onClick={toggleDayPhase} aria-label={`当前${dayPhase === "day" ? "日间" : "夜间"}模式，切换到${dayPhase === "day" ? "夜间" : "日间"}模式`} title="切换日夜">
            <span aria-hidden="true">{dayPhase === "day" ? "日" : "夜"}</span>
          </button>
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
              ? "复核通过前不会公开，也不会发放首发真瓜籽。"
              : buryFeedback.trueSeedAwarded
              ? "今日首颗安全原创奖励了 1 颗真瓜籽，现在可以种进自己的瓜田。"
              : "它已经进入孵化；今天的首发真瓜籽奖励此前已经领过。"}</p>
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
            cityId={activeCity.id}
            cityName={activeCity.name}
            dayPhase={dayPhase}
            demoMode={mode === "demo"}
            sceneContext={model.discovery.sceneContext}
            visitorLocated={model.discovery.visitorType !== "location_unknown"}
            scope={discoveryScope}
            locatingNearby={locatingNearby}
            opening={activeCity.opening}
            openingMelon={openingMelon}
            onLocate={locate}
            onCityBrowse={() => {
              setDiscoveryScope("city");
              setNotice(`正在浏览${activeCity.name}城市瓜区 · 附近范围已关闭`);
            }}
            onOpen={openMelon}
            onSquat={quickSquat}
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
        ? <OwnerMelonReader adapter={islandAdapter} opened={opened} onClose={() => { setOpened(null); setOpenedAsOwner(false); }} />
        : <MelonReader adapter={islandAdapter} opened={opened} onClose={() => setOpened(null)} onFinished={finishRead} onViewField={viewField} onSeek={seekZone} onSquatChanged={refreshSquatShelf} readOnly={writesBlocked} initialPresence={zonePresence[opened.melon.spot.id]} />)}
      {showCities && <CityPicker model={model} onClose={() => setShowCities(false)} onSelect={selectCity} />}
      {showSquatShelf && <SquatShelfSheet shelf={model.squatShelf} busy={openingMelon} onClose={() => setShowSquatShelf(false)} onOpen={openSquattedMelon} onCancel={quickSquat} />}
      {showBury && !writesBlocked && <BurySheetV1 key={activeCity.id} cityId={activeCity.id} spots={activeCity.spots} cityName={activeCity.name} demoMode={mode === "demo"} onClose={() => setShowBury(false)} onCreate={createMelon} />}
    </div>
  );
}

function RadarView({ items, details, quickSquats, cityId, cityName, dayPhase, demoMode, sceneContext, visitorLocated, scope, locatingNearby, opening, openingMelon, onLocate, onCityBrowse, onOpen, onSquat, onRefresh, readOnly }: {
  items: MelonPreview[];
  details: IslandBootstrap["melonDetails"];
  quickSquats: string[];
  cityId: CityId;
  cityName: string;
  dayPhase: "day" | "night";
  demoMode: boolean;
  sceneContext: DiscoverySceneContext;
  visitorLocated: boolean;
  scope: DiscoveryScope;
  locatingNearby: boolean;
  opening: CityOpeningState;
  openingMelon: boolean;
  onLocate: () => void;
  onCityBrowse: () => void;
  onOpen: (melon: MelonPreview, presenceToken?: string) => void;
  onSquat: (id: string) => void;
  onRefresh: () => void;
  readOnly: boolean;
}) {
  const [topic, setTopic] = useState<SafeTopic | "all">("all");
  const [basketOpen, setBasketOpen] = useState(false);
  const [selectedSpotId, setSelectedSpotId] = useState<string | null>(null);
  const cityItems = items.filter((melon) => melon.cityId === cityId && (melon.burialKind ?? "public_spot") === "public_spot");
  const nearbyItems = nearbyItemsForScene(items, sceneContext);
  const scopedItems = scope === "nearby" ? nearbyItems : cityItems;
  const spotGroups = Array.from(scopedItems.reduce((groups, melon) => {
    const group = groups.get(melon.spot.id) ?? [];
    group.push(melon);
    groups.set(melon.spot.id, group);
    return groups;
  }, new Map<string, MelonPreview[]>()).values()).sort((left, right) => right.length - left.length);
  const activeSpotId = spotGroups.some((group) => group[0]?.spot.id === selectedSpotId) ? selectedSpotId : spotGroups[0]?.[0]?.spot.id;
  const zoneItems = spotGroups.find((group) => group[0]?.spot.id === activeSpotId) ?? [];
  const filteredItems = topic === "all" ? zoneItems : zoneItems.filter((melon) => melon.topic === topic);
  const zoneSpot = zoneItems[0]?.spot;
  const zoneScene = zoneSpot ? getSpotScene(zoneSpot) : null;
  const matureCount = filteredItems.filter((melon) => melon.status === "mature").length;
  const incubatingCount = filteredItems.length - matureCount;
  const effectiveSceneKind = scope === "city" ? "city_overview" : sceneContext.kind;
  const showingNearbyArea = effectiveSceneKind === "nearby_area";
  const cityVisual = getCityVisual(cityId);
  const sceneImage = showingNearbyArea
    ? dayPhase === "day" ? "/scenes/nearby-neighborhood-day-v1.png" : "/scenes/nearby-neighborhood-night-v1.png"
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
            const scene = getSpotScene(melon.spot);
            const displayTitle = detail?.title ?? melon.title ?? (melon.status === "mature" ? `一颗成熟的${topicName[melon.topic]}瓜` : `${topicName[melon.topic]}孵化瓜`);
            return <article className={`basket-row ${melon.status}`} key={melon.id} aria-label={displayTitle}>
              <span className="basket-fruit" aria-hidden="true"><i /></span>
              <div className="basket-copy">
                <span>{topicName[melon.topic]}瓜 / {scene.displayName}</span>
                <h3>{melon.status === "mature" ? displayTitle : `正在孵化，${formatCountdown(melon.maturesAt)} 后成熟`}</h3>
                <p>{melon.status === "mature" ? `${detail?.alias ?? "匿名小动物"} / ${distanceName[melon.distanceBand]} / ${melon.commentCount ?? 0} 条评论` : "蹲后续不会打扰它成熟"}</p>
              </div>
              <div className="basket-actions">
                {melon.status === "mature" ? <>
                  <button className="basket-primary" onClick={() => onOpen(melon)}>{melon.isRemote ? "远方围观" : "直接吃"}</button>
                  {!readOnly && <button onClick={() => onSquat(melon.id)} aria-pressed={squatted}>{squatted ? "已蹲瓜" : "蹲瓜"}</button>}
                </> : <button className="basket-primary" onClick={() => onSquat(melon.id)} disabled={readOnly} aria-pressed={squatted}>{readOnly ? "只读" : squatted ? "已蹲瓜" : "蹲瓜"}</button>}
              </div>
            </article>;
          }) : <div className="basket-empty"><SproutIcon /><strong>这个话题暂时没有瓜</strong><span>换一个话题，或稍后再听一听。</span></div>}
        </div>
      </section>
      <OpeningCard state={opening} />
    </>
  );
}

function nearbyItemsForScene(
  items: readonly MelonPreview[],
  sceneContext: DiscoverySceneContext,
): MelonPreview[] {
  if (sceneContext.kind === "nearby_area") {
    return items.filter((melon) => melon.distanceBand === "within_1km" && melon.burialKind === "nearby_area");
  }
  if (sceneContext.kind !== "public_spot") return [];
  return items.filter(
    (melon) => melon.distanceBand === "within_1km" && melon.burialKind !== "nearby_area" && melon.spot.id === sceneContext.spot.id,
  );
}

function OpeningCard({ state }: { state: CityOpeningState }) {
  const items = [["安全瓜", state.safeMelons, 30], ["瓜主", state.distinctAuthors, 25], ["地点", state.distinctSpots, 3], ["话题", state.distinctTopics, 3]] as const;
  if (state.status === "open") return <section className="opening-card is-open"><span className="utility-label">CITY GATE OPEN</span><h2>这座城的瓜门已经打开</h2><p>今晚的成熟瓜正按距离向外扩散。</p></section>;
  return (
    <section className="opening-card" aria-labelledby="opening-title">
      <header><span className="utility-label">CITY / OPENING</span><strong>{state.status === "countdown" ? "正在倒数开城门" : "继续攒热闹"}</strong></header>
      <div><h2 id="opening-title">这座城正在攒一场热闹</h2><p>四项都满后，次日 20:00 开城门。</p></div>
      <ul>{items.map(([label, value, goal]) => <li key={label}><span>{label}</span><div><i style={{ width: `${Math.min(100, value / goal * 100)}%` }} /></div><strong>{value}<small>/{goal}</small></strong></li>)}</ul>
    </section>
  );
}

function MyField({ field, isOwn, onBury, onOpen, onPlant, onRefresh, onHarvest, onHarvested }: {
  field: FieldView;
  isOwn: boolean;
  onBury: () => void;
  onOpen: (preview: FieldMelonPreview) => Promise<void>;
  onPlant: (plotIndex: FieldPlotIndex, operationId: string) => Promise<OwnFieldView>;
  onRefresh: () => Promise<OwnFieldView>;
  onHarvest: () => Promise<HarvestFieldResult>;
  onHarvested: (result: HarvestFieldResult) => void;
}) {
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
    <section className="field-view" aria-labelledby="field-title" aria-label={isOwn ? "我的瓜田" : `${field.alias}的瓜田`}>
      <p className="utility-label"><SproutIcon /> {isOwn ? "MY THREE PATCHES" : "VISITING PATCH"}</p>
      <h1 id="field-title">{isOwn ? <>我的瓜田，<em>九个坑，慢慢长。</em></> : <>{field.alias} <em>的瓜田</em></>}</h1>

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
        <header><div><h2 id="my-melons-title">{isOwn ? "我埋下的瓜" : `${field.alias} 埋下的瓜`}</h2></div>{isOwn && <button onClick={onBury}><PlusIcon />再埋一个故事</button>}</header>
        {field.melons.length ? <div className="field-plots">{field.melons.map((melon) => isOwn
          ? <button type="button" className="field-melon-card" key={melon.id} onClick={() => void onOpen(melon)} aria-label={`查看${topicName[melon.topic]}瓜的正文和评论`}><span className="plot-melon" aria-hidden="true"/><div><strong>{topicName[melon.topic]}瓜</strong><p>{getSpotScene(melon.spot).displayName}</p><small>{melon.status === "held" ? "安全复核中 · 点击查看原文" : melon.status === "incubating" ? `${formatCountdown(melon.maturesAt)} 后成熟 · 点击查看` : "已经成熟 · 查看评论"}</small></div><ChevronIcon /></button>
          : <article key={melon.id}><span className="plot-melon" aria-hidden="true"/><div><strong>{topicName[melon.topic]}瓜</strong><p>{getSpotScene(melon.spot).displayName}</p><small>{melon.status === "incubating" ? `${formatCountdown(melon.maturesAt)} 后成熟` : "已经成熟"}</small></div></article>)}</div> : isOwn ? <button className="empty-plot" onClick={onBury}><SproutIcon /><strong>这里还没有埋过故事</strong><span>可以埋在附近生活圈或公共地点</span></button> : <div className="empty-plot is-static"><SproutIcon /><strong>这里还没有公开的瓜</strong><span>过阵子再来串门</span></div>}
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
  const mature = shelf.items.filter((item) => item.melon.status === "mature");
  const growing = shelf.items.filter((item) => item.melon.status === "incubating");
  return <Sheet title="我的蹲瓜架" subtitle="成熟提醒只在猹猹街站内出现，不会发系统推送" onClose={onClose} wide>
    <section className="squat-shelf" aria-label="蹲瓜提醒">
      <header><span><strong>{shelf.unreadCount}</strong><small>刚成熟</small></span><p>回来逛街时自动检查成熟状态。<br />作者追加后续会在后续版本接入同一架子。</p></header>
      {shelf.items.length === 0 ? <div className="squat-shelf-empty"><SproutIcon /><strong>架子还是空的</strong><span>遇到还在孵化的瓜，点“蹲瓜”就会收进这里。</span></div> : <>
        {mature.length > 0 && <div className="squat-shelf-group"><h3>已经成熟 <span>{mature.length}</span></h3>{mature.map((item) => <article className={item.unread ? "is-unread" : ""} key={item.melon.id}>
          <button className="squat-shelf-main" onClick={() => onOpen(item)} disabled={busy}>
            <span className="squat-melon" aria-hidden="true" />
            <span><small>{item.unread ? "刚成熟 · " : "已成熟 · "}{topicName[item.melon.topic]}瓜</small><strong>{item.melon.title ?? "这颗瓜已经可以吃了"}</strong><em>{item.melon.spot.name}{typeof item.melon.commentCount === "number" ? ` · ${item.melon.commentCount} 条评论` : ""}</em></span>
            <ChevronIcon />
          </button>
          <button className="squat-shelf-remove" onClick={() => onCancel(item.melon.id)} aria-label={`取消蹲守${item.melon.title ?? "这颗瓜"}`}>移除</button>
        </article>)}</div>}
        {growing.length > 0 && <div className="squat-shelf-group is-growing"><h3>还在土里长 <span>{growing.length}</span></h3>{growing.map((item) => <article key={item.melon.id}>
          <button className="squat-shelf-main" onClick={() => onOpen(item)}>
            <span className="squat-sprout" aria-hidden="true"><SproutIcon /></span>
            <span><small>{topicName[item.melon.topic]}瓜 · {item.melon.spot.name}</small><strong>约 {formatCountdown(item.melon.maturesAt)} 后成熟</strong><em>成熟后，听瓜入口会亮起红点</em></span>
          </button>
          <button className="squat-shelf-remove" onClick={() => onCancel(item.melon.id)} aria-label="取消蹲守这颗孵化中的瓜">移除</button>
        </article>)}</div>}
      </>}
    </section>
  </Sheet>;
}

function OwnerMelonReader({ adapter, opened, onClose }: { adapter: IslandAdapter; opened: OpenedMelon; onClose: () => void }) {
  const [comments, setComments] = useState<MelonComment[]>([]);
  const [loading, setLoading] = useState(opened.melon.status === "mature");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (opened.melon.status !== "mature") return;
    let active = true;
    adapter.comments(opened.melon.id).then(
      (page) => { if (active) setComments(page.items); },
      (caught) => { if (active) setError(messageFrom(caught)); },
    ).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [adapter, opened.melon.id, opened.melon.status]);

  const statusCopy = opened.melon.status === "held"
    ? "安全复核中 · 只有你能看到原文，暂不公开或发放真瓜籽"
    : opened.melon.status === "incubating"
    ? `正在孵化 · 约 ${formatCountdown(opened.melon.maturesAt)} 后公开`
    : "已经成熟 · 下方是吃瓜猹留下的公开回声";

  return <Sheet title={opened.melon.title} subtitle="我的瓜 · 瓜主管理视图" onClose={onClose} wide stealth>
    <article className="owner-melon-reader">
      <div className={`owner-melon-status is-${opened.melon.status}`} role="status"><strong>{statusCopy}</strong></div>
      <PlaceScene spot={opened.melon.spot} stealth />
      <section className="owner-story"><span>{topicName[opened.melon.topic]}瓜 · {getSpotScene(opened.melon.spot).displayName}</span><p>{opened.melon.content}</p><small>发布于 {formatRelativeTime(opened.melon.createdAt)}</small></section>
      <div className="owner-melon-stats" aria-label="这颗瓜的数据"><span>吃完 <strong>{opened.melon.completedReads ?? 0}</strong> 只猹</span>{reactionMeta.map(([key, label]) => <span key={key}>{label} <strong>{opened.melon.reactions[key]}</strong></span>)}</div>
      <section className="comments owner-comments" aria-labelledby="owner-comments-title">
        <header><div><span>公开回声</span><h3 id="owner-comments-title">吃瓜猹的评论</h3></div><strong>{comments.length}</strong></header>
        {opened.melon.status !== "mature" ? <p className="comment-empty">这颗瓜公开成熟后，吃瓜猹的评论会显示在这里。</p> : loading ? <div className="comment-loading" aria-label="正在加载评论"><i/><i/><i/></div> : comments.length ? <div className="comment-list">{comments.map((item) => <article key={item.id}><strong>{item.alias}</strong><div className="comment-tools"><time dateTime={item.createdAt}>{formatRelativeTime(item.createdAt)}</time><ReportControl adapter={adapter} targetType="comment" targetId={item.id} label="举报评论" /></div><p>{item.content}</p></article>)}</div> : <p className="comment-empty">还没有公开评论。有人吃瓜并留言后会出现在这里。</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
      </section>
    </article>
  </Sheet>;
}

function MelonReader({ adapter, opened, onClose, onFinished, onViewField, onSeek, onSquatChanged, readOnly, initialPresence }: { adapter: IslandAdapter; opened: OpenedMelon; onClose: () => void; onFinished: (result: CompleteReadResult) => void; onViewField: (alias: string) => void; onSeek: (spotId: string) => Promise<ZonePresenceResult>; onSquatChanged: () => Promise<void>; readOnly: boolean; initialPresence?: ZonePresenceResult }) {
  const [elapsed, setElapsed] = useState(0);
  const [finished, setFinished] = useState(false);
  const [completionResult, setCompletionResult] = useState<CompleteReadResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [squatted, setSquatted] = useState(opened.melon.squatted);
  const [reactions, setReactions] = useState(opened.melon.reactions);
  const [reacted, setReacted] = useState<ReactionType[]>([]);

  useEffect(() => {
    const start = window.performance.now();
    const timer = window.setInterval(() => setElapsed(Math.min(5000, window.performance.now() - start)), 100);
    return () => window.clearInterval(timer);
  }, []);

  const ready = elapsed >= 5000;
  const peel = Math.max(12, elapsed / 50);
  const peelStyle = { "--peel": `${peel}%` } as CSSProperties;

  const complete = async () => {
    setBusy(true); setError(null);
    try {
      const result = await adapter.completeRead(opened.melon.id, { readToken: opened.readToken });
      setFinished(true);
      setCompletionResult(result);
      onFinished(result);
    } catch (caught) { setError(messageFrom(caught)); }
    finally { setBusy(false); }
  };

  const toggleSquat = async () => {
    const result = await adapter.setSquat(opened.melon.id, !squatted);
    setSquatted(result.active);
    await onSquatChanged();
  };

  const react = async (reaction: ReactionType) => {
    if (reacted.includes(reaction)) return;
    setReactions(await adapter.react(opened.melon.id, reaction));
    setReacted((current) => [...current, reaction]);
  };

  return (
    <Sheet title={opened.melon.title} subtitle={`${getSpotScene(opened.melon.spot).displayName} · ${opened.melon.alias}`} onClose={onClose} wide stealth>
      <article className="melon-reader">
        <StealthCue title="扒开草丛" copy="叶影替你挡住路过的视线，正文仍保持清楚可读。" />
        <PlaceScene spot={opened.melon.spot} stealth />
        <div className="reader-meta"><span>{topicName[opened.melon.topic]}瓜</span><span>{distanceName[opened.melon.distanceBand]}</span>{!readOnly && <button onClick={toggleSquat} aria-pressed={squatted}>{squatted ? <CheckIcon /> : <SproutIcon />}{squatted ? "取消蹲瓜" : "蹲瓜"}</button>}</div>
        <div className="reader-links"><a href={`/fields/${encodeURIComponent(opened.melon.alias)}`} onClick={(event) => { event.preventDefault(); onViewField(opened.melon.alias); }}>查看 {opened.melon.alias} 的瓜田</a><span><MessageIcon /> 评论就在正文下方</span></div>
        <ReportControl adapter={adapter} targetType="melon" targetId={opened.melon.id} label="举报这颗瓜" />
        <div className="peel-story" style={peelStyle}>
          <div className="story-paper"><p>{opened.melon.content}</p><footer>来自 {opened.melon.alias}</footer></div>
          <div className="melon-peel" aria-hidden="true"><i /><i /><i /><span>{ready ? "瓜瓤见底了" : "慢慢剥开…"}</span></div>
        </div>
        <div className="read-finish">
          {completionResult?.autoConverted && <span className="seed-convert-burst" aria-hidden="true"><i/><i/><i/><i/><i/><b>真</b></span>}
          <div className="read-clock" role="status" aria-live="polite" aria-label={completionResult ? readRewardLabel(completionResult) : ready ? "已经阅读 5 秒，可以完成吃瓜" : `还需阅读 ${Math.ceil((5000 - elapsed) / 1000)} 秒`}><span style={{ "--progress": `${elapsed / 50}%` } as CSSProperties}>{ready ? <CheckIcon /> : Math.ceil((5000 - elapsed) / 1000)}</span><p><strong>{completionResult ? readRewardLabel(completionResult) : ready ? "可以完成吃瓜" : "别急着划走"}</strong><small>{completionResult ? `小瓜籽 ${completionResult.wallet.smallSeedCount}/5 · 真瓜籽 ${completionResult.wallet.trueSeedCount}` : ready ? "完成后今日有效次数会由服务端判定" : "读满 5 秒，才算认真吃完"}</small></p></div>
          <button className={finished ? `finish-button finished ${completionResult?.smallSeedAwarded ? "seed-launch" : ""}` : "finish-button"} aria-label="完成吃瓜" onClick={complete} disabled={!ready || busy || finished}>{finished ? <><CheckIcon /> {completionResult ? readRewardLabel(completionResult) : "已吃完"}</> : busy ? "正在留籽…" : "完成吃瓜"}</button>
          {error && <p className="form-error" role="alert">{error}</p>}
        </div>
        {!readOnly && <div className="reaction-row" aria-label="轻反应">{reactionMeta.map(([key, label, glyph]) => <button key={key} onClick={() => react(key)} disabled={reacted.includes(key)} aria-label={`${label}，当前 ${reactions[key]} 次${reacted.includes(key) ? "，已留下" : ""}`}><span aria-hidden="true">{reacted.includes(key) ? "✓" : glyph}</span>{label}<small>{reactions[key]}</small></button>)}</div>}
        {readOnly && <p className="readonly-note">当前匿名身份只能阅读，不能轻反应、蹲瓜或评论。申诉入口即将开放。</p>}
        <InlineComments adapter={adapter} melon={opened.melon} onSeek={onSeek} readOnly={readOnly} initialPresence={initialPresence} />
      </article>
    </Sheet>
  );
}

function InlineComments({ adapter, melon, onSeek, readOnly, initialPresence }: { adapter: IslandAdapter; melon: OpenedMelon["melon"]; onSeek: (spotId: string) => Promise<ZonePresenceResult>; readOnly: boolean; initialPresence?: ZonePresenceResult }) {
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
    adapter.comments(melon.id).then(
      (value) => { if (active) setComments(value.items); },
      (caught) => { if (active) setError(messageFrom(caught)); },
    ).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [adapter, melon.id]);

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
    try { setPresence(await onSeek(melon.spot.id)); }
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
    {loading ? <div className="comment-loading" aria-label="正在加载评论"><i /><i /><i /></div> : comments.length ? <div className="comment-list">{comments.map((item) => <article key={item.id}><strong>{item.alias}</strong><div className="comment-tools"><time dateTime={item.createdAt}>{formatRelativeTime(item.createdAt)}</time><ReportControl adapter={adapter} targetType="comment" targetId={item.id} label="举报评论" /></div><p>{item.content}</p></article>)}</div> : <p className="comment-empty">还没有公开评论。远方围观者也能看到之后的全部回声。</p>}
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function BurySheet({ spots, cityName, onClose, onCreate }: { spots: IslandBootstrap["cities"][number]["spots"]; cityName: string; onClose: () => void; onCreate: (input: Omit<CreateMelonRequest, "location">) => Promise<void> }) {
  const spotInputId = useId();
  const topicInputId = useId();
  const titleInputId = useId();
  const contentInputId = useId();
  const [spotId, setSpotId] = useState(spots[0]?.id ?? "");
  const [topic, setTopic] = useState<SafeTopic>("daily");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedSpot = spots.find((spot) => spot.id === spotId);

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(null);
    if (!spotId) return setError("这座城还没有可埋瓜的公开地点。可以先去其他城市逛逛。" );
    if (title.trim().length < 4) return setError("标题至少写 4 个字，让路过的猹知道发生了什么。" );
    if (content.trim().length < 20) return setError("故事至少写 20 个字，再留一点现场细节。" );
    setBusy(true);
    try { await onCreate({ operationId: createOperationId(), burialKind: "public_spot", cityId: selectedSpot?.cityId ?? "changsha", spotId, topic, title: title.trim(), content: content.trim(), revealMode: "open" }); }
    catch (caught) { setError(messageFrom(caught)); }
    finally { setBusy(false); }
  };

  return (
    <Sheet title="埋下一颗瓜" subtitle={`会埋在${cityName}的公开地点附近`} onClose={onClose} stealth>
      <form className="bury-form" aria-label="埋瓜" onSubmit={submit}>
        <StealthCue title="把秘密压进土里" copy="只留下模糊距离，精确位置不进瓜田。" bury />
        <label htmlFor={spotInputId}><span>公共地点</span><select id={spotInputId} value={spotId} onChange={(event) => setSpotId(event.target.value)}><option value="">请选择公开地点</option>{spots.map((spot) => <option value={spot.id} key={spot.id}>{getSpotScene(spot).displayName}</option>)}</select></label>
        {selectedSpot && <PlaceScene spot={selectedSpot} compact />}
        <label htmlFor={topicInputId}><span>话题</span><select id={topicInputId} value={topic} onChange={(event) => setTopic(event.target.value as SafeTopic)}>{(Object.keys(topicName) as SafeTopic[]).map((key) => <option value={key} key={key}>{topicName[key]}</option>)}</select></label>
        <label htmlFor={titleInputId}><span>标题</span><input id={titleInputId} value={title} onChange={(event) => setTitle(event.target.value)} maxLength={42} placeholder="一句话说清发生了什么"/><small>{title.length}/42</small></label>
        <label htmlFor={contentInputId}><span>故事内容</span><textarea id={contentInputId} value={content} onChange={(event) => setContent(event.target.value)} maxLength={800} placeholder="写下匿名故事，不写可识别信息"/><small>{content.length}/800</small></label>
        <p className="safety-note">不要写真实姓名、联系方式、具体门牌或能认出某个人的信息。禁止造谣和开黄腔。</p>
        <div className="location-gate"><LocationIcon /><p><strong>发布时才请求一次定位</strong>只用于确认你在所选公共地点 500 米内；不会保存、输出或写进日志。拒绝后仍可继续逛瓜域。</p></div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="bury-submit" aria-label="埋瓜，把秘密压进土里" disabled={busy}>{busy ? "正在压土…" : "把秘密压进土里"}</button>
      </form>
    </Sheet>
  );
}

function PlaceScene({ spot, compact = false, stealth = false }: { spot: PublicSpotSummary; compact?: boolean; stealth?: boolean }) {
  const scene = getSpotScene(spot);
  const detail = scene.hidesExactVenue ? "地点名称已模糊" : `${scene.displayName}周边意象`;
  return (
    <div
      className={`place-scene scene-${scene.kind}${compact ? " is-compact" : ""}${stealth ? " is-stealth" : ""}`}
      role="img"
      aria-label={`${scene.title}的半真实城市场景：${scene.sceneLabel}。${detail}，不是实景地图。`}
    >
      <span className="scene-sky" aria-hidden="true"><i /></span>
      <span className="scene-buildings" aria-hidden="true"><i /><i /><i /></span>
      <span className="scene-prop" aria-hidden="true"><i /><i /><b /></span>
      <span className="scene-ground" aria-hidden="true" />
      <span className="scene-caption"><strong>{scene.title}</strong><small>{detail} · 非实景</small></span>
    </div>
  );
}

function StealthCue({ title, copy, bury = false }: { title: string; copy: string; bury?: boolean }) {
  return <div className={`stealth-cue${bury ? " is-bury" : ""}`}><span aria-hidden="true"><i /><i /><i /></span><p><strong>{title}</strong><small>{copy}</small></p></div>;
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

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "这次没有成功，请稍后再试。";
}
