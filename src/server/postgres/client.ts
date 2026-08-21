import "server-only";

import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";

import { unavailable } from "@/server/api";

export interface PostgresQueryable {
  query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<Row>>;
}

let pool: Pool | undefined;

function databaseUrl(): string {
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw) throw unavailable();
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw unavailable();
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw unavailable();
  }
  return raw;
}

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: databaseUrl(),
      application_name: "chacha-street",
      max: 10,
      connectionTimeoutMillis: 8_000,
      idleTimeoutMillis: 30_000,
      statement_timeout: 8_000,
    });
  }
  return pool;
}

export function postgresQuery<Row extends QueryResultRow = QueryResultRow>(
  text: string,
  values: readonly unknown[] = [],
): Promise<QueryResult<Row>> {
  return getPool().query<Row>(text, [...values]);
}

export async function withPostgresTransaction<T>(
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const result = await operation(client);
    await client.query("commit");
    return result;
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      // Preserve the original failure. The pool discards broken clients.
    }
    throw error;
  } finally {
    client.release();
  }
}
