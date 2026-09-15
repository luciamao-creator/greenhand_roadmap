import { NextRequest } from "next/server";
import { error, ok } from "../../../../../../lib/server/api/admin-response";
import { parseReviewActionBody } from "../../../../../../lib/server/dto/admin-route-parsers";
import { routeReviewService } from "../../../../../../lib/server/services/route-review-service";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const input = parseReviewActionBody(body);
    const result = await routeReviewService.runAction(id, input);
    if (!result) {
      return error("ROUTE_NOT_FOUND", "route not found", 404, "req_admin_review_post");
    }

    return ok(result, "req_admin_review_post");
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "invalid request";
    return error("INVALID_REQUEST", message, 400, "req_admin_review_post");
  }
}
