import { getAdminRouteRepository } from "../repositories/admin-route-repository-factory";

export const publicRouteService = {
  async getRoute(routeId: string) {
    const route = await getAdminRouteRepository().getById(routeId);
    if (!route) {
      return undefined;
    }
    const panelRoute = ((route.panels?.route ?? route.route ?? {}) as Record<string, unknown>) || {};

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
      pending_user_report_count: route.pending_user_report_count,
      duration_minutes: panelRoute.duration_minutes,
      distance_km: panelRoute.distance_km,
      elevation_gain_m: panelRoute.elevation_gain_m,
      summary_short: (panelRoute.summary_short as string | undefined) ?? undefined,
      route_logic_summary: (panelRoute.route_logic_summary as string | undefined) ?? undefined,
      route_nodes: route.panels?.route_nodes ?? route.route_nodes ?? [],
      route_exit_points: route.panels?.route_exit_points ?? route.route_exit_points ?? [],
      route_risk_points: route.panels?.route_risk_points ?? route.route_risk_points ?? [],
    };
  },
};
