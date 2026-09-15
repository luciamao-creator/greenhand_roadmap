import type { UserReportListQueryDTO, UserReportReviewDTO } from "../dto/admin-routes";
import { getAdminRouteRepository } from "../repositories/admin-route-repository-factory";

export const userReportReviewService = {
  async listReports(routeId: string, query: UserReportListQueryDTO) {
    return getAdminRouteRepository().listUserReports(routeId, query);
  },

  async reviewReport(routeId: string, reportId: string, input: UserReportReviewDTO) {
    return getAdminRouteRepository().reviewUserReport(routeId, reportId, input);
  },
};
