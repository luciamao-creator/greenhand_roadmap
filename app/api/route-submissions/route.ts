import { NextRequest } from "next/server";
import { error, ok } from "../../../lib/server/api/admin-response";
import { parseCreateRouteCandidateBody } from "../../../lib/server/dto/public-route-submission-parsers";
import { publicRouteSubmissionService } from "../../../lib/server/services/public-route-submission-service";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const input = parseCreateRouteCandidateBody(body);
    const result = await publicRouteSubmissionService.createCandidate(input);
    return ok(result, "req_public_route_submission_create");
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "invalid request";
    return error("INVALID_REQUEST", message, 400, "req_public_route_submission_create");
  }
}
