import { NextRequest } from "next/server";
import { error, ok } from "../../../../lib/server/api/admin-response";
import { listSubmissions } from "../../../../lib/server/services/submission-store";

/**
 * GET /api/admin/submissions
 * 返回落盘的用户投稿（候选路线 + 线路上报），供后台审核查看。
 * 若设置了 ADMIN_VIEW_TOKEN，需通过 ?token= 或 x-admin-token 头鉴权。
 */
export async function GET(request: NextRequest) {
  const expected = process.env.ADMIN_VIEW_TOKEN;
  const isProd = process.env.NODE_ENV === "production";
  if (expected) {
    const provided = request.nextUrl.searchParams.get("token") ?? request.headers.get("x-admin-token");
    if (provided !== expected) {
      return error("UNAUTHORIZED", "invalid or missing admin token", 401, "req_admin_submissions_list");
    }
  } else if (isProd) {
    // 生产环境未配置鉴权变量时锁定接口，避免投稿人联系方式等隐私公网泄露
    return error("UNAUTHORIZED", "ADMIN_VIEW_TOKEN not configured", 401, "req_admin_submissions_list");
  }

  try {
    return ok(listSubmissions(), "req_admin_submissions_list");
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "failed to read submissions";
    return error("INTERNAL", message, 500, "req_admin_submissions_list");
  }
}
