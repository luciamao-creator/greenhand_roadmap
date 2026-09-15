import { NextRequest } from "next/server";
import { error, ok } from "../../../../../../lib/server/api/admin-response";
import { parseStructuredNodeGenerateBody } from "../../../../../../lib/server/dto/admin-route-parsers";
import { structuredNodeService } from "../../../../../../lib/server/services/structured-node-service";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const body = await request.json().catch(() => undefined);
    const input = parseStructuredNodeGenerateBody(body);
    const result = await structuredNodeService.trigger(id, input);
    if (!result) {
      return error("ROUTE_NOT_FOUND", "route not found", 404, "req_admin_structured_nodes_post");
    }

    return ok(result, "req_admin_structured_nodes_post");
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "invalid request";
    return error("INVALID_REQUEST", message, 400, "req_admin_structured_nodes_post");
  }
}
