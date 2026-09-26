import { NextRequest, NextResponse } from "next/server";
import { verifyUser, signSession, SESSION_COOKIE } from "../../../../lib/server/services/auth-service";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { username?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ code: "BAD_JSON", message: "请求体不是合法 JSON" }, { status: 400 });
  }
  const username = (body.username ?? "").trim();
  const password = body.password ?? "";
  if (!username || !password) {
    return NextResponse.json({ code: "MISSING_FIELDS", message: "请输入用户名和密码" }, { status: 400 });
  }
  const user = await verifyUser(username, password);
  if (!user) {
    return NextResponse.json({ code: "BAD_CREDENTIALS", message: "用户名或密码错误" }, { status: 401 });
  }
  const res = NextResponse.json({ code: "OK", data: { user } });
  res.cookies.set(SESSION_COOKIE, signSession(user.user_id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  });
  return res;
}
