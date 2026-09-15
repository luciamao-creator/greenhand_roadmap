import { NextRequest } from "next/server";
import { error, ok } from "../../../../../../lib/server/api/admin-response";
import { routePublishService } from "../../../../../../lib/server/services/route-publish-service";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const result = await routePublishService.listVersions(id);
  if (!result) {
    return error("ROUTE_NOT_FOUND", "route not found", 404, "req_admin_publish_versions_get");
  }

  return ok(result, "req_admin_publish_versions_get");
}
