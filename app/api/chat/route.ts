import { NextRequest } from "next/server";
import { ok, error } from "../../../lib/server/api/admin-response";
import {
  answerRouteQuery,
  RouteChatServiceError,
  type ChatTurn,
} from "../../../lib/server/services/route-chat-service";

type ChatRequestBody = {
  query?: unknown;
  topK?: unknown;
  focusRouteId?: unknown;
  history?: unknown;
};

function parseHistory(value: unknown): ChatTurn[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const turns: ChatTurn[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const role = (item as { role?: unknown }).role;
    const content = (item as { content?: unknown }).content;
    if ((role === "user" || role === "assistant") && typeof content === "string") {
      turns.push({ role, content });
    }
  }
  return turns.length > 0 ? turns : undefined;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ChatRequestBody;
    const query = typeof body.query === "string" ? body.query.trim() : "";
    if (!query) {
      return error("INVALID_REQUEST", "query 不能为空", 400, "req_chat");
    }

    let topK = 5;
    if (typeof body.topK === "number" && Number.isFinite(body.topK)) {
      topK = Math.min(Math.max(Math.trunc(body.topK), 1), 10);
    }

    const focusRouteId = typeof body.focusRouteId === "string" && body.focusRouteId.trim() ? body.focusRouteId : undefined;

    const result = await answerRouteQuery(query, {
      topK,
      focusRouteId,
      history: parseHistory(body.history),
    });
    return ok(result, "req_chat");
  } catch (cause) {
    if (cause instanceof RouteChatServiceError) {
      return error("CHAT_FAILED", cause.message, 500, "req_chat");
    }
    const message = cause instanceof Error ? cause.message : "对话服务异常";
    return error("CHAT_FAILED", message, 500, "req_chat");
  }
}
