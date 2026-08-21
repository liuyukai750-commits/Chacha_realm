import { spawnSync } from "node:child_process";

const isWindows = process.platform === "win32";
const executable = isWindows ? process.env.ComSpec ?? "cmd.exe" : "npx";
const args = isWindows
  ? ["/d", "/s", "/c", "npx.cmd supabase@2.114.0 db push --linked --dry-run"]
  : ["supabase@2.114.0", "db", "push", "--linked", "--dry-run"];
function readMigrationList() {
  return spawnSync(executable, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    windowsHide: true,
  });
}

let result = readMigrationList();
if (result.status !== 0 && !result.error) {
  console.warn("Supabase 迁移状态首次读取失败，正在做一次短重试。");
  result = readMigrationList();
}

if (result.status !== 0) {
  process.stderr.write(
    result.error?.message
      ? `无法读取 Supabase 迁移状态：${result.error.message}\n`
      : result.stderr || result.stdout || "无法读取 Supabase 迁移状态。\n",
  );
  process.exit(result.status ?? 1);
}

const jsonLine = result.stdout
  .split(/\r?\n/)
  .map((line) => line.trim())
  .find((line) => line.startsWith("{") && line.endsWith("}"));

if (!jsonLine) {
  process.stderr.write("Supabase CLI 没有返回可解析的迁移清单。\n");
  process.exit(1);
}

const payload = JSON.parse(jsonLine);
const migrations = Array.isArray(payload.migrations) ? payload.migrations : [];

if (!payload.upToDate || migrations.length) {
  console.error(
    migrations.length
      ? `测试 Supabase 缺少迁移：${migrations.join(", ")}`
      : "测试 Supabase 迁移状态未齐平。",
  );
  process.exit(1);
}

console.log(`Supabase 迁移已齐平（${migrations.length} 条）。`);
