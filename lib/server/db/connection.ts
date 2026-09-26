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

/**
 * 云数据库（Supabase / 腾讯云等）通常强制 TLS，而 pg 默认不启用 SSL，直接连会握手失败。
 * 策略：连接串已声明 sslmode 时交给 pg 自己解析；否则非本地地址默认启用 TLS。
 * 本地（localhost）保持明文，避免自签证书校验噪音。
 */
function buildSslOption(databaseUrl: string) {
  if (/\bsslmode=/i.test(databaseUrl)) return null;
  if (/localhost|127\.0\.0\.1/.test(databaseUrl)) return null;
  return { rejectUnauthorized: false };
}

function getPool() {
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured");
  }

  if (!globalThis.__route_admin_pg_pool__) {
    const ssl = buildSslOption(databaseUrl);
    globalThis.__route_admin_pg_pool__ = new Pool({
      connectionString: databaseUrl,
      ...(ssl ? { ssl } : {}),
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
