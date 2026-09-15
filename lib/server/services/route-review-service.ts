import type { ReviewActionDTO } from "../dto/admin-routes";
import { getAdminRouteRepository } from "../repositories/admin-route-repository-factory";

export const routeReviewService = {
  async getReviewDetail(routeId: string) {
    return getAdminRouteRepository().getReviewDetail(routeId);
  },

  async runAction(routeId: string, input: ReviewActionDTO) {
    return getAdminRouteRepository().runReviewAction(routeId, input);
  },
};
