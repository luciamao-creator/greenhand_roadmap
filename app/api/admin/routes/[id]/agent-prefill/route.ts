import { NextRequest } from "next/server";
import { error, ok } from "../../../../../../lib/server/api/admin-response";
import { parseAgentPrefillTriggerBody } from "../../../../../../lib/server/dto/admin-route-parsers";
import { agentPrefillService } from "../../../../../../lib/server/services/agent-prefill-service";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const result = await agentPrefillService.getStatus(id);
  if (!result) {
    return error("ROUTE_NOT_FOUND", "route not found", 404, "req_admin_agent_prefill_get");
  }

  return ok(result, "req_admin_agent_prefill_get");
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const input = parseAgentPrefillTriggerBody(body);
    const result = await agentPrefillService.trigger(id, input);
    if (!result) {
      return error("ROUTE_NOT_FOUND", "route not found", 404, "req_admin_agent_prefill_post");
    }

    return ok(result, "req_admin_agent_prefill_post");
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "invalid request";
    return error("INVALID_REQUEST", message, 400, "req_admin_agent_prefill_post");
  }
}
