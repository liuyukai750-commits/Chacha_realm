"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
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
import styles from "./recording-demo.module.css";

type Screen = "nearby" | "detail" | "bury" | "success" | "field";
type Reaction = "蹲后续" | "瓜熟了" | "路过";

const melons = [
  {
    id: "office",
    distance: "120m",
    time: "刚刚",
    topic: "职场",
    title: "原来工作再努力，也没有站对队重要。我领导昨天还说公平，今天却把那个名额……",
    activity: "12 只猹正在吃",
    comments: 8,
    accent: "ripe",
  },
  {
    id: "elevator",
    distance: "260m",
    time: "3分钟前",
    topic: "日常",
    title: "她在某综艺里明明挺会照顾人的，怎么镜头一关，对工作人员就……",
    activity: "7 只猹蹲后续",
    comments: 5,
    accent: "fresh",
  },
  {
    id: "canteen",
    distance: "480m",
    time: "8分钟前",
    topic: "吃喝",
    title: "同事天天哭穷，直到昨天有人看见他下班后上了那辆车……",
    activity: "9 只猹闻着味来了",
    comments: 11,
    accent: "gold",
  },
  {
    id: "metro",
    distance: "760m",
    time: "12分钟前",
    topic: "关系",
    title: "谈了五年都没公开，他朋友圈突然多了一张合照，旁边的人却不是……",
    activity: "4 只猹路过",
    comments: 3,
    accent: "soft",
  },
] as const;

const comments = [
  { alias: "猹007", text: "所以被夸的人，根本不是最后拿名额的？", time: "1分钟前" },
  { alias: "猹021", text: "后半句我大概猜到了，蹲一个。", time: "刚刚" },
  { alias: "猹108", text: "这种事上班久了真的见过……", time: "刚刚" },
];

export function RecordingDemo({ reel = false }: { reel?: boolean }) {
  const [screen, setScreen] = useState<Screen>("nearby");
  const [reaction, setReaction] = useState<Reaction | null>(null);
  const [story, setStory] = useState("我一直以为领导最看重能力，直到今天听见他亲口说：这次机会得先给……");
  const [range, setRange] = useState("1km");
  const [freshness, setFreshness] = useState("24小时");
  const [newMelon, setNewMelon] = useState<string | null>(null);

  const [reelCue, setReelCue] = useState(0);

  useEffect(() => {
    if (!reel) return;
    const timers = [
      window.setTimeout(() => { setScreen("detail"); setReelCue(1); }, 2_800),
      window.setTimeout(() => { setReaction("蹲后续"); setReelCue(2); }, 6_500),
      window.setTimeout(() => { setScreen("bury"); setReelCue(3); }, 9_000),
    ];
    return () => timers.forEach(window.clearTimeout);
  }, [reel]);

  const openBury = () => setScreen("bury");

  const submitMelon = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = story.trim();
    if (!value) return;
    setNewMelon(value);
    setScreen("success");
  };

  return (
    <main className={styles.stage}>
      <section className={styles.phone} aria-label="猹猹街抖音录屏演示">
        {reel && <div className={styles.reelBadge}>概念演示</div>}
        {reel && <div className={styles.reelCaption} data-cue={reelCue}>
          {reelCue === 0 && <>你附近的人，<strong>背着你吃上瓜了。</strong></>}
          {reelCue === 1 && <>原来工作再努力，<strong>也没有站对队重要……</strong></>}
          {reelCue === 2 && <>看到这里的猹，<strong>都在蹲后续。</strong></>}
          {reelCue === 3 && <>你附近，<strong>有什么瓜？</strong></>}
        </div>}
        <header className={styles.topbar}>
          <button className={styles.brand} onClick={() => setScreen("nearby")} aria-label="回到附近瓜田">
            <span>猹</span>
            <strong>猹猹街</strong>
          </button>
          <div className={styles.location}><LocationIcon /><span>附近 1km</span></div>
          <div className={styles.seeds}><SeedIcon /><strong>21</strong></div>
        </header>

        <div className={styles.viewport}>
          {screen === "nearby" && <NearbyView onOpen={() => setScreen("detail")} onBury={openBury} />}
          {screen === "detail" && <DetailView reaction={reaction} onReact={setReaction} onClose={() => setScreen("nearby")} onBury={openBury} />}
          {screen === "bury" && <BuryView story={story} range={range} freshness={freshness} onStory={setStory} onRange={setRange} onFreshness={setFreshness} onSubmit={submitMelon} onClose={() => setScreen("nearby")} />}
          {screen === "success" && <SuccessView onField={() => setScreen("field")} onNearby={() => setScreen("nearby")} />}
          {screen === "field" && <FieldView newMelon={newMelon} onBury={openBury} />}
        </div>

        {screen !== "bury" && screen !== "success" && <nav className={styles.dock} aria-label="Demo 导航">
          <button className={screen === "nearby" || screen === "detail" ? styles.active : ""} onClick={() => setScreen("nearby")}><RadarIcon /><span>附近</span></button>
          <button className={styles.buryButton} onClick={openBury}><PlusIcon /><span>埋瓜</span></button>
          <button className={screen === "field" ? styles.active : ""} onClick={() => setScreen("field")}><FieldIcon /><span>瓜田</span></button>
        </nav>}
      </section>
    </main>
  );
}

function NearbyView({ onOpen, onBury }: { onOpen: () => void; onBury: () => void }) {
  return <div className={styles.nearby}>
    <section className={styles.nearbyHero}>
      <div className={styles.heroSignal} aria-hidden="true"><i /><i /><i /><span>32</span></div>
      <p><span className={styles.liveDot} /> 附近 1km</p>
      <h1>32只猹<br /><em>正在活动</em> 👀</h1>
      <span>你周围的瓜，正在冒头</span>
    </section>

    <div className={styles.feedHeading}>
      <div><span>附近瓜田</span><strong>现在正在发生</strong></div>
      <button onClick={onBury}><PlusIcon />埋一个</button>
    </div>

    <div className={styles.melonList}>
      {melons.map((melon, index) => <button key={melon.id} className={styles.melonCard} data-accent={melon.accent} onClick={index === 0 ? onOpen : undefined}>
        <div className={styles.cardMeta}><span>{melon.topic}</span><small>{melon.distance} · {melon.time}</small></div>
        <strong>{melon.title}</strong>
        <footer><span><i />{melon.activity}</span><small><MessageIcon />{melon.comments}</small><ChevronIcon /></footer>
      </button>)}
    </div>
  </div>;
}

function DetailView({ reaction, onReact, onClose, onBury }: { reaction: Reaction | null; onReact: (value: Reaction) => void; onClose: () => void; onBury: () => void }) {
  return <div className={styles.detail}>
    <header className={styles.screenHeader}>
      <button onClick={onClose} aria-label="关闭"><CloseIcon /></button>
      <div><span>120m · 刚刚</span><strong>附近的一颗职场瓜</strong></div>
      <span className={styles.anonymous}>匿名</span>
    </header>

    <article className={styles.story}>
      <div className={styles.storyTag}><span className={styles.liveDot} /> 12 只猹正在吃</div>
      <p>我以前真觉得努力就够了：</p>
      <h2>原来工作再努力，<br />也没有站对队重要……</h2>
      <footer><span>猹073 埋下</span><span>保鲜 23小时</span></footer>
    </article>

    <div className={styles.reactions} role="group" aria-label="瓜田互动">
      {(["蹲后续", "瓜熟了", "路过"] as Reaction[]).map((item) => <button key={item} className={reaction === item ? styles.selected : ""} onClick={() => onReact(item)}><span>{item === "蹲后续" ? "👀" : item === "瓜熟了" ? "🍉" : "🐾"}</span>{item}{reaction === item && <i>+1</i>}</button>)}
    </div>

    <section className={styles.comments}>
      <header><div><MessageIcon /><strong>瓜下有动静</strong></div><span>8条</span></header>
      {comments.map((comment) => <div key={comment.alias} className={styles.comment}>
        <span>{comment.alias.slice(-2)}</span>
        <p><strong>{comment.alias}</strong>{comment.text}<small>{comment.time}</small></p>
      </div>)}
    </section>

    <button className={styles.sharePrompt} onClick={onBury}><PlusIcon /><span><strong>你附近也有瓜？</strong><small>匿名埋进瓜田</small></span><ChevronIcon /></button>
  </div>;
}

function BuryView({ story, range, freshness, onStory, onRange, onFreshness, onSubmit, onClose }: { story: string; range: string; freshness: string; onStory: (value: string) => void; onRange: (value: string) => void; onFreshness: (value: string) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onClose: () => void }) {
  return <form className={styles.bury} onSubmit={onSubmit}>
    <header className={styles.screenHeader}>
      <button type="button" onClick={onClose} aria-label="关闭"><CloseIcon /></button>
      <div><span>悄悄说，没人知道你是谁</span><strong>埋一颗瓜</strong></div>
      <span className={styles.anonymous}>猹219</span>
    </header>

    <label className={styles.storyInput}>
      <span>这颗瓜是什么味的？</span>
      <textarea value={story} onChange={(event) => onStory(event.target.value)} maxLength={140} placeholder="说说你刚刚听见或遇见的事…" />
      <small>{story.length}/140</small>
    </label>

    <fieldset>
      <legend>谁能在附近闻到？</legend>
      <div className={styles.segmented}>
        {["500m", "1km", "3km"].map((item) => <button type="button" key={item} className={range === item ? styles.selected : ""} onClick={() => onRange(item)}>{item}</button>)}
      </div>
      <p><LocationIcon />只显示模糊范围，不展示你的具体位置</p>
    </fieldset>

    <fieldset>
      <legend>保鲜期</legend>
      <div className={styles.segmented}>
        {["6小时", "24小时", "3天"].map((item) => <button type="button" key={item} className={freshness === item ? styles.selected : ""} onClick={() => onFreshness(item)}>{item}</button>)}
      </div>
    </fieldset>

    <div className={styles.identityRow}><span>匿名身份</span><strong><i>19</i> 猹219</strong><small>每颗瓜使用随机身份</small></div>
    <button className={styles.submit} type="submit" disabled={!story.trim()}><span>埋进瓜田 🍉</span><small>{range} · 保鲜{freshness}</small></button>
  </form>;
}

function SuccessView({ onField, onNearby }: { onField: () => void; onNearby: () => void }) {
  return <div className={styles.success}>
    <div className={styles.successVisual} aria-hidden="true"><span>🍉</span><i /><i /><i /></div>
    <p>埋好了</p>
    <h1>已经有3只猹<br />闻着味来了 👀</h1>
    <span>你的具体位置不会显示</span>
    <button onClick={onField}>去我的瓜田看看 <ChevronIcon /></button>
    <button className={styles.textButton} onClick={onNearby}>继续潜入附近瓜田</button>
  </div>;
}

function FieldView({ newMelon, onBury }: { newMelon: string | null; onBury: () => void }) {
  return <div className={styles.field}>
    <section className={styles.fieldHero}>
      <p>我的瓜田</p>
      <h1>今天来过<br /><em>18只猹</em> 👀</h1>
      <div className={styles.fieldStats}>
        <span><SproutIcon /><strong>3</strong><small>个瓜正在生长</small></span>
        <span><SeedIcon /><strong>21</strong><small>粒瓜籽</small></span>
      </div>
    </section>

    <section className={styles.growing}>
      <header><div><span className={styles.liveDot} /> 正在生长</div><button onClick={onBury}><PlusIcon />再埋一颗</button></header>
      {newMelon && <article className={styles.newMelon}>
        <div><span>刚刚埋下</span><small>已有 3 只猹闻着味来了</small></div>
        <p>{newMelon}</p>
        <footer><span><i />生长中</span><small>保鲜 24小时</small></footer>
      </article>}
      <article><div><span>2小时前</span><small>7 只猹蹲后续</small></div><p>她在某综艺里挺好的，怎么镜头一关就……</p></article>
      <article><div><span>昨天</span><small>11 只猹吃过</small></div><p>同事天天哭穷，直到有人看见他上了那辆车……</p></article>
    </section>
  </div>;
}
