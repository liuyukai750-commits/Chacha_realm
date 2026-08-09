"use client";

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
import type {
  CityId,
  CityOpeningState,
  CompleteReadResult,
  CreateMelonRequest,
  CreateReportRequest,
  DistanceBand,
  FieldView,
  LocationProof,
  MelonComment,
  MelonPreview,
  OpenedMelon,
  PublicSpotSummary,
  ReactionType,
  SafeTopic,
  SeekState,
  ZonePresenceResult,
} from "@/contracts";
import { demoIslandAdapter, type IslandAdapter, type IslandBootstrap } from "./demo-island-adapter";
import { httpIslandAdapter, isExplicitServiceUnavailable } from "./http-island-adapter";
import { getSpotScene } from "./city-visuals";
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
  outside: { label: "叶语很轻", hint: "还在瓜区外，可以继续远方围观。", notice: "叶语感应完成：目前在瓜区外，仍可远方围观" },
  near: { label: "叶脉有回应", hint: "正在靠近公共地点，没有路线和精确距离。", notice: "叶语感应完成：正在靠近公共地点" },
  inside_zone: { label: "已进入瓜区", hint: "现场评论凭证已点亮，有效期很短。", notice: "叶语感应完成：已进入瓜区" },
  found: { label: "找到瓜棚了", hint: "这里只确认公共地点，不显示任何人的位置。", notice: "叶语感应完成：已找到瓜棚" },
};

type LandmarkKind = "pavilion" | "temple" | "pearl" | "canton" | "skyline" | "meadow";

const cityLandmarks: Record<CityId, { name: string; atmosphere: string; kind: LandmarkKind }> = {
  changsha: { name: "天心阁", atmosphere: "橘洲晴风", kind: "pavilion" },
  beijing: { name: "天坛", atmosphere: "古树晴空", kind: "temple" },
  shanghai: { name: "东方明珠", atmosphere: "江风与天际线", kind: "pearl" },
  guangzhou: { name: "广州塔", atmosphere: "珠江暖风", kind: "canton" },
  shenzhen: { name: "城市天际线", atmosphere: "海风草坡", kind: "skyline" },
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
  const [viewedField, setViewedField] = useState<FieldView | null>(null);
  const [quickSquats, setQuickSquats] = useState<string[]>([]);
  const [zonePresence, setZonePresence] = useState<Record<string, ZonePresenceResult>>({});
  const [openingMelon, setOpeningMelon] = useState(false);
  const [showCities, setShowCities] = useState(false);
  const [showBury, setShowBury] = useState(false);
  const [notice, setNotice] = useState("定位未开启 · 正在浏览公开瓜场");

  useLayoutEffect(() => {
    const syncDayPhase = () => {
      const localHour = new Date().getHours();
      setDayPhase(localHour >= 6 && localHour < 18 ? "day" : "night");
    };
    syncDayPhase();
    const timer = window.setInterval(syncDayPhase, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    islandAdapter.bootstrap().then(
      (value) => { if (active) setModel(value); },
      (error) => { if (active) setLoadError(error); },
    );
    return () => { active = false; };
  }, [islandAdapter, retryKey]);

  const activeCity = model?.cities.find((city) => city.id === model.discovery.activeCityId);
  const writesBlocked = model?.session.accountStatus === "banned";

  const selectCity = async (cityId: CityId) => {
    if (!model) return;
    const discovery = await islandAdapter.discover({ selectedCityId: cityId });
    setModel({ ...model, discovery });
    setShowCities(false);
    setNotice(`已切到${model.cities.find((city) => city.id === cityId)?.name ?? "这座城"}公开瓜场 · 未使用精确位置`);
  };

  const locate = async () => {
    if (!model) return;
    try {
      const location = await requestLocationProof();
      const discovery = await islandAdapter.discover({ location, selectedCityId: model.discovery.activeCityId });
      setModel({ ...model, discovery });
      setNotice("本次距离校准完成 · 精确位置未保存");
    } catch (error) {
      setNotice(messageFrom(error));
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

  const openMelon = async (preview: MelonPreview) => {
    if (preview.status === "incubating") {
      setNotice(`这颗瓜还在长，约 ${formatCountdown(preview.maturesAt)} 后成熟`);
      return;
    }
    setOpeningMelon(true);
    try {
      setOpened(await islandAdapter.openMelon(preview.id));
    } catch (error) {
      setNotice(messageFrom(error));
    } finally {
      setOpeningMelon(false);
    }
  };

  const finishRead = async (result: CompleteReadResult) => {
    if (!model) return;
    setModel({ ...model, session: { ...model.session, seedCount: result.readerSeedCount }, field: { ...model.field, progress: { ...model.field.progress, seedCount: result.readerSeedCount } } });
    setNotice(result.readerSeedAwarded ? "这颗瓜吃完了 · 瓜籽 +1" : "这颗瓜已经吃过 · 本次不重复奖励");
  };

  const createMelon = async (input: Omit<CreateMelonRequest, "location">) => {
    const location = await requestLocationProof();
    const result = await islandAdapter.createMelon({ ...input, location });
    const field = await islandAdapter.field();
    if (model) setModel({ ...model, field });
    setShowBury(false);
    setTab("field");
    setNotice(result.status === "held" ? "这颗瓜需要人工复核，暂时不会成熟" : "瓜埋好了 · 约 2 小时后成熟");
  };

  const quickSquat = async (id: string) => {
    if (writesBlocked) return setNotice("当前匿名身份已被封禁，只能阅读公开内容。申诉入口即将开放。");
    const active = !quickSquats.includes(id);
    try {
      const result = await islandAdapter.setSquat(id, active);
      setQuickSquats((current) => result.active ? [...new Set([...current, id])] : current.filter((value) => value !== id));
      setNotice(result.active ? "已经蹲好，有后续会提醒你" : "已经取消蹲瓜");
    } catch (error) { setNotice(messageFrom(error)); }
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

  if (loadError) return <IslandUnavailable error={loadError} onRetry={() => { setLoadError(null); setRetryKey((value) => value + 1); }} onDemo={isExplicitServiceUnavailable(loadError) ? () => { setMode("demo"); setModel(null); setLoadError(null); setIslandAdapter(demoIslandAdapter); } : undefined} />;
  if (!model || !activeCity) return <IslandLoading />;

  return (
    <div className="sunny-shell" data-day-phase={dayPhase}>
      {mode === "demo" && <div className="demo-banner" role="note"><strong>本地试玩</strong><span>示例数据只留在当前页面，不会上传或保存。</span></div>}
      <header className="topbar">
        <button className="brand" onClick={() => setTab("radar")} aria-label="回到瓜域雷达">
          <span className="brand-glyph" aria-hidden="true">猹</span>
          <span><strong>猹猹王国</strong><small>CHACHA / SUNNY FIELD</small></span>
        </button>
        <div className="topbar-actions">
          <button className="city-switch" onClick={() => setShowCities(true)} aria-label={`当前城市${activeCity.name}，切换城市`}>
            <LocationIcon /><span>{activeCity.name}</span><ChevronIcon />
          </button>
          <span className="seed-count" aria-label={`拥有 ${model.session.seedCount} 粒瓜籽`}><SeedIcon />{model.session.seedCount}</span>
        </div>
      </header>

      <main className="island-main">
        {writesBlocked && <div className="account-readonly" role="status"><strong>当前为只读状态</strong><span>匿名身份已被封禁，仍可读瓜和查看公开评论。申诉入口即将开放。</span></div>}
        {!opened && !showBury && !showCities && <div className="live-notice" role="status"><span aria-hidden="true" />{notice}</div>}
        {tab === "radar" ? (
          <RadarView
            items={model.discovery.items}
            details={model.melonDetails}
            quickSquats={quickSquats}
            cityId={activeCity.id}
            cityName={activeCity.name}
            visitorLocated={model.discovery.visitorType !== "location_unknown"}
            opening={activeCity.opening}
            openingMelon={openingMelon}
            onLocate={locate}
            onSeek={seekZone}
            onOpen={openMelon}
            onSquat={quickSquat}
            onRefresh={async () => {
              const discovery = await islandAdapter.discover({ selectedCityId: model.discovery.activeCityId });
              setModel({ ...model, discovery });
              setNotice("雷达已重听 · 同区、同城、远方依次排好");
            }}
            readOnly={writesBlocked}
          />
        ) : (
          <MyField field={viewedField ?? model.field} isOwn={!viewedField} onBury={() => setShowBury(true)} />
        )}
      </main>

      <nav className="bottom-dock" aria-label="主要导航">
        <button className={tab === "radar" ? "active" : ""} onClick={() => setTab("radar")} aria-current={tab === "radar" ? "page" : undefined}><RadarIcon /><span>听瓜</span></button>
        {viewedField ? <button className="bury-button field-return" onClick={() => setViewedField(null)}><FieldIcon /><span>回我的田</span></button> : <button className="bury-button" onClick={() => setShowBury(true)} disabled={writesBlocked} aria-label={writesBlocked ? "当前只读，不能埋瓜" : "埋瓜"}>{writesBlocked ? <CloseIcon /> : <PlusIcon />}<span>{writesBlocked ? "只读" : "埋瓜"}</span></button>}
        <button className={tab === "field" ? "active" : ""} onClick={showOwnField} aria-current={tab === "field" ? "page" : undefined}><FieldIcon /><span>瓜田</span></button>
      </nav>

      {opened && <MelonReader adapter={islandAdapter} opened={opened} onClose={() => setOpened(null)} onFinished={finishRead} onViewField={viewField} onSeek={seekZone} readOnly={writesBlocked} initialPresence={zonePresence[opened.melon.spot.id]} />}
      {showCities && <CityPicker model={model} onClose={() => setShowCities(false)} onSelect={selectCity} />}
      {showBury && !writesBlocked && <BurySheet spots={activeCity.spots} cityName={activeCity.name} onClose={() => setShowBury(false)} onCreate={createMelon} />}
    </div>
  );
}

function RadarView({ items, details, quickSquats, cityId, cityName, visitorLocated, opening, openingMelon, onLocate, onSeek, onOpen, onSquat, onRefresh, readOnly }: {
  items: MelonPreview[];
  details: IslandBootstrap["melonDetails"];
  quickSquats: string[];
  cityId: CityId;
  cityName: string;
  visitorLocated: boolean;
  opening: CityOpeningState;
  openingMelon: boolean;
  onLocate: () => void;
  onSeek: (spotId: string) => Promise<ZonePresenceResult>;
  onOpen: (melon: MelonPreview) => void;
  onSquat: (id: string) => void;
  onRefresh: () => void;
  readOnly: boolean;
}) {
  const [topic, setTopic] = useState<SafeTopic | "all">("all");
  const [basketOpen, setBasketOpen] = useState(false);
  const [selectedSpotId, setSelectedSpotId] = useState<string | null>(null);
  const [seekTargetId, setSeekTargetId] = useState<string | null>(null);
  const [seekResult, setSeekResult] = useState<ZonePresenceResult | null>(null);
  const [seekBusy, setSeekBusy] = useState(false);
  const [seekError, setSeekError] = useState<string | null>(null);
  const spotGroups = Array.from(items.filter((melon) => melon.cityId === cityId).reduce((groups, melon) => {
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
  const representatives = [...filteredItems].sort((left, right) => Number(right.status === "mature") - Number(left.status === "mature")).slice(0, 5);

  const senseLeaves = async () => {
    if (!zoneSpot) return;
    setSeekBusy(true);
    setSeekError(null);
    try { setSeekResult(await onSeek(zoneSpot.id)); }
    catch (error) { setSeekError(messageFrom(error)); }
    finally { setSeekBusy(false); }
  };

  const selectZone = (spotId: string) => {
    setSelectedSpotId(spotId);
    setSeekResult(null);
    setSeekTargetId(null);
    setTopic("all");
  };

  const seekMelon = async (melon: MelonPreview) => {
    setSeekTargetId(melon.id);
    setSeekBusy(true);
    setSeekError(null);
    try { setSeekResult(await onSeek(melon.spot.id)); }
    catch (error) { setSeekError(messageFrom(error)); }
    finally { setSeekBusy(false); }
  };

  return (
    <>
      <section className="radar-intro" aria-labelledby="radar-title">
        <p className="utility-label"><SunIcon /> 晴日雷达 · {cityName}</p>
        <h1 id="radar-title">附近有瓜，<em>正在发亮。</em></h1>
        <button className={visitorLocated ? "location-calibrated" : "location-callout"} onClick={onLocate} aria-label={visitorLocated ? "重新定位" : "开启定位"}>
          {visitorLocated ? <CheckIcon /> : <LocationIcon />}
          <span><strong>{visitorLocated ? "距离已校准" : "校准附近距离"}</strong><small>{visitorLocated ? "本次精确位置不会保存" : "拒绝也能按城市继续浏览"}</small></span>
        </button>
      </section>

      <section className="zone-console" aria-label="瓜区控制台">
        <div className="zone-heading">
          <div><span className="zone-kicker">公共地点瓜棚</span><h2>{zoneScene?.displayName ?? `${cityName}瓜区`}</h2></div>
          <strong>{filteredItems.length} 颗瓜</strong>
        </div>
        {spotGroups.length > 1 && <div className="zone-switcher" role="group" aria-label="切换公共地点瓜区">{spotGroups.map((group) => {
          const spot = group[0].spot;
          return <button key={spot.id} className={spot.id === activeSpotId ? "active" : ""} onClick={() => selectZone(spot.id)} aria-pressed={spot.id === activeSpotId}>{getSpotScene(spot).displayName}<small>{group.length}</small></button>;
        })}</div>}
        <div className="topic-filter" role="group" aria-label="按单一话题筛选">
          <button className={topic === "all" ? "active" : ""} onClick={() => setTopic("all")} aria-pressed={topic === "all"}>全部</button>
          {(Object.keys(topicName) as SafeTopic[]).map((key) => <button key={key} className={topic === key ? "active" : ""} onClick={() => setTopic(key)} aria-pressed={topic === key}>{topicName[key]}</button>)}
        </div>
        <div className={`leaf-seek ${seekResult ? `state-${seekResult.seekState}` : ""}`} role="status" aria-live="polite">
          <div className="leaf-sensor" aria-hidden="true"><i /><i /><i /><span /></div>
          <div className="leaf-copy">
            <strong>{seekResult ? seekCopy[seekResult.seekState].label : "叶语寻瓜"}</strong>
            <small>{seekResult ? seekCopy[seekResult.seekState].hint : "由你主动感应，只返回粗略接近状态。"}</small>
          </div>
          <button onClick={senseLeaves} disabled={seekBusy || !zoneSpot}>{seekBusy ? "感应中" : seekResult ? "再感应" : "开始感应"}</button>
        </div>
        {seekError && <p className="seek-fallback" role="alert">{seekError} 定位拒绝不影响远方围观。</p>}
        <ol className="seek-scale" aria-label="寻瓜四段状态">
          {(Object.keys(seekCopy) as SeekState[]).map((state) => <li key={state} className={seekResult?.seekState === state ? "current" : ""}>{seekCopy[state].label}</li>)}
        </ol>
      </section>

      <section className="radar-stage" data-testid="radar-surface" aria-label="瓜区信号舞台：只展示代表瓜，不提供路线或精确距离" aria-busy={openingMelon}>
        <div className="radar-grid" aria-hidden="true"><i /><i /><i /><span className="radar-sweep" /></div>
        <CityIsland cityId={cityId} cityName={cityName} radar />
        <div className="radar-origin" aria-hidden="true"><span>猹</span><i /></div>
        {representatives.map((melon, index) => {
          const scene = getSpotScene(melon.spot);
          return <button
            key={melon.id}
            className={`melon-node node-${index + 1} ${melon.status} scene-${scene.kind}`}
            onClick={() => melon.status === "mature" ? onOpen(melon) : onSquat(melon.id)}
            disabled={readOnly && melon.status === "incubating"}
            aria-label={`${melon.status === "mature" ? "吃瓜" : quickSquats.includes(melon.id) ? "取消旁观" : "旁观"}：${topicName[melon.topic]}瓜，${scene.displayName}，${distanceName[melon.distanceBand]}`}
            aria-pressed={melon.status === "incubating" ? quickSquats.includes(melon.id) : undefined}
          >
            <span className="melon-orb" aria-hidden="true"><i /><i /><i /></span>
            <span className="node-label"><strong>{melon.status === "mature" ? "吃瓜" : quickSquats.includes(melon.id) ? "已旁观" : "旁观"}</strong><small>{topicName[melon.topic]} · {scene.displayName}</small></span>
          </button>;
        })}
        <div className="ring-label ring-one">瓜区</div><div className="ring-label ring-two">附近</div><div className="ring-label ring-three">同城</div>
      </section>

      <section className="radar-legend" aria-label="雷达说明">
        <span><i className="legend-mature" />成熟，可吃</span><span><i className="legend-sleep" />孵化中</span>
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
                <p>{melon.status === "mature" ? `${detail?.alias ?? "匿名小动物"} / ${distanceName[melon.distanceBand]} / ${melon.commentCount ?? 0} 条评论` : "旁观不会打扰它成熟"}</p>
              </div>
              <div className="basket-actions">
                {melon.status === "mature" ? <>
                  <button className="basket-primary" onClick={() => onOpen(melon)}>{melon.isRemote ? "远方围观" : "直接吃"}</button>
                  {seekTargetId === melon.id && seekResult?.seekState === "found"
                    ? <button onClick={() => onOpen(melon)}>打开这颗瓜</button>
                    : <button onClick={() => seekMelon(melon)} disabled={seekBusy && seekTargetId === melon.id}>{seekBusy && seekTargetId === melon.id ? "叶语感应中" : seekTargetId === melon.id ? "继续寻瓜" : "去现场找"}</button>}
                  {!readOnly && <button onClick={() => onSquat(melon.id)} aria-pressed={squatted}>{squatted ? "已蹲瓜" : "蹲瓜"}</button>}
                </> : <button className="basket-primary" onClick={() => onSquat(melon.id)} disabled={readOnly} aria-pressed={squatted}>{readOnly ? "只读" : squatted ? "已旁观" : "旁观"}</button>}
              </div>
            </article>;
          }) : <div className="basket-empty"><SproutIcon /><strong>这个话题暂时没有瓜</strong><span>换一个话题，或稍后再听一听。</span></div>}
        </div>
      </section>
      <OpeningCard state={opening} />
    </>
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

function MyField({ field, isOwn, onBury }: { field: FieldView; isOwn: boolean; onBury: () => void }) {
  const stages = [[1, "嫩芽"], [3, "藤蔓"], [7, "花"], [12, "青瓜"], [21, "成熟"]] as const;
  const goal = field.progress.nextStageAt ?? field.progress.seedCount;
  const previous = [...stages].reverse().find(([seed]) => seed <= field.progress.seedCount)?.[0] ?? 0;
  const progress = goal === previous ? 100 : Math.min(100, ((field.progress.seedCount - previous) / (goal - previous)) * 100);
  return (
    <section className="field-view" aria-labelledby="field-title">
      <p className="utility-label"><SproutIcon /> {isOwn ? "MY SUNNY PATCH" : "VISITING PATCH"}</p>
      <h1 id="field-title">{isOwn ? <>我的瓜田，<em>今天也晒着太阳。</em></> : <>{field.alias} <em>的瓜田</em></>}</h1>
      <div className={`field-illustration stage-${field.progress.stage}`} data-testid="field-stage" aria-label={`瓜田阶段：${stages.find(([seed]) => seed === previous)?.[1] ?? "荒地"}`}>
        <div className="field-sun" /><div className="field-soil" /><div className="vine vine-left"><i /><i /><i /></div><div className="vine vine-right"><i /><i /></div><span className="field-flower flower-one">✦</span><span className="field-flower flower-two">✦</span><span className="field-flower flower-three">✦</span>
      </div>
      <div className="field-progress">
        <header><div><span>{field.alias}</span><strong>{field.progress.seedCount} 粒瓜籽 · {stages.find(([seed]) => seed === previous)?.[1] ?? "荒地"}</strong></div><SeedIcon /></header>
        <div className="growth-track"><i style={{ width: `${progress}%` }} /></div>
        <ol>{stages.map(([seed, label]) => <li key={seed} className={field.progress.seedCount >= seed ? (field.progress.seedCount === seed ? "current" : "done") : ""}>{seed} {label}</li>)}</ol>
        <p>{field.progress.nextStageAt ? `再收 ${field.progress.nextStageAt - field.progress.seedCount} 粒，瓜田会长到下一阶段。` : "瓜田已经结出成熟瓜，风一吹就沙沙作响。"}</p>
      </div>
      <section className="my-melons" aria-labelledby="my-melons-title">
        <header><div><h2 id="my-melons-title">{isOwn ? "我埋下的瓜" : `${field.alias} 埋下的瓜`}</h2></div>{isOwn && <button onClick={onBury}><PlusIcon />埋新瓜</button>}</header>
        {field.melons.length ? <div className="field-plots">{field.melons.map((melon) => <article key={melon.id}><span className="plot-melon" aria-hidden="true"/><div><strong>{topicName[melon.topic]}瓜</strong><p>{getSpotScene(melon.spot).displayName}</p><small>{melon.status === "incubating" ? `${formatCountdown(melon.maturesAt)} 后成熟` : "已经成熟"}</small></div></article>)}</div> : isOwn ? <button className="empty-plot" onClick={onBury}><SproutIcon /><strong>这块地还空着</strong><span>去公共地点附近，埋下第一颗瓜</span></button> : <div className="empty-plot is-static"><SproutIcon /><strong>这里还没有公开的瓜</strong><span>过阵子再来串门</span></div>}
      </section>
    </section>
  );
}

function MelonReader({ adapter, opened, onClose, onFinished, onViewField, onSeek, readOnly, initialPresence }: { adapter: IslandAdapter; opened: OpenedMelon; onClose: () => void; onFinished: (result: CompleteReadResult) => void; onViewField: (alias: string) => void; onSeek: (spotId: string) => Promise<ZonePresenceResult>; readOnly: boolean; initialPresence?: ZonePresenceResult }) {
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
          <div className="read-clock" role="status" aria-live="polite" aria-label={completionResult ? (completionResult.readerSeedAwarded ? "完成吃瓜，瓜籽加一" : "已经吃过，本次不重复奖励") : ready ? "已经阅读 5 秒，可以完成吃瓜" : `还需阅读 ${Math.ceil((5000 - elapsed) / 1000)} 秒`}><span style={{ "--progress": `${elapsed / 50}%` } as CSSProperties}>{ready ? <CheckIcon /> : Math.ceil((5000 - elapsed) / 1000)}</span><p><strong>{completionResult ? (completionResult.readerSeedAwarded ? "完成吃瓜 · 瓜籽 +1" : "已经吃过 · 不重复奖励") : ready ? "可以完成吃瓜" : "别急着划走"}</strong><small>{completionResult ? `现在共有 ${completionResult.readerSeedCount} 粒瓜籽` : ready ? "完成后今日有效次数会由服务端判定" : "读满 5 秒，才算认真吃完"}</small></p></div>
          <button className={finished ? "finish-button finished seed-launch" : "finish-button"} aria-label="完成吃瓜" onClick={complete} disabled={!ready || busy || finished}>{finished ? <><CheckIcon /> 已吃完，瓜籽飞进瓜田</> : busy ? "正在留籽…" : "完成吃瓜"}</button>
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
      {!readOnly && !canComment && <button onClick={seek} disabled={seeking}>{seeking ? "叶语感应中" : presence ? "继续寻瓜" : "去现场找"}</button>}
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
    try { await onCreate({ spotId, topic, title: title.trim(), content: content.trim() }); }
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
      aria-label={`${scene.title}的半真实卡通场景：${scene.sceneLabel}。${detail}，不是实景地图。`}
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
  return <main className="island-loading" aria-label="正在听王国里的动静"><div><i/><i/><span>猹</span></div><p>正在听王国里的动静…</p></main>;
}

function IslandUnavailable({ error, onRetry, onDemo }: { error: unknown; onRetry: () => void; onDemo?: () => void }) {
  return <main className="island-unavailable"><div className="unavailable-sun" aria-hidden="true"><span>!</span></div><h1>瓜田信号没接上</h1><p role="alert">{messageFrom(error)}</p><div><button onClick={onRetry}>重新连接</button>{onDemo && <button className="demo-entry" onClick={onDemo}>进入本地试玩</button>}</div>{onDemo && <small>本地试玩使用明确标注的示例数据，不代表真实附近内容，也不会上传或保存。</small>}</main>;
}

function requestLocationProof(): Promise<LocationProof> {
  return new Promise((resolve, reject) => {
    if (!window.isSecureContext) return reject(new Error("当前页面不是安全连接，不能读取位置。仍可按城市继续浏览。" ));
    if (!("geolocation" in navigator)) return reject(new Error("当前浏览器不支持定位。仍可按城市继续浏览。" ));
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracyM: position.coords.accuracy, capturedAt: new Date(position.timestamp).toISOString() }),
      (error) => reject(new Error(error.code === error.PERMISSION_DENIED ? "定位已拒绝 · 已保留城市浏览，埋瓜需要本次定位" : "这次没有取到位置 · 可以重试或继续按城市浏览" )),
      { enableHighAccuracy: false, maximumAge: 0, timeout: 8000 },
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
