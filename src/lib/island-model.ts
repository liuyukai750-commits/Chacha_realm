export type Region = "五一广场" | "岳麓山" | "河西" | "星沙";

export type PostCategory = "日常瓜" | "职场瓜" | "情感瓜" | "大瓜";

export type AnimalType = "猹" | "水豚" | "狐狸" | "熊猫" | "青蛙" | "仓鼠";

export interface IslandUser {
  id: string;
  nickname: string;
  animalType: AnimalType;
  animalEmoji: string;
  level: number;
  seedCount: number;
  region: Region;
  joinedAt: string;
}

export interface IslandPost {
  id: string;
  userId: string;
  authorName: string;
  authorEmoji: string;
  title: string;
  content: string;
  category: PostCategory;
  region: Region;
  status: "growing" | "ripe";
  createdAt: string;
  viewCount: number;
  eatCount: number;
}

export interface IslandComment {
  id: string;
  postId: string;
  userId: string;
  authorName: string;
  authorEmoji: string;
  content: string;
  createdAt: string;
}

export interface SeedRecord {
  id: string;
  userId: string;
  action: "join" | "post" | "eat" | "comment";
  amount: number;
  createdAt: string;
}

export interface IslandState {
  version: 1;
  user: IslandUser | null;
  posts: IslandPost[];
  comments: IslandComment[];
  eatenPostIds: string[];
  seedRecords: SeedRecord[];
}

export interface CreatePostInput {
  title: string;
  content: string;
  category: PostCategory;
}

const animalIdentities = [
  { type: "猹", emoji: "🐹", names: ["巡岛小猹", "月光小猹", "听风小猹"] },
  { type: "水豚", emoji: "🦫", names: ["松弛水豚", "泡澡水豚", "慢慢水豚"] },
  { type: "狐狸", emoji: "🦊", names: ["路过狐狸", "夜行狐狸", "好奇狐狸"] },
  { type: "熊猫", emoji: "🐼", names: ["熬夜熊猫", "竹林熊猫", "围观熊猫"] },
  { type: "青蛙", emoji: "🐸", names: ["摸鱼青蛙", "雨后青蛙", "池塘青蛙"] },
  { type: "仓鼠", emoji: "🐹", names: ["加班仓鼠", "屯粮仓鼠", "暴躁仓鼠"] },
] as const;

const seedPosts: IslandPost[] = [
  {
    id: "seed-post-1",
    userId: "seed-user-1",
    authorName: "加班仓鼠 237",
    authorEmoji: "🐹",
    title: "老板凌晨 12 点发需求，还问我睡了吗",
    content: "我回了一个“刚准备睡”。他秒回：那正好，有个小改动。现在我和五一广场的路灯一样精神。",
    category: "职场瓜",
    region: "五一广场",
    status: "ripe",
    createdAt: "2026-08-04T00:36:00.000Z",
    viewCount: 326,
    eatCount: 86,
  },
  {
    id: "seed-post-2",
    userId: "seed-user-2",
    authorName: "泡澡水豚 092",
    authorEmoji: "🦫",
    title: "岳麓山脚那家粉店，我愿称它为雨天救星",
    content: "不是网红店，门口只有四张桌子。老板会多送一勺酸豆角，今天一碗热汤把我从坏心情里捞出来了。",
    category: "日常瓜",
    region: "岳麓山",
    status: "ripe",
    createdAt: "2026-08-03T11:20:00.000Z",
    viewCount: 189,
    eatCount: 53,
  },
  {
    id: "seed-post-3",
    userId: "seed-user-3",
    authorName: "夜行狐狸 511",
    authorEmoji: "🦊",
    title: "搬来河西的第 14 天，终于有人记住了我的名字",
    content: "楼下便利店阿姨今天说：你还是老样子，冰美式不要糖。原来被一个陌生人记住，也会有一点像回家。",
    category: "情感瓜",
    region: "河西",
    status: "ripe",
    createdAt: "2026-08-02T13:08:00.000Z",
    viewCount: 241,
    eatCount: 72,
  },
  {
    id: "seed-post-4",
    userId: "seed-user-4",
    authorName: "摸鱼青蛙 404",
    authorEmoji: "🐸",
    title: "星沙今晚的云像一艘很慢的船",
    content: "下班路上抬头看了五分钟。最近总在赶路，差点忘了天空其实不收门票。",
    category: "日常瓜",
    region: "星沙",
    status: "ripe",
    createdAt: "2026-08-04T10:15:00.000Z",
    viewCount: 96,
    eatCount: 31,
  },
];

const seedComments: IslandComment[] = [
  {
    id: "seed-comment-1",
    postId: "seed-post-1",
    userId: "seed-user-5",
    authorName: "围观熊猫 118",
    authorEmoji: "🐼",
    content: "“小改动”是职场最大的悬疑片。",
    createdAt: "2026-08-04T01:02:00.000Z",
  },
  {
    id: "seed-comment-2",
    postId: "seed-post-2",
    userId: "seed-user-6",
    authorName: "听风小猹 016",
    authorEmoji: "🐹",
    content: "求一个更具体的位置，我也想被热汤捞一下。",
    createdAt: "2026-08-03T12:10:00.000Z",
  },
];

export const regions: Region[] = ["五一广场", "岳麓山", "河西", "星沙"];
export const categories: PostCategory[] = ["日常瓜", "职场瓜", "情感瓜", "大瓜"];

export function createInitialState(): IslandState {
  return {
    version: 1,
    user: null,
    posts: seedPosts,
    comments: seedComments,
    eatenPostIds: [],
    seedRecords: [],
  };
}

export function createAnonymousUser(region: Region, random = Math.random()): IslandUser {
  const identity = animalIdentities[Math.floor(random * animalIdentities.length) % animalIdentities.length];
  const baseName = identity.names[Math.floor(random * identity.names.length) % identity.names.length];
  const suffix = String(Math.floor(random * 900) + 100);
  const now = new Date().toISOString();

  return {
    id: `local-${now}-${suffix}`,
    nickname: `${baseName} ${suffix}`,
    animalType: identity.type,
    animalEmoji: identity.emoji,
    level: 1,
    seedCount: 12,
    region,
    joinedAt: now,
  };
}

export function joinIsland(state: IslandState, region: Region, random = Math.random()): IslandState {
  const user = createAnonymousUser(region, random);
  return {
    ...state,
    user,
    seedRecords: [
      ...state.seedRecords,
      {
        id: `seed-${user.id}`,
        userId: user.id,
        action: "join",
        amount: 12,
        createdAt: user.joinedAt,
      },
    ],
  };
}

export function changeRegion(state: IslandState, region: Region): IslandState {
  if (!state.user) return state;
  return { ...state, user: { ...state.user, region } };
}

export function createPost(state: IslandState, input: CreatePostInput): IslandState {
  if (!state.user) return state;
  const now = new Date().toISOString();
  const post: IslandPost = {
    id: `post-${now}`,
    userId: state.user.id,
    authorName: state.user.nickname,
    authorEmoji: state.user.animalEmoji,
    title: input.title.trim(),
    content: input.content.trim(),
    category: input.category,
    region: state.user.region,
    status: "ripe",
    createdAt: now,
    viewCount: 1,
    eatCount: 0,
  };

  return {
    ...state,
    user: { ...state.user, seedCount: state.user.seedCount + 5 },
    posts: [post, ...state.posts],
    seedRecords: [
      ...state.seedRecords,
      { id: `seed-post-${now}`, userId: state.user.id, action: "post", amount: 5, createdAt: now },
    ],
  };
}

export function eatPost(state: IslandState, postId: string): IslandState {
  if (!state.user || state.eatenPostIds.includes(postId)) return state;
  const now = new Date().toISOString();
  return {
    ...state,
    user: { ...state.user, seedCount: state.user.seedCount + 1 },
    posts: state.posts.map((post) => (post.id === postId ? { ...post, eatCount: post.eatCount + 1 } : post)),
    eatenPostIds: [...state.eatenPostIds, postId],
    seedRecords: [
      ...state.seedRecords,
      { id: `seed-eat-${now}`, userId: state.user.id, action: "eat", amount: 1, createdAt: now },
    ],
  };
}

export function addComment(state: IslandState, postId: string, content: string): IslandState {
  if (!state.user || !content.trim()) return state;
  const now = new Date().toISOString();
  const comment: IslandComment = {
    id: `comment-${now}`,
    postId,
    userId: state.user.id,
    authorName: state.user.nickname,
    authorEmoji: state.user.animalEmoji,
    content: content.trim(),
    createdAt: now,
  };

  return {
    ...state,
    user: { ...state.user, seedCount: state.user.seedCount + 2 },
    comments: [...state.comments, comment],
    seedRecords: [
      ...state.seedRecords,
      { id: `seed-comment-${now}`, userId: state.user.id, action: "comment", amount: 2, createdAt: now },
    ],
  };
}

export function formatRelativeTime(dateString: string, now = Date.now()): string {
  const diffMinutes = Math.max(1, Math.floor((now - new Date(dateString).getTime()) / 60000));
  if (diffMinutes < 60) return `${diffMinutes} 分钟前`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} 小时前`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} 天前`;
}
