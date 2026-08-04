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
  CompleteReadResult,
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
import { demoIslandAdapter, type IslandAdapter, type IslandBootstrap } from "./demo-island-adapter";
import { httpIslandAdapter, isExplicitServiceUnavailable } from "./http-island-adapter";
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

export function ChachaIsland() {
  const [islandAdapter, setIslandAdapter] = useState<IslandAdapter>(httpIslandAdapter);
  const [mode, setMode] = useState<"live" | "demo">("live");
  const [model, setModel] = useState<IslandBootstrap | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [tab, setTab] = useState<"radar" | "field">("radar");
  const [opened, setOpened] = useState<OpenedMelon | null>(null);
  const [commentMelon, setCommentMelon] = useState<OpenedMelon["melon"] | null>(null);
  const [viewedField, setViewedField] = useState<FieldView | null>(null);
  const [quickSquats, setQuickSquats] = useState<string[]>([]);
  const [openingMelon, setOpeningMelon] = useState(false);
  const [showCities, setShowCities] = useState(false);
  const [showBury, setShowBury] = useState(false);
  const [notice, setNotice] = useState("定位未开启 · 正在浏览公开瓜场");

  useEffect(() => {
    let active = true;
    islandAdapter.bootstrap().then(
      (value) => { if (active) setModel(value); },
      (error) => { if (active) setLoadError(error); },
    );
    return () => { active = false; };
  }, [islandAdapter, retryKey]);

  const activeCity = model?.cities.find((city) => city.id === model.discovery.activeCityId);

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
    const active = !quickSquats.includes(id);
    const result = await islandAdapter.setSquat(id, active);
    setQuickSquats((current) => result.active ? [...new Set([...current, id])] : current.filter((value) => value !== id));
    setNotice(result.active ? "已经蹲好，有后续会提醒你" : "已经取消蹲瓜");
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
    <div className="sunny-shell">
      {mode === "demo" && <div className="demo-banner" role="note"><strong>本地试玩</strong><span>示例数据只留在当前页面，不会上传或保存。</span></div>}
      <header className="topbar">
        <button className="brand" onClick={() => setTab("radar")} aria-label="回到雷达岛">
          <span className="brand-glyph" aria-hidden="true">猹</span>
          <span><strong>猹猹岛</strong><small>CHACHA / SUNNY FIELD</small></span>
        </button>
        <div className="topbar-actions">
          <button className="city-switch" onClick={() => setShowCities(true)} aria-label={`当前城市${activeCity.name}，切换城市`}>
            <LocationIcon /><span>{activeCity.name}</span><ChevronIcon />
          </button>
          <span className="seed-count" aria-label={`拥有 ${model.session.seedCount} 粒瓜籽`}><SeedIcon />{model.session.seedCount}</span>
        </div>
      </header>

      <main className="island-main">
        {!opened && !commentMelon && !showBury && !showCities && <div className="live-notice" role="status"><span aria-hidden="true" />{notice}</div>}
        {tab === "radar" ? (
          <RadarView
            items={model.discovery.items}
            details={model.melonDetails}
            quickSquats={quickSquats}
            cityName={activeCity.name}
            visitorLocated={model.discovery.visitorType !== "location_unknown"}
            opening={activeCity.opening}
            openingMelon={openingMelon}
            onLocate={locate}
            onOpen={openMelon}
            onSquat={quickSquat}
            onRefresh={async () => {
              const discovery = await islandAdapter.discover({ selectedCityId: model.discovery.activeCityId });
              setModel({ ...model, discovery });
              setNotice("雷达已重听 · 同区、同城、远方依次排好");
            }}
          />
        ) : (
          <MyField field={viewedField ?? model.field} isOwn={!viewedField} onBury={() => setShowBury(true)} />
        )}
      </main>

      <nav className="bottom-dock" aria-label="主要导航">
        <button className={tab === "radar" ? "active" : ""} onClick={() => setTab("radar")} aria-current={tab === "radar" ? "page" : undefined}><RadarIcon /><span>听瓜</span></button>
        {viewedField ? <button className="bury-button field-return" onClick={() => setViewedField(null)}><FieldIcon /><span>回我的田</span></button> : <button className="bury-button" onClick={() => setShowBury(true)}><PlusIcon /><span>埋瓜</span></button>}
        <button className={tab === "field" ? "active" : ""} onClick={showOwnField} aria-current={tab === "field" ? "page" : undefined}><FieldIcon /><span>瓜田</span></button>
      </nav>

      {opened && <MelonReader adapter={islandAdapter} opened={opened} onClose={() => setOpened(null)} onFinished={finishRead} onComment={() => { setCommentMelon(opened.melon); setOpened(null); }} onViewField={viewField} />}
      {commentMelon && <CommentSheet adapter={islandAdapter} melon={commentMelon} onClose={() => setCommentMelon(null)} />}
      {showCities && <CityPicker model={model} onClose={() => setShowCities(false)} onSelect={selectCity} />}
      {showBury && <BurySheet spots={activeCity.spots} cityName={activeCity.name} onClose={() => setShowBury(false)} onCreate={createMelon} />}
    </div>
  );
}

function RadarView({ items, details, quickSquats, cityName, visitorLocated, opening, openingMelon, onLocate, onOpen, onSquat, onRefresh }: {
  items: MelonPreview[];
  details: IslandBootstrap["melonDetails"];
  quickSquats: string[];
  cityName: string;
  visitorLocated: boolean;
  opening: CityOpeningState;
  openingMelon: boolean;
  onLocate: () => void;
  onOpen: (melon: MelonPreview) => void;
  onSquat: (id: string) => void;
  onRefresh: () => void;
}) {
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

      <section className="radar-stage" data-testid="radar-surface" aria-label="成熟瓜距离雷达：同区、同城、远方依次排列" aria-busy={openingMelon}>
        <div className="radar-grid" aria-hidden="true"><i /><i /><i /><span className="radar-sweep" /></div>
        <div className="radar-origin" aria-hidden="true"><span>猹</span><i /></div>
        {items.slice(0, 5).map((melon, index) => (
          <button
            key={melon.id}
            className={`melon-node node-${index + 1} ${melon.status}`}
            onClick={() => onOpen(melon)}
            aria-label={`${melon.status === "mature" ? "成熟" : "孵化中"}${topicName[melon.topic]}瓜，${melon.spot.name}，${distanceName[melon.distanceBand]}`}
          >
            <span className="melon-orb" aria-hidden="true"><i /><i /><i /></span>
            <span className="node-label"><strong>{topicName[melon.topic]}瓜</strong><small>{melon.spot.name} · {distanceName[melon.distanceBand]}</small></span>
          </button>
        ))}
        <div className="ring-label ring-one">1 km</div><div className="ring-label ring-two">3 km</div><div className="ring-label ring-three">8 km</div>
      </section>

      <section className="radar-legend" aria-label="雷达说明">
        <span><i className="legend-mature" />成熟，可吃</span><span><i className="legend-sleep" />孵化中</span>
        <button onClick={onRefresh}>重新听一圈 <RadarIcon /></button>
      </section>
      <section className="radar-cards" aria-label="雷达发现的成熟瓜">
        <header><span className="utility-label">FIELD LOG / MATURE</span><h2>今天田里冒出的故事</h2></header>
        {items.filter((melon) => melon.status === "mature").map((melon) => {
          const detail = details[melon.id];
          if (!detail) return null;
          const squatted = quickSquats.includes(melon.id);
          return <article key={melon.id} aria-label={detail.title}>
            <div className="card-signal" aria-hidden="true"><span/><i/><i/></div>
            <div className="card-copy"><span>{topicName[melon.topic]}瓜 · {melon.spot.name}</span><h3>{detail.title}</h3><p>{detail.alias} · {distanceName[melon.distanceBand]}</p></div>
            <div className="card-actions"><button onClick={() => onOpen(melon)}>打开这颗瓜</button><button onClick={() => onSquat(melon.id)} aria-pressed={squatted}>{squatted ? "取消蹲瓜" : "蹲瓜"}</button></div>
          </article>;
        })}
      </section>
      <OpeningCard state={opening} />
    </>
  );
}

function OpeningCard({ state }: { state: CityOpeningState }) {
  const items = [["安全瓜", state.safeMelons, 30], ["瓜主", state.distinctAuthors, 25], ["地点", state.distinctSpots, 3], ["话题", state.distinctTopics, 3]] as const;
  if (state.status === "open") return <section className="opening-card is-open"><span className="utility-label">ISLAND OPEN</span><h2>岛上的灯已经亮了</h2><p>今晚的成熟瓜正按距离向外扩散。</p></section>;
  return (
    <section className="opening-card" aria-labelledby="opening-title">
      <header><span className="utility-label">CITY / OPENING</span><strong>{state.status === "countdown" ? "正在倒数开岛" : "继续攒热闹"}</strong></header>
      <div><h2 id="opening-title">这座城正在攒一场热闹</h2><p>四项都满后，次日 20:00 开岛。</p></div>
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
        <header><div><span className="utility-label">BURIED HERE</span><h2 id="my-melons-title">{isOwn ? "我埋下的瓜" : `${field.alias} 埋下的瓜`}</h2></div>{isOwn && <button onClick={onBury}><PlusIcon />埋新瓜</button>}</header>
        {field.melons.length ? <div className="field-plots">{field.melons.map((melon) => <article key={melon.id}><span className="plot-melon" aria-hidden="true"/><div><strong>{topicName[melon.topic]}瓜</strong><p>{melon.spot.name}</p><small>{melon.status === "incubating" ? `${formatCountdown(melon.maturesAt)} 后成熟` : "已经成熟"}</small></div></article>)}</div> : isOwn ? <button className="empty-plot" onClick={onBury}><SproutIcon /><strong>这块地还空着</strong><span>去公共地点附近，埋下第一颗瓜</span></button> : <div className="empty-plot is-static"><SproutIcon /><strong>这里还没有公开的瓜</strong><span>过阵子再来串门</span></div>}
      </section>
    </section>
  );
}

function MelonReader({ adapter, opened, onClose, onFinished, onComment, onViewField }: { adapter: IslandAdapter; opened: OpenedMelon; onClose: () => void; onFinished: (result: CompleteReadResult) => void; onComment: () => void; onViewField: (alias: string) => void }) {
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
    <Sheet title={opened.melon.title} subtitle={`${opened.melon.spot.name} · ${opened.melon.alias}`} onClose={onClose} wide>
      <article className="melon-reader">
        <div className="reader-meta"><span>{topicName[opened.melon.topic]}瓜</span><span>{distanceName[opened.melon.distanceBand]}</span><button onClick={toggleSquat} aria-pressed={squatted}>{squatted ? <CheckIcon /> : <SproutIcon />}{squatted ? "取消蹲瓜" : "蹲瓜"}</button></div>
        <div className="reader-links"><a href={`/fields/${encodeURIComponent(opened.melon.alias)}`} onClick={(event) => { event.preventDefault(); onViewField(opened.melon.alias); }}>查看 {opened.melon.alias} 的瓜田</a><button onClick={onComment}><MessageIcon />评论</button></div>
        <div className="peel-story" style={peelStyle}>
          <div className="story-paper"><p>{opened.melon.content}</p><footer>—— {opened.melon.alias}</footer></div>
          <div className="melon-peel" aria-hidden="true"><i /><i /><i /><span>{ready ? "瓜瓤见底了" : "慢慢剥开…"}</span></div>
        </div>
        <div className="read-finish">
          <div className="read-clock" role="status" aria-live="polite" aria-label={completionResult ? (completionResult.readerSeedAwarded ? "完成吃瓜，瓜籽加一" : "已经吃过，本次不重复奖励") : ready ? "已经阅读 5 秒，可以完成吃瓜" : `还需阅读 ${Math.ceil((5000 - elapsed) / 1000)} 秒`}><span style={{ "--progress": `${elapsed / 50}%` } as CSSProperties}>{ready ? <CheckIcon /> : Math.ceil((5000 - elapsed) / 1000)}</span><p><strong>{completionResult ? (completionResult.readerSeedAwarded ? "完成吃瓜 · 瓜籽 +1" : "已经吃过 · 不重复奖励") : ready ? "可以完成吃瓜" : "别急着划走"}</strong><small>{completionResult ? `现在共有 ${completionResult.readerSeedCount} 粒瓜籽` : ready ? "完成后今日有效次数会由服务端判定" : "读满 5 秒，才算认真吃完"}</small></p></div>
          <button className={finished ? "finish-button finished seed-launch" : "finish-button"} aria-label="完成吃瓜" onClick={complete} disabled={!ready || busy || finished}>{finished ? <><CheckIcon /> 已吃完，瓜籽飞进瓜田</> : busy ? "正在留籽…" : "完成吃瓜"}</button>
          {error && <p className="form-error" role="alert">{error}</p>}
        </div>
        <div className="reaction-row" aria-label="轻反应">{reactionMeta.map(([key, label, glyph]) => <button key={key} onClick={() => react(key)} disabled={reacted.includes(key)} aria-label={`${label}，当前 ${reactions[key]} 次${reacted.includes(key) ? "，已留下" : ""}`}><span aria-hidden="true">{reacted.includes(key) ? "✓" : glyph}</span>{label}<small>{reactions[key]}</small></button>)}</div>
      </article>
    </Sheet>
  );
}

function CommentSheet({ adapter, melon, onClose }: { adapter: IslandAdapter; melon: OpenedMelon["melon"]; onClose: () => void }) {
  const [comments, setComments] = useState<MelonComment[]>([]);
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    adapter.comments(melon.id).then((value) => { if (active) setComments(value); });
    return () => { active = false; };
  }, [adapter, melon.id]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const comment = content.trim();
    if (!comment) return;
    setBusy(true); setError(null);
    try {
      const created = await adapter.comment(melon.id, comment);
      setComments((current) => [...current, created]);
      setContent("");
    } catch (caught) { setError(messageFrom(caught)); }
    finally { setBusy(false); }
  };

  return <Sheet title="评论" subtitle={melon.title} onClose={onClose}>
    <section className="comments" aria-label="评论区">
      {comments.length ? <div className="comment-list">{comments.map((item) => <article key={item.id}><strong>{item.alias}</strong><p>{item.content}</p></article>)}</div> : <p className="comment-empty">还没人说话。留一句轻一点的回声。</p>}
      <form onSubmit={submit}><label htmlFor="comment-content">评论内容</label><textarea id="comment-content" value={content} onChange={(event) => setContent(event.target.value)} maxLength={140} placeholder="匿名留句话，不超过 140 字…" /><div><small>{content.length}/140</small><button disabled={!content.trim() || busy}>{busy ? "正在发表…" : "发表评论"}</button></div>{error && <p className="form-error" role="alert">{error}</p>}</form>
    </section>
  </Sheet>;
}

function CityPicker({ model, onClose, onSelect }: { model: IslandBootstrap; onClose: () => void; onSelect: (city: CityId) => void }) {
  return <Sheet title="换一座岛逛逛" subtitle="选择城市不需要精确位置" onClose={onClose}><div className="city-list">{model.cities.map((city) => <button key={city.id} onClick={() => onSelect(city.id)} className={city.id === model.discovery.activeCityId ? "selected" : ""}><span className="city-sun" aria-hidden="true"/><span><strong>{city.name}</strong><small>{city.opening.status === "open" ? "已开岛" : `${city.opening.safeMelons}/30 颗安全瓜`}</small></span>{city.id === model.discovery.activeCityId && <i>正在逛</i>}<ChevronIcon /></button>)}</div><p className="privacy-copy"><LocationIcon />定位被拒绝时仍可按城市浏览和蹲瓜；只有埋瓜需要在公共地点附近完成一次距离验证。</p></Sheet>;
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
      <form className="bury-form" aria-label="埋瓜" onSubmit={submit}>
        <label htmlFor={spotInputId}><span>公共地点</span><select id={spotInputId} value={spotId} onChange={(event) => setSpotId(event.target.value)}><option value="">请选择公开地点</option>{spots.map((spot) => <option value={spot.id} key={spot.id}>{spot.name}</option>)}</select></label>
        <label htmlFor={topicInputId}><span>话题</span><select id={topicInputId} value={topic} onChange={(event) => setTopic(event.target.value as SafeTopic)}>{(Object.keys(topicName) as SafeTopic[]).map((key) => <option value={key} key={key}>{topicName[key]}</option>)}</select></label>
        <label htmlFor={titleInputId}><span>标题</span><input id={titleInputId} value={title} onChange={(event) => setTitle(event.target.value)} maxLength={42} placeholder="一句话说清发生了什么"/><small>{title.length}/42</small></label>
        <label htmlFor={contentInputId}><span>故事内容</span><textarea id={contentInputId} value={content} onChange={(event) => setContent(event.target.value)} maxLength={800} placeholder="不写联系方式、精确住址或可识别他人的隐私…"/><small>{content.length}/800</small></label>
        <div className="location-gate"><LocationIcon /><p><strong>发布时才请求一次定位</strong>只用于确认你在所选公共地点 500 米内；不会保存、输出或写进日志。拒绝后仍可继续逛岛。</p></div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="bury-submit" disabled={busy}>{busy ? "正在验证距离…" : "埋下这颗瓜"}</button>
      </form>
    </Sheet>
  );
}

function Sheet({ title, subtitle, onClose, children, wide = false }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
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
  return <div className="sheet-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section ref={sheetRef} className={wide ? "sheet wide" : "sheet"} role="dialog" aria-modal="true" aria-labelledby={titleId}><div className="sheet-handle" aria-hidden="true"/><header className="sheet-header"><div><h2 id={titleId}>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button ref={closeRef} onClick={onClose} aria-label="关闭"><CloseIcon /></button></header>{children}</section></div>;
}

function IslandLoading() {
  return <main className="island-loading" aria-label="正在听岛上的动静"><div><i/><i/><span>猹</span></div><p>正在听岛上的动静…</p></main>;
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

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "这次没有成功，请稍后再试。";
}
