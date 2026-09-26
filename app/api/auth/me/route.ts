import { NextRequest, NextResponse } from "next/server";
import { getUserById, verifySession, SESSION_COOKIE } from "../../../../lib/server/services/auth-service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const userId = verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!userId) return NextResponse.json({ code: "UNAUTHORIZED", data: { user: null } });
  const user = await getUserById(userId);
  if (!user) return NextResponse.json({ code: "UNAUTHORIZED", data: { user: null } });
  return NextResponse.json({ code: "OK", data: { user } });
}
