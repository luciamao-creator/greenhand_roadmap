import { NextRequest } from "next/server";
import { error, ok } from "../../../../../lib/server/api/admin-response";
import { parseCreatePublicUserReportBody } from "../../../../../lib/server/dto/public-route-submission-parsers";
import { publicRouteSubmissionService } from "../../../../../lib/server/services/public-route-submission-service";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const input = parseCreatePublicUserReportBody(body);
    const result = await publicRouteSubmissionService.createUserReport(id, input);
    if (!result) {
      return error("ROUTE_NOT_FOUND", "route not found", 404, "req_public_route_contribution_create");
    }
    return ok(result, "req_public_route_contribution_create");
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "invalid request";
    return error("INVALID_REQUEST", message, 400, "req_public_route_contribution_create");
  }
}
