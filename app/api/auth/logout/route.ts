import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "../../../../lib/server/services/auth-service";

export const dynamic = "force-dynamic";

export async function POST() {
  const res = NextResponse.json({ code: "OK", data: { logged_out: true } });
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}
