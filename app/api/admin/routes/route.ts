import { NextRequest } from "next/server";
import { error, ok } from "../../../../lib/server/api/admin-response";
import { parseAdminRouteListQuery, parseCreateRouteDraftBody } from "../../../../lib/server/dto/admin-route-parsers";
import { adminRouteListService } from "../../../../lib/server/services/admin-route-list-service";
import { routeDraftService } from "../../../../lib/server/services/route-draft-service";

export async function GET(request: NextRequest) {
  try {
    const query = parseAdminRouteListQuery(new URL(request.url));
    const result = await adminRouteListService.listRoutes(query);
    return ok(result, "req_admin_routes_list");
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "invalid request";
    return error("INVALID_REQUEST", message, 400, "req_admin_routes_list");
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const input = parseCreateRouteDraftBody(body);
    const result = await routeDraftService.createDraft(input);
    return ok(result, "req_admin_routes_create");
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "invalid request";
    return error("INVALID_REQUEST", message, 400, "req_admin_routes_create");
  }
}
