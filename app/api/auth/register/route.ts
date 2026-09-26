import { NextRequest, NextResponse } from "next/server";
import { createUser, validateUsername, validatePassword, signSession, SESSION_COOKIE } from "../../../../lib/server/services/auth-service";

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
  const unameErr = validateUsername(username);
  if (unameErr) return NextResponse.json({ code: "INVALID_USERNAME", message: unameErr }, { status: 400 });
  const pwdErr = validatePassword(password);
  if (pwdErr) return NextResponse.json({ code: "INVALID_PASSWORD", message: pwdErr }, { status: 400 });

  const result = await createUser(username, password);
  if (!result.ok) {
    return NextResponse.json({ code: "USER_EXISTS", message: result.message }, { status: 409 });
  }

  const res = NextResponse.json({ code: "OK", data: { user: result.user } });
  res.cookies.set(SESSION_COOKIE, signSession(result.user.user_id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  });
  return res;
}
