import { NextRequest } from "next/server";
import { error, ok } from "../../../../../../lib/server/api/admin-response";
import { parseMapSyncTriggerBody } from "../../../../../../lib/server/dto/admin-route-parsers";
import { mapSyncService } from "../../../../../../lib/server/services/map-sync-service";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const result = await mapSyncService.getStatus(id);
  if (!result) {
    return error("ROUTE_NOT_FOUND", "route not found", 404, "req_admin_map_sync_get");
  }

  return ok(result, "req_admin_map_sync_get");
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const input = parseMapSyncTriggerBody(body);
    const result = await mapSyncService.trigger(id, input);
    if (!result) {
      return error("ROUTE_NOT_FOUND", "route not found", 404, "req_admin_map_sync_post");
    }

    return ok(result, "req_admin_map_sync_post");
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "invalid request";
    return error("INVALID_REQUEST", message, 400, "req_admin_map_sync_post");
  }
}
