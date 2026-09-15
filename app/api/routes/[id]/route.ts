import { NextRequest } from "next/server";
import { error, ok } from "../../../../lib/server/api/admin-response";
import { publicRouteService } from "../../../../lib/server/services/public-route-service";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const route = await publicRouteService.getRoute(id);
  if (!route) {
    return error("ROUTE_NOT_FOUND", "route not found", 404, "req_public_route_get");
  }
  return ok(route, "req_public_route_get");
}
