import "server-only";

/**
 * 对话实时上下文（聚焦模式用）：把高德开放平台的实时数据注入 LLM。
 *
 * 防幻觉边界（与决策文档一致）：
 *  - 只注入明确标注来源的实时数据块，要求 LLM 引用时注明「实时数据」；
 *  - 没有可靠数据源的问题（实时人流/拥挤度）绝不编造，注入如实说明的指引；
 *  - adcode 与天气结果均做内存缓存（TTL 10 分钟），避免每轮追问都打高德配额。
 */

const WEB_KEY = process.env.AMAP_WEB_SERVICE_KEY ?? "";

const adcodeCache = new Map<string, string>();
const weatherCache = new Map<string, { at: number; text: string | null }>();

const WEATHER_TTL_MS = 10 * 60 * 1000;

const WEATHER_WORDS = [
  "天气", "气温", "温度", "几度", "下雨", "降雨", "暴雨", "雷", "雪", "风",
  "湿度", "冷不冷", "热不热", "冷吗", "热吗", "穿什么", "带伞", "防晒", "晒不晒", "雾",
];

const CROWD_WORDS = ["人流", "人多", "拥挤", "排队", "客流", "爆满", "扎堆", "堵不堵"];

export function queryWantsWeather(query: string): boolean {
  return WEATHER_WORDS.some((w) => query.includes(w));
}

export function queryWantsCrowdInfo(query: string): boolean {
  return CROWD_WORDS.some((w) => query.includes(w));
}

/** 城市/区县名 → 高德 adcode（行政区划编码），永久缓存 */
async function resolveAdcode(city: string | null | undefined, area: string | null | undefined): Promise<string | null> {
  if (!WEB_KEY) return null;
  const q = (area || city || "").trim();
  if (!q) return null;
  const cached = adcodeCache.get(q);
  if (cached) return cached;
  try {
    const url =
      "https://restapi.amap.com/v3/geocode/geo?address=" +
      encodeURIComponent(q) +
      "&key=" +
      WEB_KEY;
    const res = await fetch(url, { cache: "no-store" });
    const json = await res.json();
    const adcode = json?.geocodes?.[0]?.adcode;
    if (typeof adcode === "string" && adcode) {
      adcodeCache.set(q, adcode);
      return adcode;
    }
  } catch {
    // 网络失败 → 降级为无实时数据
  }
  return null;
}

/** 拉取实况 + 未来 3 天预报，格式化为注入文本；失败返回 null */
async function fetchWeatherText(adcode: string): Promise<string | null> {
  const base = "https://restapi.amap.com/v3/weather/weatherInfo?city=" + adcode + "&key=" + WEB_KEY;
  try {
    const [liveRes, allRes] = await Promise.all([
      fetch(base + "&extensions=base", { cache: "no-store" }),
      fetch(base + "&extensions=all", { cache: "no-store" }),
    ]);
    const liveJson = await liveRes.json();
    const allJson = await allRes.json();
    const live = liveJson?.lives?.[0] ?? null;
    const casts = allJson?.forecasts?.[0]?.casts ?? [];
    if (!live && casts.length === 0) return null;

    const lines: string[] = [];
    if (live) {
      lines.push(
        `当前实况：${live.weather} ${live.temperature}°C，${live.winddirection}风${live.windpower}级，湿度${live.humidity}%（发布时间 ${live.reporttime}）`,
      );
    }
    if (casts.length > 0) {
      const f = casts
        .slice(0, 3)
        .map((c: Record<string, string>) => `${String(c.date).slice(5)} ${c.dayweather} ${c.nighttemp}~${c.daytemp}°C`)
        .join("；");
      lines.push(`未来三天预报：${f}`);
    }
    return lines.join("\n");
  } catch {
    return null;
  }
}

/**
 * 按用户 query 判断需要哪些实时数据，返回注入 LLM 的文本块；无需/不可用时返回 null。
 */
export async function buildLiveContext(
  query: string,
  route: { city_name?: string | null; area_name?: string | null; route_name?: string | null },
): Promise<string | null> {
  const wantsWeather = queryWantsWeather(query);
  const wantsCrowd = queryWantsCrowdInfo(query);
  if (!wantsWeather && !wantsCrowd) return null;

  const parts: string[] = [];

  if (wantsWeather) {
    const label = [route.city_name, route.area_name].filter(Boolean).join("·") || route.route_name || "线路所在地";
    const key = `wx:${label}`;
    const cached = weatherCache.get(key);
    let text = cached && Date.now() - cached.at < WEATHER_TTL_MS ? cached.text : null;
    if (!cached || Date.now() - cached.at >= WEATHER_TTL_MS) {
      text = null;
      const adcode = await resolveAdcode(route.city_name, route.area_name);
      if (adcode) text = await fetchWeatherText(adcode);
      weatherCache.set(key, { at: Date.now(), text });
    }
    if (text) parts.push(`【实时数据 · 来源：高德开放平台】${label}：\n${text}`);
  }

  if (wantsCrowd) {
    parts.push(
      "【实时人流说明】当前没有可靠的实时人流/拥挤度数据源。请如实告知用户暂无该数据、不要编造，可建议出发前通过景区官方公众号或地图 App 查看，并结合季节与节假日给出一般性提示（仅当线路资料中有依据时）。",
    );
  }

  return parts.length ? parts.join("\n") : null;
}
