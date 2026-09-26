import fs from "fs";
import path from "path";
import { getAdminRouteRepository } from "../repositories/admin-route-repository-factory";

type GeoPoint = { lng: number; lat: number } | null | undefined;

function loadRouteFile(routeId: string) {
  const file = path.join(process.cwd(), "data", "routes", `${routeId}.json`);
  if (!fs.existsSync(file)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return undefined;
  }
}

/**
 * 公开线路详情：优先读 data/routes/<id>.json（真实种子/发布线路，含几何轨迹），
 * 读不到再回退到管理仓库（内存桩）。这样 H5 地图能渲染真实轨迹，首页→地图对全部线路可用。
 */
export const publicRouteService = {
  async getRoute(routeId: string) {
    const raw = loadRouteFile(routeId);
    if (raw) {
      const base = raw.base_facts ?? {};
      const geo = raw.geometry ?? {};
      const metrics = raw.metrics ?? {};
      const narrative = raw.narrative ?? {};
      const durationHours = metrics.duration_hours ?? null;
      return {
        route_id: raw.route_id ?? routeId,
        route_name: base.route_name,
        province_name: base.province_name,
        city_name: base.city_name,
        area_name: base.area_name,
        start_point_name: base.start_point_name,
        end_point_name: base.end_point_name,
        route_type: base.route_type,
        route_type_label: base.route_type_label,
        difficulty_band: base.difficulty_band,
        difficulty_label: base.difficulty_label,
        route_status: raw.route_status,
        distance_km: metrics.distance_km ?? null,
        duration_minutes: durationHours != null ? Math.round(durationHours * 60) : null,
        elevation_gain_m: metrics.ascent_m ?? null,
        summary_short: narrative.summary_short ?? undefined,
        cover_image: raw.cover_image ?? undefined,
        route_logic_summary: narrative.beginner_fit_reason ?? undefined,
        geometry: {
          start_point: (geo.start_point as GeoPoint) ?? null,
          end_point: (geo.end_point as GeoPoint) ?? null,
          amap_walking_path: Array.isArray(geo.amap_walking_path) ? geo.amap_walking_path : [],
          polyline: geo.polyline ?? null,
          note: geo.note ?? geo.amap_walking_note ?? null,
        },
        route_nodes: Array.isArray(raw.route_nodes) ? raw.route_nodes : [],
        route_exit_points: Array.isArray(raw.route_exit_points) ? raw.route_exit_points : [],
        route_risk_points: Array.isArray(raw.route_risk_points) ? raw.route_risk_points : [],
      };
    }

    // 回退：管理仓库（内存桩）
    const route = await getAdminRouteRepository().getById(routeId);
    if (!route) {
      return undefined;
    }
    const panelRoute = ((route.panels?.route ?? route.route ?? {}) as Record<string, unknown>) || {};
    const routeGeo = (route.route_geometry ?? (panelRoute as Record<string, unknown>).geometry) as
      | Record<string, unknown>
      | undefined;
    const amapPath = (routeGeo?.amap_walking_path as Array<{ lng: number; lat: number }>) ?? [];

    return {
      route_id: route.route_id,
      route_name: route.route_name,
      province_name: route.province_name,
      city_name: route.city_name,
      area_name: route.area_name,
      start_point_name: route.start_point_name,
      end_point_name: route.end_point_name,
      route_type: route.route_type,
      route_status: route.route_status,
      distance_km: (panelRoute.distance_km as number | undefined) ?? undefined,
      duration_minutes: (panelRoute.duration_minutes as number | undefined) ?? undefined,
      elevation_gain_m: (panelRoute.elevation_gain_m as number | undefined) ?? undefined,
      summary_short: (panelRoute.summary_short as string | undefined) ?? undefined,
      route_logic_summary: (panelRoute.route_logic_summary as string | undefined) ?? undefined,
      geometry: {
        start_point: (routeGeo?.start_point as GeoPoint) ?? null,
        end_point: (routeGeo?.end_point as GeoPoint) ?? null,
        amap_walking_path: amapPath,
        note: (routeGeo?.note as string | undefined) ?? null,
      },
      route_nodes: route.panels?.route_nodes ?? route.route_nodes ?? [],
      route_exit_points: route.panels?.route_exit_points ?? route.route_exit_points ?? [],
      route_risk_points: route.panels?.route_risk_points ?? route.route_risk_points ?? [],
    };
  },
};
