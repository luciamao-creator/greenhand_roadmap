import { NextRequest } from "next/server";
import { error, ok } from "../../../../../lib/server/api/admin-response";
import { parseUpdateRouteDraftBody } from "../../../../../lib/server/dto/admin-route-parsers";
import { adminRouteListService } from "../../../../../lib/server/services/admin-route-list-service";
import { routeDraftService } from "../../../../../lib/server/services/route-draft-service";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const result = await adminRouteListService.getRouteWorkspace(id);
  if (!result) {
    return error("ROUTE_NOT_FOUND", "route not found", 404, "req_admin_route_get");
  }

  return ok(result, "req_admin_route_get");
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const input = parseUpdateRouteDraftBody(body);
    const result = await routeDraftService.updateDraft(id, input);
    if (!result) {
      return error("ROUTE_NOT_FOUND", "route not found", 404, "req_admin_route_update");
    }

    return ok(result, "req_admin_route_update");
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "invalid request";
    return error("INVALID_REQUEST", message, 400, "req_admin_route_update");
  }
}
