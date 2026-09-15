import type { CreatePublicUserReportDTO, CreateRouteCandidateDTO } from "../dto/public-route-submissions";
import { getAdminRouteRepository } from "../repositories/admin-route-repository-factory";

export const publicRouteSubmissionService = {
  async createCandidate(input: CreateRouteCandidateDTO) {
    return getAdminRouteRepository().createCandidate(input);
  },

  async createUserReport(routeId: string, input: CreatePublicUserReportDTO) {
    return getAdminRouteRepository().createUserReport(routeId, input);
  },
};
