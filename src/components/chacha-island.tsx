"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useIsland } from "@/hooks/use-island";
import {
  categories,
  formatRelativeTime,
  IslandPost,
  PostCategory,
  Region,
  regions,
} from "@/lib/island-model";
import {
  ChevronIcon,
  CloseIcon,
  FieldIcon,
  HomeIcon,
  LocationIcon,
  MessageIcon,
  PlusIcon,
  SeedIcon,
  SparkIcon,
} from "@/components/icons";

type Tab = "field" | "garden";

const categoryMeta: Record<PostCategory, { glyph: string; note: string; delay: string }> = {
  日常瓜: { glyph: "小", note: "一件刚刚发生的小事", delay: "立即成熟" },
  职场瓜: { glyph: "班", note: "工位附近的真实瞬间", delay: "2 小时成熟" },
  情感瓜: { glyph: "心", note: "那些没地方说的感受", delay: "6 小时成熟" },
  大瓜: { glyph: "大", note: "值得慢慢讲的完整故事", delay: "Lv5 解锁" },
};

export function ChachaIsland() {
  const { state, isReady, storageError, join, selectRegion, publish, eat, comment } = useIsland();
  const [tab, setTab] = useState<Tab>("field");
  const [showCompose, setShowCompose] = useState(false);
  const [showRegions, setShowRegions] = useState(false);
  const [commentPost, setCommentPost] = useState<IslandPost | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const notify = (message: string) => setToast(message);

  if (!isReady) return <IslandLoading />;
  if (!state.user) return <Onboarding onJoin={join} />;

  const userPosts = state.posts.filter((post) => post.userId === state.user?.id);
  const nearbyPosts = state.posts.filter((post) => post.region === state.user?.region);

  return (
    <div className="island-shell">
      <div className="ambient-orb ambient-orb-one" aria-hidden="true" />
      <div className="ambient-orb ambient-orb-two" aria-hidden="true" />

      <header className="island-header">
        <button className="brand-lockup" onClick={() => setTab("field")} aria-label="返回附近瓜田">
          <span className="brand-mark" aria-hidden="true"><span /></span>
          <span>
            <strong>猹猹岛</strong>
            <small>CHACHA ISLAND</small>
          </span>
        </button>
        <div className="header-actions">
          <button className="location-pill" onClick={() => setShowRegions(true)}>
            <LocationIcon />
            <span>长沙 · {state.user.region}</span>
            <ChevronIcon className="chevron-down" />
          </button>
          <div className="seed-balance" aria-label={`拥有 ${state.user.seedCount} 颗瓜籽`}>
            <SeedIcon />
            <span>{state.user.seedCount}</span>
          </div>
        </div>
      </header>

      <main className="island-main">
        {storageError && <div className="storage-warning" role="status">{storageError}</div>}
        {tab === "field" ? (
          <FieldPage
            posts={nearbyPosts}
            commentsCount={(postId) => state.comments.filter((item) => item.postId === postId).length}
            eatenPostIds={state.eatenPostIds}
            region={state.user.region}
            onEat={(postId) => {
              eat(postId);
              if (!state.eatenPostIds.includes(postId)) notify("吃到一口新鲜瓜，瓜籽 +1");
            }}
            onComment={setCommentPost}
            onCompose={() => setShowCompose(true)}
          />
        ) : (
          <GardenPage user={state.user} posts={userPosts} seedRecordCount={state.seedRecords.length} onCompose={() => setShowCompose(true)} />
        )}
      </main>

      <nav className="bottom-nav" aria-label="主要导航">
        <button className={tab === "field" ? "active" : ""} onClick={() => setTab("field")} aria-current={tab === "field" ? "page" : undefined}>
          <HomeIcon />
          <span>附近</span>
        </button>
        <button className="plant-button" onClick={() => setShowCompose(true)} aria-label="种下一颗瓜">
          <PlusIcon />
        </button>
        <button className={tab === "garden" ? "active" : ""} onClick={() => setTab("garden")} aria-current={tab === "garden" ? "page" : undefined}>
          <FieldIcon />
          <span>我的瓜田</span>
        </button>
      </nav>

      {showCompose && (
        <ComposeSheet
          userLevel={state.user.level}
          region={state.user.region}
          onClose={() => setShowCompose(false)}
          onPublish={(input) => {
            publish(input);
            setShowCompose(false);
            setTab("garden");
            notify("瓜种下了，瓜籽 +5");
          }}
        />
      )}

      {showRegions && (
        <RegionSheet
          current={state.user.region}
          onClose={() => setShowRegions(false)}
          onSelect={(region) => {
            selectRegion(region);
            setShowRegions(false);
            notify(`已来到 ${region} 瓜田`);
          }}
        />
      )}

      {commentPost && (
        <CommentSheet
          post={commentPost}
          comments={state.comments.filter((item) => item.postId === commentPost.id)}
          onClose={() => setCommentPost(null)}
          onComment={(content) => {
            comment(commentPost.id, content);
            notify("悄悄话留下了，瓜籽 +2");
          }}
        />
      )}

      {toast && <div className="toast" role="status"><SparkIcon />{toast}</div>}
    </div>
  );
}

function IslandLoading() {
  return (
    <div className="loading-screen" aria-label="正在登岛">
      <div className="loading-melon" aria-hidden="true"><span /></div>
      <p>正在靠近小岛…</p>
    </div>
  );
}

function Onboarding({ onJoin }: { onJoin: (region: Region) => void }) {
  const [region, setRegion] = useState<Region>("五一广场");

  return (
    <main className="onboarding">
      <div className="onboarding-sky" aria-hidden="true">
        <i className="star star-one" /><i className="star star-two" /><i className="star star-three" />
      </div>
      <section className="onboarding-copy">
        <div className="brand-kicker"><span /> CHACHA ISLAND · 001</div>
        <h1>附近的人，<br />正在过怎样的生活？</h1>
        <p>不需要真实姓名。领取一个动物身份，去附近的瓜田听听真实故事。</p>
      </section>

      <div className="island-map" aria-hidden="true">
        <div className="moon" />
        <div className="island-land">
          <div className="island-tree tree-one"><i /><span /></div>
          <div className="island-tree tree-two"><i /><span /></div>
          <div className="melon-patch"><i /><i /><i /></div>
        </div>
        <div className="water-line water-one" /><div className="water-line water-two" />
      </div>

      <section className="join-card" aria-labelledby="join-title">
        <div>
          <span className="step-label">登岛前的最后一步</span>
          <h2 id="join-title">你想先去哪里逛逛？</h2>
        </div>
        <div className="region-grid">
          {regions.map((item) => (
            <button key={item} className={region === item ? "selected" : ""} onClick={() => setRegion(item)}>
              <span className="region-dot" />
              <span><strong>{item}</strong><small>{regionSubtitle[item]}</small></span>
            </button>
          ))}
        </div>
        <button className="primary-button" onClick={() => onJoin(region)}>
          匿名登岛
          <ChevronIcon />
        </button>
        <p className="privacy-note">身份随机生成，精确位置不会公开</p>
      </section>
    </main>
  );
}

const regionSubtitle: Record<Region, string> = {
  五一广场: "热闹中心",
  岳麓山: "山风与校园",
  河西: "慢生活片区",
  星沙: "城市另一面",
};

function FieldPage({
  posts,
  commentsCount,
  eatenPostIds,
  region,
  onEat,
  onComment,
  onCompose,
}: {
  posts: IslandPost[];
  commentsCount: (postId: string) => number;
  eatenPostIds: string[];
  region: Region;
  onEat: (postId: string) => void;
  onComment: (post: IslandPost) => void;
  onCompose: () => void;
}) {
  return (
    <>
      <section className="field-hero">
        <div>
          <span className="eyebrow"><i /> NEARBY FIELD</span>
          <h1>{region}<br /><em>今晚有风，也有新瓜。</em></h1>
        </div>
        <div className="field-weather" aria-label="附近瓜田热度 86">
          <span>瓜田热度</span>
          <strong>86<small>%</small></strong>
          <div><i style={{ width: "86%" }} /></div>
        </div>
      </section>

      <div className="vine-divider" aria-hidden="true"><span /><i /><i /><i /></div>

      <section className="feed-heading">
        <div><h2>刚成熟的瓜</h2><p>按新鲜程度排列</p></div>
        <button onClick={onCompose}>种一颗 <PlusIcon /></button>
      </section>

      <div className="post-feed">
        {posts.length ? posts.map((post, index) => (
          <PostCard
            key={post.id}
            post={post}
            index={index}
            isEaten={eatenPostIds.includes(post.id)}
            commentCount={commentsCount(post.id)}
            onEat={() => onEat(post.id)}
            onComment={() => onComment(post)}
          />
        )) : (
          <div className="empty-field">
            <div className="empty-sprout"><i /><i /></div>
            <h3>这片瓜田还很安静</h3>
            <p>种下这里的第一颗瓜，让附近的人发现你的今天。</p>
            <button className="secondary-button" onClick={onCompose}>种下第一颗瓜</button>
          </div>
        )}
      </div>
    </>
  );
}

function PostCard({ post, index, isEaten, commentCount, onEat, onComment }: { post: IslandPost; index: number; isEaten: boolean; commentCount: number; onEat: () => void; onComment: () => void }) {
  return (
    <article className="post-card">
      <div className="post-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</div>
      <div className={`post-melon category-${post.category}`} aria-hidden="true">
        <span>{categoryMeta[post.category].glyph}</span>
        <i className="melon-stripe stripe-one" /><i className="melon-stripe stripe-two" /><i className="melon-stripe stripe-three" />
      </div>
      <div className="post-body">
        <div className="post-meta">
          <span className="animal-avatar">{post.authorEmoji}</span>
          <span><strong>{post.authorName}</strong><small>{formatRelativeTime(post.createdAt)} · {post.region}</small></span>
          <span className="category-label">{post.category}</span>
        </div>
        <h3>{post.title}</h3>
        <p>{post.content}</p>
        <div className="post-actions">
          <button className={isEaten ? "eaten" : ""} onClick={onEat} disabled={isEaten}>
            <span className="bite-icon" aria-hidden="true" />
            {isEaten ? "吃过了" : "吃一口"}
            <small>{post.eatCount}</small>
          </button>
          <button onClick={onComment}>
            <MessageIcon />
            聊两句
            <small>{commentCount}</small>
          </button>
          <span className="view-count">{post.viewCount} 猹路过</span>
        </div>
      </div>
    </article>
  );
}

function GardenPage({ user, posts, seedRecordCount, onCompose }: { user: NonNullable<ReturnType<typeof useIsland>["state"]["user"]>; posts: IslandPost[]; seedRecordCount: number; onCompose: () => void }) {
  const progress = Math.min(100, (user.seedCount % 30) / 30 * 100);
  return (
    <>
      <section className="garden-profile">
        <div className="profile-avatar"><span>{user.animalEmoji}</span><i>Lv{user.level}</i></div>
        <div className="profile-copy"><span className="eyebrow"><i /> MY LITTLE ISLAND</span><h1>{user.nickname}</h1><p>住在长沙 · {user.region} 的第 {Math.max(1, Math.ceil((Date.now() - new Date(user.joinedAt).getTime()) / 86400000))} 天</p></div>
      </section>

      <section className="garden-stats">
        <div><span>收获瓜籽</span><strong>{user.seedCount}</strong><small>SEEDS</small></div>
        <div><span>种下的瓜</span><strong>{posts.length}</strong><small>POSTS</small></div>
        <div><span>岛上足迹</span><strong>{seedRecordCount}</strong><small>TRACES</small></div>
      </section>

      <section className="level-card">
        <div className="level-copy"><span>距离 Lv{user.level + 1}</span><strong>再收集 {Math.max(0, 30 - (user.seedCount % 30))} 颗瓜籽</strong></div>
        <div className="level-track"><i style={{ width: `${progress}%` }} /></div>
        <div className="level-markers"><span>Lv{user.level}</span><span>Lv{user.level + 1}</span></div>
      </section>

      <section className="my-field-heading"><div><span className="eyebrow"><i /> PRIVATE FIELD</span><h2>我的瓜田</h2></div><button onClick={onCompose}><PlusIcon /> 种新瓜</button></section>

      <div className="garden-plots">
        {posts.length ? posts.map((post) => (
          <article key={post.id} className="garden-plot">
            <div className="plot-soil" aria-hidden="true"><div className="mini-melon"><span>{categoryMeta[post.category].glyph}</span></div><i /><i /><i /></div>
            <span className="plot-status">已成熟</span>
            <h3>{post.title}</h3>
            <p>{post.category} · {post.eatCount} 猹吃过</p>
          </article>
        )) : (
          <button className="garden-empty-plot" onClick={onCompose}>
            <div className="empty-sprout"><i /><i /></div>
            <strong>这块地还空着</strong>
            <span>点一下，种下你的第一颗瓜</span>
          </button>
        )}
        <div className="locked-plot"><span>LV 3</span><strong>新地块</strong><p>升级后解锁</p></div>
      </div>
    </>
  );
}

function SheetFrame({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", closeOnEscape);
    document.body.classList.add("no-scroll");
    return () => { document.removeEventListener("keydown", closeOnEscape); document.body.classList.remove("no-scroll"); };
  }, [onClose]);

  return (
    <div className="sheet-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
        <div className="sheet-handle" aria-hidden="true" />
        <header><div><h2 id="sheet-title">{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button onClick={onClose} aria-label="关闭"><CloseIcon /></button></header>
        {children}
      </section>
    </div>
  );
}

function ComposeSheet({ userLevel, region, onClose, onPublish }: { userLevel: number; region: Region; onClose: () => void; onPublish: (input: { title: string; content: string; category: PostCategory }) => void }) {
  const [category, setCategory] = useState<PostCategory>("日常瓜");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (title.trim().length < 4) return setError("标题至少写 4 个字，让路过的猹知道发生了什么。");
    if (content.trim().length < 10) return setError("故事至少写 10 个字，再多留一点现场细节吧。");
    setError(null);
    onPublish({ title, content, category });
  };

  return (
    <SheetFrame title="种下一颗瓜" subtitle={`会种在长沙 · ${region}`} onClose={onClose}>
      <form className="compose-form" onSubmit={submit}>
        <fieldset><legend>选一颗瓜种</legend><div className="category-grid">{categories.map((item) => {
          const locked = item === "大瓜" && userLevel < 5;
          return <button type="button" key={item} disabled={locked} className={category === item ? "selected" : ""} onClick={() => setCategory(item)}><span>{categoryMeta[item].glyph}</span><strong>{item}</strong><small>{categoryMeta[item].delay}</small></button>;
        })}</div></fieldset>
        <label><span>给这颗瓜起个名字</span><input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={42} placeholder="一句话说清发生了什么" autoFocus /><small>{title.length}/42</small></label>
        <label><span>慢慢讲，岛上没有熟人</span><textarea value={content} onChange={(event) => setContent(event.target.value)} maxLength={500} placeholder="可以写下现场、心情，或你没来得及说出口的话……" /><small>{content.length}/500</small></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="anonymity-note"><span>{"◐"}</span><p><strong>匿名保护已开启</strong>不会展示精确位置和真实身份</p></div>
        <button className="primary-button" type="submit">种进我的瓜田 <FieldIcon /></button>
      </form>
    </SheetFrame>
  );
}

function RegionSheet({ current, onClose, onSelect }: { current: Region; onClose: () => void; onSelect: (region: Region) => void }) {
  return (
    <SheetFrame title="换一片瓜田" subtitle="只展示区域，不读取精确位置" onClose={onClose}>
      <div className="region-list">{regions.map((region) => <button key={region} className={current === region ? "selected" : ""} onClick={() => onSelect(region)}><span className="region-pin"><LocationIcon /></span><span><strong>{region}</strong><small>{regionSubtitle[region]}</small></span>{current === region && <i>正在这里</i>}<ChevronIcon /></button>)}</div>
    </SheetFrame>
  );
}

function CommentSheet({ post, comments, onClose, onComment }: { post: IslandPost; comments: ReturnType<typeof useIsland>["state"]["comments"]; onClose: () => void; onComment: (content: string) => void }) {
  const [content, setContent] = useState("");
  const commentList = useMemo(() => comments, [comments]);
  const submit = (event: FormEvent) => { event.preventDefault(); if (!content.trim()) return; onComment(content); setContent(""); };
  return (
    <SheetFrame title="瓜田里的悄悄话" subtitle={post.title} onClose={onClose}>
      <div className="comment-list">{commentList.length ? commentList.map((item) => <article key={item.id}><span>{item.authorEmoji}</span><div><strong>{item.authorName}<small>{formatRelativeTime(item.createdAt)}</small></strong><p>{item.content}</p></div></article>) : <div className="comment-empty"><MessageIcon /><p>还没人开口。留下一句，别让这颗瓜孤零零的。</p></div>}</div>
      <form className="comment-form" onSubmit={submit}><label><span className="sr-only">评论内容</span><input value={content} onChange={(event) => setContent(event.target.value)} maxLength={160} placeholder="匿名聊两句…" /></label><button type="submit" disabled={!content.trim()}>留下悄悄话</button></form>
    </SheetFrame>
  );
}
