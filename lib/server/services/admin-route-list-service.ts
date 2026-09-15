import type { AdminRouteListQueryDTO } from "../dto/admin-routes";
import { getAdminRouteRepository } from "../repositories/admin-route-repository-factory";

export const adminRouteListService = {
  async listRoutes(query: AdminRouteListQueryDTO) {
    return getAdminRouteRepository().list(query);
  },

  async getRouteWorkspace(routeId: string) {
    const route = await getAdminRouteRepository().getById(routeId);
    if (!route) {
      return undefined;
    }

    return {
      route_id: route.route_id,
      route_name: route.route_name,
      route_status: route.route_status,
      province_name: route.province_name,
      city_name: route.city_name,
      area_name: route.area_name,
      start_point_name: route.start_point_name,
      end_point_name: route.end_point_name,
      route_type: route.route_type,
      agent_prefill_status: route.agent_prefill_status,
      map_sync_status: route.map_sync_status,
      completion_ratio: route.completion_ratio,
      evidence_coverage_level: route.evidence_coverage_level,
      pending_user_report_count: route.pending_user_report_count,
      risk_summary: (route as Record<string, unknown>).risk_summary ?? undefined,
      panels: {
        route: route.route ?? {},
        route_geometry: route.route_geometry ?? {},
        route_nodes: route.route_nodes ?? [],
        route_exit_points: route.route_exit_points ?? [],
        route_risk_points: route.route_risk_points ?? [],
        route_tags: route.route_tags ?? [],
        route_weather_rules: route.route_weather_rules ?? [],
        route_checklist_profile: route.route_checklist_profile ?? {},
        route_faqs: route.route_faqs ?? [],
        route_sources: route.route_sources ?? [],
      },
      updated_at: route.updated_at,
    };
  },
};
