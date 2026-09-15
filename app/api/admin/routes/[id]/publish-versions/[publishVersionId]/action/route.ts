import { NextRequest } from "next/server";
import { error, ok } from "../../../../../../../../lib/server/api/admin-response";
import { parsePublishVersionActionBody } from "../../../../../../../../lib/server/dto/admin-route-parsers";
import { routePublishService } from "../../../../../../../../lib/server/services/route-publish-service";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string; publishVersionId: string }> },
) {
  try {
    const { id, publishVersionId } = await context.params;
    const body = await request.json();
    const input = parsePublishVersionActionBody(body);
    const result = await routePublishService.runVersionAction(id, publishVersionId, input);
    if (result === undefined) {
      return error("ROUTE_NOT_FOUND", "route not found", 404, "req_admin_publish_version_action_post");
    }
    if (result === null) {
      return error("PUBLISH_VERSION_NOT_FOUND", "publish version not found", 404, "req_admin_publish_version_action_post");
    }

    return ok(result, "req_admin_publish_version_action_post");
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "invalid request";
    return error("INVALID_REQUEST", message, 400, "req_admin_publish_version_action_post");
  }
}
