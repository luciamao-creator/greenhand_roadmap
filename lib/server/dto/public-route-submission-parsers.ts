import type {
  CreatePublicUserReportDTO,
  CreateRouteCandidateDTO,
  NamedSubmissionPointDTO,
  SubmissionPointDTO,
} from "./public-route-submissions";

function asNonEmptyString(value: unknown, field: string, maxLength: number) {
  if (typeof value !== "string") {
    throw new Error(`${field} must be a string`);
  }

  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${field} is required`);
  }

  if (trimmed.length > maxLength) {
    throw new Error(`${field} is too long`);
  }

  return trimmed;
}

function asOptionalString(value: unknown, field: string, maxLength: number) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  return asNonEmptyString(value, field, maxLength);
}

function asFiniteNumber(value: unknown, field: string) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${field} must be a finite number`);
  }
  return parsed;
}

function parseOptionalPoint(input: unknown, field: string): SubmissionPointDTO | undefined {
  if (input === undefined || input === null) {
    return undefined;
  }
  if (typeof input !== "object") {
    throw new Error(`${field} must be an object`);
  }

  const record = input as Record<string, unknown>;
  const lng = asFiniteNumber(record.lng, `${field}.lng`);
  const lat = asFiniteNumber(record.lat, `${field}.lat`);

  if (lng === undefined && lat === undefined) {
    return undefined;
  }
  if (lng === undefined || lat === undefined) {
    throw new Error(`${field} requires both lng and lat`);
  }

  return { lng, lat };
}

function parseNamedPoint(input: unknown, field: string): NamedSubmissionPointDTO {
  if (!input || typeof input !== "object") {
    throw new Error(`${field} must be an object`);
  }

  const record = input as Record<string, unknown>;
  return {
    point_name: asNonEmptyString(record.point_name, `${field}.point_name`, 128),
    point: parseOptionalPoint(record.point, `${field}.point`),
  };
}

export function parseCreateRouteCandidateBody(body: unknown): CreateRouteCandidateDTO {
  if (!body || typeof body !== "object") {
    throw new Error("request body must be an object");
  }

  const input = body as Record<string, unknown>;
  const routeType = asNonEmptyString(input.route_type, "route_type", 32);
  if (!["loop", "out_and_back", "one_way"].includes(routeType)) {
    throw new Error("route_type is invalid");
  }

  const provinceName = asNonEmptyString(input.province_name, "province_name", 32);
  if (!["四川", "浙江", "广东", "福建"].includes(provinceName)) {
    throw new Error("province_name is not supported in MVP");
  }

  if (!Array.isArray(input.waypoints) || input.waypoints.length === 0) {
    throw new Error("waypoints is required");
  }

  const waypoints = input.waypoints.map((item, index) => parseNamedPoint(item, `waypoints[${index}]`));

  return {
    route_name: asNonEmptyString(input.route_name, "route_name", 128),
    province_name: provinceName,
    city_name: asNonEmptyString(input.city_name, "city_name", 64),
    area_name: asOptionalString(input.area_name, "area_name", 64),
    route_type: routeType as CreateRouteCandidateDTO["route_type"],
    start_point: parseNamedPoint(input.start_point, "start_point"),
    end_point: parseNamedPoint(input.end_point, "end_point"),
    waypoints,
    user_description: asNonEmptyString(input.user_description, "user_description", 2000),
    submitter_name: asOptionalString(input.submitter_name, "submitter_name", 64),
    submitter_contact: asOptionalString(input.submitter_contact, "submitter_contact", 128),
  };
}

export function parseCreatePublicUserReportBody(body: unknown): CreatePublicUserReportDTO {
  if (!body || typeof body !== "object") {
    throw new Error("request body must be an object");
  }

  const input = body as Record<string, unknown>;
  const reportType = asNonEmptyString(input.report_type, "report_type", 32);
  if (!["node", "exit_point", "risk_point"].includes(reportType)) {
    throw new Error("report_type is invalid");
  }

  const suggestionAction = asNonEmptyString(input.suggestion_action, "suggestion_action", 16);
  if (!["add", "modify", "delete"].includes(suggestionAction)) {
    throw new Error("suggestion_action is invalid");
  }

  return {
    report_type: reportType as CreatePublicUserReportDTO["report_type"],
    suggestion_action: suggestionAction as CreatePublicUserReportDTO["suggestion_action"],
    proposal_title: asNonEmptyString(input.proposal_title, "proposal_title", 128),
    proposal_text: asNonEmptyString(input.proposal_text, "proposal_text", 2000),
    proposal_point: parseOptionalPoint(input.proposal_point, "proposal_point"),
    reporter_name: asOptionalString(input.reporter_name, "reporter_name", 64),
  };
}
