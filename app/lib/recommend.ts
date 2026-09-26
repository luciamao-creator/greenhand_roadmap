import type { RouteCardLite } from "../components/types";

/**
 * 首页「本周推荐 / 为你推荐」的轻量排序：
 * 综合 定位所在地相关度 + 当季时令 + 用户对话偏好 + 新手友好度。
 * 纯前端、确定性，不依赖后端。
 */

export type RecommendCtx = {
  locatedProvince?: string | null;
  keywords?: string[];
  month?: number; // 1-12
};

export function seasonOfMonth(month: number): string {
  if (month >= 3 && month <= 5) return "春季";
  if (month >= 6 && month <= 8) return "夏季";
  if (month >= 9 && month <= 11) return "秋季";
  return "冬季";
}

export function nextSeasonOfMonth(month: number): string {
  const s = seasonOfMonth(month);
  return s === "春季" ? "夏季" : s === "夏季" ? "秋季" : s === "秋季" ? "冬季" : "春季";
}

// RouteCardLite 不含 surface/season，这里用宽松类型读取
type AnyRoute = RouteCardLite & { surface_tags?: string[]; season_tags?: string[] };

function searchable(route: AnyRoute): string {
  return [
    route.route_name,
    route.province_name,
    route.city_name,
    route.area_name,
    route.route_type_label,
    route.difficulty_label,
    route.summary_short,
    (route.surface_tags ?? []).join(" "),
    (route.season_tags ?? []).join(" "),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function scoreRoute(route: RouteCardLite, ctx: RecommendCtx): number {
  const r = route as AnyRoute;
  const month = ctx.month ?? new Date().getMonth() + 1;
  const text = searchable(r);
  let score = 0;

  // 当季时令
  if (Array.isArray(r.season_tags)) {
    if (r.season_tags.includes(seasonOfMonth(month))) score += 2.5;
    else if (r.season_tags.includes(nextSeasonOfMonth(month))) score += 1;
  }

  // 定位所在地相关度
  if (ctx.locatedProvince && r.province_name === ctx.locatedProvince) score += 4;

  // 新手友好度
  if (r.difficulty_label && /轻松|入门|简单/.test(r.difficulty_label)) score += 1;
  if (r.distance_km != null && r.distance_km < 6) score += 0.8;
  if (r.duration_hours != null && r.duration_hours < 2) score += 0.6;

  // 用户对话偏好命中
  for (const kw of ctx.keywords ?? []) {
    if (kw && text.includes(kw.toLowerCase())) score += 2;
  }

  return score;
}

export function recommendRoutes(
  routes: RouteCardLite[],
  ctx: RecommendCtx,
  limit = 10,
): RouteCardLite[] {
  const month = ctx.month ?? new Date().getMonth() + 1;
  return routes
    .map((r) => ({ r, score: scoreRoute(r, { ...ctx, month }) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.r);
}
