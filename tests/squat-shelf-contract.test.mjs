import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = async (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("蹲瓜架只读取当前匿名身份，并由服务端成熟时间计算未读", async () => {
  const migration = await source("supabase/migrations/202608120001_squat_shelf.sql");
  assert.match(migration, /add column if not exists mature_seen_at timestamptz/);
  assert.match(migration, /effective_melon_status\(m\.status, m\.matures_at, m\.completed_reads\)/);
  assert.match(migration, /where s\.user_id = actor/);
  assert.match(migration, /'unread', r\.effective_status = 'mature' and r\.mature_seen_at is null/);
  assert.match(migration, /coalesce\(ps\.name, '附近生活圈'\) as resolved_spot_name/);
  assert.doesNotMatch(migration, /nearby_cell_id|latitude|longitude/);
});

test("已成熟后才蹲的瓜不会伪造新提醒，取消蹲瓜会从架上移除", async () => {
  const migration = await source("supabase/migrations/202608120001_squat_shelf.sql");
  assert.match(migration, /case when effective_status = 'mature' then statement_timestamp\(\) else null end/);
  assert.match(migration, /delete from public\.squats where user_id = actor and melon_id = p_melon_id/);
});

test("站内提醒 API 使用动态 GET，已读操作要求同源和活动会话", async () => {
  const [listRoute, seenRoute] = await Promise.all([
    source("src/app/api/squats/route.ts"),
    source("src/app/api/squats/[id]/seen/route.ts"),
  ]);
  assert.match(listRoute, /export const dynamic = "force-dynamic"/);
  assert.match(listRoute, /requireSession\(\)/);
  assert.match(listRoute, /getSquatShelf\(session\.accessToken\)/);
  assert.match(seenRoute, /requireSameOrigin\(request\)/);
  assert.match(seenRoute, /requireActiveSession\(\)/);
  assert.match(seenRoute, /markSquatAlertSeen\(id, session\.accessToken\)/);
});

test("前端契约包含蹲瓜架、未读数量和成熟直达动作", async () => {
  const [contracts, adapter, component] = await Promise.all([
    source("src/contracts/index.ts"),
    source("src/components/demo-island-adapter.ts"),
    source("src/components/chacha-island.tsx"),
  ]);
  assert.match(contracts, /export interface SquatShelf/);
  assert.match(contracts, /unreadCount: number/);
  assert.match(adapter, /squatShelf\(\): Promise<SquatShelf>/);
  assert.match(adapter, /markSquatSeen\(id: string\): Promise/);
  assert.match(component, /蹲瓜架/);
  assert.match(component, /squat-unread-badge/);
  assert.match(component, /onOpen/);
});
