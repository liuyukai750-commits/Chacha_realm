"use client";

import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import type { AdminOverview } from "@/contracts/admin";
import styles from "./admin-dashboard.module.css";

type DashboardState =
  | { kind: "loading" }
  | { kind: "ready"; overview: AdminOverview }
  | { kind: "unauthorized" }
  | { kind: "forbidden" }
  | { kind: "error" };

type Metric = {
  label: string;
  value: number | string;
  note: string;
  tone?: "coral" | "lime";
};

const numberFormatter = new Intl.NumberFormat("zh-CN");
const cityLabels: Record<AdminOverview["cities"][number]["cityId"], string> = {
  changsha: "长沙",
  beijing: "北京",
  shanghai: "上海",
  guangzhou: "广州",
  shenzhen: "深圳",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRecord(parent: Record<string, unknown>, key: string) {
  const value = parent[key];
  if (!isRecord(value)) throw new Error(`Invalid ${key}`);
  return value;
}

function readCount(parent: Record<string, unknown>, key: string) {
  const value = parent[key];
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid ${key}`);
  }
  return value;
}

function readText(parent: Record<string, unknown>, key: string) {
  const value = parent[key];
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`Invalid ${key}`);
  return value;
}

function readMetricPair(parent: Record<string, unknown>, key: string) {
  const value = readRecord(parent, key);
  return {
    total: readCount(value, "total"),
    today: readCount(value, "today"),
  };
}

export function parseAdminOverview(payload: unknown): AdminOverview {
  if (!isRecord(payload)) throw new Error("Invalid overview response");
  const candidate = isRecord(payload.data)
    ? payload.data
    : isRecord(payload.overview)
      ? payload.overview
      : payload;
  const users = readRecord(candidate, "users");
  const engagement = readRecord(candidate, "engagement");
  const economy = readRecord(candidate, "economy");
  const moderation = readRecord(candidate, "moderation");
  const registrations = readRecord(users, "registrations");
  const active = readRecord(users, "active");
  const squats = readRecord(engagement, "squats");
  const balances = readRecord(economy, "balances");
  const earned = readRecord(economy, "earned");
  const fieldPlants = readRecord(economy, "fieldPlants");
  const fieldHarvests = readRecord(economy, "fieldHarvests");
  const rawCities = candidate.cities;
  const generatedAt = readText(candidate, "generatedAt");

  if (Number.isNaN(Date.parse(generatedAt)) || !Array.isArray(rawCities)) {
    throw new Error("Invalid overview response");
  }

  return {
    generatedAt,
    timezone: candidate.timezone === "Asia/Shanghai" ? candidate.timezone : "Asia/Shanghai",
    users: {
      registrations: {
        total: readCount(registrations, "total"),
        today: readCount(registrations, "today"),
      },
      active: {
        today: readCount(active, "today"),
        last7Days: readCount(active, "last7Days"),
        last30Days: readCount(active, "last30Days"),
      },
    },
    engagement: {
      publishedMelons: readMetricPair(engagement, "publishedMelons"),
      effectiveReads: readMetricPair(engagement, "effectiveReads"),
      comments: readMetricPair(engagement, "comments"),
      likes: readMetricPair(engagement, "likes"),
      squats: {
        active: readCount(squats, "active"),
        addedToday: readCount(squats, "addedToday"),
      },
    },
    economy: {
      balances: {
        smallSeeds: readCount(balances, "smallSeeds"),
        trueSeeds: readCount(balances, "trueSeeds"),
      },
      earned: {
        smallSeeds: readMetricPair(earned, "smallSeeds"),
        trueSeeds: readMetricPair(earned, "trueSeeds"),
      },
      trueSeedsPlanted: readMetricPair(economy, "trueSeedsPlanted"),
      fieldPlants: {
        planted: readMetricPair(fieldPlants, "planted"),
        active: readCount(fieldPlants, "active"),
      },
      fieldHarvests: {
        batches: readMetricPair(fieldHarvests, "batches"),
        plants: readMetricPair(fieldHarvests, "plants"),
      },
    },
    cities: rawCities.map((rawCity) => {
      if (!isRecord(rawCity)) throw new Error("Invalid city overview");
      const cityId = readText(rawCity, "cityId");
      if (!(cityId in cityLabels)) throw new Error("Invalid city overview");
      return {
        cityId: cityId as AdminOverview["cities"][number]["cityId"],
        publishedMelons: readCount(rawCity, "publishedMelons"),
        effectiveReads: readCount(rawCity, "effectiveReads"),
        comments: readCount(rawCity, "comments"),
        likes: readCount(rawCity, "likes"),
        squats: readCount(rawCity, "squats"),
      };
    }),
    moderation: {
      pendingReviewCases: readCount(moderation, "pendingReviewCases"),
      heldMelons: readCount(moderation, "heldMelons"),
      heldComments: readCount(moderation, "heldComments"),
      reports: readMetricPair(moderation, "reports"),
      reportedTargets: readCount(moderation, "reportedTargets"),
      bannedProfiles: readCount(moderation, "bannedProfiles"),
      banActions: readMetricPair(moderation, "banActions"),
    },
  };
}

export function isOverviewEmpty(overview: AdminOverview) {
  return (
    overview.users.registrations.total === 0 &&
    overview.engagement.publishedMelons.total === 0 &&
    overview.engagement.effectiveReads.total === 0 &&
    overview.cities.every((city) => city.publishedMelons === 0 && city.effectiveReads === 0)
  );
}

function formatCount(value: number) {
  return numberFormatter.format(value);
}

function formatRate(numerator: number, denominator: number) {
  if (denominator === 0) return "—";
  return `${new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 1 }).format((numerator / denominator) * 100)}%`;
}

function formatGeneratedAt(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function LedgerIcon({ children }: { children: ReactNode }) {
  return (
    <span className={styles.ledgerIcon} aria-hidden="true">
      {children}
    </span>
  );
}

function LedgerSection({
  title,
  eyebrow,
  icon,
  metrics,
}: {
  title: string;
  eyebrow: string;
  icon: ReactNode;
  metrics: Metric[];
}) {
  return (
    <section className={styles.ledgerSection} aria-labelledby={`ledger-${eyebrow}`}>
      <header className={styles.sectionHeader}>
        <LedgerIcon>{icon}</LedgerIcon>
        <div>
          <p>{eyebrow}</p>
          <h2 id={`ledger-${eyebrow}`}>{title}</h2>
        </div>
      </header>
      <dl className={styles.metricList}>
        {metrics.map((metric) => (
          <div className={`${styles.metricRow} ${metric.tone ? styles[metric.tone] : ""}`} key={metric.label}>
            <dt>
              <strong>{metric.label}</strong>
              <span>{metric.note}</span>
            </dt>
            <dd>{typeof metric.value === "number" ? formatCount(metric.value) : metric.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function PageMark() {
  return (
    <span className={styles.pageMark} aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}

function StatusPanel({
  tone,
  eyebrow,
  title,
  detail,
  action,
}: {
  tone: "loading" | "locked" | "error" | "empty";
  eyebrow: string;
  title: string;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <main className={styles.statusShell}>
      <section className={`${styles.statusPanel} ${styles[tone]}`} aria-live="polite" aria-busy={tone === "loading"}>
        <PageMark />
        <p className={styles.statusEyebrow}>{eyebrow}</p>
        <h1>{title}</h1>
        <p className={styles.statusDetail}>{detail}</p>
        {tone === "loading" ? (
          <div className={styles.loadingRules} aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
        ) : null}
        {action ? <div className={styles.statusAction}>{action}</div> : null}
      </section>
    </main>
  );
}

export function AdminDashboard() {
  const [state, setState] = useState<DashboardState>({ kind: "loading" });
  const [requestVersion, setRequestVersion] = useState(0);

  const reload = useCallback(() => {
    setState({ kind: "loading" });
    setRequestVersion((value) => value + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function loadOverview() {
      try {
        const response = await fetch("/api/admin/overview", {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });

        if (response.status === 401) {
          setState({ kind: "unauthorized" });
          return;
        }
        if (response.status === 403) {
          setState({ kind: "forbidden" });
          return;
        }
        if (!response.ok) throw new Error("Overview request failed");

        const overview = parseAdminOverview(await response.json());
        setState({ kind: "ready", overview });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({ kind: "error" });
      }
    }

    void loadOverview();
    return () => controller.abort();
  }, [requestVersion]);

  if (state.kind === "loading") {
    return (
      <StatusPanel
        tone="loading"
        eyebrow="正在翻开城市账本"
        title="汇总街区脉搏…"
        detail="只读取聚合数据，稍候就好。"
      />
    );
  }

  if (state.kind === "unauthorized") {
    return (
      <StatusPanel
        tone="locked"
        eyebrow="账本已合上"
        title="请先登录主理人账号"
        detail="当前会话还没有登录。完成登录后，再回到这里查看城市汇总。"
        action={<Link href="/">回到猹猹街</Link>}
      />
    );
  }

  if (state.kind === "forbidden") {
    return (
      <StatusPanel
        tone="locked"
        eyebrow="只限主理人"
        title="这个猹号没有驾驶舱权限"
        detail="驾驶舱不会展示任何数据。如需查看，请联系拥有主理人权限的成员。"
        action={<Link href="/">回到猹猹街</Link>}
      />
    );
  }

  if (state.kind === "error") {
    return (
      <StatusPanel
        tone="error"
        eyebrow="账本暂时没接上"
        title="城市汇总读取失败"
        detail="可能是网络短暂中断。可以重新读取，不会改动任何数据。"
        action={<button onClick={reload}>重新读取</button>}
      />
    );
  }

  return <DashboardReady overview={state.overview} onReload={reload} />;
}

function DashboardReady({ overview, onReload }: { overview: AdminOverview; onReload: () => void }) {
  const cityPeak = Math.max(1, ...overview.cities.map((city) => city.publishedMelons));
  const empty = isOverviewEmpty(overview);

  const sections = [
    {
      eyebrow: "增长",
      title: "账号增长",
      icon: (
        <svg viewBox="0 0 24 24"><path d="M7.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm9-1a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2 20c0-4 2.2-6 5.5-6s5.5 2 5.5 6m1.5-6c3.3 0 5.5 2 5.5 6" /></svg>
      ),
      metrics: [
        { label: "累计注册", value: overview.users.registrations.total, note: "已完成注册并生成猹号" },
        { label: "今日注册", value: overview.users.registrations.today, note: "今天新增猹号", tone: "lime" as const },
        { label: "今日活跃", value: overview.users.active.today, note: "今天有过街区行为的去重账号", tone: "lime" as const },
        { label: "七日活跃", value: overview.users.active.last7Days, note: "近七日去重活跃账号" },
        { label: "三十日活跃", value: overview.users.active.last30Days, note: "近三十日去重活跃账号" },
      ],
    },
    {
      eyebrow: "转化",
      title: "真实用户使用率",
      icon: (
        <svg viewBox="0 0 24 24"><path d="M12 21c5 0 8-3.8 8-9s-3.6-8-8-8-8 2.8-8 8 3 9 8 9Zm0-17c-1 4-1 12 0 17m-7.5-9h15" /></svg>
      ),
      metrics: [
        {
          label: "今日活跃率",
          value: formatRate(overview.users.active.today, overview.users.registrations.total),
          note: `${formatCount(overview.users.active.today)} / ${formatCount(overview.users.registrations.total)} 个真实账号今日活跃`,
          tone: "lime" as const,
        },
        {
          label: "七日活跃覆盖",
          value: formatRate(overview.users.active.last7Days, overview.users.registrations.total),
          note: `${formatCount(overview.users.active.last7Days)} / ${formatCount(overview.users.registrations.total)} 个真实账号近七日活跃`,
        },
        {
          label: "三十日活跃覆盖",
          value: formatRate(overview.users.active.last30Days, overview.users.registrations.total),
          note: `${formatCount(overview.users.active.last30Days)} / ${formatCount(overview.users.registrations.total)} 个真实账号近三十日活跃`,
        },
      ],
    },
    {
      eyebrow: "使用",
      title: "今日使用情况",
      icon: (
        <svg viewBox="0 0 24 24"><path d="M4 19V9m5 10V5m6 14v-7m5 7V3" /></svg>
      ),
      metrics: [
        { label: "今日发瓜", value: overview.engagement.publishedMelons.today, note: `累计 ${formatCount(overview.engagement.publishedMelons.total)}` },
        { label: "今日有效吃瓜", value: overview.engagement.effectiveReads.today, note: `累计 ${formatCount(overview.engagement.effectiveReads.total)}`, tone: "lime" as const },
        { label: "今日评论", value: overview.engagement.comments.today, note: `累计 ${formatCount(overview.engagement.comments.total)}` },
        { label: "今日点赞", value: overview.engagement.likes.today, note: `累计 ${formatCount(overview.engagement.likes.total)}` },
        { label: "今日蹲后续", value: overview.engagement.squats.addedToday, note: `当前蹲守 ${formatCount(overview.engagement.squats.active)}` },
      ],
    },
  ];

  if (empty) {
    return (
      <div className={styles.dashboard}>
        <DashboardHeader generatedAt={overview.generatedAt} onReload={onReload} />
        <StatusPanel
          tone="empty"
          eyebrow="今日还很安静"
          title="城市账本还没有记录"
          detail="接口已经接通；有居民和街区活动后，聚合数字会出现在这里。"
          action={<button onClick={onReload}>再读一次</button>}
        />
      </div>
    );
  }

  return (
    <div className={styles.dashboard}>
      <DashboardHeader generatedAt={overview.generatedAt} onReload={onReload} />
      <main className={styles.dashboardMain}>
        <section className={styles.pulseBand} aria-labelledby="today-pulse-title">
          <div className={styles.pulseCopy}>
            <p>今日账号增长</p>
            <h1 id="today-pulse-title">今日新猹</h1>
            <span>今天完成注册并生成猹号</span>
          </div>
          <div className={styles.pulseNumber}>
            <strong>{formatCount(overview.users.registrations.today)}</strong>
            <span>个账号</span>
          </div>
          <div className={styles.pulseTrack} aria-hidden="true">
            {Array.from({ length: 12 }, (_, index) => <i key={index} />)}
          </div>
        </section>

        <div className={styles.ledgerGrid}>
          {sections.map((section) => <LedgerSection key={section.eyebrow} {...section} />)}
        </div>

        <section className={styles.cityLedger} aria-labelledby="city-ledger-title">
          <header className={styles.cityLedgerHeader}>
            <div>
              <p>五城横账</p>
              <h2 id="city-ledger-title">每座城市的瓜与街坊</h2>
            </div>
            <span>仅显示城市级汇总</span>
          </header>
          {overview.cities.length === 0 ? (
            <p className={styles.citiesEmpty}>暂时没有城市汇总，其他账页仍可正常查看。</p>
          ) : (
            <ol className={styles.cityList}>
              {overview.cities.map((city, index) => (
                <li key={city.cityId}>
                  <span className={styles.cityRank}>{String(index + 1).padStart(2, "0")}</span>
                  <div className={styles.cityCopy}>
                    <strong>{cityLabels[city.cityId]}</strong>
                    <span className={styles.cityScale} aria-hidden="true">
                      <i style={{ "--city-width": `${Math.max(4, (city.publishedMelons / cityPeak) * 100)}%` } as CSSProperties} />
                    </span>
                  </div>
                  <dl className={styles.cityStats}>
                    <div><dt>瓜</dt><dd>{formatCount(city.publishedMelons)}</dd></div>
                    <div><dt>吃瓜</dt><dd>{formatCount(city.effectiveReads)}</dd></div>
                    <div><dt>评论</dt><dd>{formatCount(city.comments)}</dd></div>
                    <div><dt>点赞</dt><dd>{formatCount(city.likes)}</dd></div>
                    <div><dt>蹲守</dt><dd>{formatCount(city.squats)}</dd></div>
                  </dl>
                </li>
              ))}
            </ol>
          )}
        </section>

        <footer className={styles.privacyNote}>
          <span aria-hidden="true">只读</span>
          <p><strong>只看城市汇总。</strong>驾驶舱不提供个人与内容详情，也不能在这里修改街区数据。</p>
        </footer>
      </main>
    </div>
  );
}

function DashboardHeader({ generatedAt, onReload }: { generatedAt: string; onReload: () => void }) {
  return (
    <header className={styles.topbar}>
      <Link className={styles.brand} href="/" aria-label="返回猹猹街">
        <PageMark />
        <span>
          <strong>猹猹街</strong>
          <small>主理人驾驶舱</small>
        </span>
      </Link>
      <div className={styles.topbarMeta}>
        <span>
          账本更新
          <time dateTime={generatedAt}>{formatGeneratedAt(generatedAt)}</time>
        </span>
        <button onClick={onReload} aria-label="重新读取城市账本">
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M19 8a8 8 0 1 0 1 6m0-6V3m0 5h-5" /></svg>
          <span>刷新</span>
        </button>
      </div>
    </header>
  );
}
