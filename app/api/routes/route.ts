import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import {
  getRouteRetriever,
  isRouteIndexBuilt,
  type RouteCard,
} from "../../../lib/server/services/route-vector-retriever";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isRouteIndexBuilt()) {
    return NextResponse.json({ code: "OK", data: [] as RouteCard[] });
  }
  const cards = await getRouteRetriever().listRouteCards();
  // 从真实数据文件回填封面图（不污染检索索引，避免缺 key 时无法列线路）
  const enriched = cards.map((c) => {
    let cover_image: string | undefined;
    try {
      const file = path.join(process.cwd(), "data", "routes", `${c.route_id}.json`);
      if (fs.existsSync(file)) {
        const raw = JSON.parse(fs.readFileSync(file, "utf-8"));
        cover_image = raw.cover_image ?? undefined;
      }
    } catch {
      /* 忽略 */
    }
    return { ...c, cover_image };
  });
  return NextResponse.json({ code: "OK", data: enriched });
}
