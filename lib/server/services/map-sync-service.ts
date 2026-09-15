import type { MapSyncTriggerDTO } from "../dto/admin-routes";
import { getAdminRouteRepository } from "../repositories/admin-route-repository-factory";

export const mapSyncService = {
  async trigger(routeId: string, input: MapSyncTriggerDTO) {
    return getAdminRouteRepository().triggerMapSync(routeId, input);
  },

  async getStatus(routeId: string) {
    return getAdminRouteRepository().getMapSyncStatus(routeId);
  },
};
