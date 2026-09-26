import crypto from "crypto";
import { runQuery, getDatabaseUrl } from "../db/connection";
import { readJson, writeJson } from "./user-data-store";

/**
 * 账号服务（PG 存储优先 + 对象存储回退）
 *  - 配置 DATABASE_URL 时读写 app_users / user_favorites 表（见 db/migrations/012），实例重启不丢；
 *  - 未配置时走 user-data-store：配了 COS_* 落对象存储（实例重建不丢），否则本地文件（重建即丢）；
 *  - 密码 scrypt + 随机盐；会话为 HMAC-SHA256 签名 Cookie，服务端无会话表。
 */

/** 是否启用 PG 存储：仅依赖 DATABASE_URL，部署接库即自动生效，无需额外开关 */
function usePg(): boolean {
  return Boolean(getDatabaseUrl());
}

/** PG 唯一约束冲突（23505），用于把重复用户名翻译成业务错误 */
function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string })?.code === "23505";
}

const USERS_KEY = "users.json";
const DEV_FALLBACK_SECRET = "hiking-route-mvp-dev-secret-2026";

// 生产环境禁止使用内置默认密钥：否则任何人都能伪造会话 Cookie。
// 延迟到运行时校验，避免 build 阶段（NODE_ENV=production）因缺变量而失败。
function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("生产环境必须配置 AUTH_SECRET 环境变量，禁止使用内置默认密钥");
  }
  return DEV_FALLBACK_SECRET;
}
export const SESSION_COOKIE = "hr_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 天

export type StoredUser = {
  user_id: string;
  username: string;
  pass_hash: string;
  salt: string;
  created_at: string;
};

export type PublicUser = { user_id: string; username: string; created_at: string };

async function readUsers(): Promise<StoredUser[]> {
  const raw = await readJson<{ users: StoredUser[] }>(USERS_KEY);
  return Array.isArray(raw?.users) ? raw.users : [];
}

async function writeUsers(users: StoredUser[]): Promise<void> {
  await writeJson(USERS_KEY, { users });
}

function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 32).toString("hex");
}

/** PG 返回的 created_at 可能是 Date，统一成 ISO 字符串，保证与文件存储行为一致 */
function toIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

export function validateUsername(username: string): string | null {
  if (!/^[a-zA-Z0-9_\u4e00-\u9fa5]{2,24}$/.test(username)) {
    return "用户名需为 2-24 位字母、数字、下划线或中文";
  }
  return null;
}

export function validatePassword(password: string): string | null {
  if (typeof password !== "string" || password.length < 6 || password.length > 64) {
    return "密码需为 6-64 位字符";
  }
  return null;
}

export async function createUser(
  username: string,
  password: string,
): Promise<{ ok: true; user: PublicUser } | { ok: false; message: string }> {
  const salt = crypto.randomBytes(16).toString("hex");
  const now = new Date().toISOString();
  const user: StoredUser = {
    user_id: `u_${crypto.randomBytes(6).toString("hex")}`,
    username,
    salt,
    pass_hash: hashPassword(password, salt),
    created_at: now,
  };

  if (usePg()) {
    try {
      const res = await runQuery<{ user_id: string; username: string; created_at: string | Date }>(
        `INSERT INTO app_users (user_id, username, pass_hash, salt, created_at)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING user_id, username, created_at`,
        [user.user_id, user.username, user.pass_hash, user.salt, user.created_at],
      );
      const row = res.rows[0];
      return {
        ok: true,
        user: { user_id: row.user_id, username: row.username, created_at: toIso(row.created_at) },
      };
    } catch (err) {
      // 并发注册也由数据库唯一约束兜底，避免仅靠应用层先查后写
      if (isUniqueViolation(err)) return { ok: false, message: "用户名已被占用" };
      throw err;
    }
  }

  const users = await readUsers();
  if (users.some((u) => u.username === username)) {
    return { ok: false, message: "用户名已被占用" };
  }
  users.push(user);
  await writeUsers(users);
  return { ok: true, user: { user_id: user.user_id, username: user.username, created_at: user.created_at } };
}

export async function verifyUser(username: string, password: string): Promise<PublicUser | null> {
  let stored: StoredUser | null = null;

  if (usePg()) {
    const res = await runQuery<{ user_id: string; username: string; pass_hash: string; salt: string; created_at: string | Date }>(
      `SELECT user_id, username, pass_hash, salt, created_at FROM app_users WHERE username = $1`,
      [username],
    );
    const row = res.rows[0];
    if (row) {
      stored = {
        user_id: row.user_id,
        username: row.username,
        pass_hash: row.pass_hash,
        salt: row.salt,
        created_at: toIso(row.created_at),
      };
    }
  } else {
    stored = (await readUsers()).find((u) => u.username === username) ?? null;
  }

  if (!stored) return null;
  const hash = hashPassword(password, stored.salt);
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(stored.pass_hash, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return { user_id: stored.user_id, username: stored.username, created_at: stored.created_at };
}

export async function getUserById(userId: string): Promise<PublicUser | null> {
  if (usePg()) {
    const res = await runQuery<{ user_id: string; username: string; created_at: string | Date }>(
      `SELECT user_id, username, created_at FROM app_users WHERE user_id = $1`,
      [userId],
    );
    const row = res.rows[0];
    if (!row) return null;
    return { user_id: row.user_id, username: row.username, created_at: toIso(row.created_at) };
  }
  const user = (await readUsers()).find((u) => u.user_id === userId);
  if (!user) return null;
  return { user_id: user.user_id, username: user.username, created_at: user.created_at };
}

/* ---------- 会话签名 ---------- */

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function hmac(data: string): string {
  return crypto.createHmac("sha256", getSecret()).update(data).digest("base64url");
}

export function signSession(userId: string): string {
  const payload = b64url(JSON.stringify({ uid: userId, exp: Date.now() + SESSION_TTL_MS }));
  return `${payload}.${hmac(payload)}`;
}

export function verifySession(token: string | undefined | null): string | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = hmac(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8")) as { uid?: string; exp?: number };
    if (!parsed.uid || typeof parsed.exp !== "number" || parsed.exp < Date.now()) return null;
    return parsed.uid;
  } catch {
    return null;
  }
}

/* ---------- 用户数据（收藏等） ---------- */

export type FavoriteItem = { route_id: string; route_name: string; saved_at: string };

/** 对象存储 key 沿用原文件名，便于已有的本地数据平滑迁移 */
function userDataKey(userId: string): string {
  return `${userId}.json`;
}

export async function readUserData(userId: string): Promise<{ favorites: FavoriteItem[] }> {
  if (usePg()) {
    const res = await runQuery<{ route_id: string; route_name: string; saved_at: string | Date }>(
      `SELECT route_id, route_name, saved_at FROM user_favorites
       WHERE user_id = $1 ORDER BY saved_at DESC`,
      [userId],
    );
    return {
      favorites: res.rows.map((r) => ({
        route_id: r.route_id,
        route_name: r.route_name,
        saved_at: toIso(r.saved_at),
      })),
    };
  }
  const raw = await readJson<{ favorites: FavoriteItem[] }>(userDataKey(userId));
  return { favorites: Array.isArray(raw?.favorites) ? raw.favorites : [] };
}

async function writeUserData(userId: string, data: { favorites: FavoriteItem[] }): Promise<void> {
  await writeJson(userDataKey(userId), data);
}

export async function addFavorite(
  userId: string,
  routeId: string,
  routeName: string,
): Promise<{ ok: boolean; favorites: FavoriteItem[] }> {
  if (usePg()) {
    // ON CONFLICT DO NOTHING：重复收藏不再产生重复行
    await runQuery(
      `INSERT INTO user_favorites (user_id, route_id, route_name, saved_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, route_id) DO NOTHING`,
      [userId, routeId, routeName, new Date().toISOString()],
    );
    const data = await readUserData(userId);
    return { ok: true, favorites: data.favorites };
  }
  const data = await readUserData(userId);
  if (!data.favorites.some((f) => f.route_id === routeId)) {
    data.favorites.unshift({ route_id: routeId, route_name: routeName, saved_at: new Date().toISOString() });
    await writeUserData(userId, data);
  }
  return { ok: true, favorites: data.favorites };
}

export async function removeFavorite(userId: string, routeId: string): Promise<FavoriteItem[]> {
  if (usePg()) {
    await runQuery(`DELETE FROM user_favorites WHERE user_id = $1 AND route_id = $2`, [userId, routeId]);
    const data = await readUserData(userId);
    return data.favorites;
  }
  const data = await readUserData(userId);
  data.favorites = data.favorites.filter((f) => f.route_id !== routeId);
  await writeUserData(userId, data);
  return data.favorites;
}
