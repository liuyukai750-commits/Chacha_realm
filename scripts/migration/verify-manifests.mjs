#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { compareManifests } from "./catalog.mjs";

const [, , sourcePath, targetPath] = process.argv;
if (!sourcePath || !targetPath) {
  process.stderr.write("usage: node scripts/migration/verify-manifests.mjs SOURCE.json TARGET.json\n");
  process.exitCode = 2;
} else {
  const [source, target] = await Promise.all([
    readFile(sourcePath, "utf8").then(JSON.parse),
    readFile(targetPath, "utf8").then(JSON.parse),
  ]);
  const result = compareManifests(source, target);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
}
