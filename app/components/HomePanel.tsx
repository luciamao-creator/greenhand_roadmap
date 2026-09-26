"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { RouteCardLite } from "./types";
import { getTopKeywords } from "../lib/userPrefs";
import { recommendRoutes } from "../lib/recommend";

function visualGradient(seed: string): string {
  const palette = [
    "linear-gradient(180deg,#b6dec3 0%,#dcefdc 48%,#eef4f0 100%)",
    "linear-gradient(180deg,#c9d8f3 0%,#edf2fb 100%)",
    "linear-gradient(180deg,#d2e4d0 0%,#eef4ee 100%)",
    "linear-gradient(180deg,#cfe6e0 0%,#eef6f3 100%)",
    "linear-gradient(180deg,#e3ddc9 0%,#f5f1e6 100%)",
  ];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

function haversine(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const la1 = (aLat * Math.PI) / 180;
  const la2 = (bLat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

type RegionProvince = { province: string; coordinate: { lng: number; lat: number } | null; cities: { city: string; coordinate: { lng: number; lat: number } | null }[] };

const QUICK: { label: string; query: string; dynamic?: boolean }[] = [
  { label: "更轻松", query: "推荐更轻松、强度低的新手徒步线" },
  { label: "风景更好", query: "哪些线路风景更好看、适合拍照出片" },
  { label: "更安心", query: "哪几条线最成熟、回撤方便，最让新手安心" },
];

// 定位结果持久化到 localStorage：页面被微信 WebView 回收重载 / 切 tab 重挂后，
// 不再重复发起定位请求（iOS 微信重载页面后即便之前授权过，也可能再次弹定位确认框）。
const LOCATED_PROVINCE_KEY = "home_located_province_v1";
const USER_PICKED_KEY = "home_user_picked_v1";

function readLocal(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // 隐私模式等场景静默降级
  }
}

export default function HomePanel({
  onOpenMap,
  onOpenChat,
}: {
  onOpenMap: (id: string, name: string) => void;
  onOpenChat: (id: string, name: string) => void;
}) {
  const [routes, setRoutes] = useState<RouteCardLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [province, setProvince] = useState<string | null>(null);
  const [userPicked, setUserPicked] = useState(() => readLocal(USER_PICKED_KEY) === "1");
  const [regions, setRegions] = useState<RegionProvince[]>([]);
  const [locatedProvince, setLocatedProvince] = useState<string | null>(() =>
    readLocal(LOCATED_PROVINCE_KEY),
  );
  const [regionPanelOpen, setRegionPanelOpen] = useState(false);
  const recommendRef = useRef<HTMLDivElement | null>(null);
  // 选完地区后把「为你推荐」模块锚定上滑到视口顶部，避免用户看不到已切换的内容
  const jumpToRecommend = () => {
    requestAnimationFrame(() => recommendRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);

  const month = new Date().getMonth() + 1;

  useEffect(() => {
    let alive = true;
    Promise.all([fetch("/api/routes"), fetch("/api/regions")])
      .then(async ([r1, r2]) => {
        const p1 = await r1.json();
        const p2 = await r2.json();
        if (!alive) return;
        setRoutes((p1.data as RouteCardLite[]) ?? []);
        setRegions((p2.data?.provinces as RegionProvince[]) ?? []);
        setLoading(false);
      })
      .catch(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  // GPS 定位 → 映射到最近省份（无 AK，用真实几何质心 + 球面距离）
  const startLocate = (opts?: { silent?: boolean }) => {
    const geo = typeof navigator !== "undefined" ? navigator.geolocation : null;
    if (!geo) {
      if (!opts?.silent) setLocateError("当前环境不支持定位，请手动选择地区");
      return;
    }
    setLocating(true);
    setLocateError(null);
    geo.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        let best: string | null = null;
        let bestD = Infinity;
        for (const p of regions) {
          if (!p.coordinate) continue;
          const d = haversine(latitude, longitude, p.coordinate.lat, p.coordinate.lng);
          if (d < bestD) {
            bestD = d;
            best = p.province;
          }
        }
        setLocating(false);
        if (best) {
          setLocatedProvince(best);
          writeLocal(LOCATED_PROVINCE_KEY, best);
          setUserPicked(false);
          writeLocal(USER_PICKED_KEY, null);
          setProvince(best);
        } else if (!opts?.silent) {
          setLocateError("暂时无法识别所在省份");
        }
      },
      () => {
        setLocating(false);
        if (!opts?.silent) setLocateError("定位失败，可手动选择地区");
      },
      { enableHighAccuracy: false, timeout: 8000 },
    );
  };

  // 进入页面静默定位一次；定位成功即自动切到当前地区（用户手动选过则不覆盖）
  useEffect(() => {
    if (regions.length > 0 && !locatedProvince && !userPicked) startLocate({ silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regions]);

  const keywords = useMemo(() => getTopKeywords(3), [routes]);

  const effectiveProvince = province ?? locatedProvince;
  const personalized = Boolean(province || locatedProvince || keywords.length);

  const recommended = useMemo(() => {
    const base = province ? routes.filter((r) => r.province_name === province) : routes;
    return recommendRoutes(base, { locatedProvince: effectiveProvince, keywords, month }, 10);
  }, [routes, province, effectiveProvince, keywords, month]);

  const quickItems = useMemo(() => {
    const dynamic = keywords.map((k) => ({ label: k, query: `推荐${k}的新手徒步线`, dynamic: true }));
    return [...QUICK, ...dynamic];
  }, [keywords]);

  const regionLabel = province ?? locatedProvince ?? "全国";
  const isLocated = !province && Boolean(locatedProvince);

  return (
    <div className="no-scrollbar h-full overflow-x-hidden overflow-y-auto" style={{ background: "transparent" }}>
      <div className="space-y-7 px-5 pb-10 pt-3">
        {/* 顶部：地区切换（点击拉起面板）+ 搜索条 */}
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setRegionPanelOpen(true)}
            className="flex w-full items-center gap-2 rounded-full bg-white px-4 py-3 text-sm font-medium text-ink"
            style={{ boxShadow: "0 8px 20px rgba(18,32,24,0.06)" }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#1d7c57" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
              <path d="M12 21s7-5.1 7-11a7 7 0 1 0-14 0c0 5.9 7 11 7 11Z" />
              <circle cx="12" cy="10" r="2.6" />
            </svg>
            <span className="truncate">{regionLabel}</span>
            {isLocated ? (
              <span
                className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                style={{ background: "var(--primary-soft)", color: "var(--primary)" }}
              >
                GPS
              </span>
            ) : null}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9aa8a0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ml-auto shrink-0">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => onOpenChat("", "")}
            className="flex w-full items-center gap-2.5 rounded-full bg-white px-4 py-3 text-left"
            style={{ boxShadow: "0 8px 20px rgba(18,32,24,0.06)" }}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#9aa8a0" strokeWidth="2" strokeLinecap="round">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <span className="text-sm text-muted">搜线路、城市或场景，也可以直接问我</span>
          </button>
        </div>

        {/* Hero：深绿渐变 */}
        <section
          className="relative overflow-hidden rounded-[28px] px-5 pb-5 pt-6 text-white"
          style={{
            background:
              "linear-gradient(180deg, rgba(8,15,12,0.08), rgba(8,15,12,0.42)), linear-gradient(160deg,#1a3128 0%,#1f4a39 42%,#2d6b56 100%)",
            boxShadow: "0 24px 60px rgba(17,31,24,0.28)",
          }}
        >
          <span
            className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] uppercase tracking-wider"
            style={{ background: "rgba(255,255,255,0.12)", backdropFilter: "blur(8px)" }}
          >
            Beginner Routes
          </span>
          <h2 className="serif mt-3 text-[34px] font-bold leading-[1.08] tracking-tight">
            先去那些
            <br />
            看起来就想出发的山
          </h2>
          <p className="mt-3 max-w-[240px] text-sm" style={{ color: "rgba(244,249,246,0.8)" }}>
            不是硬核登山工具，而是帮新手先找到值得去、看得懂、走得稳的成熟路线。
          </p>

          <div
            className="mt-3 inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs"
            style={{ background: "rgba(255,243,216,0.16)", border: "1px solid rgba(255,243,216,0.18)" }}
          >
            已收录 {routes.length || "—"} 条真实线路，先挑一条试试
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <div className="rounded-2xl p-3" style={{ background: "rgba(255,255,255,0.1)", backdropFilter: "blur(10px)" }}>
              <strong className="block text-xl leading-none">{regions.length || "—"}</strong>
              <span className="mt-1.5 block text-[11px]" style={{ color: "rgba(244,249,246,0.72)" }}>覆盖省份</span>
            </div>
            <div className="rounded-2xl p-3" style={{ background: "rgba(255,255,255,0.1)", backdropFilter: "blur(10px)" }}>
              <strong className="block text-xl leading-none">
                {routes.length ? "新手向" : "—"}
              </strong>
              <span className="mt-1.5 block text-[11px]" style={{ color: "rgba(244,249,246,0.72)" }}>人群定位</span>
            </div>
            <div className="rounded-2xl p-3" style={{ background: "rgba(255,255,255,0.1)", backdropFilter: "blur(10px)" }}>
              <strong className="block text-xl leading-none">100%</strong>
              <span className="mt-1.5 block text-[11px]" style={{ color: "rgba(244,249,246,0.72)" }}>成熟公开线</span>
            </div>
          </div>
        </section>

        {/* 快速开始（预置 + 你的对话偏好） */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-lg font-semibold tracking-tight text-ink">快速开始</h3>
            {keywords.length > 0 ? (
              <span className="text-[11px] text-muted">已同步你的对话偏好</span>
            ) : null}
          </div>
          <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
            {quickItems.map((q) => (
              <button
                key={q.label}
                type="button"
                onClick={() => onOpenChat("", q.query)}
                className="whitespace-nowrap rounded-2xl px-4 py-3 text-sm font-medium shadow-sm"
                style={
                  q.dynamic
                    ? { background: "var(--primary-soft)", color: "var(--primary)", border: "1px solid rgba(29,124,87,0.2)" }
                    : { background: "#ffffff", color: "var(--ink)", boxShadow: "0 8px 22px rgba(18,32,24,0.06)" }
                }
              >
                {q.dynamic ? `# ${q.label}` : q.label}
              </button>
            ))}
          </div>
        </section>

        {/* 本周推荐 / 为你推荐（个性化子集，带实景封面） */}
        <section>
          <div ref={recommendRef} className="mb-3 flex items-center justify-between">
            <h3 className="text-lg font-semibold tracking-tight text-ink">
              {personalized ? "为你推荐" : "本周推荐"}
            </h3>
            <span className="text-xs text-muted">{recommended.length} 条精选</span>
          </div>
          {personalized ? (
            <div className="mb-2 text-[11px] text-muted">
              结合定位 · 当季时令 · 你的对话偏好
            </div>
          ) : null}

          {loading ? (
            <div className="rounded-2xl bg-white/70 p-6 text-center text-sm text-muted shadow-sm">加载真实线路中…</div>
          ) : recommended.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/70 bg-white/60 p-6 text-center text-sm text-muted">
              该范围内暂无线路，换个地区看看。
            </div>
          ) : (
            <div className="no-scrollbar -mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-1">
              {recommended.map((r) => (
                <RouteCard key={r.route_id} route={r} onOpenMap={onOpenMap} onOpenChat={onOpenChat} gradient={visualGradient(r.route_id)} />
              ))}
            </div>
          )}
        </section>

        {/* 按地区找线（不暴露条数，仅作地区入口） */}
        <section>
          <div className="mb-3">
            <h3 className="text-lg font-semibold tracking-tight text-ink">按地区找线</h3>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => {
                setProvince(null);
                setUserPicked(false);
                writeLocal(USER_PICKED_KEY, null);
                jumpToRecommend();
              }}
              className="flex items-center justify-between rounded-2xl bg-white/80 px-4 py-4 text-left shadow-sm transition"
              style={{ border: !province && !userPicked ? "1px solid rgba(29,124,87,0.25)" : "1px solid rgba(255,255,255,0.7)" }}
            >
              <strong className="text-base text-ink">全部地区</strong>
              <span className="text-lg leading-none text-primary">›</span>
            </button>
            {regions.map((p) => (
              <button
                key={p.province}
                type="button"
                onClick={() => {
                  setProvince(p.province);
                  setUserPicked(true);
                  writeLocal(USER_PICKED_KEY, "1");
                  jumpToRecommend();
                }}
                className="flex items-center justify-between rounded-2xl bg-white/80 px-4 py-4 text-left shadow-sm transition"
                style={{ border: province === p.province ? "1px solid rgba(29,124,87,0.25)" : "1px solid rgba(255,255,255,0.7)" }}
              >
                <strong className="text-base text-ink">{p.province}</strong>
                <span className="text-lg leading-none text-primary">›</span>
              </button>
            ))}
          </div>
        </section>
      </div>

      {/* 地区切换面板（底部抽屉） */}
      {regionPanelOpen ? (
        <div
          className="fixed left-0 top-0 z-50 flex h-screen w-full items-end justify-center"
          style={{ height: "100dvh" }}
          role="dialog"
          aria-modal="true"
        >
          <div className="absolute inset-0" style={{ background: "rgba(10,20,15,0.45)" }} onClick={() => setRegionPanelOpen(false)} />
          <div
            className="relative w-full max-w-[460px] rounded-t-[24px] bg-white px-5 pt-3 shadow-2xl"
            style={{ paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom))" }}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full" style={{ background: "rgba(18,32,24,0.15)" }} />
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-ink">选择地区</h3>
              <button
                type="button"
                onClick={() => setRegionPanelOpen(false)}
                className="grid h-8 w-8 place-items-center rounded-full text-sm text-muted"
                style={{ background: "rgba(18,32,24,0.05)" }}
                aria-label="关闭"
              >
                ✕
              </button>
            </div>
            <button
              type="button"
              onClick={() => startLocate()}
              className="flex w-full items-center gap-2.5 rounded-2xl px-4 py-3 text-left text-sm font-medium"
              style={{ background: "var(--primary-soft)", color: "var(--primary)" }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                <path d="M12 21s7-5.1 7-11a7 7 0 1 0-14 0c0 5.9 7 11 7 11Z" />
                <circle cx="12" cy="10" r="2.6" />
              </svg>
              <span className="flex-1">
                {locating ? "正在定位…" : locatedProvince ? `使用当前位置（${locatedProvince}）` : "使用当前位置定位"}
              </span>
            </button>
            {locateError ? (
              <div className="mt-2 text-xs" style={{ color: "#b4552d" }}>
                {locateError}
              </div>
            ) : null}
            <div className="mt-4 grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => {
                  setProvince(null);
                  setUserPicked(false);
                  writeLocal(USER_PICKED_KEY, null);
                  setRegionPanelOpen(false);
                  jumpToRecommend();
                }}
                className="rounded-xl px-2 py-2.5 text-sm font-medium transition"
                style={
                  !province && !userPicked
                    ? { background: "var(--primary-soft)", color: "var(--primary)" }
                    : { background: "rgba(18,32,24,0.05)", color: "var(--ink)" }
                }
              >
                全部地区
              </button>
              {regions.map((p) => (
                <button
                  key={p.province}
                  type="button"
                  onClick={() => {
                    setProvince(p.province);
                    setUserPicked(true);
                    writeLocal(USER_PICKED_KEY, "1");
                    setRegionPanelOpen(false);
                    jumpToRecommend();
                  }}
                  className="rounded-xl px-2 py-2.5 text-sm font-medium transition"
                  style={
                    province === p.province
                      ? { background: "var(--primary-soft)", color: "var(--primary)" }
                      : { background: "rgba(18,32,24,0.05)", color: "var(--ink)" }
                  }
                >
                  {p.province}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RouteCard({
  route,
  gradient,
  onOpenMap,
  onOpenChat,
}: {
  route: RouteCardLite;
  gradient: string;
  onOpenMap: (id: string, name: string) => void;
  onOpenChat: (id: string, name: string) => void;
}) {
  const name = route.route_name ?? route.route_id;
  return (
    <div className="frost-strong w-[300px] shrink-0 snap-start overflow-hidden rounded-[24px] p-3">
      <div className="h-[168px] w-full overflow-hidden rounded-2xl" style={{ background: gradient }}>
        {route.cover_image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={route.cover_image} alt={name} className="h-full w-full object-cover" loading="lazy" />
        ) : null}
      </div>
      <div className="px-1.5 pb-1 pt-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="text-lg font-semibold tracking-tight text-ink">{name}</div>
          <div className="shrink-0 pt-1 text-xs text-muted">
            {route.duration_hours != null ? `${route.duration_hours}h` : ""}
            {route.distance_km != null ? ` · ${route.distance_km}km` : ""}
          </div>
        </div>
        <div className="mt-1 text-xs text-muted">{[route.city_name, route.area_name].filter(Boolean).join(" · ")}</div>
        {route.summary_short ? <div className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted">{route.summary_short}</div> : null}
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {route.difficulty_label ? <span className="chip chip-brand">{route.difficulty_label}</span> : null}
          {route.route_type_label ? <span className="chip chip-gray">{route.route_type_label}</span> : null}
        </div>
        <div className="mt-3.5 flex gap-2.5">
          <button
            type="button"
            onClick={() => onOpenMap(route.route_id, name)}
            className="flex-1 whitespace-nowrap rounded-xl border border-white/80 bg-white/70 px-3 py-2.5 text-center text-sm font-medium text-ink"
          >
            查看地图
          </button>
          <button
            type="button"
            onClick={() => onOpenChat(route.route_id, name)}
            className="btn-primary flex-1 whitespace-nowrap px-3 py-2.5 text-center text-sm"
          >
            问更多
          </button>
        </div>
      </div>
    </div>
  );
}
