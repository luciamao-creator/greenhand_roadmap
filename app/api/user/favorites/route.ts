import { NextRequest, NextResponse } from "next/server";
import { getUserById, verifySession, readUserData, addFavorite, removeFavorite, SESSION_COOKIE } from "../../../../lib/server/services/auth-service";

export const dynamic = "force-dynamic";

function currentUserId(req: NextRequest): string | null {
  return verifySession(req.cookies.get(SESSION_COOKIE)?.value);
}

export async function GET(req: NextRequest) {
  const userId = currentUserId(req);
  if (!userId) return NextResponse.json({ code: "UNAUTHORIZED", message: "请先登录" }, { status: 401 });
  const user = await getUserById(userId);
  if (!user) return NextResponse.json({ code: "UNAUTHORIZED", message: "账号不存在" }, { status: 401 });
  const data = await readUserData(userId);
  return NextResponse.json({ code: "OK", data: { favorites: data.favorites } });
}

export async function POST(req: NextRequest) {
  const userId = currentUserId(req);
  if (!userId) return NextResponse.json({ code: "UNAUTHORIZED", message: "请先登录" }, { status: 401 });
  let body: { route_id?: string; route_name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ code: "BAD_JSON", message: "请求体不是合法 JSON" }, { status: 400 });
  }
  const routeId = (body.route_id ?? "").trim();
  if (!routeId) return NextResponse.json({ code: "INVALID_REQUEST", message: "route_id 不能为空" }, { status: 400 });
  const { favorites } = await addFavorite(userId, routeId, (body.route_name ?? routeId).trim());
  return NextResponse.json({ code: "OK", data: { favorites } });
}

export async function DELETE(req: NextRequest) {
  const userId = currentUserId(req);
  if (!userId) return NextResponse.json({ code: "UNAUTHORIZED", message: "请先登录" }, { status: 401 });
  const routeId = req.nextUrl.searchParams.get("routeId")?.trim();
  if (!routeId) return NextResponse.json({ code: "INVALID_REQUEST", message: "routeId 不能为空" }, { status: 400 });
  const favorites = await removeFavorite(userId, routeId);
  return NextResponse.json({ code: "OK", data: { favorites } });
}
