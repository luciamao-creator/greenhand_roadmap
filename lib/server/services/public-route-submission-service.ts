import type { CreatePublicUserReportDTO, CreateRouteCandidateDTO } from "../dto/public-route-submissions";
import { getAdminRouteRepository } from "../repositories/admin-route-repository-factory";
import { saveCandidate, saveUserReport } from "./submission-store";

export const publicRouteSubmissionService = {
  async createCandidate(input: CreateRouteCandidateDTO) {
    const result = await getAdminRouteRepository().createCandidate(input);
    saveCandidate(input, result as { route_id: string; route_name?: string; province_name?: string; city_name?: string; updated_at: string });
    return result;
  },

  async createUserReport(routeId: string, input: CreatePublicUserReportDTO) {
    const result = await getAdminRouteRepository().createUserReport(routeId, input);
    if (result) {
      saveUserReport(routeId, result as { report_id: string; proposal_text?: string });
    }
    return result;
  },
};
