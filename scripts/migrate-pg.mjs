#!/usr/bin/env node
/**
 * 云端可用的 PostgreSQL 迁移执行器（仅依赖 pg 驱动，不需要 psql / pg_ctl）
 *
 * 为什么需要它：scripts/run-migrations.sh 依赖本机 psql，且会尝试启动本地 Postgres.app，
 * 在云托管环境不可用。本脚本与 shell 版共用同一套 schema_migrations 追踪表语义，
 * 因此在本地和云上执行结果一致，不会重复或漏跑。
 *
 * 用法：
 *   node scripts/migrate-pg.mjs                 # 应用所有未执行的迁移
 *   node scripts/migrate-pg.mjs --only 012_     # 只应用文件名包含该子串的迁移
 *   node scripts/migrate-pg.mjs --check         # 只打印待执行清单，不写入
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import dotenv from "dotenv";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// 云上变量来自运行环境；本地开发允许放在 .env.local / .env
dotenv.config({ path: path.join(projectRoot, ".env.local"), quiet: true });
dotenv.config({ path: path.join(projectRoot, ".env"), quiet: true });

function parseArgs(argv) {
  const opts = { only: null, check: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--only") {
      opts.only = argv[i + 1] ?? null;
      i += 1;
    } else if (argv[i] === "--check") {
      opts.check = true;
    }
  }
  return opts;
}

function resolveDatabaseUrl() {
  const direct = process.env.DATABASE_URL;
  if (direct && direct.trim()) return direct.trim();

  const host = process.env.PGHOST;
  const database = process.env.PGDATABASE;
  if (!host || !database) return null;

  const user = process.env.PGUSER ?? "postgres";
  const password = process.env.PGPASSWORD ?? "";
  const port = process.env.PGPORT ?? "5432";
  const auth = password ? `${encodeURIComponent(user)}:${encodeURIComponent(password)}` : encodeURIComponent(user);
  return `postgres://${auth}@${host}:${port}/${database}`;
}

function log(message) {
  process.stdout.write(`[migrate] ${message}\n`);
}

function fail(message) {
  process.stderr.write(`[migrate] ERROR: ${message}\n`);
  process.exit(1);
}

const opts = parseArgs(process.argv.slice(2));
const databaseUrl = resolveDatabaseUrl();

if (!databaseUrl) {
  fail("未找到数据库连接信息，请设置 DATABASE_URL（或 PGHOST/PGDATABASE 等 PG* 变量）");
}

// 云数据库（Supabase 等）强制要求 TLS；本地直连保持明文，避免证书校验噪音
const isLocal = /localhost|127\.0\.0\.1/.test(databaseUrl);
const client = new pg.Client({
  connectionString: databaseUrl,
  ssl: isLocal ? undefined : { rejectUnauthorized: false },
});

const migrationsDir = path.join(projectRoot, "db", "migrations");

if (!fs.existsSync(migrationsDir)) {
  fail(`迁移目录不存在：${migrationsDir}`);
}

const files = fs
  .readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .filter((name) => (opts.only ? name.includes(opts.only) : true))
  .sort();

if (files.length === 0) {
  fail(opts.only ? `没有匹配 --only "${opts.only}" 的迁移文件` : "没有找到迁移文件");
}

async function main() {
  await client.connect();
  log("已连接数据库");

  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  const { rows: countRows } = await client.query("SELECT count(*)::int AS n FROM schema_migrations");
  const { rows: routesRows } = await client.query("SELECT to_regclass('public.routes') IS NOT NULL AS exists");
  const migrationCount = countRows[0].n;
  const routesExists = routesRows[0].exists;

  // 与 shell 版一致：库里已有 schema 但没有迁移历史时，先把现有文件记为已执行，
  // 避免对既有库重复建表
  if (migrationCount === 0 && routesExists && !opts.only) {
    log("检测到已有 schema 但无迁移记录，执行基线标记");
    const all = fs
      .readdirSync(migrationsDir)
      .filter((name) => name.endsWith(".sql"))
      .sort();
    for (const name of all) {
      await client.query(
        "INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING",
        [name],
      );
    }
  }

  const pending = [];
  for (const name of files) {
    const { rowCount } = await client.query("SELECT 1 FROM schema_migrations WHERE filename = $1", [name]);
    if (rowCount === 0) pending.push(name);
  }

  if (pending.length === 0) {
    log("迁移均为最新，无需执行");
    return;
  }

  log(opts.check ? `待执行 ${pending.length} 个迁移（--check 模式，不写入）：` : `待执行 ${pending.length} 个迁移：`);
  for (const name of pending) log(`  - ${name}`);

  if (opts.check) return;

  for (const name of pending) {
    const sql = fs.readFileSync(path.join(migrationsDir, name), "utf-8");
    log(`应用 ${name}`);
    try {
      await client.query(sql);
    } catch (err) {
      await client.end().catch(() => {});
      fail(`迁移 ${name} 执行失败：${err?.message ?? err}`);
    }
    await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [name]);
  }

  log("迁移完成");
}

main()
  .then(() => client.end().catch(() => {}))
  .catch((err) => {
    process.stderr.write(`[migrate] ERROR: ${err?.message ?? err}\n`);
    process.exit(1);
  });
