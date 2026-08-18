import { cp, mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const standalone = join(root, ".next", "standalone");
const publicDir = join(root, "public");
const staticDir = join(root, ".next", "static");

async function assertDirectory(path, label) {
  const info = await stat(path).catch(() => null);
  if (!info?.isDirectory()) {
    throw new Error(`${label} not found at ${path}; run npm run build first.`);
  }
}

async function findForbiddenFiles(path, found = []) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const fullPath = join(path, entry.name);
    if (entry.isDirectory()) {
      await findForbiddenFiles(fullPath, found);
    } else if (/^\.env(?:\.|$)/i.test(entry.name) || /\.(?:pem|key|p12)$/i.test(entry.name)) {
      found.push(relative(standalone, fullPath).split(sep).join("/"));
    }
  }
  return found;
}

await assertDirectory(standalone, "standalone output");
await assertDirectory(publicDir, "public assets");
await assertDirectory(staticDir, "Next.js static assets");

await mkdir(join(standalone, ".next"), { recursive: true });
await cp(publicDir, join(standalone, "public"), { recursive: true, force: true });
await cp(staticDir, join(standalone, ".next", "static"), { recursive: true, force: true });

const forbidden = await findForbiddenFiles(standalone);
if (forbidden.length > 0) {
  throw new Error(`Refusing to package sensitive files: ${forbidden.join(", ")}`);
}

const commit = process.env.CHACHA_RELEASE_COMMIT?.trim();
if (!commit || !/^[0-9a-f]{40}$/i.test(commit)) {
  throw new Error("CHACHA_RELEASE_COMMIT must be the full 40-character Git commit SHA.");
}
const manifest = {
  application: "chacha-street",
  commit,
  createdAt: new Date().toISOString(),
  runtime: process.version,
  format: "next-standalone-v1",
};

await writeFile(join(standalone, "release-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Prepared standalone runtime for ${commit.slice(0, 12)}.`);
