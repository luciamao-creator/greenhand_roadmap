import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

const WEB_KEY = process.env.AMAP_WEB_SERVICE_KEY;
const adcodeCache = new Map<string, string>();

function loadRouteMeta(routeId: string) {
  const file = path.join(process.cwd(), "data", "routes", `${routeId}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf-8"));
    const base = raw.base_facts ?? {};
    return { city_name: base.city_name, area_name: base.area_name, province_name: base.province_name };
  } catch {
    return null;
  }
}

async function geocodeAdcode(city: string, area?: string): Promise<string | null> {
  const q = (area || city || "").trim();
  if (!q || !WEB_KEY) return null;
  const cached = adcodeCache.get(q);
  if (cached) return cached;
  try {
    const url =
      "https://restapi.amap.com/v3/geocode/geo?address=" +
      encodeURIComponent(q) +
      "&city=" +
      encodeURIComponent(city || q) +
      "&key=" +
      WEB_KEY;
    const res = await fetch(url);
    const json = await res.json();
    const adcode = json?.geocodes?.[0]?.adcode;
    if (adcode) {
      adcodeCache.set(q, adcode);
      return adcode;
    }
  } catch {
    /* 忽略，交给上层降级 */
  }
  return null;
}

export async function GET(req: Request) {
  const routeId = new URL(req.url).searchParams.get("routeId");
  if (!routeId) {
    return NextResponse.json({ code: "BAD_PARAM", message: "缺少 routeId" }, { status: 400 });
  }
  if (!WEB_KEY) {
    return NextResponse.json(
      { code: "NO_KEY", message: "未配置 AMAP_WEB_SERVICE_KEY，无法获取天气" },
      { status: 200 },
    );
  }

  const meta = loadRouteMeta(routeId);
  if (!meta) {
    return NextResponse.json({ code: "NO_ROUTE", message: "线路不存在" }, { status: 404 });
  }

  const adcode = await geocodeAdcode(meta.city_name ?? "", meta.area_name ?? undefined);
  if (!adcode) {
    return NextResponse.json({ code: "NO_ADCODE", message: "无法定位城市编码" }, { status: 200 });
  }

  try {
    // 高德天气：extensions=base 返回实况(lives)，extensions=all 返回预报(forecasts.casts)，需分别请求
    const base = "https://restapi.amap.com/v3/weather/weatherInfo?city=" + adcode + "&key=" + WEB_KEY;
    const [liveRes, allRes] = await Promise.all([
      fetch(base + "&extensions=base"),
      fetch(base + "&extensions=all"),
    ]);
    const liveJson = await liveRes.json();
    const allJson = await allRes.json();
    if (liveJson.status !== "1" && allJson.status !== "1") {
      return NextResponse.json(
        { code: "AMAP_ERR", message: liveJson.info || allJson.info || "天气查询失败" },
        { status: 200 },
      );
    }
    const live = liveJson.lives?.[0] ?? null;
    const casts = allJson.forecasts?.[0]?.casts ?? [];
    return NextResponse.json({
      code: "OK",
      data: {
        adcode,
        city: meta.city_name,
        area: meta.area_name,
        live: live
          ? {
              weather: live.weather,
              temperature: live.temperature,
              temperature_float: live.temperature_float,
              winddirection: live.winddirection,
              windpower: live.windpower,
              humidity: live.humidity,
              reporttime: live.reporttime,
            }
          : null,
        forecast: casts.slice(0, 3).map((c: any) => ({
          date: c.date,
          dayweather: c.dayweather,
          nightweather: c.nightweather,
          daytemp: c.daytemp,
          nighttemp: c.nighttemp,
          daywind: c.daywind,
          daypower: c.daypower,
        })),
      },
    });
  } catch {
    return NextResponse.json({ code: "FETCH_ERR", message: "天气服务请求失败" }, { status: 200 });
  }
}
