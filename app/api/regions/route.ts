import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

type Pt = { lng: number; lat: number } | null;

/** 用线路真实几何估计该线路的参考坐标（优先起点，其次轨迹中点） */
function centroid(route: Record<string, any>): Pt {
  const geo = route.geometry ?? {};
  if (geo.start_point?.lng != null && geo.start_point?.lat != null) return geo.start_point;
  const path = Array.isArray(geo.amap_walking_path) ? geo.amap_walking_path : [];
  if (path.length) return path[Math.floor(path.length / 2)];
  return null;
}

function avg(pts: Pt[]): { lng: number; lat: number } | null {
  const ok = pts.filter(Boolean) as { lng: number; lat: number }[];
  if (!ok.length) return null;
  return {
    lng: ok.reduce((a, p) => a + p.lng, 0) / ok.length,
    lat: ok.reduce((a, p) => a + p.lat, 0) / ok.length,
  };
}

/**
 * 返回各省份（及城市）的参考坐标，供前端把 GPS 定位映射到「当前地区」。
 * count 仅用于内部，不向前端暴露线路总数（避免范围暴露）。
 */
export async function GET() {
  const dir = path.join(process.cwd(), "data", "routes");
  if (!fs.existsSync(dir)) {
    return NextResponse.json({ code: "OK", data: { provinces: [] } });
  }

  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  const byProvince = new Map<string, { pts: Pt[]; cities: Map<string, Pt[]> }>();

  for (const f of files) {
    try {
      const route = JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8"));
      const base = route.base_facts ?? {};
      const prov = base.province_name;
      if (!prov) continue;
      const c = centroid(route);
      if (!byProvince.has(prov)) byProvince.set(prov, { pts: [], cities: new Map() });
      const entry = byProvince.get(prov)!;
      if (c) entry.pts.push(c);
      const city = base.city_name;
      if (city) {
        if (!entry.cities.has(city)) entry.cities.set(city, []);
        if (c) entry.cities.get(city)!.push(c);
      }
    } catch {
      /* 跳过损坏文件 */
    }
  }

  const provinces = [...byProvince.entries()]
    .map(([province, v]) => ({
      province,
      coordinate: avg(v.pts),
      cities: [...v.cities.entries()]
        .map(([city, pts]) => ({ city, coordinate: avg(pts) }))
        .filter((c) => c.coordinate),
    }))
    .filter((p) => p.coordinate);

  return NextResponse.json({ code: "OK", data: { provinces } });
}
