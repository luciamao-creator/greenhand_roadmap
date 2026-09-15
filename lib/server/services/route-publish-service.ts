import type { PublishPreviewDTO, PublishRouteDTO, PublishVersionActionDTO } from "../dto/admin-routes";
import { getAdminRouteRepository } from "../repositories/admin-route-repository-factory";

export const routePublishService = {
  async createPreview(routeId: string, input: PublishPreviewDTO) {
    return getAdminRouteRepository().createPublishPreview(routeId, input);
  },

  async publish(routeId: string, input: PublishRouteDTO) {
    return getAdminRouteRepository().publish(routeId, input);
  },

  async listVersions(routeId: string) {
    return getAdminRouteRepository().listPublishVersions(routeId);
  },

  async runVersionAction(routeId: string, publishVersionId: string, input: PublishVersionActionDTO) {
    return getAdminRouteRepository().runPublishVersionAction(routeId, publishVersionId, input);
  },
};
