"use client";

import { useState } from "react";
import type { CityOpeningState, DistanceBand, FieldStage, SafeTopic } from "@/contracts";
import { ChevronIcon, FieldIcon, LocationIcon, MoonIcon, PlusIcon, RadarIcon, SeedIcon, SproutIcon } from "./icons";

type RadarMelon = {
  id: string;
  title: string;
  topic: SafeTopic;
  distanceBand: DistanceBand;
  spot: string;
  author: string;
  status: "mature" | "incubating";
  countdown?: string;
};

const melons: RadarMelon[] = [
  { id: "m-001", title: "辞职前一晚，我在湘江边坐到了末班车", topic: "work", distanceBand: "within_1km", spot: "杜甫江阁", author: "戴耳机的水獭", status: "mature" },
  { id: "m-002", title: "便利店阿姨偷偷多塞给我一颗茶叶蛋", topic: "daily", distanceBand: "within_3km", spot: "五一广场", author: "晚睡小浣熊", status: "mature" },
  { id: "m-003", title: "我们在同一张长椅上等了三场雨", topic: "relationship", distanceBand: "within_8km", spot: "烈士公园", author: "淋雨的灰兔", status: "mature" },
  { id: "m-004", title: "岳麓山脚下的凌晨面馆", topic: "food", distanceBand: "within_3km", spot: "岳麓书院", author: "巡夜小刺猬", status: "incubating", countdown: "01:18:42" },
];

const opening: CityOpeningState = {
  cityId: "changsha",
  status: "gathering",
  safeMelons: 22,
  distinctAuthors: 19,
  distinctSpots: 3,
  distinctTopics: 3,
};

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

export function ChachaIsland() {
  const [tab, setTab] = useState<"radar" | "field">("radar");
  const [notice, setNotice] = useState("定位未开启 · 正在浏览长沙公开瓜场");

  return (
    <div className="night-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setTab("radar")} aria-label="回到雷达岛">
          <span className="brand-glyph" aria-hidden="true">猹</span>
          <span><strong>猹猹岛</strong><small>CHACHA / NIGHT WATCH</small></span>
        </button>
        <div className="topbar-actions">
          <button className="city-switch" onClick={() => setNotice("城市切换将在下一检查点接入")}>
            <LocationIcon /><span>长沙</span><ChevronIcon />
          </button>
          <span className="seed-count" aria-label="拥有 7 粒瓜籽"><SeedIcon />7</span>
        </div>
      </header>

      <main className="island-main">
        {tab === "radar" ? (
          <>
            <section className="radar-intro" aria-labelledby="radar-title">
              <p className="utility-label"><MoonIcon /> 今夜雷达 · 23:42</p>
              <h1 id="radar-title">附近有瓜，<em>正在发亮。</em></h1>
              <p>{notice}</p>
            </section>

            <section className="radar-stage" aria-label="成熟瓜距离雷达">
              <div className="radar-grid" aria-hidden="true"><i /><i /><i /><span className="radar-sweep" /></div>
              <div className="radar-origin" aria-hidden="true"><span>猹</span><i /></div>
              {melons.map((melon, index) => (
                <button
                  key={melon.id}
                  className={`melon-node node-${index + 1} ${melon.status}`}
                  onClick={() => setNotice(melon.status === "mature" ? `已锁定：${melon.title}` : `这颗瓜还要孵化 ${melon.countdown}`)}
                  aria-label={`${melon.status === "mature" ? "成熟瓜" : "孵化中"}，${melon.title}，${distanceName[melon.distanceBand]}`}
                >
                  <span className="melon-orb"><i /><i /><i /></span>
                  <span className="node-label"><strong>{topicName[melon.topic]}瓜</strong><small>{distanceName[melon.distanceBand]}</small></span>
                </button>
              ))}
              <div className="ring-label ring-one">1 km</div>
              <div className="ring-label ring-two">3 km</div>
              <div className="ring-label ring-three">8 km</div>
            </section>

            <section className="radar-legend" aria-label="雷达说明">
              <span><i className="legend-mature" />成熟，可吃</span>
              <span><i className="legend-sleep" />孵化中</span>
              <button onClick={() => setNotice("雷达已刷新 · 优先同区，再同城，最后远方")}>重新听一圈 <RadarIcon /></button>
            </section>

            <OpeningCard state={opening} />
          </>
        ) : (
          <FieldView />
        )}
      </main>

      <nav className="bottom-dock" aria-label="主要导航">
        <button className={tab === "radar" ? "active" : ""} onClick={() => setTab("radar")} aria-current={tab === "radar" ? "page" : undefined}><RadarIcon /><span>听瓜</span></button>
        <button className="bury-button" onClick={() => setNotice("埋瓜前需要验证你在公共地点 500 米内")}><PlusIcon /><span>埋瓜</span></button>
        <button className={tab === "field" ? "active" : ""} onClick={() => setTab("field")} aria-current={tab === "field" ? "page" : undefined}><FieldIcon /><span>瓜田</span></button>
      </nav>
    </div>
  );
}

function OpeningCard({ state }: { state: CityOpeningState }) {
  const items = [
    ["安全瓜", state.safeMelons, 30],
    ["瓜主", state.distinctAuthors, 25],
    ["地点", state.distinctSpots, 3],
    ["话题", state.distinctTopics, 3],
  ] as const;

  return (
    <section className="opening-card" aria-labelledby="opening-title">
      <header><span className="utility-label">CHANGSHA / OPENING</span><strong>明晚也许能开岛</strong></header>
      <div><h2 id="opening-title">长沙正在攒一场热闹</h2><p>四项都满后，次日 20:00 开岛。</p></div>
      <ul>{items.map(([label, value, goal]) => <li key={label}><span>{label}</span><div><i style={{ width: `${Math.min(100, value / goal * 100)}%` }} /></div><strong>{value}<small>/{goal}</small></strong></li>)}</ul>
    </section>
  );
}

function FieldView() {
  const stage: FieldStage = "flower";
  return (
    <section className="field-view" aria-labelledby="field-title">
      <p className="utility-label"><SproutIcon /> MY QUIET PATCH</p>
      <h1 id="field-title">风吹过，<em>我的瓜田开花了。</em></h1>
      <div className={`field-illustration stage-${stage}`} aria-label="瓜田阶段：开花">
        <div className="field-moon" /><div className="field-soil" />
        <div className="vine vine-left"><i /><i /><i /></div><div className="vine vine-right"><i /><i /></div>
        <span className="field-flower flower-one">✦</span><span className="field-flower flower-two">✦</span><span className="field-flower flower-three">✦</span>
      </div>
      <div className="field-progress">
        <header><div><span>戴耳机的水獭</span><strong>7 粒瓜籽 · 花期</strong></div><SeedIcon /></header>
        <div className="growth-track"><i style={{ width: "58%" }} /></div>
        <ol><li className="done">1 嫩芽</li><li className="done">3 藤蔓</li><li className="current">7 花</li><li>12 青瓜</li><li>21 成熟</li></ol>
        <p>再收 5 粒，藤上会结出第一颗青瓜。</p>
      </div>
      <button className="field-cta"><PlusIcon />埋下我的第一颗瓜</button>
    </section>
  );
}
