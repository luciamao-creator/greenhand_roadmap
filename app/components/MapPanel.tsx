"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { kindTheme, type Kind } from "./theme";
import type { RouteCardLite, RouteGeometry } from "./types";
import { loadAMap } from "../lib/amap-loader";

type LngLat = [number, number];

type KeyNode = {
  node_id?: string;
  node_name?: string;
  navigation_hint?: string;
  wrong_choice_hint?: string;
  point?: { type?: string; coordinates?: [number, number] };
};
type RiskPoint = {
  risk_point_id?: string;
  risk_title?: string;
  risk_text?: string;
  safe_action_text?: string;
  point?: { type?: string; coordinates?: [number, number] };
};
type ExitPoint = {
  exit_point_id?: string;
  exit_name?: string;
  exit_action_text?: string;
  point?: { type?: string; coordinates?: [number, number] };
};
type RouteDetail = {
  route_id?: string;
  route_name?: string;
  province_name?: string;
  city_name?: string;
  area_name?: string;
  start_point_name?: string;
  end_point_name?: string;
  distance_km?: number | null;
  duration_minutes?: number | null;
  geometry?: RouteGeometry;
  route_nodes: KeyNode[];
  route_risk_points: RiskPoint[];
  route_exit_points: ExitPoint[];
};
type WeatherData = {
  city?: string;
  area?: string;
  live?: { weather?: string; temperature?: string; winddirection?: string; windpower?: string; humidity?: string; reporttime?: string } | null;
  forecast?: { date?: string; dayweather?: string; nightweather?: string; daytemp?: string; nighttemp?: string }[];
};
type ChecklistApiItem = { dimension: string; label: string; mentioned: boolean; quotes: string[] };
type AMapType = any;
const NEAR_RADIUS_M = 2000;   // 宽松判据：是否进入线路周边
const ON_ROUTE_M = 60;        // 严格判据：是否真的踩在线路上（含 GPS 误差容差）

function haversine(a: LngLat, b: LngLat) {
  const R = 6371000;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLng = ((b[0] - a[0]) * Math.PI) / 180;
  const lat1 = (a[1] * Math.PI) / 180;
  const lat2 = (b[1] * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// 浏览器 geolocation 返回 WGS-84，高德底图/轨迹是 GCJ-02。
// 不转换会偏移 300~800m：人明明在线路上，蓝点却显示在几百米外。
const A = 6378245.0;
const EE = 0.00669342162296594323;

function transformLat(x: number, y: number) {
  let r = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  r += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0;
  r += (20.0 * Math.sin(y * Math.PI) + 40.0 * Math.sin(y / 3.0 * Math.PI)) * 2.0 / 3.0;
  return r;
}
function transformLng(x: number, y: number) {
  let r = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  r += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0;
  r += (20.0 * Math.sin(x * Math.PI) + 40.0 * Math.sin(x / 3.0 * Math.PI)) * 2.0 / 3.0;
  r += (150.0 * Math.sin(x / 12.0 * Math.PI) + 300.0 * Math.sin(x / 30.0 * Math.PI)) * 2.0 / 3.0;
  return r;
}
function wgs84ToGcj02(p: LngLat): LngLat {
  const [lng, lat] = p;
  if (lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271) return p; // 境外不纠偏
  let dLat = transformLat(lng - 105.0, lat - 35.0);
  let dLng = transformLng(lng - 105.0, lat - 35.0);
  const radLat = (lat / 180.0) * Math.PI;
  return [lng + (dLng / A) / Math.cos(radLat) * 180.0 / Math.PI, lat + (dLat / A) * 180.0 / Math.PI];
}
function bearing(from: LngLat, to: LngLat) {
  const y = Math.sin(((to[0] - from[0]) * Math.PI) / 180) * Math.cos((to[1] * Math.PI) / 180);
  const x = Math.cos((from[1] * Math.PI) / 180) * Math.sin((to[1] * Math.PI) / 180) - Math.sin((from[1] * Math.PI) / 180) * Math.cos((to[1] * Math.PI) / 180) * Math.cos(((to[0] - from[0]) * Math.PI) / 180);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}
function toPath(geo?: RouteGeometry | null): LngLat[] {
  if (!geo) return [];
  // 注意：polyline 可能为空数组（不是 nullish），?? 拦不住会把有数据的 amap_walking_path 挡死，
  // 导致每次都多打一次 route-geometry 接口。这里显式按"是否有内容"取舍。
  const polyline = (geo as any).polyline;
  const src: any = Array.isArray(polyline) && polyline.length > 0 ? polyline : (geo as any).amap_walking_path;
  if (!src) return [];
  if (Array.isArray(src.coordinates) && src.coordinates.length) {
    return src.coordinates.map((c: any) => [Number(c[0]), Number(c[1])] as LngLat);
  }
  if (Array.isArray(src) && src.length && Array.isArray(src[0])) {
    return (src as any[]).map((c: any) => [Number(c[0]), Number(c[1])] as LngLat);
  }
  return [];
}
function pt(p?: { type?: string; coordinates?: [number, number] }): LngLat | null {
  if (p?.coordinates && Number.isFinite(p.coordinates[0])) return [p.coordinates[0], p.coordinates[1]];
  return null;
}
function weatherIcon(text?: string): string {
  const t = text || "";
  if (t.includes("雷")) return "⛈";
  if (t.includes("雨")) return "🌧";
  if (t.includes("雪")) return "🌨";
  if (t.includes("雾") || t.includes("霾")) return "🌫";
  if (t.includes("阴")) return "☁";
  if (t.includes("云")) return "⛅";
  if (t.includes("晴")) return "☀";
  return "🌤";
}
export default function MapPanel({
  routeId,
  routeName,
  onOpenChat,
  onSelectRoute,
  onNeedLogin,
}: {
  routeId: string | null;
  routeName: string | null;
  onOpenChat: (id: string, name: string) => void;
  onSelectRoute: (id: string, name: string) => void;
  onNeedLogin?: () => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<AMapType | null>(null);
  const amapRef = useRef<AMapType | null>(null);
  const infoRef = useRef<AMapType | null>(null);
  const overlaysRef = useRef<AMapType[]>([]);
  const placeSearchRef = useRef<AMapType | null>(null);
  const geocoderRef = useRef<AMapType | null>(null);
  const hotspotFiredRef = useRef(false);
  const userMarkerRef = useRef<AMapType | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const orientRef = useRef<((e: any) => void) | null>(null);
  const fixTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 跟随中标记 + 最新 stopFollow：地图事件里要能读到，且不因闭包过期而失效
  const followingRef = useRef(false);
  const stopFollowRef = useRef<() => void>(() => {});
  const panCleanupRef = useRef<(() => void) | null>(null);
  const lastPosRef = useRef<LngLat | null>(null);
  const pathRef = useRef<LngLat[]>([]);

  const [ready, setReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [routes, setRoutes] = useState<RouteCardLite[]>([]);
  const [name, setName] = useState<string | null>(routeName);
  const [detail, setDetail] = useState<RouteDetail | null>(null);
  const [loadingPath, setLoadingPath] = useState(false);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [following, setFollowing] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [nearRoute, setNearRoute] = useState(false);
  const [nearM, setNearM] = useState<number | null>(null);
  const [userPos, setUserPos] = useState<LngLat | null>(null);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [checklistLoading, setChecklistLoading] = useState(false);
  const [checklistErr, setChecklistErr] = useState<string | null>(null);
  const [checklist, setChecklist] = useState<{ route_name?: string; items: ChecklistApiItem[] } | null>(null);
  const [fav, setFav] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const clearOverlays = useCallback(() => {
    const map = mapRef.current;
    if (map && overlaysRef.current.length) {
      map.remove(overlaysRef.current);
      overlaysRef.current = [];
    }
  }, []);

  const openInfo = useCallback((pos: LngLat, html: string) => {
    const map = mapRef.current;
    const AMap = amapRef.current;
    if (!map || !AMap) return;
    if (!infoRef.current) infoRef.current = new AMap.InfoWindow({ offset: new AMap.Pixel(0, -8) });
    infoRef.current.setContent(html);
    infoRef.current.open(map, pos);
  }, []);

  // 节点信息框：节点提示在上，该位置逆地理信息在下，同一个框内补全（避免跳变）
  const openNodeInfo = useCallback((p: LngLat, title: string, sub: string, warn = false) => {
    const render = (addr?: string) =>
      `<div style="min-width:160px;max-width:250px"><div style="font-weight:600;margin-bottom:3px;${warn ? "color:#b91c1c" : ""}">${warn ? "⚠ " : ""}${title}</div><div style="font-size:12px;color:#555;line-height:1.5">${sub}</div><div style="font-size:11px;color:#8a8a8a;margin-top:6px;border-top:1px dashed #e5e7eb;padding-top:4px">${addr ? `📍 ${addr}` : "📍 定位解析中…"}</div></div>`;
    openInfo(p, render());
    const gc = geocoderRef.current;
    if (gc) {
      gc.getAddress(p, (_s: string, r: any) => {
        const addr = r?.regeocode?.formattedAddress;
        if (addr) openInfo(p, render(addr));
      });
    }
  }, [openInfo]);
  // 初始化真实高德底图（路网 / 缩放平移 / POI 点击）
  useEffect(() => {
    let cancelled = false;
    loadAMap()
      .then((AMap) => {
        if (cancelled || !containerRef.current || mapRef.current) return;
        amapRef.current = AMap;
        const map = new AMap.Map(containerRef.current, {
          viewMode: "2D",
          zoom: 4.2,
          center: [105, 36],
          resizeEnable: true,
        });
        mapRef.current = map;
        try {
          map.addControl(new AMap.ToolBar({ position: { top: "84px", right: "12px" } }));
          map.addControl(new AMap.Scale());
        } catch { /* 控件失败不影响主图 */ }
        try {
          placeSearchRef.current = new AMap.PlaceSearch({ pageSize: 1, pageIndex: 1, extensions: "all" });
          geocoderRef.current = new AMap.Geocoder({ extensions: "all" });
        } catch { /* 插件缺失时仅影响 POI 详情 / 逆地理 */ }

        // 逆地理格式化：山野/公园区域 formattedAddress 常为空或只到街道级（数据源精度上限），
        // 用地址组件逐级拼接兜底，并附最近 POI 帮用户确认点击位置
        const formatRegeo = (reg: any): { addr: string; nearPoi: string | null } => {
          const ac = reg?.addressComponent ?? {};
          const parts = [ac.province, ac.city, ac.district, ac.township, ac.street, ac.number]
            .filter((t: unknown): t is string => typeof t === "string" && t.length > 0 && t !== "[]");
          const addr = (typeof reg?.formattedAddress === "string" && reg.formattedAddress && reg.formattedAddress !== "[]"
            ? reg.formattedAddress
            : Array.from(new Set(parts)).join("")) || "该位置";
          const nearPoi = (Array.isArray(reg?.pois) && reg.pois[0]?.name) || null;
          return { addr, nearPoi };
        };
        const showAddress = (loc: LngLat) => {
          const gc = geocoderRef.current;
          if (!gc) return;
          gc.getAddress(loc, (_s: string, r: any) => {
            const { addr, nearPoi } = formatRegeo(r?.regeocode);
            openInfo(loc, `<div style="min-width:160px;max-width:250px"><div style="font-size:11px;color:#8a8a8a">点击位置附近${nearPoi ? ` · 近「${nearPoi}」` : ""}</div><div style="font-size:12px;color:#111;line-height:1.5;margin-top:3px">${addr}</div></div>`);
          });
        };
        const showAddressFallback = (loc: LngLat, poiName: string) => {
          const gc = geocoderRef.current;
          if (!gc) { openInfo(loc, `<div style="min-width:160px;max-width:260px"><div style="font-weight:600;margin-bottom:4px">${poiName}</div></div>`); return; }
          gc.getAddress(loc, (_s: string, r: any) => {
            const addr = r?.regeocode?.formattedAddress || "地址解析中…";
            openInfo(loc, `<div style="min-width:160px;max-width:260px"><div style="font-weight:600;margin-bottom:4px">${poiName}</div><div style="font-size:12px;color:#555">${addr}</div></div>`);
          });
        };
        // 底图 POI 点击：hotspot 事件直接携带被点 POI 的真实名称，不再按坐标猜测
        map.on("hotspot", (e: any) => {
          hotspotFiredRef.current = true;
          if (!e?.lnglat) return;
          const loc: LngLat = [e.lnglat.getLng(), e.lnglat.getLat()];
          const name = e?.name || "兴趣点";
          const ps = placeSearchRef.current;
          const baseRows = (addr?: string) => (addr ? [addr] : []);
          const render = (rows: string[]) =>
            `<div style="min-width:160px;max-width:260px"><div style="font-weight:600;margin-bottom:4px">${name}</div>${rows.map((t) => `<div style="font-size:12px;color:#555;line-height:1.6">${t}</div>`).join("")}</div>`;
          openInfo(loc, render(baseRows()));
          if (ps && e?.id) {
            try {
              ps.getDetails(e.id, (_s: string, result: any) => {
                const p = result?.poiList?.pois?.[0];
                if (!p) { showAddressFallback(loc, name); return; }
                const addr = p.address || (Array.isArray(p.address) ? p.address[0] : "");
                // 营业时间：高德 JS 详情里位于 biz_ext.opentime2 / open_time（无顶层 business 字段）
                const biz: string | undefined =
                  p.biz_ext?.opentime2 || p.biz_ext?.open_time || p.business;
                const rating: string | undefined = p.biz_ext?.rating;
                const rows: string[] = [];
                if (addr) rows.push(addr);
                if (p.tel && p.tel !== "[]") rows.push(`☎ ${p.tel}`);
                if (p.website && p.website !== "[]") rows.push(`🌐 ${p.website}`);
                if (biz) rows.push(`🕒 ${biz}`);
                if (rating) rows.push(`⭐ 评分 ${rating}`);
                openInfo(loc, render(rows.length ? rows : baseRows(addr)));
              });
            } catch (err) {
              console.error("[MapPanel] getDetails failed:", err);
              showAddressFallback(loc, name);
            }
          } else {
            showAddressFallback(loc, name);
          }
        });
        map.on("click", (e: any) => {
          const loc: LngLat = [e.lnglat.getLng(), e.lnglat.getLat()];
          // 若此次点击命中的是底图 POI（hotspot），跳过通用地址展示
          setTimeout(() => {
            if (!hotspotFiredRef.current) showAddress(loc);
            hotspotFiredRef.current = false;
          }, 200);
        });
        // 用户手动拖动地图即退出跟随导航：否则 watchPosition 每 2 秒会把视野强制拉回实时位置，
        // 表现为「怎么拖都弹回去」。
        // AMap 的 dragstart 在部分版本/纯触屏下不一定派发，故再补一层原生手势兜底。
        const exitFollowOnPan = () => {
          if (!followingRef.current) return;
          stopFollowRef.current();
          showToast("已退出跟随导航，可自由拖动查看地图");
        };
        map.on("dragstart", exitFollowOnPan);
        const panEl = containerRef.current;
        const onTouchMove = () => exitFollowOnPan();
        const onMouseMove = (e: MouseEvent) => {
          if (e.buttons === 1) exitFollowOnPan();
        };
        if (panEl) {
          panEl.addEventListener("touchmove", onTouchMove, { passive: true });
          panEl.addEventListener("mousemove", onMouseMove, { passive: true });
          panCleanupRef.current = () => {
            panEl.removeEventListener("touchmove", onTouchMove);
            panEl.removeEventListener("mousemove", onMouseMove);
          };
        }

        setReady(true);
      })
      .catch((err: any) => setMapError(err?.message || "地图加载失败"));
    return () => {
      cancelled = true;
    };
  }, [openInfo]);
  const renderRoute = useCallback((AMap: AMapType, d: RouteDetail, path: LngLat[]) => {
    const map = mapRef.current;
    if (!map) return;
    clearOverlays();
    pathRef.current = path;
    if (path.length >= 2) {
      const casing = new AMap.Polyline({ path, strokeColor: "#ffffff", strokeWeight: 11, strokeOpacity: 0.9, lineJoin: "round", lineCap: "round", zIndex: 48 });
      const line = new AMap.Polyline({ path, strokeColor: "#f97316", strokeWeight: 7, strokeOpacity: 0.95, lineJoin: "round", lineCap: "round", showDir: true, zIndex: 50 });
      overlaysRef.current.push(casing, line);
      map.add([casing, line]);
    }
    const addDot = (p: LngLat, color: string, radius: number, title: string, sub: string, warn = false) => {
      let m: AMapType;
      if (typeof AMap.CircleMarker === "function") {
        m = new AMap.CircleMarker({ center: p, radius, fillColor: color, fillOpacity: 0.95, strokeColor: "#ffffff", strokeWeight: 2, cursor: "pointer", bubble: false, zIndex: 60 });
      } else {
        m = new AMap.Marker({ position: p, anchor: "center", zIndex: 60, content: `<div style="width:${radius * 2}px;height:${radius * 2}px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3)"></div>` });
      }
      m.on("click", () => openNodeInfo(p, title, sub, warn));
      overlaysRef.current.push(m);
      map.add(m);
    };
    const sp = d.geometry?.start_point;
    const ep = d.geometry?.end_point;
    if (sp?.lng != null) { const p: LngLat = [sp.lng, sp.lat]; addDot(p, "#22c55e", 9, "起点", d.start_point_name || "线路起点"); }
    if (ep?.lng != null) { const p: LngLat = [ep.lng, ep.lat]; addDot(p, "#14b8a6", 9, "终点", d.end_point_name || "线路终点"); }
    (d.route_nodes ?? []).forEach((n) => {
      const p = pt(n.point);
      if (p) addDot(p, "#3b82f6", 7, n.node_name || "关键节点", n.navigation_hint || n.wrong_choice_hint || "途经关键节点");
    });
    (d.route_risk_points ?? []).forEach((r) => {
      const p = pt(r.point);
      if (p) addDot(p, "#ef4444", 7, r.risk_title || "风险点", r.safe_action_text || r.risk_text || "注意风险", true);
    });
    (d.route_exit_points ?? []).forEach((e) => {
      const p = pt(e.point);
      if (p) addDot(p, "#06b6d4", 7, e.exit_name || "下撤点", e.exit_action_text || "可在此下撤");
    });

    if (path.length < 2 && sp?.lng != null && ep?.lng != null) {
      // 无轨迹数据时，用虚线直连起终点，保证线路走向可见
      const dashed = new AMap.Polyline({ path: [[sp.lng, sp.lat], [ep.lng, ep.lat]], strokeColor: "#f97316", strokeWeight: 4, strokeOpacity: 0.85, strokeStyle: "dashed", zIndex: 50 });
      overlaysRef.current.push(dashed);
      map.add(dashed);
    }

    if (path.length >= 2) {
      try { map.setFitView(overlaysRef.current, false, [60, 90, 60, 90]); } catch { map.setZoomAndCenter(14, path[Math.floor(path.length / 2)]); }
    } else if (sp?.lng != null || ep?.lng != null) {
      const c: LngLat = sp?.lng != null ? [sp.lng, sp.lat] : [ep!.lng, ep!.lat];
      map.setZoomAndCenter(15, c);
    }
  }, [clearOverlays, openNodeInfo]);
  const loadRoute = useCallback(async (id: string) => {
    setLoadingPath(true);
    setWeather(null);
    setWeatherLoading(true);
    let d: RouteDetail | undefined;
    try {
      const res = await fetch(`/api/routes/${id}`);
      const payload = await res.json();
      d = payload.data as RouteDetail | undefined;
      if (d) setDetail(d);
    } catch { /* 静默 */ }

    let path: LngLat[] = [];
    const local = toPath(d?.geometry);
    if (local.length >= 2) {
      path = local;
    } else {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 8000);
        const gr = await fetch(`/api/route-geometry?routeId=${encodeURIComponent(id)}`, { signal: ctrl.signal });
        clearTimeout(timer);
        const gp = await gr.json();
        if (gp.code === "OK" && Array.isArray(gp.data?.path)) path = gp.data.path as LngLat[];
      } catch { /* 静默 */ }
    }
    const AMap = amapRef.current;
    const routeDetail = d ?? ({} as RouteDetail);
    try {
      if (AMap && mapRef.current) renderRoute(AMap, routeDetail, path);
    } catch (err) {
      console.error("[MapPanel] renderRoute failed:", err);
    }
    setLoadingPath(false);

    const fetchWeather = async (attempt = 0): Promise<void> => {
      try {
        const r = await fetch(`/api/weather?routeId=${encodeURIComponent(id)}`);
        const w = await r.json();
        if (w.code === "OK") {
          setWeather(w.data as WeatherData);
          return;
        }
        if (w.code === "FETCH_ERR" && attempt < 2) {
          await new Promise((res) => setTimeout(res, 800 * (attempt + 1)));
          return fetchWeather(attempt + 1);
        }
      } catch {
        if (attempt < 2) {
          await new Promise((res) => setTimeout(res, 800 * (attempt + 1)));
          return fetchWeather(attempt + 1);
        }
      }
    };
    void fetchWeather().finally(() => setWeatherLoading(false));
  }, [renderRoute]);

  useEffect(() => {
    setName(routeName);
  }, [routeName]);

  // 收藏状态跟随线路变化
  useEffect(() => {
    setFav(false);
    if (!routeId) return;
    fetch("/api/user/favorites")
      .then((r) => r.json())
      .then((p) => {
        if (p.code === "OK") {
          const list = (p.data?.favorites ?? []) as Array<{ route_id: string }>;
          setFav(list.some((f) => f.route_id === routeId));
        }
      })
      .catch(() => {});
  }, [routeId]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast((cur) => (cur === msg ? null : cur)), 2200);
  }, []);

  const toggleFav = useCallback(async () => {
    if (!routeId) return;
    const res = await fetch("/api/user/favorites", {
      method: fav ? "DELETE" : "POST",
      headers: { "Content-Type": "application/json" },
      body: fav ? undefined : JSON.stringify({ route_id: routeId, route_name: name ?? routeId }),
    }).catch(() => null);
    if (!res) { showToast("网络异常，请稍后重试"); return; }
    const p = await res.json().catch(() => null);
    if (res.status === 401) {
      showToast("请先在「我的」页登录后再收藏");
      onNeedLogin?.();
      return;
    }
    if (p?.code === "OK") {
      setFav(!fav);
      showToast(fav ? "已取消收藏" : "已收藏，可在「我的」页查看");
    } else {
      showToast(p?.message || "操作失败");
    }
  }, [routeId, fav, name, showToast, onNeedLogin]);

  const openChecklist = useCallback(() => {
    if (!routeId) return;
    setChecklistOpen(true);
    if (checklist) return; // 已加载过则直接展示
    setChecklistLoading(true);
    setChecklistErr(null);
    fetch(`/api/route-checklist?routeId=${encodeURIComponent(routeId)}`)
      .then((r) => r.json())
      .then((p) => {
        if (p?.data?.items) setChecklist({ route_name: p.data.route_name, items: p.data.items as ChecklistApiItem[] });
        else setChecklistErr(p?.message || "清单加载失败");
      })
      .catch(() => setChecklistErr("清单加载失败，请稍后重试"))
      .finally(() => setChecklistLoading(false));
  }, [routeId, checklist]);

  useEffect(() => {
    if (!routeId) {
      fetch("/api/routes")
        .then((r) => r.json())
        .then((p) => setRoutes((p.data as RouteCardLite[]) ?? []))
        .catch(() => {});
      return;
    }
    if (!routeName) {
      fetch("/api/routes")
        .then((r) => r.json())
        .then((p) => {
          const hit = ((p.data as RouteCardLite[]) ?? []).find((r) => r.route_id === routeId);
          if (hit) setName(hit.route_name ?? routeId);
        })
        .catch(() => {});
    }
  }, [routeId, routeName]);

  useEffect(() => {
    if (ready && routeId) void loadRoute(routeId);
    if (ready && !routeId) { clearOverlays(); setDetail(null); }
  }, [ready, routeId, loadRoute, clearOverlays]);
  const stopFollow = useCallback(() => {
    if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
    watchIdRef.current = null;
    if (fixTimerRef.current) { clearTimeout(fixTimerRef.current); fixTimerRef.current = null; }
    if (orientRef.current && typeof window !== "undefined") window.removeEventListener("deviceorientation", orientRef.current);
    orientRef.current = null;
    if (userMarkerRef.current && mapRef.current) mapRef.current.remove(userMarkerRef.current);
    userMarkerRef.current = null;
    setFollowing(false);
    // 同步置 false：定位回调里据此判定，不等 useEffect 提交，避免退出后仍被拉回实时位置
    followingRef.current = false;
    setNearRoute(false);
    setNearM(null);
    setUserPos(null);
    lastPosRef.current = null;
  }, []);

  useEffect(() => {
    followingRef.current = following;
  }, [following]);
  useEffect(() => {
    stopFollowRef.current = stopFollow;
  }, [stopFollow]);
  // 切 tab / 组件卸载时必须停掉定位监听：浏览器不会因 React 卸载而自动停止 watchPosition，
  // 否则回到页面会有「看不见的手」继续把地图拉走。
  useEffect(
    () => () => {
      const cleanup = panCleanupRef.current;
      if (cleanup) {
        cleanup();
        panCleanupRef.current = null;
      }
      stopFollowRef.current();
    },
    [],
  );

  const startFollow = useCallback(() => {
    const AMap = amapRef.current;
    const map = mapRef.current;
    if (!AMap || !map || !navigator.geolocation) {
      setMapError(
        typeof window !== "undefined" && !window.isSecureContext
          ? "跟随导航需要 HTTPS 或 localhost 访问才可用（当前为非安全上下文，浏览器禁用定位）"
          : "当前浏览器不支持定位",
      );
      showToast("跟随导航不可用：请在 HTTPS 或 localhost 下打开，并允许定位权限");
      return;
    }
    setFollowing(true);
    followingRef.current = true;
    const arrowHtml = (deg: number) =>
      `<div style="transform:rotate(${deg}deg);font-size:22px;line-height:1;color:#1d4ed8;filter:drop-shadow(0 1px 2px rgba(0,0,0,.3))">➤</div>`;
    const updateArrow = (pos: LngLat, deg: number) => {
      if (!userMarkerRef.current) {
        userMarkerRef.current = new AMap.Marker({ position: pos, anchor: "center", content: arrowHtml(deg), zIndex: 80 });
        map.add(userMarkerRef.current);
      } else {
        userMarkerRef.current.setPosition(pos);
        userMarkerRef.current.setContent(arrowHtml(deg));
      }
    };
    const minDistToPath = (pos: LngLat): number | null => {
      const path = pathRef.current;
      if (!path.length) return null;
      let min = Infinity;
      for (const v of path) min = Math.min(min, haversine(pos, v));
      return min;
    };
    const onHeading = (e: any) => {
      const deg = e.webkitCompassHeading != null ? e.webkitCompassHeading : (360 - (e.alpha || 0)) % 360;
      const pos = lastPosRef.current;
      if (pos) updateArrow(pos, deg);
    };
    orientRef.current = onHeading;
    if (typeof (DeviceOrientationEvent as any)?.requestPermission === "function") {
      (DeviceOrientationEvent as any).requestPermission().then((s: string) => { if (s === "granted") window.addEventListener("deviceorientation", onHeading); }).catch(() => {});
    } else {
      window.addEventListener("deviceorientation", onHeading);
    }
    // 兜底：持续拿不到首个坐标时给出提示，避免"点击后毫无反应"
    if (fixTimerRef.current) clearTimeout(fixTimerRef.current);
    fixTimerRef.current = setTimeout(() => {
      if (lastPosRef.current) return;
      showToast("尚未获取到定位…请确认浏览器定位权限，或在室外/真机上再试");
    }, 8000);

    watchIdRef.current = navigator.geolocation.watchPosition(
      (p) => {
        if (fixTimerRef.current) { clearTimeout(fixTimerRef.current); fixTimerRef.current = null; }
        // 已退出跟随：即便 clearWatch 因浏览器差异未生效，也绝不更新位置、不把视野拉回实时位置
        if (!followingRef.current) return;
        const prev = lastPosRef.current;
        // WGS-84 -> GCJ-02：不转换会有数百米偏移，人会不在轨迹上
        const pos: LngLat = wgs84ToGcj02([p.coords.longitude, p.coords.latitude]);
        lastPosRef.current = pos;
        setUserPos(pos);
        const nearM = minDistToPath(pos);
        setNearM(nearM);
        setNearRoute(nearM != null && nearM <= NEAR_RADIUS_M);
        const deg = prev ? bearing(prev, pos) : 0;
        updateArrow(pos, deg);
        map.setZoomAndCenter(17, pos);
      },
      (err) => {
        if (fixTimerRef.current) { clearTimeout(fixTimerRef.current); fixTimerRef.current = null; }
        if (err?.code === err.PERMISSION_DENIED) {
          showToast("定位权限被拒绝，请在浏览器地址栏『网站设置』里允许定位后重试");
        } else if (err?.code === err.POSITION_UNAVAILABLE) {
          showToast("无法获取定位信号，请在室外或开启系统定位后再试");
        } else {
          showToast("定位失败，请检查浏览器定位权限");
        }
        setFollowing(false);
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 },
    );
  }, [showToast]);
  type SidebarItem = { key: string; kind: Kind; title: string; sub: string; pos: LngLat | null; warn: boolean };
  const uid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2));

  const sidebarItems: SidebarItem[] = [
    ...(detail?.route_nodes ?? []).map((n) => ({ key: n.node_id ?? uid(), kind: "node" as Kind, title: n.node_name || "关键节点", sub: n.navigation_hint || n.wrong_choice_hint || "途经关键节点", pos: pt(n.point), warn: false })),
    ...(detail?.route_risk_points ?? []).map((r) => ({ key: r.risk_point_id ?? uid(), kind: "risk" as Kind, title: r.risk_title || "风险点", sub: r.safe_action_text || r.risk_text || "注意风险", pos: pt(r.point), warn: true })),
    ...(detail?.route_exit_points ?? []).map((e) => ({ key: e.exit_point_id ?? uid(), kind: "exit" as Kind, title: e.exit_name || "下撤点", sub: e.exit_action_text || "可在此下撤", pos: pt(e.point), warn: false })),
  ];
  const focusNode = (item: SidebarItem) => {
    if (!item.pos) return;
    mapRef.current?.setZoomAndCenter(16, item.pos);
    openNodeInfo(item.pos, item.title, item.sub, item.warn);
  };
  const primaryRisk = (detail?.route_risk_points ?? [])[0];

  return (
    <div className="relative flex h-full flex-col">
      <div ref={containerRef} className="relative min-h-0 flex-1 overflow-hidden" style={{ background: "#dfece3" }}>
        {!ready && !mapError ? (
          <div className="absolute inset-0 grid place-items-center px-6 text-center"><div className="rounded-2xl bg-white/90 p-5 text-sm text-muted shadow-sm">地图加载中…</div></div>
        ) : null}
        {mapError ? (
          <div className="absolute inset-0 grid place-items-center px-6 text-center"><div className="rounded-2xl bg-white/90 p-5 text-sm text-muted shadow-sm">{mapError}</div></div>
        ) : null}

        {ready && routeId ? (
          <>
            <div className="absolute left-3 right-3 top-3 flex items-center justify-between rounded-2xl px-3 py-2" style={{ background: "rgba(255,255,255,0.84)", backdropFilter: "blur(12px)", boxShadow: "0 14px 32px rgba(18,32,24,0.08)" }}>
              <div className="min-w-0 truncate text-xs text-ink">
                {weather?.live
                  ? `${weatherIcon(weather.live.weather)} ${weather.live.weather} ${weather.live.temperature}° · ${weather.live.winddirection}风${weather.live.windpower}级 · 湿度${weather.live.humidity}%`
                  : weatherLoading
                    ? "天气信息查询中…"
                    : weather?.forecast?.[0]
                      ? `今日 ${weatherIcon(weather.forecast[0].dayweather)} ${weather.forecast[0].dayweather} ${weather.forecast[0].nighttemp}~${weather.forecast[0].daytemp}°`
                      : [detail?.city_name, detail?.area_name].filter(Boolean).join(" · ") || "线路地图"}
              </div>
              <span className="chip chip-warn">实测轨迹</span>
            </div>

            {loadingPath ? (
              <div className="absolute left-3 right-3 top-[68px] rounded-xl bg-white/85 px-3 py-2 text-[11px] text-muted">轨迹规划中…</div>
            ) : null}

            {weather?.forecast?.length ? (
              <div className="absolute left-3 right-3 top-[68px] flex items-center gap-3 rounded-xl px-3 py-1.5 text-[10px] text-muted" style={{ background: "rgba(255,255,255,0.8)", backdropFilter: "blur(12px)" }}>
                {weather.forecast.slice(0, 3).map((f) => (
                  <span key={f.date}>
                    {f.date?.slice(5).replace("-", "/")} {weatherIcon(f.dayweather)}{f.dayweather} {f.daytemp}°/{f.nighttemp}°
                  </span>
                ))}
              </div>
            ) : null}

            <div className="absolute right-3 top-[120px] flex flex-col items-end gap-2">
              <button type="button" onClick={following ? stopFollow : startFollow} className="w-[104px] rounded-full px-3 py-2 text-center text-xs font-semibold text-white shadow-sm" style={{ background: following ? "#b91c1c" : "var(--primary)" }}>
                {following ? "停止导航" : "跟随导航"}
              </button>
              <button type="button" onClick={openChecklist} className="flex w-[104px] items-center justify-center gap-1 rounded-full px-3 py-2 text-xs font-semibold text-white shadow-sm" style={{ background: "#d97706" }}>
                🎒 出行清单
              </button>
              <button type="button" onClick={toggleFav} className="flex w-[104px] items-center justify-center gap-1 rounded-full bg-white/90 px-3 py-2 text-xs font-semibold shadow-sm backdrop-blur" style={{ color: fav ? "#d97706" : "#6b7280", border: "1px solid rgba(0,0,0,0.06)" }}>
                {fav ? "★ 已收藏" : "☆ 收藏"}
              </button>
            </div>

            {toast ? (
              <div className="absolute bottom-[110px] left-3 right-3 rounded-xl bg-black/75 px-3 py-2 text-center text-xs text-white">{toast}</div>
            ) : null}

            {following ? (
              <div className="absolute bottom-[120px] left-3 right-3 flex items-center gap-2 rounded-xl px-3 py-2 text-[11px] font-medium shadow-sm" style={{ background: nearM != null && nearM <= ON_ROUTE_M ? "rgba(232,245,238,0.94)" : "rgba(255,243,216,0.94)", color: nearM != null && nearM <= ON_ROUTE_M ? "#1d7c57" : "#b45309" }}>
                <span className="min-w-0 flex-1">{nearM == null ? "跟随中 · 轨迹数据未就绪，暂无法判定偏航" : nearM <= ON_ROUTE_M ? `✅ 在路线上 · 距轨迹 ${Math.round(nearM)} 米，跟随中` : nearM <= NEAR_RADIUS_M ? `偏离主线约 ${Math.round(nearM)} 米 · 请回到轨迹` : `距线路 ${(nearM / 1000).toFixed(1)} 公里 · 已锁定你的位置`}</span>
                <button type="button" onClick={stopFollow} className="shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold shadow-sm" style={{ background: "#ffffff", color: "#b91c1c" }}>退出跟随</button>
              </div>
            ) : null}

            {primaryRisk ? (
              <div className="absolute bottom-3 left-3 right-3 rounded-2xl px-3 py-2.5" style={{ background: "rgba(255,243,216,0.94)", boxShadow: "0 12px 30px rgba(18,32,24,0.08)" }}>
                <strong className="block text-sm text-ink">⚠ {primaryRisk.risk_title}</strong>
                <div className="mt-1 text-xs text-muted">{primaryRisk.safe_action_text || primaryRisk.risk_text}</div>
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      <div className="shrink-0 overflow-y-auto border-t border-white/70 bg-white/70 px-4 py-3" style={{ maxHeight: "42%" }}>
        {!routeId ? (
          <>
            <div className="mb-2 rounded-2xl border border-dashed border-white/70 bg-white/60 p-4 text-center text-sm text-muted">在「对话」或「首页」里点「查看地图」选择一条线路，这里会展示它的真实轨迹与关键节点。</div>
            <div className="space-y-2">
              {routes.map((r) => (
                <button key={r.route_id} type="button" onClick={() => onSelectRoute(r.route_id, r.route_name ?? r.route_id)} className="frost-strong block w-full p-3 text-left">
                  <div className="text-sm font-semibold text-ink">{r.route_name}</div>
                  <div className="mt-0.5 text-xs text-muted">{[r.province_name, r.city_name, r.area_name].filter(Boolean).join(" / ")}</div>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <button type="button" onClick={() => setListOpen((v) => !v)} className="mb-2 flex w-full items-center justify-between text-sm font-semibold text-ink">
              <span>关键节点清单（{sidebarItems.length}）· 点卡片在地图上定位</span>
              <span className="text-xs text-muted">{listOpen ? "▾ 收起" : "▸ 展开"}</span>
            </button>
            {listOpen ? (
              <div className="space-y-2">
                {sidebarItems.length === 0 ? (
                  <div className="text-xs text-muted">暂无结构化节点。该线路已有真实轨迹，可在对话里追问细节。</div>
                ) : (
                  sidebarItems.map((item) => {
                    const t = kindTheme[item.kind];
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => focusNode(item)}
                        className="block w-full rounded-xl border p-3 text-left transition active:scale-[0.99]"
                        style={{ borderColor: t.border, background: t.cardBg, cursor: item.pos ? "pointer" : "default" }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-semibold text-ink">{item.title}</div>
                          <span className="chip" style={{ background: t.badgeBg, color: t.badgeColor }}>{t.label}</span>
                        </div>
                        <div className="mt-1 text-xs leading-relaxed text-muted">{item.sub}</div>
                      </button>
                    );
                  })
                )}
              </div>
            ) : null}
            <button type="button" onClick={() => onOpenChat(routeId, name ?? routeId)} className="btn-primary mt-3 w-full px-4 py-2.5 text-sm">在对话里继续聊这条线</button>
          </>
        )}
      </div>

      {checklistOpen ? (
        <div className="absolute inset-0 z-[999] flex flex-col justify-end">
          <button type="button" aria-label="关闭清单" onClick={() => setChecklistOpen(false)} className="absolute inset-0 bg-black/35" />
          <div
            className="relative flex flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl"
            style={{ height: "70%", animation: "checklist-up 0.24s ease-out" }}
          >
            <div className="flex flex-shrink-0 items-center justify-between border-b border-gray-100 px-4 py-3">
              <div>
                <div className="serif text-base font-bold text-ink">出行清单</div>
                <div className="text-[11px] text-muted">按「装备 / 补水 / 补给 / 交通 / 天气 / 难度 / 安全 / 时间」从线路资料中提取</div>
              </div>
              <button type="button" aria-label="关闭" onClick={() => setChecklistOpen(false)} className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-gray-100 text-base leading-none text-gray-500 active:bg-gray-200">✕</button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              {checklistLoading ? (
                <div className="grid h-full place-items-center text-sm text-muted">清单整理中…</div>
              ) : checklistErr ? (
                <div className="rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-700">⚠ {checklistErr}</div>
              ) : (
                <div className="space-y-2.5">
                  {(checklist?.items ?? []).map((it) => (
                    <div key={it.dimension} className="rounded-xl border border-gray-100 bg-white p-3" style={{ boxShadow: "0 4px 14px rgba(18,32,24,0.04)" }}>
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold text-ink">{it.label}</div>
                        {it.mentioned ? (
                          <span className="chip" style={{ background: "#e7f5ee", color: "#1d7c57" }}>资料已提及</span>
                        ) : (
                          <span className="chip bg-gray-100 text-gray-400">资料未提及</span>
                        )}
                      </div>
                      {it.mentioned ? (
                        <ul className="mt-1.5 space-y-1">
                          {it.quotes.map((q, i) => (
                            <li key={i} className="text-xs leading-relaxed text-muted">· {q}</li>
                          ))}
                        </ul>
                      ) : (
                        <div className="mt-1 text-xs text-gray-400">该线路资料中没有此维度内容，请按常规经验准备。</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

