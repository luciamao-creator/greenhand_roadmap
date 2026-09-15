import { NextRequest } from "next/server";
import { error, ok } from "../../../../../../lib/server/api/admin-response";
import { parsePublishRouteBody } from "../../../../../../lib/server/dto/admin-route-parsers";
import { routePublishService } from "../../../../../../lib/server/services/route-publish-service";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const input = parsePublishRouteBody(body);
    const result = await routePublishService.publish(id, input);
    if (!result) {
      return error("ROUTE_NOT_FOUND", "route not found", 404, "req_admin_publish_post");
    }

    return ok(result, "req_admin_publish_post");
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "invalid request";
    return error("INVALID_REQUEST", message, 400, "req_admin_publish_post");
  }
}
