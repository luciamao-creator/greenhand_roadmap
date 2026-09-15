import { Pool, type QueryResult as PgQueryResult } from "pg";

export type SqlRow = Record<string, unknown>;

export type QueryResult<T extends SqlRow = SqlRow> = {
  rows: T[];
  rowCount: number;
};

export function getDatabaseUrl() {
  return process.env.DATABASE_URL;
}

export function isPgRepositoryEnabled() {
  return process.env.ADMIN_REPOSITORY_DRIVER === "pg";
}

declare global {
  // eslint-disable-next-line no-var
  var __route_admin_pg_pool__: Pool | undefined;
}

function getPool() {
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured");
  }

  if (!globalThis.__route_admin_pg_pool__) {
    globalThis.__route_admin_pg_pool__ = new Pool({
      connectionString: databaseUrl,
      max: 10,
      idleTimeoutMillis: 30000,
    });
  }

  return globalThis.__route_admin_pg_pool__;
}

export async function runQuery<T extends SqlRow = SqlRow>(
  sql: string,
  params: unknown[] = [],
): Promise<QueryResult<T>> {
  const result: PgQueryResult<T> = await getPool().query(sql, params);
  return {
    rows: result.rows,
    rowCount: result.rowCount ?? result.rows.length,
  };
}
