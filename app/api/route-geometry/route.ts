import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

const WEB_KEY = process.env.AMAP_WEB_SERVICE_KEY;
const cache = new Map<string, [number, number][]>();

type LngLat = { lng: number; lat: number };

function loadEndpoints(routeId: string): { start?: LngLat; end?: LngLat } | null {
  const file = path.join(process.cwd(), "data", "routes", `${routeId}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf-8"));
    const geo = raw.geometry ?? {};
    return { start: geo.start_point, end: geo.end_point };
  } catch {
    return null;
  }
}

// 仓库里已由 sync-geometry 预生成好高德步行轨迹，优先直接用：
// 不依赖 AMAP_WEB_SERVICE_KEY，任意环境（含沙箱/离线）都能出轨迹，也省 API 配额。
function loadCachedPath(routeId: string): [number, number][] | null {
  const file = path.join(process.cwd(), "data", "routes", `${routeId}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf-8"));
    const pts: any[] = raw.geometry?.amap_walking_path ?? [];
    const coords: [number, number][] = [];
    for (const p of pts) {
      const lng = Number(p?.lng);
      const lat = Number(p?.lat);
      if (Number.isFinite(lng) && Number.isFinite(lat)) coords.push([lng, lat]);
    }
    return coords.length >= 2 ? coords : null;
  } catch {
    return null;
  }
}

async function walkingPath(start: LngLat, end: LngLat): Promise<[number, number][] | null> {
  if (!WEB_KEY) return null;
  const url =
    "https://restapi.amap.com/v3/direction/walking?origin=" +
    `${start.lng},${start.lat}&destination=${end.lng},${end.lat}&key=${WEB_KEY}`;
  try {
    const res = await fetch(url);
    const json = await res.json();
    if (json.status !== "1") return null;
    const steps: any[] = json.route?.paths?.[0]?.steps ?? [];
    const coords: [number, number][] = [];
    for (const step of steps) {
      const segs = String(step.polyline || "").split(";");
      for (const seg of segs) {
        const [lng, lat] = seg.split(",").map(Number);
        if (Number.isFinite(lng) && Number.isFinite(lat)) coords.push([lng, lat]);
      }
    }
    return coords.length >= 2 ? coords : null;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const routeId = new URL(req.url).searchParams.get("routeId");
  if (!routeId) {
    return NextResponse.json({ code: "BAD_PARAM", message: "缺少 routeId" }, { status: 400 });
  }
  const cached = cache.get(routeId);
  if (cached) return NextResponse.json({ code: "OK", data: { path: cached, cached: true } });

  // 1) 仓库内预生成轨迹（无需 key，首选）
  const stored = loadCachedPath(routeId);
  if (stored) {
    cache.set(routeId, stored);
    return NextResponse.json({ code: "OK", data: { path: stored, cached: true } });
  }

  // 2) 回退：实时调高德规划（需要 key）
  if (!WEB_KEY) {
    return NextResponse.json(
      { code: "NO_KEY", message: "未配置 AMAP_WEB_SERVICE_KEY，且该线路无预生成轨迹" },
      { status: 200 },
    );
  }

  const ep = loadEndpoints(routeId);
  if (!ep || !ep.start || !ep.end) {
    return NextResponse.json({ code: "NO_GEOMETRY", message: "线路缺少起终点坐标" }, { status: 200 });
  }

  const coords = await walkingPath(ep.start, ep.end);
  if (!coords || coords.length < 2) {
    return NextResponse.json({ code: "NO_ROUTE", message: "未规划出步行轨迹" }, { status: 200 });
  }
  cache.set(routeId, coords);
  return NextResponse.json({ code: "OK", data: { path: coords } });
}
