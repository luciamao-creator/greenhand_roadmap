import { NextRequest } from "next/server";
import { error, ok } from "../../../../../../lib/server/api/admin-response";
import { routeReviewService } from "../../../../../../lib/server/services/route-review-service";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const result = await routeReviewService.getReviewDetail(id);
  if (!result) {
    return error("ROUTE_NOT_FOUND", "route not found", 404, "req_admin_review_detail_get");
  }

  return ok(result, "req_admin_review_detail_get");
}
