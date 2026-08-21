#!/usr/bin/env node

import { assertSafeExecutionEnvironment, buildMigrationPlan } from "./catalog.mjs";

const args = new Set(process.argv.slice(2));
const targetArgument = process.argv.find((argument) => argument.startsWith("--target="));
const target = targetArgument?.slice("--target=".length) || "managed";
const plan = buildMigrationPlan(target);

if (args.has("--execute")) {
  assertSafeExecutionEnvironment(process.env);
  throw new Error(
    "network execution is intentionally disabled in the preparation package; follow docs/migration/RUNBOOK.md during an approved migration window",
  );
}

process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
