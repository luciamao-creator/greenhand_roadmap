import type { AgentPrefillTriggerDTO } from "../dto/admin-routes";
import { getAdminRouteRepository } from "../repositories/admin-route-repository-factory";

export const agentPrefillService = {
  async trigger(routeId: string, input: AgentPrefillTriggerDTO) {
    return getAdminRouteRepository().triggerAgentPrefill(routeId, input);
  },

  async getStatus(routeId: string) {
    return getAdminRouteRepository().getAgentPrefillStatus(routeId);
  },
};
