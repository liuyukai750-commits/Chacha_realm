const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;

export const MIGRATED_TABLES = Object.freeze([
  "cities",
  "districts",
  "public_spots",
  "profiles",
  "melons",
  "melon_location_anchors",
  "melon_completions",
  "seed_ledger",
  "squats",
  "reactions",
  "comments",
  "reports",
  "moderation_cases",
  "account_moderation_actions",
  "field_harvests",
  "field_plants",
  "economy_ledger",
  "melon_create_operations",
  "melon_basket_dismissals",
  "account_login_credentials",
  "account_recovery_credentials",
  "local_auth_credentials",
]);

export const RESET_AT_CUTOVER_TABLES = Object.freeze([
  "auth_phone_attempts",
  "auth_credential_attempts",
  "local_auth_sessions",
  "local_auth_security_events",
]);

export const TARGETS = Object.freeze({
  managed: Object.freeze({
    label: "腾讯云托管 PostgreSQL",
    recommendation: "recommended",
    rationale: "独立备份、监控、故障恢复与资源隔离，适合作为正式目标。",
  }),
  lighthouse: Object.freeze({
    label: "Lighthouse 本机 PostgreSQL",
    recommendation: "temporary-only",
    rationale: "2C2G 与 Next.js 共机，资源、备份和单机故障风险较高，只适合短期过渡。",
  }),
});

export function buildMigrationPlan(target = "managed") {
  const selected = TARGETS[target];
  if (!selected) throw new Error(`unknown target: ${target}`);
  return {
    mode: "dry-run",
    target,
    targetLabel: selected.label,
    recommendation: selected.recommendation,
    phases: [
      "freeze-contracts",
      "apply-source-compatibility-schema",
      "export-count-and-hash-manifest",
      "export-encrypted-data",
      "bootstrap-empty-target",
      "import-in-foreign-key-order",
      "verify-counts-hashes-and-invariants",
      "two-account-login-rehearsal",
      "short-write-freeze-and-final-delta",
      "switch-application-and-observe",
    ],
    migratedTables: [...MIGRATED_TABLES],
    resetAtCutoverTables: [...RESET_AT_CUTOVER_TABLES],
    rollback: "keep-source-read-only-and-switch-application-back",
    rationale: selected.rationale,
  };
}

export function buildManifestQuery() {
  const tableQueries = MIGRATED_TABLES.map((table, index) => `
  select ${index + 1} as ordinal, '${table}' as "table",
         count(*)::bigint as count,
         coalesce(
           encode(digest(string_agg(row_digest, '' order by row_digest), 'sha256'), 'hex'),
           encode(digest('', 'sha256'), 'hex')
         ) as digest
  from (select md5(to_jsonb(t)::text) as row_digest from public.${table} t) rows`).join("\n  union all\n");
  return `-- Read-only count/hash manifest; contains no row data or secrets.
begin transaction read only;
select jsonb_pretty(jsonb_build_object(
  'version', 1,
  'tables', jsonb_agg(to_jsonb(summary) - 'ordinal' order by ordinal)
)) from (
${tableQueries}
) summary;
rollback;
`;
}

export function assertSafeExecutionEnvironment(environment) {
  const required = {
    CHACHA_MIGRATION_STAGE: "rehearsal",
    CHACHA_MIGRATION_ACK: "COPY_TWO_TEST_ACCOUNTS_ONLY",
  };
  for (const [name, expected] of Object.entries(required)) {
    if (environment[name] !== expected) {
      throw new Error(`${name} must equal ${expected}`);
    }
  }
  const sourceHost = environment.CHACHA_SOURCE_PGHOST?.trim();
  const targetHost = environment.CHACHA_TARGET_PGHOST?.trim();
  if (!sourceHost || !targetHost) throw new Error("source and target PGHOST are required");
  if (sourceHost.toLowerCase() === targetHost.toLowerCase()) {
    throw new Error("source and target hosts must differ");
  }
  if (environment.CHACHA_ALLOW_PRODUCTION === "true") {
    throw new Error("this rehearsal package refuses production execution");
  }
  return { safe: true, sourceHost, targetHost };
}

function normalizeRows(manifest) {
  if (!manifest || manifest.version !== 1 || !Array.isArray(manifest.tables)) {
    throw new Error("invalid migration manifest");
  }
  const result = new Map();
  for (const row of manifest.tables) {
    if (!MIGRATED_TABLES.includes(row.table)) throw new Error(`unexpected table: ${row.table}`);
    if (!Number.isSafeInteger(row.count) || row.count < 0) throw new Error(`invalid count: ${row.table}`);
    if (!DIGEST_PATTERN.test(row.digest)) throw new Error(`invalid digest: ${row.table}`);
    if (result.has(row.table)) throw new Error(`duplicate table: ${row.table}`);
    result.set(row.table, { count: row.count, digest: row.digest });
  }
  return result;
}

export function compareManifests(source, target) {
  const sourceRows = normalizeRows(source);
  const targetRows = normalizeRows(target);
  const differences = [];
  for (const table of MIGRATED_TABLES) {
    const before = sourceRows.get(table);
    const after = targetRows.get(table);
    if (!before || !after) {
      differences.push({ table, reason: "missing" });
      continue;
    }
    if (before.count !== after.count || before.digest !== after.digest) {
      differences.push({ table, reason: "mismatch", source: before, target: after });
    }
  }
  return { ok: differences.length === 0, differences };
}

export function validateIdentitySample(sample) {
  if (!sample || !UUID_PATTERN.test(sample.id)) return false;
  if (!/^CC-[0-9A-HJKMNP-TV-Z]{8}$/.test(sample.publicId)) return false;
  if (typeof sample.alias !== "string" || sample.alias.length < 2) return false;
  return true;
}
