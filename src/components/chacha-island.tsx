"use client";

import {
  type CSSProperties,
  type FormEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import type {
  CityId,
  CityOpeningState,
  CreateMelonRequest,
  DistanceBand,
  FieldView,
  LocationProof,
  MelonComment,
  MelonPreview,
  OpenedMelon,
  ReactionType,
  SafeTopic,
} from "@/contracts";
import { demoIslandAdapter, type IslandBootstrap } from "./demo-island-adapter";
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
} from "./icons";

const topicName: Record<SafeTopic, string> = {
  daily: "日常",
  work: "职场",
  relationship: "关系",
  food: "吃喝",
  neighborhood: "邻里",
};

const distanceName: Record<DistanceBand, string> = {
  within_1km: "1 km 内",
  within_3km: "3 km 内",
  within_8km: "8 km 内",
  within_20km: "20 km 内",
  remote: "远方",
};

const reactionMeta: Array<[ReactionType, string, string]> = [
  ["juicy", "有汁", "◒"],
  ["wild", "离谱", "≋"],
  ["hug", "抱抱", "⌒"],
  ["follow_up", "蹲后续", "…"],
];

const adapter = demoIslandAdapter;

export function ChachaIsland() {
  const [model, setModel] = useState<IslandBootstrap | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<"radar" | "field">("radar");
  const [opened, setOpened] = useState<OpenedMelon | null>(null);
  const [openingMelon, setOpeningMelon] = useState(false);
  const [showCities, setShowCities] = useState(false);
  const [showBury, setShowBury] = useState(false);
  const [notice, setNotice] = useState("定位未开启 · 正在浏览公开瓜场");

  useEffect(() => {
    let active = true;
    adapter.bootstrap()
      .then((value) => {
        if (!active) return;
        setModel(value);
        setLoadError(null);
      })
      .catch((error) => active && setLoadError(messageFrom(error)));
    return () => { active = false; };
  }, []);

  const activeCity = model?.cities.find((city) => city.id === model.discovery.activeCityId);

  const selectCity = async (cityId: CityId) => {
    if (!model) return;
    const discovery = await adapter.discover({ selectedCityId: cityId });
    setModel({ ...model, discovery });
    setShowCities(false);
    setNotice(`已切到${model.cities.find((city) => city.id === cityId)?.name ?? "这座城"}公开瓜场 · 未使用精确位置`);
  };

  const locate = async () => {
    if (!model) return;
    try {
      const location = await requestLocationProof();
      const discovery = await adapter.discover({ location, selectedCityId: model.discovery.activeCityId });
      setModel({ ...model, discovery });
      setNotice("本次距离校准完成 · 精确位置未保存");
    } catch (error) {
      setNotice(messageFrom(error));
      setShowCities(true);
    }
  };

  const openMelon = async (preview: MelonPreview) => {
    if (preview.status === "incubating") {
      setNotice(`这颗瓜还在长，约 ${formatCountdown(preview.maturesAt)} 后成熟`);
      return;
    }
    setOpeningMelon(true);
    try {
      setOpened(await adapter.openMelon(preview.id));
    } catch (error) {
      setNotice(messageFrom(error));
    } finally {
      setOpeningMelon(false);
    }
  };

  const finishRead = async (seedCount: number) => {
    if (!model) return;
    const field = await adapter.field();
    setModel({ ...model, session: { ...model.session, seedCount }, field });
    setNotice("这颗瓜吃完了 · 瓜籽 +1");
  };

  const createMelon = async (input: Omit<CreateMelonRequest, "location">) => {
    const location = await requestLocationProof();
    const result = await adapter.createMelon({ ...input, location });
    const field = await adapter.field();
    if (model) setModel({ ...model, field });
    setShowBury(false);
    setTab("field");
    setNotice(result.status === "held" ? "这颗瓜需要人工复核，暂时不会成熟" : "瓜埋好了 · 约 2 小时后成熟");
  };

  if (loadError) return <IslandLoadError message={loadError} />;
  if (!model || !activeCity) return <IslandLoading />;

  return (
    <div className="island-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setTab("radar")} aria-label="回到猹猹岛首页">
          <span className="brand-glyph" aria-hidden="true"><span /></span>
          <span><strong>猹猹岛</strong><small>附近有瓜，先吃再说</small></span>
        </button>
        <div className="topbar-actions">
          <span className="play-label">本地试玩</span>
          <button className="city-switch" onClick={() => setShowCities(true)} aria-label={`当前城市${activeCity.name}，切换城市`}>
            <LocationIcon /><span>{activeCity.name}</span><ChevronIcon />
          </button>
          <span className="seed-count" aria-label={`拥有 ${model.session.seedCount} 粒瓜籽`}><SeedIcon />{model.session.seedCount}</span>
        </div>
      </header>

      <main className="island-main">
        <div className="live-notice" role="status"><span aria-hidden="true" />{notice}</div>
        {tab === "radar" ? (
          <RadarView
            items={model.discovery.items}
            cityId={activeCity.id}
            cityName={activeCity.name}
            visitorLocated={model.discovery.visitorType !== "location_unknown"}
            opening={activeCity.opening}
            openingMelon={openingMelon}
            onLocate={locate}
            onOpen={openMelon}
            onRefresh={async () => {
              const discovery = await adapter.discover({ selectedCityId: model.discovery.activeCityId });
              setModel({ ...model, discovery });
              setNotice("雷达已重听 · 同区、同城、远方依次排好");
            }}
          />
        ) : (
          <MyField field={model.field} onBury={() => setShowBury(true)} />
        )}
      </main>

      <nav className="bottom-dock" aria-label="主要导航">
        <button className={tab === "radar" ? "active" : ""} onClick={() => setTab("radar")} aria-current={tab === "radar" ? "page" : undefined}><RadarIcon /><span>听瓜</span></button>
        <button className="bury-button" onClick={() => setShowBury(true)}><PlusIcon /><span>埋瓜</span></button>
        <button className={tab === "field" ? "active" : ""} onClick={() => setTab("field")} aria-current={tab === "field" ? "page" : undefined}><FieldIcon /><span>瓜田</span></button>
      </nav>

      {opened && <MelonReader opened={opened} onClose={() => setOpened(null)} onFinished={finishRead} />}
      {showCities && <CityPicker model={model} onClose={() => setShowCities(false)} onSelect={selectCity} />}
      {showBury && <BurySheet spots={activeCity.spots} cityName={activeCity.name} onClose={() => setShowBury(false)} onCreate={createMelon} />}
    </div>
  );
}

function RadarView({ items, cityId, cityName, visitorLocated, opening, openingMelon, onLocate, onOpen, onRefresh }: {
  items: MelonPreview[];
  cityId: CityId;
  cityName: string;
  visitorLocated: boolean;
  opening: CityOpeningState;
  openingMelon: boolean;
  onLocate: () => void;
  onOpen: (melon: MelonPreview) => void;
  onRefresh: () => void;
}) {
  const localSpotId = items.find((item) => item.cityId === cityId)?.spot.id;
  const cityVisual = getSpotScene(cityId, localSpotId);
  return (
    <div className="radar-view">
      <section className="radar-intro" aria-labelledby="radar-title">
        <p className="utility-label"><RadarIcon /> {cityName}主岛</p>
        <h1 id="radar-title">附近有瓜，<em>先吃再说。</em></h1>
        <p className="intro-copy">公共瓜点会长出土堆。成熟后，从附近慢慢传向整座城。</p>
        <button className={visitorLocated ? "location-calibrated" : "location-callout"} onClick={onLocate}>
          {visitorLocated ? <CheckIcon /> : <LocationIcon />}
          <span><strong>{visitorLocated ? "距离已校准" : "校准附近距离"}</strong><small>{visitorLocated ? "本次精确位置不会保存" : "拒绝也能按城市继续浏览"}</small></span>
        </button>
      </section>

      <section className="radar-stage" aria-label={`${cityVisual.islandLabel}，${cityVisual.sceneLabel}是象征性远景，不是导航地图`} aria-busy={openingMelon}>
        <div className="sky-scene" aria-hidden="true"><span className="sun" /><i className="cloud cloud-one" /><i className="cloud cloud-two" /></div>
        <div className={`city-landmark landmark-${cityVisual.sceneKind}`} role="img" aria-label={cityVisual.sceneLabel}><i /><i /><i /><span /></div>
        <div className="island-land" aria-hidden="true"><span className="island-bank" /><i className="island-tree tree-one" /><i className="island-tree tree-two" /><i className="island-bridge" /></div>
        <div className="discovery-rings" aria-hidden="true"><i /><i /><i /><span /></div>
        <div className="radar-origin" aria-hidden="true"><span>猹</span><i /></div>
        <div className="melon-nodes">
          {items.slice(0, 5).map((melon, index) => (
            <article key={melon.id} className={`melon-node node-${index + 1} ${melon.status}`} aria-label={`${melon.status === "mature" ? "成熟" : "生长中"}${topicName[melon.topic]}瓜，${melon.spot.name}，${distanceName[melon.distanceBand]}`}>
              <button onClick={() => onOpen(melon)} aria-label={melon.status === "mature" ? "打开这颗瓜" : `查看土堆，${formatCountdown(melon.maturesAt)}后成熟`}>
                <span className="melon-orb" aria-hidden="true"><i /><i /><i /></span>
                <span className="node-label"><strong>{melon.status === "mature" ? "可以吃了" : formatCountdown(melon.maturesAt)}</strong><small>{melon.spot.name}</small></span>
              </button>
            </article>
          ))}
        </div>
        {!items.length && <div className="radar-empty"><SproutIcon /><strong>这座岛正在长第一颗瓜</strong><span>换座岛看看，或稍后再来。</span></div>}
      </section>

      <section className="radar-legend" aria-label="雷达说明">
        <span><i className="legend-mature" />成熟，可吃</span><span><i className="legend-sleep" />土堆，生长中</span>
        <button onClick={onRefresh}>看看新瓜 <RadarIcon /></button>
      </section>
      <OpeningCard state={opening} />
    </div>
  );
}

function OpeningCard({ state }: { state: CityOpeningState }) {
  const items = [["安全瓜", state.safeMelons, 30], ["瓜主", state.distinctAuthors, 25], ["地点", state.distinctSpots, 3], ["话题", state.distinctTopics, 3]] as const;
  if (state.status === "open") return <section className="opening-card is-open"><span className="utility-label">今天已开岛</span><h2>瓜正从附近传过来</h2><p>先看 1 km 内的瓜，没人吃时会慢慢传远。</p></section>;
  return (
    <section className="opening-card" aria-labelledby="opening-title">
      <header><span className="utility-label">开岛进度</span><strong>{state.status === "countdown" ? "正在倒数开岛" : "继续攒热闹"}</strong></header>
      <div><h2 id="opening-title">这座城正在攒一场热闹</h2><p>四项都满后，次日 20:00 开岛。</p></div>
      <ul>{items.map(([label, value, goal]) => <li key={label}><span>{label}</span><strong>{value}<small> / {goal}</small></strong></li>)}</ul>
    </section>
  );
}

function MyField({ field, onBury }: { field: FieldView; onBury: () => void }) {
  const stages = [[1, "嫩芽"], [3, "藤蔓"], [7, "花"], [12, "青瓜"], [21, "成熟"]] as const;
  const goal = field.progress.nextStageAt ?? field.progress.seedCount;
  const previous = [...stages].reverse().find(([seed]) => seed <= field.progress.seedCount)?.[0] ?? 0;
  const progress = goal === previous ? 100 : Math.min(100, ((field.progress.seedCount - previous) / (goal - previous)) * 100);
  return (
    <section className="field-view" aria-labelledby="field-title">
      <p className="utility-label"><SproutIcon /> 我的地块</p>
      <h1 id="field-title">今天的瓜籽，<em>已经发芽了。</em></h1>
      <div className={`field-illustration stage-${field.progress.stage}`} aria-label={`瓜田阶段：${stages.find(([seed]) => seed === previous)?.[1] ?? "荒地"}`}>
        <div className="field-sun" /><div className="field-hill hill-back" /><div className="field-hill hill-front" /><div className="field-soil" /><div className="vine vine-left"><i /><i /><i /></div><div className="vine vine-right"><i /><i /></div><span className="field-flower flower-one"/><span className="field-flower flower-two"/><span className="field-flower flower-three"/>
      </div>
      <div className="field-progress">
        <header><div><span>{field.alias}</span><strong>{field.progress.seedCount} 粒瓜籽 · {stages.find(([seed]) => seed === previous)?.[1] ?? "荒地"}</strong></div><SeedIcon /></header>
        <div className="growth-track"><i style={{ width: `${progress}%` }} /></div>
        <ol>{stages.map(([seed, label]) => <li key={seed} className={field.progress.seedCount >= seed ? (field.progress.seedCount === seed ? "current" : "done") : ""}>{seed} {label}</li>)}</ol>
        <p>{field.progress.nextStageAt ? `再收 ${field.progress.nextStageAt - field.progress.seedCount} 粒，瓜田会长到下一阶段。` : "瓜田已经结出成熟瓜，风一吹就沙沙作响。"}</p>
      </div>
      <section className="my-melons" aria-labelledby="my-melons-title">
        <header><div><span className="utility-label">岛上足迹</span><h2 id="my-melons-title">我埋下的瓜</h2></div><button onClick={onBury}><PlusIcon />埋新瓜</button></header>
        {field.melons.length ? <div className="field-plots">{field.melons.map((melon) => <article key={melon.id}><span className="plot-melon" aria-hidden="true"/><div><strong>{topicName[melon.topic]}瓜</strong><p>{melon.spot.name}</p><small>{melon.status === "incubating" ? `${formatCountdown(melon.maturesAt)} 后成熟` : "已经成熟"}</small></div></article>)}</div> : <button className="empty-plot" onClick={onBury}><SproutIcon /><strong>这块地还空着</strong><span>去公共地点附近，埋下第一颗瓜</span></button>}
      </section>
    </section>
  );
}

function MelonReader({ opened, onClose, onFinished }: { opened: OpenedMelon; onClose: () => void; onFinished: (seedCount: number) => void }) {
  const [elapsed, setElapsed] = useState(0);
  const [finished, setFinished] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [squatted, setSquatted] = useState(opened.melon.squatted);
  const [reactions, setReactions] = useState(opened.melon.reactions);
  const [reacted, setReacted] = useState<ReactionType[]>([]);
  const [comments, setComments] = useState<MelonComment[]>([]);
  const [comment, setComment] = useState("");
  useEffect(() => {
    const start = window.performance.now();
    const timer = window.setInterval(
      () => setElapsed(Math.min(5000, window.performance.now() - start)),
      100,
    );
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    adapter.comments(opened.melon.id).then((value) => active && setComments(value));
    return () => { active = false; };
  }, [opened.melon.id]);

  const ready = elapsed >= 5000;
  const peel = Math.max(12, elapsed / 50);
  const peelStyle = { "--peel": `${peel}%` } as CSSProperties;

  const complete = async () => {
    setBusy(true); setError(null);
    try {
      const result = await adapter.completeRead(opened.melon.id, { readToken: opened.readToken });
      setFinished(true);
      await onFinished(result.readerSeedCount);
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

  const submitComment = async (event: FormEvent) => {
    event.preventDefault();
    const content = comment.trim();
    if (!content) return;
    const created = await adapter.comment(opened.melon.id, content);
    setComments((current) => [...current, created]);
    setComment("");
  };

  return (
    <Sheet title="打开一颗瓜" dialogLabel={opened.melon.title} subtitle={`${opened.melon.spot.name} · ${opened.melon.alias}`} onClose={onClose} wide>
      <article className="melon-reader">
        <div className="reader-meta"><span>{topicName[opened.melon.topic]}瓜</span><span>{distanceName[opened.melon.distanceBand]}</span><button onClick={toggleSquat} aria-pressed={squatted} aria-label={squatted ? "取消蹲瓜" : "蹲瓜"}>{squatted ? <CheckIcon /> : <SproutIcon />}{squatted ? "已蹲后续" : "蹲后续"}</button></div>
        <h2>{opened.melon.title}</h2>
        <div className="peel-story" style={peelStyle}>
          <div className="story-paper"><p>{opened.melon.content}</p><footer>来自 {opened.melon.alias}</footer></div>
          <div className="melon-peel" aria-hidden="true"><i /><i /><i /><span>{ready ? "瓜瓤见底了" : "慢慢剥开…"}</span></div>
        </div>
        <div className="read-finish">
          <div className="read-clock" role="status" aria-live="polite" aria-label={ready ? "已经阅读 5 秒" : `还需阅读 ${Math.ceil((5000 - elapsed) / 1000)} 秒`}><span style={{ "--progress": `${elapsed / 50}%` } as CSSProperties}>{ready ? <CheckIcon /> : Math.ceil((5000 - elapsed) / 1000)}</span><p><strong>{ready ? "可以留籽了" : "别急着划走"}</strong><small>{ready ? "完成后今日有效次数会在服务端判定" : "读满 5 秒，才算认真吃完"}</small></p></div>
          <button className={finished ? "finish-button finished" : "finish-button"} aria-label="完成吃瓜" onClick={complete} disabled={!ready || busy || finished}>{finished ? <><CheckIcon /> 已吃完，瓜籽留下了</> : busy ? "正在留籽…" : "完成吃瓜，留一粒瓜籽"}</button>
          {error && <p className="form-error" role="alert">{error}</p>}
        </div>
        <div className="reaction-row" aria-label="轻反应">{reactionMeta.map(([key, label, glyph]) => <button key={key} onClick={() => react(key)} disabled={reacted.includes(key)} aria-label={`${label}，当前 ${reactions[key]} 次${reacted.includes(key) ? "，已留下" : ""}`}><span aria-hidden="true">{reacted.includes(key) ? "✓" : glyph}</span>{label}<small>{reactions[key]}</small></button>)}</div>
        <section className="comments" aria-labelledby="comments-title"><header><h3 id="comments-title">瓜田回声</h3><span>{comments.length} 条</span></header>{comments.length ? <div className="comment-list">{comments.map((item) => <article key={item.id}><strong>{item.alias}</strong><p>{item.content}</p></article>)}</div> : <p className="comment-empty">还没人说话。留一句轻一点的回声。</p>}<form onSubmit={submitComment}><label><span className="sr-only">评论，最多 140 字</span><textarea value={comment} onChange={(event) => setComment(event.target.value)} maxLength={140} placeholder="匿名留句话，不超过 140 字…" /></label><div><small>{comment.length}/140</small><button disabled={!comment.trim()}>留下回声 <MessageIcon /></button></div></form></section>
      </article>
    </Sheet>
  );
}

function CityPicker({ model, onClose, onSelect }: { model: IslandBootstrap; onClose: () => void; onSelect: (city: CityId) => void }) {
  return <Sheet title="换一座岛看看" subtitle="每座城是一座主岛，地标只是象征性远景" onClose={onClose}><div className="city-list">{model.cities.map((city) => <button key={city.id} onClick={() => onSelect(city.id)} className={city.id === model.discovery.activeCityId ? "selected" : ""}><span className={`city-island city-island-${city.id}`} aria-hidden="true"/><span><strong>{city.name}</strong><small>{city.opening.status === "open" ? "已开岛" : `${city.opening.safeMelons}/30 颗安全瓜`}</small></span>{city.id === model.discovery.activeCityId && <i>正在逛</i>}<ChevronIcon /></button>)}</div><p className="privacy-copy"><LocationIcon />定位被拒绝时仍可按城市浏览和蹲瓜；只有埋瓜需要在公共地点附近完成一次距离验证。</p></Sheet>;
}

function BurySheet({ spots, cityName, onClose, onCreate }: { spots: IslandBootstrap["cities"][number]["spots"]; cityName: string; onClose: () => void; onCreate: (input: Omit<CreateMelonRequest, "location">) => Promise<void> }) {
  const [spotId, setSpotId] = useState(spots[0]?.id ?? "");
  const [topic, setTopic] = useState<SafeTopic>("daily");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <Sheet title="埋下一颗瓜" subtitle={`会埋在${cityName}的公开地点附近`} onClose={onClose}>
      <form className="bury-form" onSubmit={submit}>
        <fieldset><legend>选一个公开地点</legend><div className="spot-grid">{spots.map((spot) => <button type="button" key={spot.id} className={spotId === spot.id ? "selected" : ""} onClick={() => setSpotId(spot.id)}><LocationIcon /><span>{spot.name}</span>{spotId === spot.id && <CheckIcon />}</button>)}</div></fieldset>
        <fieldset><legend>这是什么瓜</legend><div className="topic-grid">{(Object.keys(topicName) as SafeTopic[]).map((key) => <button type="button" key={key} className={topic === key ? "selected" : ""} onClick={() => setTopic(key)}>{topicName[key]}</button>)}</div></fieldset>
        <label><span>给瓜起个名字</span><input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={42} placeholder="一句话说清发生了什么"/><small>{title.length}/42</small></label>
        <label><span>把故事埋进土里</span><textarea value={content} onChange={(event) => setContent(event.target.value)} maxLength={800} placeholder="不写联系方式、精确住址或可识别他人的隐私…"/><small>{content.length}/800</small></label>
        <div className="location-gate"><LocationIcon /><p><strong>发布时才请求一次定位</strong>只用于确认你在所选公共地点 500 米内；不会保存、输出或写进日志。拒绝后仍可继续逛岛。</p></div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="bury-submit" disabled={busy}>{busy ? "正在验证距离…" : "验证位置并埋瓜"}</button>
      </form>
    </Sheet>
  );
}

function Sheet({ title, dialogLabel, subtitle, onClose, children, wide = false }: { title: string; dialogLabel?: string; subtitle?: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
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
  return <div className="sheet-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section ref={sheetRef} className={wide ? "sheet wide" : "sheet"} role="dialog" aria-modal="true" aria-label={dialogLabel} aria-labelledby={dialogLabel ? undefined : titleId}><div className="sheet-handle" aria-hidden="true"/><header className="sheet-header"><div><h2 id={titleId}>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button ref={closeRef} onClick={onClose} aria-label="关闭"><CloseIcon /></button></header>{children}</section></div>;
}

function IslandLoading() {
  return <main className="island-loading" aria-label="正在把瓜田搬上岛"><div><i/><i/><span>猹</span></div><p>正在把瓜田搬上岛…</p></main>;
}

function IslandLoadError({ message }: { message: string }) {
  return <main className="island-load-error"><SproutIcon /><h1>这座岛暂时没长出来</h1><p>{message}</p><button onClick={() => window.location.reload()}>重新登岛</button><small>也可以稍后再来，本地草稿不会因此公开。</small></main>;
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

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "这次没有成功，请稍后再试。";
}
