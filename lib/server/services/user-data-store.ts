import fs from "fs";
import path from "path";
import COS from "cos-nodejs-sdk-v5";

/**
 * 账号数据读写（对象存储优先 + 本地文件回退）
 *
 * 为什么要有这层：云托管容器的磁盘是临时的，服务重新部署 / 实例重建后 data/user-data 里的
 * 账号数据会丢失。配置 COS_* 后账号数据落到对象存储，实例重建不丢，成本按实际用量计（
 * 数据量在 KB 级，月成本接近于零），因此可作为买不起托管 PostgreSQL 时的持久方案。
 *
 * 局限（必须知悉）：「读-改-写」不是原子操作，同一瞬间并发注册可能互相覆盖。
 * 个人/小范围使用无碍；若要支撑高并发写入，应改用 DATABASE_URL 走 PG 分支（见 db/migrations/012）。
 */

const DATA_DIR = path.join(process.cwd(), "data", "user-data");

type CosContext = {
  cos: COS;
  bucket: string;
  region: string;
};

function cosContext(): CosContext | null {
  const bucket = process.env.COS_BUCKET;
  const region = process.env.COS_REGION;
  const secretId = process.env.TENCENTCLOUD_SECRET_ID;
  const secretKey = process.env.TENCENTCLOUD_SECRET_KEY;
  if (!bucket || !region || !secretId || !secretKey) return null;
  return { cos: new COS({ SecretId: secretId, SecretKey: secretKey }), bucket, region };
}

/** 是否已启用对象存储持久化（未配置时落在容器临时磁盘，重建即丢） */
export function useObjectStore(): boolean {
  return cosContext() !== null;
}

function localPath(key: string): string {
  return path.join(DATA_DIR, key);
}

function isNotFound(err: unknown): boolean {
  const code = (err as { statusCode?: number; code?: string })?.statusCode;
  const name = (err as { code?: string })?.code;
  return code === 404 || name === "NoSuchKey";
}

export async function readJson<T>(key: string): Promise<T | null> {
  const ctx = cosContext();

  if (ctx) {
    try {
      const res = await ctx.cos.getObject({
        Bucket: ctx.bucket,
        Region: ctx.region,
        Key: key,
      });
      const body = res.Body;
      const text = Buffer.isBuffer(body) ? body.toString("utf-8") : String(body ?? "");
      if (!text) return null;
      return JSON.parse(text) as T;
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  const file = localPath(key);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8")) as T;
  } catch {
    return null;
  }
}

export async function writeJson(key: string, data: unknown): Promise<void> {
  const body = JSON.stringify(data, null, 2);
  const ctx = cosContext();

  if (ctx) {
    await ctx.cos.putObject({
      Bucket: ctx.bucket,
      Region: ctx.region,
      Key: key,
      Body: body,
      ContentType: "application/json",
    });
    return;
  }

  const file = localPath(key);
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(file, body, "utf-8");
}
