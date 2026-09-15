import { NextRequest } from "next/server";
import { error, ok } from "../../../../../../../../lib/server/api/admin-response";
import { parseUserReportReviewBody } from "../../../../../../../../lib/server/dto/admin-route-parsers";
import { userReportReviewService } from "../../../../../../../../lib/server/services/user-report-review-service";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string; reportId: string }> },
) {
  try {
    const { id, reportId } = await context.params;
    const body = await request.json();
    const input = parseUserReportReviewBody(body);
    const result = await userReportReviewService.reviewReport(id, reportId, input);
    if (result === undefined) {
      return error("ROUTE_NOT_FOUND", "route not found", 404, "req_admin_user_report_review");
    }
    if (result === null) {
      return error("USER_REPORT_NOT_FOUND", "user report not found", 404, "req_admin_user_report_review");
    }

    return ok(result, "req_admin_user_report_review");
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "invalid request";
    return error("INVALID_REQUEST", message, 400, "req_admin_user_report_review");
  }
}
