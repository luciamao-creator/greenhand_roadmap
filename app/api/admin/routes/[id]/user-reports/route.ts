import { NextRequest } from "next/server";
import { error, ok } from "../../../../../../lib/server/api/admin-response";
import { parseUserReportListQuery } from "../../../../../../lib/server/dto/admin-route-parsers";
import { userReportReviewService } from "../../../../../../lib/server/services/user-report-review-service";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const query = parseUserReportListQuery(new URL(request.url));
    const result = await userReportReviewService.listReports(id, query);
    if (!result) {
      return error("ROUTE_NOT_FOUND", "route not found", 404, "req_admin_user_reports_get");
    }

    return ok(result, "req_admin_user_reports_get");
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "invalid request";
    return error("INVALID_REQUEST", message, 400, "req_admin_user_reports_get");
  }
}
