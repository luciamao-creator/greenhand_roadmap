import type {
  AdminRouteListQueryDTO,
  CreateRouteDraftDTO,
  AgentPrefillTriggerDTO,
  MapSyncTriggerDTO,
  PublishPreviewDTO,
  PublishRouteDTO,
  PublishVersionActionDTO,
  ReviewActionDTO,
  RouteStatus,
  RouteType,
  UpdateRouteDraftDTO,
  UserReportListQueryDTO,
  UserReportReviewDTO,
  ReportStatus,
  ReportType,
  StructuredNodeGenerateDTO,
} from "./admin-routes";

const routeStatuses: RouteStatus[] = [
  "candidate",
  "draft",
  "pending_review",
  "approved",
  "published",
  "paused",
  "retired",
];

const routeTypes: RouteType[] = ["loop", "out_and_back", "one_way"];
const reportTypes: ReportType[] = ["node", "exit_point", "risk_point"];
const reportStatuses: ReportStatus[] = ["pending", "accepted", "rejected"];

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

function asBoolean(value: string | null) {
  if (value === null) {
    return undefined;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  throw new Error("boolean query param must be true or false");
}

function asPositiveInt(value: string | null, defaultValue: number) {
  if (value === null) {
    return defaultValue;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error("page and page_size must be positive integers");
  }

  return parsed;
}

export function parseAdminRouteListQuery(url: URL): AdminRouteListQueryDTO {
  const routeStatus = url.searchParams.get("route_status");
  if (routeStatus !== null && !routeStatuses.includes(routeStatus as RouteStatus)) {
    throw new Error("route_status is invalid");
  }

  const page = asPositiveInt(url.searchParams.get("page"), 1);
  const pageSize = asPositiveInt(url.searchParams.get("page_size"), 20);
  if (pageSize > 100) {
    throw new Error("page_size cannot exceed 100");
  }

  return {
    route_status: routeStatus === null ? undefined : (routeStatus as RouteStatus),
    province_name: asOptionalString(url.searchParams.get("province_name"), "province_name", 32),
    city_name: asOptionalString(url.searchParams.get("city_name"), "city_name", 64),
    evidence_gap_only: asBoolean(url.searchParams.get("evidence_gap_only")),
    risk_gap_only: asBoolean(url.searchParams.get("risk_gap_only")),
    faq_unreviewed_only: asBoolean(url.searchParams.get("faq_unreviewed_only")),
    page,
    page_size: pageSize,
  };
}

export function parseCreateRouteDraftBody(body: unknown): CreateRouteDraftDTO {
  if (!body || typeof body !== "object") {
    throw new Error("request body must be an object");
  }

  const input = body as Record<string, unknown>;
  const routeType = asNonEmptyString(input.route_type, "route_type", 32) as RouteType;
  if (!routeTypes.includes(routeType)) {
    throw new Error("route_type is invalid");
  }

  const provinceName = asNonEmptyString(input.province_name, "province_name", 32);
  if (!["四川", "浙江", "广东", "福建"].includes(provinceName)) {
    throw new Error("province_name is not supported in MVP");
  }

  return {
    route_name: asNonEmptyString(input.route_name, "route_name", 128),
    province_name: provinceName,
    city_name: asNonEmptyString(input.city_name, "city_name", 64),
    area_name: asOptionalString(input.area_name, "area_name", 64),
    start_point_name: asNonEmptyString(input.start_point_name, "start_point_name", 128),
    end_point_name: asNonEmptyString(input.end_point_name, "end_point_name", 128),
    route_type: routeType,
    map_search_keyword: asOptionalString(input.map_search_keyword, "map_search_keyword", 256),
    trigger_agent_prefill:
      typeof input.trigger_agent_prefill === "boolean" ? input.trigger_agent_prefill : true,
  };
}

export function parseUpdateRouteDraftBody(body: unknown): UpdateRouteDraftDTO {
  if (!body || typeof body !== "object") {
    throw new Error("request body must be an object");
  }

  const input = body as Record<string, unknown>;
  const allowedKeys = [
    "route",
    "route_geometry",
    "route_nodes",
    "route_exit_points",
    "route_risk_points",
    "route_tags",
    "route_weather_rules",
    "route_checklist_profile",
    "route_faqs",
    "route_sources",
  ];

  const hasKnownKey = allowedKeys.some((key) => key in input);
  if (!hasKnownKey) {
    throw new Error("update payload is empty");
  }

  return {
    route: typeof input.route === "object" && input.route !== null ? (input.route as Record<string, unknown>) : undefined,
    route_geometry:
      typeof input.route_geometry === "object" && input.route_geometry !== null
        ? (input.route_geometry as Record<string, unknown>)
        : undefined,
    route_nodes: Array.isArray(input.route_nodes) ? (input.route_nodes as Array<Record<string, unknown>>) : undefined,
    route_exit_points: Array.isArray(input.route_exit_points)
      ? (input.route_exit_points as Array<Record<string, unknown>>)
      : undefined,
    route_risk_points: Array.isArray(input.route_risk_points)
      ? (input.route_risk_points as Array<Record<string, unknown>>)
      : undefined,
    route_tags: Array.isArray(input.route_tags) ? (input.route_tags as Array<Record<string, unknown>>) : undefined,
    route_weather_rules: Array.isArray(input.route_weather_rules)
      ? (input.route_weather_rules as Array<Record<string, unknown>>)
      : undefined,
    route_checklist_profile:
      typeof input.route_checklist_profile === "object" && input.route_checklist_profile !== null
        ? (input.route_checklist_profile as Record<string, unknown>)
        : undefined,
    route_faqs: Array.isArray(input.route_faqs) ? (input.route_faqs as Array<Record<string, unknown>>) : undefined,
    route_sources: Array.isArray(input.route_sources)
      ? (input.route_sources as Array<Record<string, unknown>>)
      : undefined,
  };
}

export function parseAgentPrefillTriggerBody(body: unknown): AgentPrefillTriggerDTO {
  if (!body || typeof body !== "object") {
    throw new Error("request body must be an object");
  }

  const input = body as Record<string, unknown>;
  if (!Array.isArray(input.modules) || input.modules.length === 0) {
    throw new Error("modules is required");
  }

  const modules = input.modules.map((item) => {
    if (item !== "base_facts" && item !== "tags" && item !== "faq" && item !== "sources") {
      throw new Error("modules contains invalid value");
    }
    return item;
  });

  return {
    modules,
    force_refresh: typeof input.force_refresh === "boolean" ? input.force_refresh : false,
  };
}

export function parseMapSyncTriggerBody(body: unknown): MapSyncTriggerDTO {
  if (!body || typeof body !== "object") {
    throw new Error("request body must be an object");
  }

  const input = body as Record<string, unknown>;
  if (!Array.isArray(input.sync_scope) || input.sync_scope.length === 0) {
    throw new Error("sync_scope is required");
  }

  const syncScope = input.sync_scope.map((item) => {
    if (item !== "geometry" && item !== "elevation_profile") {
      throw new Error("sync_scope contains invalid value");
    }
    return item;
  });

  return {
    sync_scope: syncScope,
    provider_hint: asOptionalString(input.provider_hint, "provider_hint", 64),
    force_refresh: typeof input.force_refresh === "boolean" ? input.force_refresh : false,
  };
}

export function parseStructuredNodeGenerateBody(body: unknown): StructuredNodeGenerateDTO {
  if (body === null || body === undefined) {
    return { force_refresh: false };
  }
  if (typeof body !== "object") {
    throw new Error("request body must be an object");
  }
  const input = body as Record<string, unknown>;
  return {
    force_refresh: typeof input.force_refresh === "boolean" ? input.force_refresh : false,
  };
}

export function parseUserReportListQuery(url: URL): UserReportListQueryDTO {
  const reportType = url.searchParams.get("report_type");
  const reportStatus = url.searchParams.get("report_status");

  if (reportType !== null && !reportTypes.includes(reportType as ReportType)) {
    throw new Error("report_type is invalid");
  }

  if (reportStatus !== null && !reportStatuses.includes(reportStatus as ReportStatus)) {
    throw new Error("report_status is invalid");
  }

  return {
    report_type: reportType === null ? undefined : (reportType as ReportType),
    report_status: reportStatus === null ? "pending" : (reportStatus as ReportStatus),
  };
}

export function parseUserReportReviewBody(body: unknown): UserReportReviewDTO {
  if (!body || typeof body !== "object") {
    throw new Error("request body must be an object");
  }

  const input = body as Record<string, unknown>;
  if (input.action !== "accept" && input.action !== "reject") {
    throw new Error("action is invalid");
  }

  const mergeTargetType =
    input.merge_target_type === undefined
      ? undefined
      : asNonEmptyString(input.merge_target_type, "merge_target_type", 64);

  if (
    mergeTargetType &&
    mergeTargetType !== "route_nodes" &&
    mergeTargetType !== "route_exit_points" &&
    mergeTargetType !== "route_risk_points"
  ) {
    throw new Error("merge_target_type is invalid");
  }

  const reviewComment = asOptionalString(input.review_comment, "review_comment", 1000);

  if (input.action === "reject" && !reviewComment) {
    throw new Error("review_comment is required when rejecting a report");
  }

  return {
    action: input.action,
    merge_target_type: mergeTargetType as UserReportReviewDTO["merge_target_type"],
    review_comment: reviewComment,
  };
}

export function parseReviewActionBody(body: unknown): ReviewActionDTO {
  if (!body || typeof body !== "object") {
    throw new Error("request body must be an object");
  }

  const input = body as Record<string, unknown>;
  const action = asNonEmptyString(input.action, "action", 32);
  if (!["submit_review", "approve", "return", "reject", "pause", "retire"].includes(action)) {
    throw new Error("action is invalid");
  }

  const credibilityLevel = asOptionalString(input.credibility_level, "credibility_level", 4);
  if (credibilityLevel && !["A", "B", "C"].includes(credibilityLevel)) {
    throw new Error("credibility_level is invalid");
  }

  return {
    action: action as ReviewActionDTO["action"],
    credibility_level: credibilityLevel as ReviewActionDTO["credibility_level"],
    comment: asOptionalString(input.comment, "comment", 1000),
  };
}

export function parsePublishPreviewBody(body: unknown): PublishPreviewDTO {
  if (body === null || body === undefined) {
    return { force_refresh: false };
  }
  if (typeof body !== "object") {
    throw new Error("request body must be an object");
  }
  const input = body as Record<string, unknown>;
  return {
    force_refresh: typeof input.force_refresh === "boolean" ? input.force_refresh : false,
  };
}

export function parsePublishRouteBody(body: unknown): PublishRouteDTO {
  if (body === null || body === undefined) {
    return {};
  }
  if (typeof body !== "object") {
    throw new Error("request body must be an object");
  }
  const input = body as Record<string, unknown>;
  return {
    comment: asOptionalString(input.comment, "comment", 1000),
  };
}

export function parsePublishVersionActionBody(body: unknown): PublishVersionActionDTO {
  if (!body || typeof body !== "object") {
    throw new Error("request body must be an object");
  }
  const input = body as Record<string, unknown>;
  const action = asNonEmptyString(input.action, "action", 32);
  if (!["pause", "invalidate", "restore"].includes(action)) {
    throw new Error("action is invalid");
  }

  return {
    action: action as PublishVersionActionDTO["action"],
    comment: asOptionalString(input.comment, "comment", 1000),
  };
}
