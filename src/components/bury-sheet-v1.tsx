"use client";

import { type FormEvent, useId, useRef, useState } from "react";
import type { BurialKind, CitySummary, CreateMelonRequest, SafeTopic } from "@/contracts";
import { getSpotScene } from "./city-visuals";
import { CheckIcon, CloseIcon, LocationIcon, RadarIcon } from "./icons";

const topicName: Record<SafeTopic, string> = {
  daily: "日常",
  work: "职场",
  relationship: "关系",
  food: "吃喝",
  neighborhood: "邻里",
};

export function BurySheetV1({
  spots,
  cityName,
  demoMode,
  onClose,
  onCreate,
}: {
  spots: CitySummary["spots"];
  cityName: string;
  demoMode: boolean;
  onClose: () => void;
  onCreate: (input: Omit<CreateMelonRequest, "location">) => Promise<void>;
}) {
  const titleId = useId();
  const topicInputId = useId();
  const titleInputId = useId();
  const contentInputId = useId();
  const [operationId] = useState(() => createOperationId());
  const [buryMode, setBuryMode] = useState<BurialKind>("nearby_area");
  const [spotId, setSpotId] = useState(spots[0]?.id ?? "");
  const [topic, setTopic] = useState<SafeTopic>("daily");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const selectedSpot = spots.find((spot) => spot.id === spotId);
  const missingItems = [
    buryMode === "public_spot" && !spotId ? "请选择公共地点" : "",
    title.trim().length < 4 ? "标题至少 4 个字" : "",
    content.trim().length < 20 ? "故事至少 20 个字" : "",
  ].filter(Boolean);
  const canSubmit = !busy && missingItems.length === 0;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (buryMode === "public_spot" && !spotId) return setError("请选择公共地点。");
    if (title.trim().length < 4) return setError("标题至少写 4 个字。");
    if (content.trim().length < 20) return setError("故事至少写 20 个字。");
    setBusy(true);
    try {
      await onCreate(buryMode === "nearby_area"
        ? { operationId, burialKind: "nearby_area", topic, title: title.trim(), content: content.trim(), revealMode: "open" }
        : { operationId, burialKind: "public_spot", spotId, topic, title: title.trim(), content: content.trim(), revealMode: "open" });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "这次没有成功，请稍后再试。");
      window.requestAnimationFrame(() => {
        errorRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        errorRef.current?.focus({ preventScroll: true });
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sheet-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="sheet stealth-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="sheet-handle" aria-hidden="true" />
        <header className="sheet-header">
          <div><h2 id={titleId}>埋下一颗瓜</h2><p>选择埋入{cityName}的生活圈或公共地点</p></div>
          <button onClick={onClose} aria-label="关闭"><CloseIcon /></button>
        </header>
        <div className="sheet-body">
          <form className="bury-form" aria-label="埋瓜" onSubmit={submit}>
            <div className="stealth-cue is-bury"><span aria-hidden="true"><i /><i /><i /></span><p><strong>把秘密压进土里</strong><small>只留下模糊归属，精确位置不进瓜田。</small></p></div>
            <fieldset className="bury-mode-picker">
              <legend>埋瓜方式</legend>
              <button type="button" className={buryMode === "nearby_area" ? "selected" : ""} aria-pressed={buryMode === "nearby_area"} onClick={() => { setBuryMode("nearby_area"); setError(null); }}>
                <LocationIcon />
                <span><strong>附近生活圈</strong><small>500 米模糊范围 · 本地发现</small></span>
              </button>
              <button type="button" className={buryMode === "public_spot" ? "selected" : ""} aria-pressed={buryMode === "public_spot"} onClick={() => { setBuryMode("public_spot"); setError(null); }}>
                <RadarIcon />
                <span><strong>公共地点</strong><small>系统地点 · 可进地点瓜区</small></span>
              </button>
            </fieldset>

            {buryMode === "nearby_area" && (
              <div className="bury-mode-note" role="status"><LocationIcon /><p><strong>附近生活圈</strong>{demoMode ? "本地试玩会模拟当前位置发布；真实模式点击提交时才请求一次定位。" : "点击提交时才请求一次定位，服务端只保存模糊生活圈归属。"}</p></div>
            )}
            <fieldset className="spot-choice-list">
              <legend>公共地点</legend>
              {spots.length ? spots.map((spot) => {
                const scene = getSpotScene(spot);
                return <button type="button" key={spot.id} className={buryMode === "public_spot" && spot.id === spotId ? "selected" : ""} aria-label={scene.displayName} aria-pressed={buryMode === "public_spot" && spot.id === spotId} onClick={() => { setBuryMode("public_spot"); setSpotId(spot.id); setError(null); }}>
                  <span><strong>{scene.displayName}</strong><small>{scene.sceneLabel} · 非导航地图</small></span>
                  {buryMode === "public_spot" && spot.id === spotId && <CheckIcon />}
                </button>;
              }) : <div className="spot-empty" role="status"><LocationIcon /><strong>这座城还没有可埋瓜的公共地点</strong><span>请先切换城市；这里不会出现无反馈空选择。</span></div>}
            </fieldset>

            <label htmlFor={topicInputId}><span>话题</span><select id={topicInputId} value={topic} onChange={(event) => setTopic(event.target.value as SafeTopic)}>{(Object.keys(topicName) as SafeTopic[]).map((key) => <option value={key} key={key}>{topicName[key]}</option>)}</select></label>
            <label htmlFor={titleInputId}><span>标题</span><input id={titleInputId} value={title} onChange={(event) => setTitle(event.target.value)} maxLength={42} placeholder="一句话说清发生了什么" /><small>{title.length}/42</small></label>
            <label htmlFor={contentInputId}><span>故事内容</span><textarea id={contentInputId} value={content} onChange={(event) => setContent(event.target.value)} maxLength={800} placeholder="写下匿名故事，不写可识别信息" /><small>{content.length}/800</small></label>
            {selectedSpot && <div className="place-scene is-compact" role="img" aria-label={`${getSpotScene(selectedSpot).title}的半真实城市场景，${getSpotScene(selectedSpot).sceneLabel}，不是实景地图`} />}
            {buryMode === "public_spot" && selectedSpot && <div className="bury-mode-note" role="status"><RadarIcon /><p><strong>{getSpotScene(selectedSpot).displayName}</strong>提交时验证约 500 米范围，人在别的城市会返回明确错误。</p></div>}
            <p className="safety-note">不要写真实姓名、联系方式、具体门牌或能认出某个人的信息。禁止造谣和开黄腔。</p>
            <div className="location-gate"><LocationIcon /><p><strong>发布时才请求一次定位</strong>{buryMode === "nearby_area" ? "只用于服务端计算模糊生活圈；不保存原始经纬度。" : "只用于服务端验证你在所选公共地点约 500 米内；不保存原始经纬度。"}</p></div>
            {error && <p ref={errorRef} className="form-error bury-submit-error" role="alert" aria-live="assertive" tabIndex={-1}><strong>这次还没埋成功</strong><span>{error}</span></p>}
            {!canSubmit && !busy && <p className="form-missing" role="status">还差：{missingItems.join("、")}</p>}
            <button className="bury-submit" aria-label="埋瓜，把秘密压进土里" disabled={!canSubmit}>{busy ? "正在压土..." : error ? "重新埋一次" : demoMode ? "模拟抵达并埋瓜" : "把秘密压进土里"}</button>
          </form>
        </div>
      </section>
    </div>
  );
}

function createOperationId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const hex = () => Math.floor(Math.random() * 0xffff).toString(16).padStart(4, "0");
  return `${hex()}${hex()}-${hex()}-4${hex().slice(1)}-8${hex().slice(1)}-${hex()}${hex()}${hex()}`;
}
