import type {
  AdminRouteListQueryDTO,
  AgentPrefillTriggerDTO,
  CreateRouteDraftDTO,
  MapSyncTriggerDTO,
  PublishPreviewDTO,
  PublishRouteDTO,
  PublishVersionActionDTO,
  ReviewActionDTO,
  UpdateRouteDraftDTO,
  UserReportListQueryDTO,
  UserReportReviewDTO,
} from "../dto/admin-routes";
import type {
  CreatePublicUserReportDTO,
  CreateRouteCandidateDTO,
  NamedSubmissionPointDTO,
  SubmissionPointDTO,
} from "../dto/public-route-submissions";
import { runQuery } from "../db/connection";
import type { AgentPrefillArtifacts } from "../integrations/agent-prefill-client";
import { isAgentPrefillConfigured, requestAgentPrefill } from "../integrations/agent-prefill-client";
import {
  geocodeAddress,
  getWalkingRoute,
  isBaiduMapConfigured,
  searchPlaces,
} from "../integrations/baidu-map-client";
import { buildRouteRiskSummary, evaluateRouteRiskGate, shouldSkipAutoMapSync } from "../services/route-risk-gate-service";
import { buildRouteRetrievalContext } from "../services/route-rag-service";
import type { AdminRouteRepository } from "./admin-route-repository";

function notYet(method: string): never {
  throw new Error(`${method} is not implemented for PostgreSQL repository yet`);
}

const provinceCodeMap: Record<string, string> = {
  四川: "sc",
  浙江: "zj",
  广东: "gd",
  福建: "fj",
};

type RouteRow = {
  route_id: string;
  route_name: string;
  province_name: string;
  province_code: string;
  city_name: string;
  area_name: string | null;
  start_point_name: string;
  end_point_name: string;
  route_anchor_points: unknown;
  route_type: string;
  route_status: string;
  map_search_keyword: string | null;
  agent_prefill_status: string;
  map_sync_status: string;
  credibility_level: string | null;
  updated_at: string;
  duration_minutes: number | null;
  distance_km: number | null;
  elevation_gain_m: number | null;
  best_season_text: string | null;
  transport_summary: string | null;
  route_logic_summary: string | null;
  exit_logic_summary: string | null;
  easiest_panic_point_text: string | null;
  not_for_whom_text: string | null;
  summary_short: string | null;
  beginner_fit_reason: string | null;
  geometry_count?: number | string | null;
  map_provider_hint?: string | null;
  risk_count?: number | string | null;
  source_count?: number | string | null;
  faq_count?: number | string | null;
  pending_user_report_count?: number | string | null;
  last_prefill_at?: string | null;
  last_map_synced_at?: string | null;
};

type RouteStatusRow = {
  route_id: string;
  agent_prefill_status: string;
  map_sync_status: string;
  last_prefill_at: string | null;
  last_map_synced_at: string | null;
};

type AsyncJobRow = {
  job_id: string;
  payload_json: Record<string, unknown> | null;
  result_json: Record<string, unknown> | null;
  created_at: string;
  finished_at: string | null;
};

type UserReportRow = {
  report_id: string;
  report_type: string;
  proposal_action: string;
  proposal_title: string;
  proposal_text: string;
  proposal_point: Record<string, unknown> | null;
  screenshot_url: string | null;
  report_status: string;
  review_comment: string | null;
  merged_target_id: string | null;
  merge_target_type: string | null;
};

type OperationLogRow = {
  action_type: string;
  comment: string | null;
  created_at: string;
};

type PublishVersionRow = {
  publish_version_id: string;
  package_id: string | null;
  publish_status: string;
  schema_version: string;
  content_version: number | string;
  package_checksum: string;
  published_at: string;
  published_by: string | null;
};

type RouteGeometryRow = {
  geometry_version: number;
  route_polyline: Record<string, unknown> | null;
  start_point: Record<string, unknown> | null;
  end_point: Record<string, unknown> | null;
  overview_center: Record<string, unknown> | null;
  bounding_box: Record<string, unknown> | null;
  overview_zoom: number | string | null;
  elevation_profile_points: unknown;
  map_provider_hint: string | null;
  source_provider: string | null;
  synced_at: string | null;
};

type RouteNodeRow = {
  node_id: string;
  node_type: string;
  node_name: string;
  point: Record<string, unknown> | null;
  stage_order: number | null;
  distance_from_start_m: number | null;
  trigger_radius_m: number;
  navigation_hint: string;
  wrong_choice_hint: string | null;
  display_priority: number;
  generation_basis: unknown;
};

type RouteExitPointRow = {
  exit_point_id: string;
  exit_name: string;
  point: Record<string, unknown> | null;
  stage_order: number | null;
  exit_type: string;
  exit_condition_text: string;
  exit_action_text: string;
  exit_priority: string;
  generation_basis: unknown;
};

type RouteRiskPointRow = {
  risk_point_id: string;
  risk_type: string;
  risk_level: string;
  point: Record<string, unknown> | null;
  stage_order: number | null;
  risk_title: string;
  risk_text: string;
  safe_action_text: string;
  trigger_radius_m: number;
  generation_basis: unknown;
};

type RouteTagRow = {
  tag_group: string;
  tag_code: string;
  tag_name: string;
  is_core: boolean;
  sort_order: number;
};

type RouteWeatherRuleRow = {
  weather_rule_id: string;
  scenario_type: string;
  severity: string;
  rule_text: string;
  action_text: string;
  threshold_config: unknown;
};

type RouteChecklistProfileRow = {
  duration_bucket: string;
  intensity_bucket: string;
  terrain_tags: unknown;
  weather_sensitive_tags: unknown;
  mandatory_supply_codes: unknown;
  optional_supply_codes: unknown;
  emergency_supply_codes: unknown;
  checklist_note_text: string | null;
};

type RouteFaqRow = {
  faq_id: string;
  question: string;
  answer: string;
  source_basis: unknown;
  generated_by_ai: boolean;
  reviewed_by_human: boolean;
  display_order: number;
};

type RouteSourceRow = {
  source_id: string;
  source_type: string;
  source_title: string;
  source_url: string | null;
  source_summary: string;
  credibility_score: number;
  used_for_fields: unknown;
  raw_text_excerpt: string | null;
  checked_at: string;
};

function createSlugPart(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\u4e00-\u9fa5-]/g, "")
    .slice(0, 24);
}

function createUniqueSuffix() {
  const time = Date.now().toString(36).slice(-4);
  const random = Math.random().toString(36).slice(2, 6);
  return `${time}${random}`;
}

function buildRouteId(input: CreateRouteDraftDTO) {
  const code = provinceCodeMap[input.province_name] ?? "cn";
  const city = createSlugPart(input.city_name) || "city";
  const route = createSlugPart(input.route_name) || "route";
  return `${code}-${city}-${route}-${createUniqueSuffix()}`;
}

function buildRouteSlug(input: CreateRouteDraftDTO) {
  const province = createSlugPart(input.province_name) || "province";
  const city = createSlugPart(input.city_name) || "city";
  const route = createSlugPart(input.route_name) || "route";
  return `${province}-${city}-${route}-${createUniqueSuffix()}`;
}

function toNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined) {
    return 0;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toNullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error("numeric field must be a finite number");
  }
  return parsed;
}

function requireRecord(value: unknown, fieldName: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${fieldName} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireString(value: unknown, fieldName: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${fieldName} must be a non-empty string`);
  }
  return value.trim();
}

function optionalString(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "string") {
    throw new Error("string field must be a string");
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function stringifyGeoJson(value: unknown, fieldName: string) {
  return JSON.stringify(requireRecord(value, fieldName));
}

function toPointGeoJson(point?: SubmissionPointDTO | null) {
  if (!point) {
    return null;
  }
  return JSON.stringify({
    type: "Point",
    coordinates: [point.lng, point.lat],
  });
}

function computeCompletionRatio(row: RouteRow) {
  const completedSections = [
    row.agent_prefill_status === "completed",
    row.map_sync_status === "completed" || row.map_sync_status === "missing",
    toNumber(row.risk_count) > 0,
    toNumber(row.source_count) > 0,
    toNumber(row.faq_count) > 0,
  ].filter(Boolean).length;

  return Number((completedSections / 5).toFixed(2));
}

function computeEvidenceCoverageLevel(sourceCount: number) {
  if (sourceCount >= 3) {
    return "high";
  }
  if (sourceCount >= 1) {
    return "medium";
  }
  return "low";
}

function mapRouteRowToListItem(row: RouteRow) {
  const sourceCount = toNumber(row.source_count);
  const hasGeometry = toNumber(row.geometry_count) > 0;
  const listRiskGate = evaluateRouteRiskGate(
    {
      route_id: row.route_id,
      route_type: row.route_type,
      route_anchor_points: row.route_anchor_points,
      map_sync_status: row.map_sync_status,
      agent_prefill_status: row.agent_prefill_status,
      pending_user_report_count: row.pending_user_report_count,
      source_count: sourceCount,
      risk_count: row.risk_count,
      route_geometry: {
        route_polyline: hasGeometry ? { type: "LineString", coordinates: [[0, 0], [0, 1]] } : undefined,
        map_provider_hint: row.map_provider_hint ?? undefined,
      },
    },
    "submit_review",
  );
  return {
    route_id: row.route_id,
    route_name: row.route_name,
    province_name: row.province_name,
    city_name: row.city_name,
    route_status: row.route_status,
    agent_prefill_status: row.agent_prefill_status,
    map_sync_status: row.map_sync_status,
    completion_ratio: computeCompletionRatio(row),
    evidence_coverage_level: computeEvidenceCoverageLevel(sourceCount),
    pending_user_report_count: toNumber(row.pending_user_report_count),
    risk_summary: buildRouteRiskSummary(listRiskGate),
    last_updated_at: row.updated_at,
  };
}

function mapRouteRowToWorkspace(row: RouteRow) {
  const sourceCount = toNumber(row.source_count);
  const hasGeometry = toNumber(row.geometry_count) > 0;
  const workspaceRiskGate = evaluateRouteRiskGate(
    {
      route_id: row.route_id,
      route_type: row.route_type,
      route_anchor_points: row.route_anchor_points,
      map_sync_status: row.map_sync_status,
      agent_prefill_status: row.agent_prefill_status,
      pending_user_report_count: row.pending_user_report_count,
      source_count: sourceCount,
      risk_count: row.risk_count,
      route_geometry: {
        route_polyline: hasGeometry ? { type: "LineString", coordinates: [[0, 0], [0, 1]] } : undefined,
        map_provider_hint: row.map_provider_hint ?? undefined,
      },
    },
    "submit_review",
  );
  return {
    route_id: row.route_id,
    route_name: row.route_name,
    province_name: row.province_name,
    city_name: row.city_name,
    area_name: row.area_name ?? undefined,
    start_point_name: row.start_point_name,
    end_point_name: row.end_point_name,
    route_type: row.route_type,
    route_status: row.route_status,
    map_search_keyword: row.map_search_keyword ?? undefined,
    agent_prefill_status: row.agent_prefill_status,
    map_sync_status: row.map_sync_status,
    completion_ratio: computeCompletionRatio(row),
    evidence_coverage_level: computeEvidenceCoverageLevel(sourceCount),
    pending_user_report_count: toNumber(row.pending_user_report_count),
    risk_summary: buildRouteRiskSummary(workspaceRiskGate),
    updated_at: row.updated_at,
    route: {
      start_point_name: row.start_point_name,
      end_point_name: row.end_point_name,
      route_type: row.route_type,
      route_anchor_points: Array.isArray(row.route_anchor_points) ? row.route_anchor_points : [],
      duration_minutes: row.duration_minutes,
      distance_km: row.distance_km,
      elevation_gain_m: row.elevation_gain_m,
      best_season_text: row.best_season_text,
      transport_summary: row.transport_summary,
      route_logic_summary: row.route_logic_summary,
      exit_logic_summary: row.exit_logic_summary,
      easiest_panic_point_text: row.easiest_panic_point_text,
      not_for_whom_text: row.not_for_whom_text,
      summary_short: row.summary_short,
      beginner_fit_reason: row.beginner_fit_reason,
    },
    route_geometry: {},
    route_nodes: [],
    route_exit_points: [],
    route_risk_points: [],
    route_tags: [],
    route_weather_rules: [],
    route_checklist_profile: {},
    route_faqs: [],
    route_sources: [],
  };
}

type RouteWorkspaceDetails = {
  route_geometry: Record<string, unknown>;
  route_nodes: Array<Record<string, unknown>>;
  route_exit_points: Array<Record<string, unknown>>;
  route_risk_points: Array<Record<string, unknown>>;
  route_tags: Array<Record<string, unknown>>;
  route_weather_rules: Array<Record<string, unknown>>;
  route_checklist_profile: Record<string, unknown>;
  route_faqs: Array<Record<string, unknown>>;
  route_sources: Array<Record<string, unknown>>;
};

function buildRouteSelectSql(whereClause: string) {
  return `
    select
      r.route_id,
      r.route_name,
      r.province_name,
      r.province_code,
      r.city_name,
      r.area_name,
      r.start_point_name,
      r.end_point_name,
      r.route_anchor_points,
      r.route_type,
      r.route_status,
      r.map_search_keyword,
      r.agent_prefill_status,
      r.map_sync_status,
      r.credibility_level,
      r.updated_at,
      r.duration_minutes,
      r.distance_km,
      r.elevation_gain_m,
      r.best_season_text,
      r.transport_summary,
      r.route_logic_summary,
      r.exit_logic_summary,
      r.easiest_panic_point_text,
      r.not_for_whom_text,
      r.summary_short,
      r.beginner_fit_reason,
      geometa.map_provider_hint,
      coalesce(src.source_count, 0) as source_count,
      coalesce(faq.faq_count, 0) as faq_count,
      coalesce(risk.risk_count, 0) as risk_count,
      coalesce(geo.geometry_count, 0) as geometry_count,
      coalesce(rep.pending_user_report_count, 0) as pending_user_report_count
    from routes r
    left join (
      select route_id, count(*) as source_count
      from route_sources
      group by route_id
    ) src on src.route_id = r.route_id
    left join (
      select route_id, count(*) as faq_count
      from route_faqs
      group by route_id
    ) faq on faq.route_id = r.route_id
    left join (
      select route_id, count(*) as risk_count
      from route_risk_points
      group by route_id
    ) risk on risk.route_id = r.route_id
    left join (
      select route_id, count(*) as geometry_count
      from route_geometries
      group by route_id
    ) geo on geo.route_id = r.route_id
    left join route_geometries geometa on geometa.route_id = r.route_id
    left join (
      select route_id, count(*) as pending_user_report_count
      from route_user_reports
      where report_status = 'pending'
      group by route_id
    ) rep on rep.route_id = r.route_id
    ${whereClause}
  `;
}

function createRecordId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function buildModuleSuggestions(module: string) {
  if (module === "base_facts") {
    return {
      module,
      status: "completed",
      suggestions_count: 5,
      source_basis: ["地图 API", "公开资料摘要"],
    };
  }
  if (module === "tags") {
    return {
      module,
      status: "completed",
      suggestions_count: 3,
      source_basis: ["标签规则模板"],
    };
  }
  return {
    module,
    status: "completed",
    suggestions_count: 2,
    source_basis: ["来源聚合结果"],
  };
}

function normalizeModules(status: string, job?: AsyncJobRow) {
  const resultModules = Array.isArray(job?.result_json?.modules)
    ? (job?.result_json?.modules as Array<Record<string, unknown>>)
    : undefined;
  if (resultModules) {
    return resultModules;
  }

  const fallbackStatus =
    status === "completed" || status === "failed" || status === "running" ? status : "pending";

  return ["base_facts", "tags", "faq", "sources"].map((module) => ({
    module,
    status: fallbackStatus,
  }));
}

async function getRouteStatus(routeId: string) {
  const result = await runQuery<RouteStatusRow>(
    `
      select
        route_id,
        agent_prefill_status,
        map_sync_status,
        last_prefill_at,
        last_map_synced_at
      from routes
      where route_id = $1
      limit 1
    `,
    [routeId],
  );

  return result.rows[0];
}

async function getLatestAsyncJob(routeId: string, jobType: "agent_prefill" | "map_sync") {
  const result = await runQuery<AsyncJobRow>(
    `
      select
        job_id,
        payload_json,
        result_json,
        created_at,
        finished_at
      from admin_async_jobs
      where route_id = $1
        and job_type = $2
      order by created_at desc
      limit 1
    `,
    [routeId, jobType],
  );

  return result.rows[0];
}

async function touchRouteUpdatedAt(routeId: string) {
  await runQuery(
    `
      update routes
      set updated_at = now()
      where route_id = $1
    `,
    [routeId],
  );
}

async function insertRouteUserReport(input: {
  routeId: string;
  reportId: string;
  reportType: "node" | "exit_point" | "risk_point";
  suggestionAction: "add" | "modify" | "delete";
  proposalTitle: string;
  proposalText: string;
  proposalPoint?: SubmissionPointDTO;
  createdBy?: string;
}) {
  const proposalPointJson = toPointGeoJson(input.proposalPoint);

  if (proposalPointJson) {
    await runQuery(
      `
        insert into route_user_reports (
          report_id,
          route_id,
          report_type,
          proposal_action,
          proposal_title,
          proposal_point,
          proposal_text,
          report_status,
          created_by,
          updated_by
        ) values (
          $1,
          $2,
          $3,
          $4,
          $5,
          ST_SetSRID(ST_GeomFromGeoJSON($6), 4326),
          $7,
          'pending',
          $8,
          $8
        )
      `,
      [
        input.reportId,
        input.routeId,
        input.reportType,
        input.suggestionAction,
        input.proposalTitle,
        proposalPointJson,
        input.proposalText,
        input.createdBy ?? "public_submission",
      ],
    );
    return;
  }

  await runQuery(
    `
      insert into route_user_reports (
        report_id,
        route_id,
        report_type,
        proposal_action,
        proposal_title,
        proposal_point,
        proposal_text,
        report_status,
        created_by,
        updated_by
      ) values (
        $1,
        $2,
        $3,
        $4,
        $5,
        null,
        $6,
        'pending',
        $7,
        $7
      )
    `,
    [
      input.reportId,
      input.routeId,
      input.reportType,
      input.suggestionAction,
      input.proposalTitle,
      input.proposalText,
      input.createdBy ?? "public_submission",
    ],
  );
}

async function getDetailedRouteRow(routeId: string) {
  const result = await runQuery<RouteRow>(
    `
      ${buildRouteSelectSql("where r.route_id = $1")}
      limit 1
    `,
    [routeId],
  );

  return result.rows[0];
}

async function insertAdminOperationLog(
  actionType: string,
  targetType: string,
  targetId: string,
  afterSnapshot: Record<string, unknown>,
  comment?: string,
) {
  await runQuery(
    `
      insert into admin_operation_logs (
        operator_id,
        operator_name,
        action_type,
        target_type,
        target_id,
        after_snapshot,
        comment
      ) values (
        'pg_repo',
        'pg_repo',
        $1,
        $2,
        $3,
        $4,
        $5
      )
    `,
    [actionType, targetType, targetId, JSON.stringify(afterSnapshot), comment ?? null],
  );
}

async function getRecentOperationLogs(routeId: string) {
  const result = await runQuery<OperationLogRow>(
    `
      select action_type, comment, created_at
      from admin_operation_logs
      where target_id = $1
      order by created_at desc
      limit 3
    `,
    [routeId],
  );

  return result.rows;
}

async function getCurrentLivePublishVersionId(routeId: string) {
  const result = await runQuery<{ publish_version_id: string }>(
    `
      select publish_version_id
      from route_publish_versions
      where route_id = $1
        and publish_status = 'published'
      order by published_at desc
      limit 1
    `,
    [routeId],
  );

  return result.rows[0]?.publish_version_id;
}

function buildReviewDetail(row: RouteRow, details: RouteWorkspaceDetails, logs: OperationLogRow[]) {
  const sourceCount = toNumber(row.source_count);
  const riskCount = toNumber(row.risk_count);
  const riskGate = evaluateRouteRiskGate(
    {
      route_id: row.route_id,
      route_type: row.route_type,
      route_anchor_points: row.route_anchor_points,
      map_sync_status: row.map_sync_status,
      agent_prefill_status: row.agent_prefill_status,
      pending_user_report_count: row.pending_user_report_count,
      source_count: sourceCount,
      risk_count: riskCount,
      route_geometry: details.route_geometry,
      route_nodes: details.route_nodes,
      route_exit_points: details.route_exit_points,
      route_risk_points: details.route_risk_points,
    },
    "submit_review",
  );
  const checks = [
    {
      check_code: "base_facts_ready",
      check_name: "基础参数是否补齐",
      status: row.agent_prefill_status === "completed" ? "passed" : "failed",
    },
    ...riskGate.review_checklist.map((item) => ({
      check_code: item.code,
      check_name: item.title,
      status: item.status,
      message: item.message,
    })),
    {
      check_code: "user_reports_resolved",
      check_name: "高优先级用户上报是否处理",
      status: toNumber(row.pending_user_report_count) === 0 ? "passed" : "warning",
    },
  ];

  return {
    route_id: row.route_id,
    route_summary: {
      route_name: row.route_name,
      route_status: row.route_status,
      credibility_level_suggestion: row.credibility_level ?? "A",
    },
    completion_summary: {
      base_facts_ready: row.agent_prefill_status === "completed",
      geometry_ready: row.map_sync_status === "completed" || row.map_sync_status === "missing",
      risk_ready: riskCount > 0,
      evidence_ready: sourceCount > 0,
    },
    evidence_summary: {
      reviewed_source_count: sourceCount,
      coverage_level: computeEvidenceCoverageLevel(sourceCount),
    },
    pending_user_report_count: toNumber(row.pending_user_report_count),
    risk_summary: buildRouteRiskSummary(riskGate),
    review_checklist: checks,
    blockers: riskGate.blockers,
    warnings: riskGate.warnings,
    risk_flags: riskGate.risk_flags,
    score_summary: riskGate.score_summary,
    latest_operation_logs: logs.map((item) => ({
      operation_type: item.action_type,
      operator_name: "pg_repo",
      created_at: item.created_at,
    })),
  };
}

async function loadRouteWorkspaceDetails(routeId: string): Promise<RouteWorkspaceDetails> {
  const [
    geometryResult,
    nodesResult,
    exitPointsResult,
    riskPointsResult,
    tagsResult,
    weatherRulesResult,
    checklistProfileResult,
    faqsResult,
    sourcesResult,
  ] = await Promise.all([
    runQuery<RouteGeometryRow>(
      `
        select
          geometry_version,
          ST_AsGeoJSON(route_polyline)::json as route_polyline,
          ST_AsGeoJSON(start_point)::json as start_point,
          ST_AsGeoJSON(end_point)::json as end_point,
          ST_AsGeoJSON(overview_center)::json as overview_center,
          ST_AsGeoJSON(bounding_box)::json as bounding_box,
          overview_zoom,
          elevation_profile_points,
          map_provider_hint,
          source_provider,
          synced_at
        from route_geometries
        where route_id = $1
        limit 1
      `,
      [routeId],
    ),
    runQuery<RouteNodeRow>(
      `
        select
          node_id,
          node_type,
          node_name,
          ST_AsGeoJSON(point)::json as point,
          stage_order,
          distance_from_start_m,
          trigger_radius_m,
          navigation_hint,
          wrong_choice_hint,
          display_priority,
          generation_basis
        from route_nodes
        where route_id = $1
        order by display_priority asc, created_at asc
      `,
      [routeId],
    ),
    runQuery<RouteExitPointRow>(
      `
        select
          exit_point_id,
          exit_name,
          ST_AsGeoJSON(point)::json as point,
          stage_order,
          exit_type,
          exit_condition_text,
          exit_action_text,
          exit_priority,
          generation_basis
        from route_exit_points
        where route_id = $1
        order by created_at asc
      `,
      [routeId],
    ),
    runQuery<RouteRiskPointRow>(
      `
        select
          risk_point_id,
          risk_type,
          risk_level,
          ST_AsGeoJSON(point)::json as point,
          stage_order,
          risk_title,
          risk_text,
          safe_action_text,
          trigger_radius_m,
          generation_basis
        from route_risk_points
        where route_id = $1
        order by created_at asc
      `,
      [routeId],
    ),
    runQuery<RouteTagRow>(
      `
        select tag_group, tag_code, tag_name, is_core, sort_order
        from route_tags
        where route_id = $1
        order by sort_order asc, created_at asc
      `,
      [routeId],
    ),
    runQuery<RouteWeatherRuleRow>(
      `
        select
          weather_rule_id,
          scenario_type,
          severity,
          rule_text,
          action_text,
          threshold_config
        from route_weather_rules
        where route_id = $1
        order by created_at asc
      `,
      [routeId],
    ),
    runQuery<RouteChecklistProfileRow>(
      `
        select
          duration_bucket,
          intensity_bucket,
          terrain_tags,
          weather_sensitive_tags,
          mandatory_supply_codes,
          optional_supply_codes,
          emergency_supply_codes,
          checklist_note_text
        from route_checklist_profiles
        where route_id = $1
        limit 1
      `,
      [routeId],
    ),
    runQuery<RouteFaqRow>(
      `
        select
          faq_id,
          question,
          answer,
          source_basis,
          generated_by_ai,
          reviewed_by_human,
          display_order
        from route_faqs
        where route_id = $1
        order by display_order asc, created_at asc
      `,
      [routeId],
    ),
    runQuery<RouteSourceRow>(
      `
        select
          source_id,
          source_type,
          source_title,
          source_url,
          source_summary,
          credibility_score,
          used_for_fields,
          raw_text_excerpt,
          checked_at
        from route_sources
        where route_id = $1
        order by credibility_score desc, checked_at desc
      `,
      [routeId],
    ),
  ]);

  const geometry = geometryResult.rows[0];

  return {
    route_geometry: geometry
      ? {
          geometry_version: geometry.geometry_version,
          route_polyline: geometry.route_polyline ?? undefined,
          start_point: geometry.start_point ?? undefined,
          end_point: geometry.end_point ?? undefined,
          overview_center: geometry.overview_center ?? undefined,
          bounding_box: geometry.bounding_box ?? undefined,
          overview_zoom:
            geometry.overview_zoom === null || geometry.overview_zoom === undefined
              ? undefined
              : Number(geometry.overview_zoom),
          elevation_profile_points: geometry.elevation_profile_points ?? undefined,
          map_provider_hint: geometry.map_provider_hint ?? undefined,
          source_provider: geometry.source_provider ?? undefined,
          synced_at: geometry.synced_at ?? undefined,
        }
      : {},
    route_nodes: nodesResult.rows.map((item) => ({
      node_id: item.node_id,
      node_type: item.node_type,
      node_name: item.node_name,
      point: item.point ?? undefined,
      stage_order: item.stage_order ?? undefined,
      distance_from_start_m: item.distance_from_start_m ?? undefined,
      trigger_radius_m: item.trigger_radius_m,
      navigation_hint: item.navigation_hint,
      wrong_choice_hint: item.wrong_choice_hint ?? undefined,
      display_priority: item.display_priority,
      generation_basis: item.generation_basis ?? [],
    })),
    route_exit_points: exitPointsResult.rows.map((item) => ({
      exit_point_id: item.exit_point_id,
      exit_name: item.exit_name,
      point: item.point ?? undefined,
      stage_order: item.stage_order ?? undefined,
      exit_type: item.exit_type,
      exit_condition_text: item.exit_condition_text,
      exit_action_text: item.exit_action_text,
      exit_priority: item.exit_priority,
      generation_basis: item.generation_basis ?? [],
    })),
    route_risk_points: riskPointsResult.rows.map((item) => ({
      risk_point_id: item.risk_point_id,
      risk_type: item.risk_type,
      risk_level: item.risk_level,
      point: item.point ?? undefined,
      stage_order: item.stage_order ?? undefined,
      risk_title: item.risk_title,
      risk_text: item.risk_text,
      safe_action_text: item.safe_action_text,
      trigger_radius_m: item.trigger_radius_m,
      generation_basis: item.generation_basis ?? [],
    })),
    route_tags: tagsResult.rows.map((item) => ({
      tag_group: item.tag_group,
      tag_code: item.tag_code,
      tag_name: item.tag_name,
      is_core: item.is_core,
      sort_order: item.sort_order,
    })),
    route_weather_rules: weatherRulesResult.rows.map((item) => ({
      weather_rule_id: item.weather_rule_id,
      scenario_type: item.scenario_type,
      severity: item.severity,
      rule_text: item.rule_text,
      action_text: item.action_text,
      threshold_config: item.threshold_config ?? undefined,
    })),
    route_checklist_profile: checklistProfileResult.rows[0]
      ? {
          duration_bucket: checklistProfileResult.rows[0].duration_bucket,
          intensity_bucket: checklistProfileResult.rows[0].intensity_bucket,
          terrain_tags: checklistProfileResult.rows[0].terrain_tags,
          weather_sensitive_tags: checklistProfileResult.rows[0].weather_sensitive_tags ?? undefined,
          mandatory_supply_codes: checklistProfileResult.rows[0].mandatory_supply_codes,
          optional_supply_codes: checklistProfileResult.rows[0].optional_supply_codes ?? undefined,
          emergency_supply_codes: checklistProfileResult.rows[0].emergency_supply_codes ?? undefined,
          checklist_note_text: checklistProfileResult.rows[0].checklist_note_text ?? undefined,
        }
      : {},
    route_faqs: faqsResult.rows.map((item) => ({
      faq_id: item.faq_id,
      question: item.question,
      answer: item.answer,
      source_basis: item.source_basis,
      generated_by_ai: item.generated_by_ai,
      reviewed_by_human: item.reviewed_by_human,
      display_order: item.display_order,
    })),
    route_sources: sourcesResult.rows.map((item) => ({
      source_id: item.source_id,
      source_type: item.source_type,
      source_title: item.source_title,
      source_url: item.source_url ?? undefined,
      source_summary: item.source_summary,
      credibility_score: item.credibility_score,
      used_for_fields: item.used_for_fields,
      raw_text_excerpt: item.raw_text_excerpt ?? undefined,
      checked_at: item.checked_at,
    })),
  };
}

function mergeWorkspace(row: RouteRow, details: RouteWorkspaceDetails) {
  return {
    ...mapRouteRowToWorkspace(row),
    ...details,
  };
}

function buildPublishedPackage(
  row: RouteRow,
  details: RouteWorkspaceDetails,
  publishVersionId: string,
  packageId: string,
  publishedAt: string,
) {
  return {
    package_type: "route_package",
    schema_version: "1.0.0",
    publish_version_id: publishVersionId,
    package_id: packageId,
    published_at: publishedAt,
    route: {
      route_id: row.route_id,
      route_name: row.route_name,
      province_name: row.province_name,
      city_name: row.city_name,
      area_name: row.area_name ?? undefined,
      start_point_name: row.start_point_name,
      end_point_name: row.end_point_name,
      route_type: row.route_type,
      route_status: "published",
      credibility_level: row.credibility_level ?? undefined,
      duration_minutes: row.duration_minutes ?? undefined,
      distance_km: row.distance_km ?? undefined,
      elevation_gain_m: row.elevation_gain_m ?? undefined,
      best_season_text: row.best_season_text ?? undefined,
      transport_summary: row.transport_summary ?? undefined,
      route_logic_summary: row.route_logic_summary ?? undefined,
      exit_logic_summary: row.exit_logic_summary ?? undefined,
      easiest_panic_point_text: row.easiest_panic_point_text ?? undefined,
      not_for_whom_text: row.not_for_whom_text ?? undefined,
      summary_short: row.summary_short ?? undefined,
      beginner_fit_reason: row.beginner_fit_reason ?? undefined,
    },
    route_geometry: details.route_geometry,
    route_nodes: details.route_nodes,
    route_exit_points: details.route_exit_points,
    route_risk_points: details.route_risk_points,
    route_tags: details.route_tags,
    route_weather_rules: details.route_weather_rules,
    route_checklist_profile: details.route_checklist_profile,
    route_faqs: details.route_faqs,
    route_sources: details.route_sources,
    stats: {
      node_count: details.route_nodes.length,
      exit_point_count: details.route_exit_points.length,
      risk_point_count: details.route_risk_points.length,
      faq_count: details.route_faqs.length,
      source_count: details.route_sources.length,
    },
  };
}

function buildRouteAddress(row: RouteRow, pointName: string) {
  // 不使用 area_name，因为百度地理编码遇到 "西湖风景区断桥残雪" 时，可能会直接降级到西湖风景区的中心点，导致起终点同点
  return [row.province_name, row.city_name, pointName].filter(Boolean).join("");
}

function calculatePointDistanceMeters(
  left: { lng: number; lat: number },
  right: { lng: number; lat: number },
) {
  const earthRadiusM = 6371000;
  const dLat = ((right.lat - left.lat) * Math.PI) / 180;
  const dLng = ((right.lng - left.lng) * Math.PI) / 180;
  const lat1 = (left.lat * Math.PI) / 180;
  const lat2 = (right.lat * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusM * c;
}

function pointsAreNearlySame(left: { lng: number; lat: number }, right: { lng: number; lat: number }) {
  return calculatePointDistanceMeters(left, right) < 80;
}

function buildPointSearchQueries(row: RouteRow, pointName: string) {
  const queryCandidates = [
    buildRouteAddress(row, pointName),
    row.map_search_keyword ? `${row.map_search_keyword} ${pointName}` : undefined,
    [row.area_name, pointName].filter(Boolean).join(""),
    [row.route_name, pointName].filter(Boolean).join(" "),
    pointName,
  ];

  return Array.from(
    new Set(
      queryCandidates
        .map((item) => item?.trim())
        .filter((item): item is string => Boolean(item)),
    ),
  );
}

type RouteAnchorPointInput = {
  anchor_name?: string;
  point?: {
    type?: string;
    coordinates?: [number, number];
  };
};

function parseRouteAnchorPoints(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is RouteAnchorPointInput => typeof item === "object" && item !== null)
    .map((item) => ({
      anchor_name: typeof item.anchor_name === "string" ? item.anchor_name.trim() : "",
      point:
        item.point &&
        typeof item.point === "object" &&
        item.point.type === "Point" &&
        Array.isArray(item.point.coordinates) &&
        item.point.coordinates.length >= 2 &&
        Number.isFinite(item.point.coordinates[0]) &&
        Number.isFinite(item.point.coordinates[1])
          ? {
              lng: Number(item.point.coordinates[0]),
              lat: Number(item.point.coordinates[1]),
            }
          : undefined,
    }))
    .filter((item) => item.anchor_name || item.point);
}

async function resolveDistinctPointByPlaceSearch(
  row: RouteRow,
  pointName: string,
  baselinePoint: { lng: number; lat: number },
  options?: {
    minDistanceM?: number;
    maxDistanceM?: number;
  },
) {
  const minDistanceM = options?.minDistanceM ?? 80;
  const maxDistanceM = options?.maxDistanceM ?? 10000;
  const queries = buildPointSearchQueries(row, pointName);

  for (const query of queries) {
    const candidates = await searchPlaces(query, row.city_name);
    const matched = candidates.find((candidate) => {
      const distance = calculatePointDistanceMeters(baselinePoint, candidate);
      return distance >= minDistanceM && distance <= maxDistanceM;
    });

    if (matched) {
      return {
        lng: matched.lng,
        lat: matched.lat,
        query,
        name: matched.name,
        address: matched.address,
      };
    }
  }

  return undefined;
}

async function resolveRouteAnchorPoint(
  row: RouteRow,
  anchor: { anchor_name?: string; point?: { lng: number; lat: number } },
  fallbackName?: string,
) {
  if (anchor.point) {
    return anchor.point;
  }
  const anchorName = anchor.anchor_name || fallbackName;
  if (!anchorName) {
    throw new Error("route anchor point is missing anchor_name");
  }
  return geocodeAddress(buildRouteAddress(row, anchorName), row.city_name);
}

function buildRoundTripRoute(route: Awaited<ReturnType<typeof getWalkingRoute>>) {
  const returnPoints = route.polyline_points.slice(0, -1).reverse();
  return {
    ...route,
    polyline_points: [...route.polyline_points, ...returnPoints],
    end_point: route.start_point,
    distance_m: route.distance_m * 2,
    duration_s: route.duration_s * 2,
  };
}

function stitchWalkingRoutes(segments: Array<Awaited<ReturnType<typeof getWalkingRoute>>>) {
  if (segments.length === 0) {
    throw new Error("walking route segments cannot be empty");
  }
  const polylinePoints = segments.flatMap((segment, index) =>
    index === 0 ? segment.polyline_points : segment.polyline_points.slice(1),
  );
  const distanceM = segments.reduce((total, segment) => total + segment.distance_m, 0);
  const durationS = segments.reduce((total, segment) => total + segment.duration_s, 0);
  const boundingBox = polylinePoints.reduce<[number, number, number, number]>(
    (box, point) => [
      Math.min(box[0], point.lng),
      Math.min(box[1], point.lat),
      Math.max(box[2], point.lng),
      Math.max(box[3], point.lat),
    ],
    [polylinePoints[0].lng, polylinePoints[0].lat, polylinePoints[0].lng, polylinePoints[0].lat],
  );
  const overviewCenter = {
    lng: (boundingBox[0] + boundingBox[2]) / 2,
    lat: (boundingBox[1] + boundingBox[3]) / 2,
  };
  const span = Math.max(boundingBox[2] - boundingBox[0], boundingBox[3] - boundingBox[1], 0.0001);
  const overviewZoom = span < 0.005 ? 16 : span < 0.02 ? 14 : span < 0.05 ? 12 : 10;

  return {
    distance_m: distanceM,
    duration_s: durationS,
    polyline_points: polylinePoints,
    start_point: polylinePoints[0],
    end_point: polylinePoints[polylinePoints.length - 1],
    overview_center: overviewCenter,
    bounding_box: boundingBox,
    overview_zoom: overviewZoom,
  };
}

function getRouteAnchorMaxDistanceM(routeType: string) {
  if (routeType === "out_and_back") {
    return 12000;
  }
  if (routeType === "loop") {
    return 18000;
  }
  return 25000;
}

function isSuspiciousAnchorDistance(routeType: string, linearDistanceM: number, walkingDistanceM?: number) {
  const maxDistanceM = getRouteAnchorMaxDistanceM(routeType);
  if (linearDistanceM > maxDistanceM) {
    return true;
  }
  if (typeof walkingDistanceM === "number" && Number.isFinite(walkingDistanceM)) {
    return walkingDistanceM > maxDistanceM * 2;
  }
  return false;
}

async function syncRouteMetricsFromMap(routeId: string, metrics: { distance_m: number; duration_s: number }) {
  const distanceKm = Number((metrics.distance_m / 1000).toFixed(1));
  const durationMinutes = Math.max(1, Math.round(metrics.duration_s / 60));
  await runQuery(
    `
      update routes
      set
        distance_km = $2,
        duration_minutes = $3,
        updated_at = now()
      where route_id = $1
    `,
    [routeId, distanceKm, durationMinutes],
  );
}

async function upsertRouteGeometryFromMapSync(
  routeId: string,
  route: Awaited<ReturnType<typeof getWalkingRoute>>,
  providerHint: string,
  includeElevationProfile: boolean,
) {
  const currentVersionResult = await runQuery<{ geometry_version: number | string }>(
    `
      select geometry_version
      from route_geometries
      where route_id = $1
      limit 1
    `,
    [routeId],
  );
  const nextVersion = Number(currentVersionResult.rows[0]?.geometry_version ?? 0) + 1;

  const routePolylineGeoJson = JSON.stringify({
    type: "LineString",
    coordinates: route.polyline_points.map((item) => [item.lng, item.lat]),
  });
  const pointGeoJson = (point: { lng: number; lat: number }) =>
    JSON.stringify({
      type: "Point",
      coordinates: [point.lng, point.lat],
    });
  const boundingBoxGeoJson = JSON.stringify({
    type: "Polygon",
    coordinates: [[
      [route.bounding_box[0], route.bounding_box[1]],
      [route.bounding_box[0], route.bounding_box[3]],
      [route.bounding_box[2], route.bounding_box[3]],
      [route.bounding_box[2], route.bounding_box[1]],
      [route.bounding_box[0], route.bounding_box[1]],
    ]],
  });

  await runQuery(
    `
      insert into route_geometries (
        route_id,
        geometry_version,
        route_polyline,
        start_point,
        end_point,
        overview_center,
        bounding_box,
        overview_zoom,
        elevation_profile_points,
        map_provider_hint,
        source_provider,
        synced_at
      ) values (
        $1,
        $2,
        ST_SetSRID(ST_GeomFromGeoJSON($3), 4326),
        ST_SetSRID(ST_GeomFromGeoJSON($4), 4326),
        ST_SetSRID(ST_GeomFromGeoJSON($5), 4326),
        ST_SetSRID(ST_GeomFromGeoJSON($6), 4326),
        ST_SetSRID(ST_GeomFromGeoJSON($7), 4326),
        $8,
        $9,
        $10,
        $11,
        now()
      )
      on conflict (route_id)
      do update set
        geometry_version = excluded.geometry_version,
        route_polyline = excluded.route_polyline,
        start_point = excluded.start_point,
        end_point = excluded.end_point,
        overview_center = excluded.overview_center,
        bounding_box = excluded.bounding_box,
        overview_zoom = excluded.overview_zoom,
        elevation_profile_points = excluded.elevation_profile_points,
        map_provider_hint = excluded.map_provider_hint,
        source_provider = excluded.source_provider,
        synced_at = excluded.synced_at
    `,
    [
      routeId,
      nextVersion,
      routePolylineGeoJson,
      pointGeoJson(route.start_point),
      pointGeoJson(route.end_point),
      pointGeoJson(route.overview_center),
      boundingBoxGeoJson,
      route.overview_zoom,
      includeElevationProfile ? JSON.stringify([]) : null,
      providerHint,
      "baidu",
    ],
  );
}

async function deleteGeneratedNavigationArtifacts(routeId: string) {
  await Promise.all([
    runQuery(
      `
        delete from route_nodes
        where route_id = $1
          and generation_basis @> '[{"basis_type":"geometry_rule"}]'::jsonb
      `,
      [routeId],
    ),
    runQuery(
      `
        delete from route_exit_points
        where route_id = $1
          and generation_basis @> '[{"basis_type":"geometry_rule"}]'::jsonb
      `,
      [routeId],
    ),
    runQuery(
      `
        delete from route_risk_points
        where route_id = $1
          and generation_basis @> '[{"basis_type":"geometry_rule"}]'::jsonb
      `,
      [routeId],
    ),
  ]);
}

async function upsertRouteGeometryFromDraftUpdate(routeId: string, patch: Record<string, unknown>) {
  const existingResult = await runQuery<RouteGeometryRow>(
    `
      select
        geometry_version,
        ST_AsGeoJSON(route_polyline)::json as route_polyline,
        ST_AsGeoJSON(start_point)::json as start_point,
        ST_AsGeoJSON(end_point)::json as end_point,
        ST_AsGeoJSON(overview_center)::json as overview_center,
        ST_AsGeoJSON(bounding_box)::json as bounding_box,
        overview_zoom,
        elevation_profile_points,
        map_provider_hint,
        source_provider,
        synced_at
      from route_geometries
      where route_id = $1
      limit 1
    `,
    [routeId],
  );
  const existing = existingResult.rows[0];
  const routePolyline = patch.route_polyline ?? existing?.route_polyline;
  const startPoint = patch.start_point ?? existing?.start_point;
  const endPoint = patch.end_point ?? existing?.end_point;
  const overviewCenter = patch.overview_center ?? existing?.overview_center;
  const boundingBox = patch.bounding_box ?? existing?.bounding_box;

  if (!routePolyline || !startPoint || !endPoint || !overviewCenter || !boundingBox) {
    throw new Error(
      "route_geometry update requires route_polyline, start_point, end_point, overview_center, and bounding_box",
    );
  }

  const nextVersion = Number(existing?.geometry_version ?? 0) + 1;
  await runQuery(
    `
      insert into route_geometries (
        route_id,
        geometry_version,
        route_polyline,
        start_point,
        end_point,
        overview_center,
        bounding_box,
        overview_zoom,
        elevation_profile_points,
        map_provider_hint,
        source_provider,
        synced_at
      ) values (
        $1,
        $2,
        ST_SetSRID(ST_GeomFromGeoJSON($3), 4326),
        ST_SetSRID(ST_GeomFromGeoJSON($4), 4326),
        ST_SetSRID(ST_GeomFromGeoJSON($5), 4326),
        ST_SetSRID(ST_GeomFromGeoJSON($6), 4326),
        ST_SetSRID(ST_GeomFromGeoJSON($7), 4326),
        $8,
        $9,
        $10,
        $11,
        $12
      )
      on conflict (route_id)
      do update set
        geometry_version = excluded.geometry_version,
        route_polyline = excluded.route_polyline,
        start_point = excluded.start_point,
        end_point = excluded.end_point,
        overview_center = excluded.overview_center,
        bounding_box = excluded.bounding_box,
        overview_zoom = excluded.overview_zoom,
        elevation_profile_points = excluded.elevation_profile_points,
        map_provider_hint = excluded.map_provider_hint,
        source_provider = excluded.source_provider,
        synced_at = excluded.synced_at
    `,
    [
      routeId,
      nextVersion,
      stringifyGeoJson(routePolyline, "route_geometry.route_polyline"),
      stringifyGeoJson(startPoint, "route_geometry.start_point"),
      stringifyGeoJson(endPoint, "route_geometry.end_point"),
      stringifyGeoJson(overviewCenter, "route_geometry.overview_center"),
      stringifyGeoJson(boundingBox, "route_geometry.bounding_box"),
      toNullableNumber(patch.overview_zoom ?? existing?.overview_zoom),
      patch.elevation_profile_points ?? existing?.elevation_profile_points ?? null,
      optionalString(patch.map_provider_hint ?? existing?.map_provider_hint),
      optionalString(patch.source_provider ?? existing?.source_provider),
      optionalString(patch.synced_at ?? existing?.synced_at),
    ],
  );
  await deleteGeneratedNavigationArtifacts(routeId);
}

async function replaceRouteNodes(routeId: string, nodes: Array<Record<string, unknown>>) {
  await runQuery(
    `
      delete from route_nodes
      where route_id = $1
    `,
    [routeId],
  );

  for (const node of nodes) {
    await runQuery(
      `
        insert into route_nodes (
          node_id,
          route_id,
          node_type,
          node_name,
          point,
          stage_order,
          distance_from_start_m,
          trigger_radius_m,
          navigation_hint,
          wrong_choice_hint,
          display_priority,
          generation_basis
        ) values (
          $1,
          $2,
          $3,
          $4,
          ST_SetSRID(ST_GeomFromGeoJSON($5), 4326),
          $6,
          $7,
          $8,
          $9,
          $10,
          $11,
          $12
        )
      `,
      [
        requireString(node.node_id, "route_nodes.node_id"),
        routeId,
        requireString(node.node_type, "route_nodes.node_type"),
        requireString(node.node_name, "route_nodes.node_name"),
        stringifyGeoJson(node.point, "route_nodes.point"),
        toNullableNumber(node.stage_order),
        toNullableNumber(node.distance_from_start_m),
        toNullableNumber(node.trigger_radius_m) ?? 30,
        requireString(node.navigation_hint, "route_nodes.navigation_hint"),
        optionalString(node.wrong_choice_hint),
        toNullableNumber(node.display_priority) ?? 100,
        JSON.stringify(node.generation_basis ?? []),
      ],
    );
  }
}

async function replaceRouteExitPoints(routeId: string, exitPoints: Array<Record<string, unknown>>) {
  await runQuery(
    `
      delete from route_exit_points
      where route_id = $1
    `,
    [routeId],
  );

  for (const exitPoint of exitPoints) {
    await runQuery(
      `
        insert into route_exit_points (
          exit_point_id,
          route_id,
          exit_name,
          point,
          stage_order,
          exit_type,
          exit_condition_text,
          exit_action_text,
          exit_priority,
          generation_basis
        ) values (
          $1,
          $2,
          $3,
          ST_SetSRID(ST_GeomFromGeoJSON($4), 4326),
          $5,
          $6,
          $7,
          $8,
          $9,
          $10
        )
      `,
      [
        requireString(exitPoint.exit_point_id, "route_exit_points.exit_point_id"),
        routeId,
        requireString(exitPoint.exit_name, "route_exit_points.exit_name"),
        stringifyGeoJson(exitPoint.point, "route_exit_points.point"),
        toNullableNumber(exitPoint.stage_order),
        requireString(exitPoint.exit_type, "route_exit_points.exit_type"),
        requireString(exitPoint.exit_condition_text, "route_exit_points.exit_condition_text"),
        requireString(exitPoint.exit_action_text, "route_exit_points.exit_action_text"),
        requireString(exitPoint.exit_priority, "route_exit_points.exit_priority"),
        JSON.stringify(exitPoint.generation_basis ?? []),
      ],
    );
  }
}

async function replaceRouteRiskPoints(routeId: string, riskPoints: Array<Record<string, unknown>>) {
  await runQuery(
    `
      delete from route_risk_points
      where route_id = $1
    `,
    [routeId],
  );

  for (const riskPoint of riskPoints) {
    await runQuery(
      `
        insert into route_risk_points (
          risk_point_id,
          route_id,
          risk_type,
          risk_level,
          point,
          stage_order,
          risk_title,
          risk_text,
          safe_action_text,
          trigger_radius_m,
          generation_basis
        ) values (
          $1,
          $2,
          $3,
          $4,
          ST_SetSRID(ST_GeomFromGeoJSON($5), 4326),
          $6,
          $7,
          $8,
          $9,
          $10,
          $11
        )
      `,
      [
        requireString(riskPoint.risk_point_id, "route_risk_points.risk_point_id"),
        routeId,
        requireString(riskPoint.risk_type, "route_risk_points.risk_type"),
        requireString(riskPoint.risk_level, "route_risk_points.risk_level"),
        stringifyGeoJson(riskPoint.point, "route_risk_points.point"),
        toNullableNumber(riskPoint.stage_order),
        requireString(riskPoint.risk_title, "route_risk_points.risk_title"),
        requireString(riskPoint.risk_text, "route_risk_points.risk_text"),
        requireString(riskPoint.safe_action_text, "route_risk_points.safe_action_text"),
        toNullableNumber(riskPoint.trigger_radius_m) ?? 30,
        JSON.stringify(riskPoint.generation_basis ?? []),
      ],
    );
  }
}

async function upsertAgentPrefillArtifacts(
  row: RouteRow,
  input: AgentPrefillTriggerDTO,
  completedAt: string,
  artifacts?: AgentPrefillArtifacts,
) {
  const durationMinutes = row.duration_minutes ?? 150;
  const elevationGain = row.elevation_gain_m ?? 220;
  const intensityBucket = elevationGain > 300 ? "moderate" : "easy";
  const durationBucket = durationMinutes > 240 ? "one_day" : "half_day";

  if (input.modules.includes("tags")) {
    const tagRows =
      artifacts?.tags?.map((item) => [
        item.tag_group,
        item.tag_code,
        item.tag_name,
        item.is_core ?? false,
        item.sort_order ?? 100,
      ]) ??
      [
        ["experience", "newbie_friendly", "新手友好", true, 10],
        ["terrain", "light_hike", "轻徒步", true, 20],
        ["scene", "scenic_landmark", "景观参照明显", false, 30],
      ];

    for (const [tagGroup, tagCode, tagName, isCore, sortOrder] of tagRows) {
      await runQuery(
        `
          insert into route_tags (
            route_id,
            tag_group,
            tag_code,
            tag_name,
            is_core,
            sort_order
          ) values ($1, $2, $3, $4, $5, $6)
          on conflict (route_id, tag_code)
          do update set
            tag_name = excluded.tag_name,
            is_core = excluded.is_core,
            sort_order = excluded.sort_order
        `,
        [row.route_id, tagGroup, tagCode, tagName, isCore, sortOrder],
      );
    }
  }

  if (input.modules.includes("faq")) {
    const faqRows =
      artifacts?.faqs?.map((item, index) => [
        `${row.route_id}_faq_${String(index + 1).padStart(3, "0")}`,
        item.question,
        item.answer,
        JSON.stringify(item.source_basis ?? ["Agent 真预填"]),
        item.display_order ?? (index + 1) * 10,
      ]) ??
      [
        [
          `${row.route_id}_faq_001`,
          `第一次走 ${row.route_name} 需要担心迷路吗？`,
          "当前路线按新手样板线处理，建议始终跟随正式节点提示，不要自行抄近路。",
          JSON.stringify(["Agent 预填草稿", "地图检索结果", "运营规则模板"]),
          10,
        ],
        [
          `${row.route_id}_faq_002`,
          `${row.route_name} 适合半天完成吗？`,
          "当前按轻徒步半日模型预填，出发前仍需结合天气和返程时间再次确认。",
          JSON.stringify(["Agent 预填草稿", "时长估算模板"]),
          20,
        ],
      ];

    for (const [faqId, question, answer, sourceBasis, displayOrder] of faqRows) {
      await runQuery(
        `
          insert into route_faqs (
            faq_id,
            route_id,
            question,
            answer,
            source_basis,
            generated_by_ai,
            reviewed_by_human,
            display_order
          ) values ($1, $2, $3, $4, $5, true, false, $6)
          on conflict (faq_id)
          do update set
            question = excluded.question,
            answer = excluded.answer,
            source_basis = excluded.source_basis,
            generated_by_ai = excluded.generated_by_ai,
            reviewed_by_human = excluded.reviewed_by_human,
            display_order = excluded.display_order
        `,
        [faqId, row.route_id, question, answer, sourceBasis, displayOrder],
      );
    }
  }

  if (input.modules.includes("sources")) {
    const sourceRows =
      artifacts?.sources?.map((item, index) => [
        `${row.route_id}_src_${index + 1}`,
        item.source_type,
        item.source_title,
        item.source_url ?? null,
        item.source_summary,
        item.credibility_score,
        JSON.stringify(item.used_for_fields ?? []),
      ]) ??
      [
        [
          `${row.route_id}_src_official`,
          "official",
          `${row.route_name} 官方/景区公开信息`,
          null,
          "用于补全基础描述、适合人群和出发建议的结构化草稿。",
          85,
          JSON.stringify(["summary_short", "beginner_fit_reason", "transport_summary"]),
        ],
        [
          `${row.route_id}_src_map`,
          "map",
          `${row.route_name} 地图检索结果`,
          null,
          "用于补全路径检索关键词、节点组织与空间事实来源说明。",
          90,
          JSON.stringify(["map_search_keyword", "route_nodes", "route_exit_points", "route_risk_points"]),
        ],
      ];

    for (const [sourceId, sourceType, sourceTitle, sourceUrl, sourceSummary, credibilityScore, usedForFields] of sourceRows) {
      await runQuery(
        `
          insert into route_sources (
            source_id,
            route_id,
            source_type,
            source_title,
            source_url,
            source_summary,
            credibility_score,
            used_for_fields,
            checked_at
          ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          on conflict (source_id)
          do update set
            source_type = excluded.source_type,
            source_title = excluded.source_title,
            source_url = excluded.source_url,
            source_summary = excluded.source_summary,
            credibility_score = excluded.credibility_score,
            used_for_fields = excluded.used_for_fields,
            checked_at = excluded.checked_at
        `,
        [sourceId, row.route_id, sourceType, sourceTitle, sourceUrl, sourceSummary, credibilityScore, usedForFields, completedAt],
      );
    }
  }

  if (input.modules.includes("base_facts")) {
    const checklistProfile = artifacts?.checklist_profile;
    await runQuery(
      `
        insert into route_checklist_profiles (
          route_id,
          duration_bucket,
          intensity_bucket,
          terrain_tags,
          weather_sensitive_tags,
          mandatory_supply_codes,
          optional_supply_codes,
          emergency_supply_codes,
          checklist_note_text
        ) values (
          $1, $2, $3, $4, $5, $6, $7, $8, $9
        )
        on conflict (route_id)
        do update set
          duration_bucket = excluded.duration_bucket,
          intensity_bucket = excluded.intensity_bucket,
          terrain_tags = excluded.terrain_tags,
          weather_sensitive_tags = excluded.weather_sensitive_tags,
          mandatory_supply_codes = excluded.mandatory_supply_codes,
          optional_supply_codes = excluded.optional_supply_codes,
          emergency_supply_codes = excluded.emergency_supply_codes,
          checklist_note_text = excluded.checklist_note_text
      `,
      [
        row.route_id,
        checklistProfile?.duration_bucket ?? durationBucket,
        checklistProfile?.intensity_bucket ?? intensityBucket,
        JSON.stringify(checklistProfile?.terrain_tags ?? ["mountain_path", "steps"]),
        JSON.stringify(checklistProfile?.weather_sensitive_tags ?? ["rain", "heat"]),
        JSON.stringify(checklistProfile?.mandatory_supply_codes ?? ["water", "phone_power_bank", "non_slip_shoes"]),
        JSON.stringify(checklistProfile?.optional_supply_codes ?? ["trekking_pole", "sun_hat"]),
        JSON.stringify(checklistProfile?.emergency_supply_codes ?? ["flashlight", "basic_first_aid"]),
        checklistProfile?.checklist_note_text ?? `${row.route_name} 当前按轻徒步草稿补齐清单，出发前需结合天气再次确认。`,
      ],
    );

    const weatherRuleRows =
      artifacts?.weather_rules?.map((item, index) => [
        `${row.route_id}_weather_${index + 1}`,
        item.scenario_type,
        item.severity,
        item.rule_text,
        item.action_text,
        JSON.stringify(item.threshold_config ?? {}),
      ]) ??
      [
        [
          `${row.route_id}_weather_rain`,
          "rain",
          "warn",
          "如遇降雨，石阶和林间湿滑风险会上升。",
          "降低速度并关注鞋底抓地力，必要时提前返回。",
          JSON.stringify({ threshold: "rain > 0mm" }),
        ],
        [
          `${row.route_id}_weather_late`,
          "late_start",
          "avoid",
          "出发过晚会压缩下撤和返程窗口。",
          "下午晚些时候不建议入线，优先选择更短路线。",
          JSON.stringify({ threshold: "start_after:15:00" }),
        ],
      ];

    for (const [weatherRuleId, scenarioType, severity, ruleText, actionText, thresholdConfig] of weatherRuleRows) {
      await runQuery(
        `
          insert into route_weather_rules (
            weather_rule_id,
            route_id,
            scenario_type,
            severity,
            rule_text,
            action_text,
            threshold_config
          ) values ($1, $2, $3, $4, $5, $6, $7)
          on conflict (weather_rule_id)
          do update set
            scenario_type = excluded.scenario_type,
            severity = excluded.severity,
            rule_text = excluded.rule_text,
            action_text = excluded.action_text,
            threshold_config = excluded.threshold_config
        `,
        [weatherRuleId, row.route_id, scenarioType, severity, ruleText, actionText, thresholdConfig],
      );
    }
  }
}

export const adminRoutePgRepository: AdminRouteRepository = {
  async list(query: AdminRouteListQueryDTO) {
    const page = query.page ?? 1;
    const pageSize = query.page_size ?? 20;
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (query.route_status) {
      params.push(query.route_status);
      conditions.push(`r.route_status = $${params.length}`);
    }
    if (query.province_name) {
      params.push(query.province_name);
      conditions.push(`r.province_name = $${params.length}`);
    }
    if (query.city_name) {
      params.push(query.city_name);
      conditions.push(`r.city_name = $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `where ${conditions.join(" and ")}` : "";
    const countSql = `select count(*) as total from routes r ${whereClause}`;
    const countResult = await runQuery<{ total: string }>(countSql, params);
    const total = Number(countResult.rows[0]?.total ?? 0);

    params.push(pageSize);
    params.push((page - 1) * pageSize);

    const sql = `
      ${buildRouteSelectSql(whereClause)}
      order by r.updated_at desc
      limit $${params.length - 1} offset $${params.length}
    `;

    const result = await runQuery<RouteRow>(sql, params);
    return {
      page,
      page_size: pageSize,
      has_more: page * pageSize < total,
      total,
      items: result.rows.map(mapRouteRowToListItem),
    };
  },

  async getById(routeId: string) {
    const sql = `
      ${buildRouteSelectSql("where r.route_id = $1")}
      limit 1
    `;

    const result = await runQuery<RouteRow>(sql, [routeId]);
    const row = result.rows[0];
    if (!row) {
      return undefined;
    }

    const details = await loadRouteWorkspaceDetails(routeId);
    return mergeWorkspace(row, details);
  },

  async create(input: CreateRouteDraftDTO) {
    const routeId = buildRouteId(input);
    const routeSlug = buildRouteSlug(input);
    const provinceCode = provinceCodeMap[input.province_name] ?? "cn";
    const sql = `
      insert into routes (
        route_id,
        route_slug,
        route_name,
        province_code,
        province_name,
        city_name,
        area_name,
        route_type,
        map_search_keyword,
        route_status,
        agent_prefill_status,
        map_sync_status,
        start_point_name,
        end_point_name
      ) values (
        $1, $2, $3, $4, $5, $6, $7, $8, $9,
        'draft',
        $10,
        'pending',
        $11,
        $12
      )
      returning
        route_id,
        route_name,
        province_name,
        city_name,
        area_name,
        start_point_name,
        end_point_name,
        route_type,
        route_status,
        agent_prefill_status,
        map_sync_status
    `;

    const result = await runQuery<{
      route_id: string;
      route_name: string;
      province_name: string;
      city_name: string;
      area_name: string | null;
      start_point_name: string;
      end_point_name: string;
      route_type: string;
      route_status: string;
      agent_prefill_status: string;
      map_sync_status: string;
    }>(sql, [
      routeId,
      routeSlug,
      input.route_name,
      provinceCode,
      input.province_name,
      input.city_name,
      input.area_name ?? null,
      input.route_type,
      input.map_search_keyword ?? null,
      input.trigger_agent_prefill === false ? "pending" : "running",
      input.start_point_name,
      input.end_point_name,
    ]);

    const row = result.rows[0];
    return {
      ...row,
      area_name: row.area_name ?? undefined,
    };
  },

  async createCandidate(input: CreateRouteCandidateDTO) {
    const routeId = buildRouteId({
      route_name: input.route_name,
      province_name: input.province_name,
      city_name: input.city_name,
      area_name: input.area_name,
      start_point_name: input.start_point.point_name,
      end_point_name: input.end_point.point_name,
      route_type: input.route_type,
    });
    const routeSlug = buildRouteSlug({
      route_name: input.route_name,
      province_name: input.province_name,
      city_name: input.city_name,
      area_name: input.area_name,
      start_point_name: input.start_point.point_name,
      end_point_name: input.end_point.point_name,
      route_type: input.route_type,
    });
    const provinceCode = provinceCodeMap[input.province_name] ?? "cn";

    const createResult = await runQuery<{
      route_id: string;
      route_name: string;
      province_name: string;
      city_name: string;
      area_name: string | null;
      start_point_name: string;
      end_point_name: string;
      route_type: string;
      route_status: string;
      agent_prefill_status: string;
      map_sync_status: string;
    }>(
      `
        insert into routes (
          route_id,
          route_slug,
          route_name,
          province_code,
          province_name,
          city_name,
          area_name,
          route_type,
          route_status,
          agent_prefill_status,
          map_sync_status,
          start_point_name,
          end_point_name,
          summary_short,
          route_logic_summary,
          transport_summary,
          beginner_fit_reason
        ) values (
          $1, $2, $3, $4, $5, $6, $7, $8,
          'candidate',
          'pending',
          'missing',
          $9,
          $10,
          $11,
          $12,
          $13,
          $14
        )
        returning
          route_id,
          route_name,
          province_name,
          city_name,
          area_name,
          start_point_name,
          end_point_name,
          route_type,
          route_status,
          agent_prefill_status,
          map_sync_status
      `,
      [
        routeId,
        routeSlug,
        input.route_name,
        provinceCode,
        input.province_name,
        input.city_name,
        input.area_name ?? null,
        input.route_type,
        input.start_point.point_name,
        input.end_point.point_name,
        input.user_description,
        `用户提交的关键节点：${input.waypoints.map((item) => item.point_name).join(" -> ")}`,
        input.submitter_contact ?? null,
        input.submitter_name ? `投稿人：${input.submitter_name}` : null,
      ],
    );

    const pointSuggestions: Array<{ title: string; text: string; point?: SubmissionPointDTO }> = [
      {
        title: `起点候选：${input.start_point.point_name}`,
        text: `用户投稿起点。${input.user_description}`,
        point: input.start_point.point,
      },
      {
        title: `终点候选：${input.end_point.point_name}`,
        text: `用户投稿终点。${input.user_description}`,
        point: input.end_point.point,
      },
      ...input.waypoints.map((waypoint, index) => ({
        title: `途经节点：${waypoint.point_name}`,
        text: `用户投稿途经节点 ${index + 1}。${input.user_description}`,
        point: waypoint.point,
      })),
    ];

    for (const [index, suggestion] of pointSuggestions.entries()) {
      await insertRouteUserReport({
        routeId,
        reportId: `${routeId}_candidate_${index + 1}`,
        reportType: "node",
        suggestionAction: "add",
        proposalTitle: suggestion.title,
        proposalText: suggestion.text,
        proposalPoint: suggestion.point,
        createdBy: input.submitter_name ?? "public_submission",
      });
    }

    await insertAdminOperationLog(
      "route_candidate_created",
      "route",
      routeId,
      {
        route_status: "candidate",
        submitter_name: input.submitter_name,
        point_suggestion_count: pointSuggestions.length,
      },
      input.user_description,
    );

    const row = createResult.rows[0];
    return {
      ...row,
      area_name: row.area_name ?? undefined,
      created_report_count: pointSuggestions.length,
    };
  },

  async update(routeId: string, patch: UpdateRouteDraftDTO) {
    const existing = await getDetailedRouteRow(routeId);
    if (!existing) {
      return undefined;
    }

    const routePatch = patch.route ?? {};
    const mutableColumns: Record<string, string> = {
      route_name: "route_name",
      area_name: "area_name",
      start_point_name: "start_point_name",
      end_point_name: "end_point_name",
      route_type: "route_type",
      map_search_keyword: "map_search_keyword",
      duration_minutes: "duration_minutes",
      distance_km: "distance_km",
      elevation_gain_m: "elevation_gain_m",
      max_altitude_m: "max_altitude_m",
      route_anchor_points: "route_anchor_points",
      best_season_text: "best_season_text",
      transport_summary: "transport_summary",
      route_logic_summary: "route_logic_summary",
      exit_logic_summary: "exit_logic_summary",
      easiest_panic_point_text: "easiest_panic_point_text",
      not_for_whom_text: "not_for_whom_text",
      summary_short: "summary_short",
      beginner_fit_reason: "beginner_fit_reason",
      cover_image_url: "cover_image_url",
      last_verified_at: "last_verified_at",
    };

    const setClauses: string[] = [];
    const params: unknown[] = [];
    let mutated = false;

    for (const [payloadKey, columnName] of Object.entries(mutableColumns)) {
      if (payloadKey in routePatch) {
        const value = (routePatch as Record<string, unknown>)[payloadKey] ?? null;
        params.push(payloadKey === "route_anchor_points" && value !== null ? JSON.stringify(value) : value);
        setClauses.push(`${columnName} = $${params.length}`);
      }
    }

    if (setClauses.length > 0) {
      params.push(routeId);
      const sql = `
        update routes
        set
          ${setClauses.join(",\n          ")},
          updated_at = now()
        where route_id = $${params.length}
        returning route_id
      `;

      await runQuery<{ route_id: string }>(sql, params);
      mutated = true;
    }

    if (patch.route_geometry !== undefined) {
      const geometryPatch = requireRecord(patch.route_geometry, "route_geometry");
      if (Object.keys(geometryPatch).length > 0) {
        await upsertRouteGeometryFromDraftUpdate(routeId, geometryPatch);
        mutated = true;
      }
    }

    if (patch.route_nodes !== undefined) {
      await replaceRouteNodes(routeId, patch.route_nodes);
      mutated = true;
    }

    if (patch.route_exit_points !== undefined) {
      await replaceRouteExitPoints(routeId, patch.route_exit_points);
      mutated = true;
    }

    if (patch.route_risk_points !== undefined) {
      await replaceRouteRiskPoints(routeId, patch.route_risk_points);
      mutated = true;
    }

    if (!mutated) {
      return this.getById(routeId);
    }

    await touchRouteUpdatedAt(routeId);
    return this.getById(routeId);
  },

  async triggerAgentPrefill(routeId: string, input: AgentPrefillTriggerDTO) {
    const row = await getDetailedRouteRow(routeId);
    if (!row) {
      return undefined;
    }
    const details = await loadRouteWorkspaceDetails(routeId);
    const retrievalContext = buildRouteRetrievalContext(
      {
        route_name: row.route_name,
        route_type: row.route_type,
        start_point_name: row.start_point_name,
        end_point_name: row.end_point_name,
        route: {
          summary_short: row.summary_short,
          beginner_fit_reason: row.beginner_fit_reason,
          route_logic_summary: row.route_logic_summary,
          exit_logic_summary: row.exit_logic_summary,
          transport_summary: row.transport_summary,
          best_season_text: row.best_season_text,
        },
        route_sources: details.route_sources,
        route_faqs: details.route_faqs,
        route_checklist_profile: details.route_checklist_profile,
        route_weather_rules: details.route_weather_rules,
      },
      input.modules,
    );

    const completedAt = new Date().toISOString();
    const generatedArtifacts = isAgentPrefillConfigured()
      ? await requestAgentPrefill({
          route_id: row.route_id,
          route_name: row.route_name,
          province_name: row.province_name,
          city_name: row.city_name,
          area_name: row.area_name ?? undefined,
          start_point_name: row.start_point_name,
          end_point_name: row.end_point_name,
          route_type: row.route_type,
          map_search_keyword: row.map_search_keyword ?? undefined,
          modules: input.modules,
          retrieval_context: retrievalContext,
        })
      : undefined;
    const routePatch = generatedArtifacts?.route_patch ?? {};
    const modules =
      generatedArtifacts && input.modules.length > 0
        ? input.modules.map((module) => ({
            ...buildModuleSuggestions(module),
            provider: "agent_http",
          }))
        : input.modules.map(buildModuleSuggestions);
    const payloadJson = {
      modules: input.modules,
      force_refresh: input.force_refresh ?? false,
      retrieval_chunk_count: retrievalContext.top_chunks.length,
    };
    const resultJson = {
      modules,
      last_completed_at: completedAt,
      provider: generatedArtifacts ? "agent_http" : "internal_stub",
      retrieval_context: retrievalContext,
    };

    await runQuery(
      `
        insert into admin_async_jobs (
          job_id,
          job_type,
          route_id,
          job_status,
          payload_json,
          result_json,
          started_at,
          finished_at,
          created_by
        ) values (
          $1,
          'agent_prefill',
          $2,
          'succeeded',
          $3,
          $4,
          now(),
          now(),
          'pg_repo'
        )
      `,
      [createRecordId("job_prefill"), routeId, JSON.stringify(payloadJson), JSON.stringify(resultJson)],
    );

    await runQuery(
      `
        update routes
        set
          agent_prefill_status = 'completed',
          duration_minutes = coalesce(duration_minutes, 150),
          distance_km = coalesce(distance_km, 6.2),
          elevation_gain_m = coalesce(elevation_gain_m, 220),
          summary_short = coalesce(summary_short, $2),
          beginner_fit_reason = coalesce(beginner_fit_reason, $3),
          transport_summary = coalesce(transport_summary, $4),
          route_logic_summary = coalesce(route_logic_summary, $5),
          exit_logic_summary = coalesce(exit_logic_summary, $6),
          last_prefill_at = now(),
          updated_at = now()
        where route_id = $1
      `,
      [
        routeId,
        typeof routePatch.summary_short === "string"
          ? routePatch.summary_short
          : `${row.route_name} 的 Agent 预填草稿已生成，可继续审核细化。`,
        typeof routePatch.beginner_fit_reason === "string"
          ? routePatch.beginner_fit_reason
          : `${row.route_name} 当前按成熟轻徒步样板线处理，优先服务新手与第一次到访用户。`,
        typeof routePatch.transport_summary === "string"
          ? routePatch.transport_summary
          : `默认建议从 ${row.start_point_name} 进入，完成后从 ${row.end_point_name} 离线。`,
        typeof routePatch.route_logic_summary === "string"
          ? routePatch.route_logic_summary
          : "当前路线逻辑按成熟步道与显著参照物组织，减少新手在岔路口的迷失感。",
        typeof routePatch.exit_logic_summary === "string"
          ? routePatch.exit_logic_summary
          : "如体力下降或天气转差，优先在正式下撤点或原路返回节点结束行程。",
      ],
    );

    await upsertAgentPrefillArtifacts(row, input, completedAt, generatedArtifacts);

    return this.getAgentPrefillStatus(routeId);
  },

  async getAgentPrefillStatus(routeId: string) {
    const existing = await getRouteStatus(routeId);
    if (!existing) {
      return undefined;
    }

    const latestJob = await getLatestAsyncJob(routeId, "agent_prefill");

    return {
      route_id: existing.route_id,
      agent_prefill_status: existing.agent_prefill_status,
      modules: normalizeModules(existing.agent_prefill_status, latestJob),
      last_completed_at:
        (latestJob?.result_json?.last_completed_at as string | undefined) ?? existing.last_prefill_at ?? undefined,
    };
  },

  async triggerMapSync(routeId: string, input: MapSyncTriggerDTO) {
    const row = await getDetailedRouteRow(routeId);
    if (!row) {
      return undefined;
    }

    const providerHint = input.provider_hint ?? "baidu-walking";
    let missingFields = input.sync_scope.includes("elevation_profile") ? [] : ["elevation_profile"];
    let mapSyncStatus: "completed" | "missing" = missingFields.length > 0 ? "missing" : "completed";
    let resultJson: Record<string, unknown> = {
      sync_scope: input.sync_scope,
      provider_hint: providerHint,
      source_provider: "baidu",
      missing_fields: missingFields,
      force_refresh: input.force_refresh ?? false,
    };

    if (isBaiduMapConfigured()) {
      const routeAnchors = parseRouteAnchorPoints(row.route_anchor_points);
      if (shouldSkipAutoMapSync({ route_type: row.route_type, route_anchor_points: row.route_anchor_points })) {
        missingFields = Array.from(new Set([...missingFields, "route_geometry"]));
        mapSyncStatus = "missing";
        resultJson = {
          sync_scope: input.sync_scope,
          provider_hint: providerHint,
          source_provider: "baidu",
          missing_fields: missingFields,
          force_refresh: input.force_refresh ?? false,
          reason: "missing_required_anchors",
          blockers: evaluateRouteRiskGate(
            {
              route_id: row.route_id,
              route_type: row.route_type,
              route_anchor_points: row.route_anchor_points,
              route_geometry: {},
            },
            "map_sync",
          ).blockers,
          suggestion:
            row.route_type === "loop"
              ? "环线必须先补 1 个以上中间锚点后再同步地图。"
              : "往返线必须先补折返点或中间锚点后再同步地图。",
        };
      } else {
        const origin = await geocodeAddress(buildRouteAddress(row, row.start_point_name), row.city_name);
        let destination = await geocodeAddress(buildRouteAddress(row, row.end_point_name), row.city_name);
        const startedFromSamePoint = pointsAreNearlySame(origin, destination);
        const maxAnchorDistanceM = getRouteAnchorMaxDistanceM(row.route_type);
        let fallbackResolution:
          | {
              query: string;
              name: string;
              address?: string;
            }
          | undefined;

        if (startedFromSamePoint) {
          const fallbackQuery =
            row.route_type === "one_way"
              ? row.end_point_name
              : row.map_search_keyword || row.route_name || row.end_point_name;
          const placeFallback = await resolveDistinctPointByPlaceSearch(row, fallbackQuery, origin, {
            minDistanceM: 200,
            maxDistanceM: maxAnchorDistanceM,
          });
          if (placeFallback) {
            destination = placeFallback;
            fallbackResolution = {
              query: placeFallback.query,
              name: placeFallback.name,
              address: placeFallback.address,
            };
          }
        }

        if (!pointsAreNearlySame(origin, destination)) {
          let linearDistanceM = calculatePointDistanceMeters(origin, destination);
          let walkingRoute = await getWalkingRoute(origin, destination);
          if (isSuspiciousAnchorDistance(row.route_type, linearDistanceM, walkingRoute.distance_m)) {
            const placeFallback = await resolveDistinctPointByPlaceSearch(row, row.end_point_name, origin, {
              minDistanceM: 200,
              maxDistanceM: maxAnchorDistanceM,
            });
            if (
              placeFallback &&
              calculatePointDistanceMeters(origin, placeFallback) < linearDistanceM
            ) {
              destination = placeFallback;
              linearDistanceM = calculatePointDistanceMeters(origin, destination);
              fallbackResolution = {
                query: placeFallback.query,
                name: placeFallback.name,
                address: placeFallback.address,
              };
              walkingRoute = await getWalkingRoute(origin, destination);
            }
          }

          if (routeAnchors.length > 0) {
            const resolvedAnchors = [];
            for (const anchor of routeAnchors) {
              resolvedAnchors.push(await resolveRouteAnchorPoint(row, anchor, row.map_search_keyword || row.route_name));
            }
            const segmentPoints = [origin, ...resolvedAnchors, destination];
            const segments = [];
            for (let index = 0; index < segmentPoints.length - 1; index += 1) {
              segments.push(await getWalkingRoute(segmentPoints[index], segmentPoints[index + 1]));
            }
            walkingRoute = stitchWalkingRoutes(segments);
          }
          const shouldBuildRoundTrip = row.route_type === "out_and_back";
          const normalizedRoute = shouldBuildRoundTrip ? buildRoundTripRoute(walkingRoute) : walkingRoute;
          const normalizedProviderHint = [
            fallbackResolution ? `${providerHint}-place-search` : providerHint,
            shouldBuildRoundTrip ? "roundtrip" : undefined,
          ]
            .filter(Boolean)
            .join("-");

        await upsertRouteGeometryFromMapSync(
          routeId,
          normalizedRoute,
          normalizedProviderHint,
          input.sync_scope.includes("elevation_profile"),
        );
        await deleteGeneratedNavigationArtifacts(routeId);
        await syncRouteMetricsFromMap(routeId, {
          distance_m: normalizedRoute.distance_m,
          duration_s: normalizedRoute.duration_s,
        });

        const mapRiskGate = evaluateRouteRiskGate(
          {
            route_id: row.route_id,
            route_type: row.route_type,
            route_anchor_points: row.route_anchor_points,
            route_geometry: {
              geometry_version: 1,
              route_polyline: {
                type: "LineString",
                coordinates: normalizedRoute.polyline_points.map((item) => [item.lng, item.lat]),
              },
              map_provider_hint: normalizedProviderHint,
            },
            route_nodes: [],
            route_exit_points: [],
            route_risk_points: [],
          },
          "map_sync",
        );
        missingFields = input.sync_scope.includes("elevation_profile")
          ? ["elevation_profile"]
          : ["elevation_profile"];
        if (mapRiskGate.blockers.length > 0) {
          missingFields = Array.from(new Set([...missingFields, "route_geometry_risk"]));
        }
          mapSyncStatus = "missing";
        resultJson = {
          sync_scope: input.sync_scope,
          provider_hint: normalizedProviderHint,
          source_provider: "baidu",
          missing_fields: missingFields,
          force_refresh: input.force_refresh ?? false,
          geocode: {
            origin_confidence: origin.confidence,
            destination_confidence: destination.confidence,
          },
          ...(fallbackResolution
            ? {
                place_search_fallback: {
                  query: fallbackResolution.query,
                  name: fallbackResolution.name,
                  address: fallbackResolution.address,
                },
              }
            : {}),
          route_metrics: {
            distance_m: normalizedRoute.distance_m,
            duration_s: normalizedRoute.duration_s,
            point_count: normalizedRoute.polyline_points.length,
          },
          risk_gate: {
            blockers: mapRiskGate.blockers,
            warnings: mapRiskGate.warnings,
            risk_flags: mapRiskGate.risk_flags,
          },
        };
        } else {
          missingFields = Array.from(new Set([...missingFields, "route_geometry"]));
          mapSyncStatus = "missing";
          resultJson = {
            sync_scope: input.sync_scope,
            provider_hint: providerHint,
            source_provider: "baidu",
            missing_fields: missingFields,
            force_refresh: input.force_refresh ?? false,
            reason: "same_geocode_point",
            geocode: {
              origin_confidence: origin.confidence,
              destination_confidence: destination.confidence,
              distance_m: 0,
            },
            suggestion: "当前起终点被百度解析为同一点，建议补充更明确的入口/出口锚点后重试。",
          };
        }
      }
    }
    await runQuery(
      `
        insert into admin_async_jobs (
          job_id,
          job_type,
          route_id,
          job_status,
          payload_json,
          result_json,
          started_at,
          finished_at,
          created_by
        ) values (
          $1,
          'map_sync',
          $2,
          'succeeded',
          $3,
          $4,
          now(),
          now(),
          'pg_repo'
        )
      `,
      [createRecordId("job_map_sync"), routeId, JSON.stringify(input), JSON.stringify(resultJson)],
    );

    await runQuery(
      `
        update routes
        set
          map_sync_status = $2,
          last_map_synced_at = now(),
          updated_at = now()
        where route_id = $1
      `,
      [routeId, mapSyncStatus],
    );

    return this.getMapSyncStatus(routeId);
  },

  async getMapSyncStatus(routeId: string) {
    const existing = await getRouteStatus(routeId);
    if (!existing) {
      return undefined;
    }

    const latestJob = await getLatestAsyncJob(routeId, "map_sync");
    const resultJson = latestJob?.result_json ?? {};

    return {
      route_id: existing.route_id,
      map_sync_status: existing.map_sync_status,
      provider_hint: (resultJson.provider_hint as string | undefined) ?? undefined,
      source_provider: (resultJson.source_provider as string | undefined) ?? undefined,
      sync_scope: Array.isArray(resultJson.sync_scope) ? resultJson.sync_scope : [],
      missing_fields: Array.isArray(resultJson.missing_fields) ? resultJson.missing_fields : [],
      last_synced_at: existing.last_map_synced_at ?? undefined,
    };
  },

  async createUserReport(routeId: string, input: CreatePublicUserReportDTO) {
    const existing = await getRouteStatus(routeId);
    if (!existing) {
      return undefined;
    }

    const reportId = createRecordId("report_public");
    await insertRouteUserReport({
      routeId,
      reportId,
      reportType: input.report_type,
      suggestionAction: input.suggestion_action,
      proposalTitle: input.proposal_title,
      proposalText: input.proposal_text,
      proposalPoint: input.proposal_point,
      createdBy: input.reporter_name ?? "public_submission",
    });

    await touchRouteUpdatedAt(routeId);
    await insertAdminOperationLog(
      "user_report_created",
      "route_user_report",
      reportId,
      {
        route_id: routeId,
        report_type: input.report_type,
        suggestion_action: input.suggestion_action,
      },
      input.proposal_text,
    );

    const pendingCountResult = await runQuery<{ total: string }>(
      `
        select count(*) as total
        from route_user_reports
        where route_id = $1
          and report_status = 'pending'
      `,
      [routeId],
    );

    return {
      route_id: routeId,
      report_id: reportId,
      report_status: "pending",
      pending_user_report_count: Number(pendingCountResult.rows[0]?.total ?? 0),
    };
  },

  async listUserReports(routeId: string, query: UserReportListQueryDTO) {
    const existing = await getRouteStatus(routeId);
    if (!existing) {
      return undefined;
    }

    const conditions = ["route_id = $1"];
    const params: unknown[] = [routeId];

    if (query.report_type) {
      params.push(query.report_type);
      conditions.push(`report_type = $${params.length}`);
    }

    if (query.report_status) {
      params.push(query.report_status);
      conditions.push(`report_status = $${params.length}`);
    }

    const result = await runQuery<UserReportRow>(
      `
        select
          report_id,
          report_type,
          proposal_action,
          proposal_title,
          ST_AsGeoJSON(proposal_point)::json as proposal_point,
          proposal_text,
          screenshot_url,
          report_status,
          review_comment,
          merged_target_id,
          merge_target_type
        from route_user_reports
        where ${conditions.join(" and ")}
        order by created_at desc
      `,
      params,
    );

    return {
      route_id: routeId,
      items: result.rows.map((row) => ({
        report_id: row.report_id,
        report_type: row.report_type,
        suggestion_action: row.proposal_action,
        proposal_title: row.proposal_title,
        proposal_point: row.proposal_point ?? undefined,
        proposal_text: row.proposal_text,
        screenshot_url: row.screenshot_url ?? undefined,
        report_status: row.report_status,
        review_comment: row.review_comment ?? undefined,
        merged_target_id: row.merged_target_id ?? undefined,
        merge_target_type: row.merge_target_type ?? undefined,
      })),
      total: result.rowCount,
    };
  },

  async reviewUserReport(routeId: string, reportId: string, input: UserReportReviewDTO) {
    const existing = await getRouteStatus(routeId);
    if (!existing) {
      return undefined;
    }

    const reportCheck = await runQuery<{
      report_id: string;
      report_type: string;
      proposal_action: string;
      proposal_title: string;
      proposal_text: string;
      proposal_point: Record<string, unknown> | null;
    }>(
      `
        select report_id, report_type, proposal_action, proposal_title, proposal_text, ST_AsGeoJSON(proposal_point)::json as proposal_point
        from route_user_reports
        where route_id = $1
          and report_id = $2
        limit 1
      `,
      [routeId, reportId],
    );

    if (reportCheck.rowCount === 0) {
      return null;
    }

    const report = reportCheck.rows[0];
    const requiresMergeTarget = input.action === "accept" && report.proposal_action !== "delete";
    if (requiresMergeTarget && !input.merge_target_type) {
      throw new Error("merge_target_type is required when accepting add/modify report");
    }
    if (requiresMergeTarget && !report.proposal_point) {
      throw new Error("该建议未附坐标，请先在后台补点后再转为正式节点");
    }
    const mergedTargetId =
      input.action === "accept"
        ? `${input.merge_target_type ?? "target"}_${Date.now().toString().slice(-4)}`
        : null;
    const nextStatus = input.action === "accept" ? "accepted" : "rejected";

    if (input.action === "accept" && input.merge_target_type === "route_nodes") {
      await runQuery(
        `
          insert into route_nodes (
            node_id,
            route_id,
            node_type,
            node_name,
            point,
            trigger_radius_m,
            navigation_hint,
            display_priority,
            generation_basis
          )
          select
            $3,
            route_id,
            'key',
            proposal_title,
            proposal_point,
            30,
            proposal_text,
            100,
            jsonb_build_array(
              jsonb_build_object(
                'basis_type', 'user_report',
                'label', '用户共创建议',
                'report_id', report_id,
                'excerpt', proposal_text
              )
            )
          from route_user_reports
          where route_id = $1
            and report_id = $2
        `,
        [routeId, reportId, mergedTargetId],
      );
    }

    if (input.action === "accept" && input.merge_target_type === "route_exit_points") {
      await runQuery(
        `
          insert into route_exit_points (
            exit_point_id,
            route_id,
            exit_name,
            point,
            exit_type,
            exit_condition_text,
            exit_action_text,
            exit_priority,
            generation_basis
          )
          select
            $3,
            route_id,
            proposal_title,
            proposal_point,
            'safe_stop',
            proposal_text,
            '优先按现场指引下撤，必要时原路返回',
            'secondary',
            jsonb_build_array(
              jsonb_build_object(
                'basis_type', 'user_report',
                'label', '用户共创建议',
                'report_id', report_id,
                'excerpt', proposal_text
              )
            )
          from route_user_reports
          where route_id = $1
            and report_id = $2
        `,
        [routeId, reportId, mergedTargetId],
      );
    }

    if (input.action === "accept" && input.merge_target_type === "route_risk_points") {
      await runQuery(
        `
          insert into route_risk_points (
            risk_point_id,
            route_id,
            risk_type,
            risk_level,
            point,
            risk_title,
            risk_text,
            safe_action_text,
            trigger_radius_m,
            generation_basis
          )
          select
            $3,
            route_id,
            'user_reported',
            'medium',
            proposal_point,
            proposal_title,
            proposal_text,
            '放慢通行，必要时原路返回',
            30,
            jsonb_build_array(
              jsonb_build_object(
                'basis_type', 'user_report',
                'label', '用户共创建议',
                'report_id', report_id,
                'excerpt', proposal_text
              )
            )
          from route_user_reports
          where route_id = $1
            and report_id = $2
        `,
        [routeId, reportId, mergedTargetId],
      );
    }

    const updateResult = await runQuery<{
      report_id: string;
      report_status: string;
      merged_target_id: string | null;
      review_comment: string | null;
    }>(
      `
        update route_user_reports
        set
          report_status = $3,
          review_comment = $4,
          merged_target_id = $5,
          merge_target_type = $6,
          updated_by = 'pg_repo'
        where route_id = $1
          and report_id = $2
        returning report_id, report_status, merged_target_id, review_comment
      `,
      [routeId, reportId, nextStatus, input.review_comment ?? null, mergedTargetId, input.merge_target_type ?? null],
    );

    await touchRouteUpdatedAt(routeId);
    await insertAdminOperationLog(
      input.action === "accept" ? "user_report_accepted" : "user_report_rejected",
      "route_user_report",
      reportId,
      {
        route_id: routeId,
        report_type: report.report_type,
        suggestion_action: report.proposal_action,
        merge_target_type: input.merge_target_type,
        merged_target_id: mergedTargetId,
      },
      input.review_comment,
    );

    const pendingCountResult = await runQuery<{ total: string }>(
      `
        select count(*) as total
        from route_user_reports
        where route_id = $1
          and report_status = 'pending'
      `,
      [routeId],
    );

    const updated = updateResult.rows[0];
    return {
      route_id: routeId,
      report_id: updated.report_id,
      report_status: updated.report_status,
      merged_target_id: updated.merged_target_id ?? undefined,
      review_comment: updated.review_comment ?? undefined,
      pending_user_report_count: Number(pendingCountResult.rows[0]?.total ?? 0),
    };
  },

  async getReviewDetail(_routeId: string) {
    const row = await getDetailedRouteRow(_routeId);
    if (!row) {
      return undefined;
    }

    const details = await loadRouteWorkspaceDetails(_routeId);
    const logs = await getRecentOperationLogs(_routeId);
    return buildReviewDetail(row, details, logs);
  },

  async runReviewAction(routeId: string, input: ReviewActionDTO) {
    const row = await getDetailedRouteRow(routeId);
    if (!row) {
      return undefined;
    }
    const details = await loadRouteWorkspaceDetails(routeId);
    const reviewStage = input.action === "approve" ? "approve" : input.action === "submit_review" ? "submit_review" : undefined;
    if (reviewStage) {
      const riskGate = evaluateRouteRiskGate(
        {
          route_id: row.route_id,
          route_type: row.route_type,
          route_anchor_points: row.route_anchor_points,
          map_sync_status: row.map_sync_status,
          agent_prefill_status: row.agent_prefill_status,
          pending_user_report_count: row.pending_user_report_count,
          source_count: row.source_count,
          risk_count: row.risk_count,
          route_geometry: details.route_geometry,
          route_nodes: details.route_nodes,
          route_exit_points: details.route_exit_points,
          route_risk_points: details.route_risk_points,
        },
        reviewStage,
      );
      if (riskGate.blockers.length > 0) {
        throw new Error(riskGate.blockers.join("；"));
      }
    }

    let nextStatus = row.route_status;
    let nextCredibilityLevel = row.credibility_level;

    if (input.action === "submit_review") {
      nextStatus = "pending_review";
    }
    if (input.action === "approve") {
      nextStatus = "approved";
      nextCredibilityLevel = input.credibility_level ?? "A";
    }
    if (input.action === "return") {
      nextStatus = "draft";
    }
    if (input.action === "reject") {
      nextStatus = "retired";
    }
    if (input.action === "pause") {
      nextStatus = "paused";
    }
    if (input.action === "retire") {
      nextStatus = "retired";
    }

    await runQuery(
      `
        update routes
        set
          route_status = $2,
          credibility_level = $3,
          updated_at = now()
        where route_id = $1
      `,
      [routeId, nextStatus, nextCredibilityLevel],
    );

    await insertAdminOperationLog(
      `route_review_${input.action}`,
      "route",
      routeId,
      {
        route_status: nextStatus,
        credibility_level: nextCredibilityLevel,
      },
      input.comment,
    );

    const reviewDetail = await this.getReviewDetail(routeId);
    return {
      route_id: routeId,
      route_status: nextStatus,
      credibility_level: nextCredibilityLevel ?? undefined,
      comment: input.comment,
      review_checklist_summary: reviewDetail?.review_checklist ?? [],
    };
  },

  async createPublishPreview(routeId: string, input: PublishPreviewDTO) {
    const row = await getDetailedRouteRow(routeId);
    if (!row) {
      return undefined;
    }

    const details = await loadRouteWorkspaceDetails(routeId);
    const previewPackage = buildPublishedPackage(row, details, "preview", "preview", new Date().toISOString());
    const publishRiskGate = evaluateRouteRiskGate(
      {
        route_id: row.route_id,
        route_type: row.route_type,
        route_anchor_points: row.route_anchor_points,
        map_sync_status: row.map_sync_status,
        agent_prefill_status: row.agent_prefill_status,
        pending_user_report_count: row.pending_user_report_count,
        source_count: row.source_count,
        risk_count: row.risk_count,
        route_geometry: details.route_geometry,
        route_nodes: details.route_nodes,
        route_exit_points: details.route_exit_points,
        route_risk_points: details.route_risk_points,
      },
      "publish",
    );
    const issues = [
      ...(row.route_status === "approved" || row.route_status === "published" ? [] : ["route status is not approved yet"]),
      ...publishRiskGate.blockers,
    ];
    const passed = issues.length === 0;
    const previewPayload = {
      package_type: "route_package",
      schema_version: "1.0.0",
      faq_count: details.route_faqs.length,
      risk_point_count: details.route_risk_points.length,
      node_count: details.route_nodes.length,
      source_count: details.route_sources.length,
      checksum: `sha256:preview_${routeId}_${input.force_refresh ? "fresh" : "cached"}`,
    };

    await runQuery(
      `
        insert into admin_async_jobs (
          job_id,
          job_type,
          route_id,
          job_status,
          payload_json,
          result_json,
          started_at,
          finished_at,
          created_by
        ) values (
          $1,
          'publish_preview',
          $2,
          'succeeded',
          $3,
          $4,
          now(),
          now(),
          'pg_repo'
        )
      `,
      [
        createRecordId("job_preview"),
        routeId,
        JSON.stringify(input),
        JSON.stringify({
          package_preview: previewPayload,
          validation_summary: {
            passed,
            evidence_count: details.route_sources.length,
            blockers: publishRiskGate.blockers,
            warnings: publishRiskGate.warnings,
          },
          package_json: previewPackage,
        }),
      ],
    );

    return {
      route_id: routeId,
      preview_job_status: "completed",
      package_preview: previewPayload,
      validation_summary: {
        passed,
        issues,
      },
    };
  },

  async publish(routeId: string, input: PublishRouteDTO) {
    const row = await getDetailedRouteRow(routeId);
    if (!row) {
      return undefined;
    }

    const details = await loadRouteWorkspaceDetails(routeId);
    const publishRiskGate = evaluateRouteRiskGate(
      {
        route_id: row.route_id,
        route_type: row.route_type,
        route_anchor_points: row.route_anchor_points,
        map_sync_status: row.map_sync_status,
        agent_prefill_status: row.agent_prefill_status,
        pending_user_report_count: row.pending_user_report_count,
        source_count: row.source_count,
        risk_count: row.risk_count,
        route_geometry: details.route_geometry,
        route_nodes: details.route_nodes,
        route_exit_points: details.route_exit_points,
        route_risk_points: details.route_risk_points,
      },
      "publish",
    );
    if (row.route_status !== "approved" && row.route_status !== "published") {
      throw new Error("route status is not approved yet");
    }
    if (publishRiskGate.blockers.length > 0) {
      throw new Error(publishRiskGate.blockers.join("；"));
    }

    const versionResult = await runQuery<{
      next_content_version: string;
      next_geometry_version: string;
      next_faq_version: string;
      next_checklist_version: string;
    }>(
      `
        select
          coalesce(max(content_version), 0) + 1 as next_content_version,
          coalesce(max(geometry_version), 0) + 1 as next_geometry_version,
          coalesce(max(faq_version), 0) + 1 as next_faq_version,
          coalesce(max(checklist_version), 0) + 1 as next_checklist_version
        from route_publish_versions
        where route_id = $1
      `,
      [routeId],
    );

    const versions = versionResult.rows[0];
    const publishVersionId = createRecordId("pub");
    const packageId = createRecordId("pkg");
    const publishedAt = new Date().toISOString();
    const packageChecksum = `sha256:${publishVersionId}`;
    const packageJson = buildPublishedPackage(row, details, publishVersionId, packageId, publishedAt);
    const packageText = JSON.stringify(packageJson);

    await runQuery(
      `
        insert into route_publish_versions (
          publish_version_id,
          route_id,
          schema_version,
          content_version,
          geometry_version,
          faq_version,
          checklist_version,
          publish_status,
          generated_at,
          published_at,
          published_by,
          package_checksum
        ) values (
          $1, $2, '1.0.0', $3, $4, $5, $6, 'published', now(), now(), 'pg_repo', $7
        )
      `,
      [
        publishVersionId,
        routeId,
        Number(versions?.next_content_version ?? 1),
        Number(versions?.next_geometry_version ?? 1),
        Number(versions?.next_faq_version ?? 1),
        Number(versions?.next_checklist_version ?? 1),
        packageChecksum,
      ],
    );

    await runQuery(
      `
        insert into route_packages (
          package_id,
          publish_version_id,
          route_id,
          package_schema_version,
          package_json,
          package_size_bytes,
          checksum
        ) values (
          $1, $2, $3, '1.0.0', $4, $5, $6
        )
      `,
      [
        packageId,
        publishVersionId,
        routeId,
        packageText,
        packageText.length,
        packageChecksum,
      ],
    );

    await runQuery(
      `
        update routes
        set
          route_status = 'published',
          published_at = now(),
          updated_at = now()
        where route_id = $1
      `,
      [routeId],
    );

    await insertAdminOperationLog(
      "route_publish",
      "route",
      routeId,
      {
        route_status: "published",
        publish_version_id: publishVersionId,
        package_id: packageId,
      },
      input.comment,
    );

    return {
      route_id: routeId,
      route_status: "published",
      publish_version_id: publishVersionId,
      package_id: packageId,
      published_at: publishedAt,
    };
  },

  async listPublishVersions(routeId: string) {
    const row = await getDetailedRouteRow(routeId);
    if (!row) {
      return undefined;
    }

    const result = await runQuery<PublishVersionRow>(
      `
        select
          pv.publish_version_id,
          rp.package_id,
          pv.publish_status,
          pv.schema_version,
          pv.content_version,
          pv.package_checksum,
          pv.published_at,
          pv.published_by
        from route_publish_versions pv
        left join route_packages rp on rp.publish_version_id = pv.publish_version_id
        where pv.route_id = $1
        order by pv.published_at desc
      `,
      [routeId],
    );

    return {
      route_id: routeId,
      items: result.rows.map((item) => ({
        publish_version_id: item.publish_version_id,
        package_id: item.package_id ?? undefined,
        publish_status: item.publish_status,
        version_summary: `content v${item.content_version}`,
        checksum: item.package_checksum,
        published_at: item.published_at,
        published_by: item.published_by ?? undefined,
      })),
      current_live_publish_version_id: await getCurrentLivePublishVersionId(routeId),
    };
  },

  async runPublishVersionAction(
    routeId: string,
    publishVersionId: string,
    input: PublishVersionActionDTO,
  ) {
    const row = await getDetailedRouteRow(routeId);
    if (!row) {
      return undefined;
    }

    const versionResult = await runQuery<{ publish_version_id: string; publish_status: string }>(
      `
        select publish_version_id, publish_status
        from route_publish_versions
        where route_id = $1
          and publish_version_id = $2
        limit 1
      `,
      [routeId, publishVersionId],
    );

    const version = versionResult.rows[0];
    if (!version) {
      return null;
    }

    if (input.action === "pause") {
      await runQuery(
        `
          update routes
          set route_status = 'paused', updated_at = now()
          where route_id = $1
        `,
        [routeId],
      );
    }

    if (input.action === "invalidate") {
      await runQuery(
        `
          update route_publish_versions
          set publish_status = 'invalid'
          where route_id = $1
            and publish_version_id = $2
        `,
        [routeId, publishVersionId],
      );
    }

    if (input.action === "restore") {
      await runQuery(
        `
          update route_publish_versions
          set publish_status = 'published'
          where route_id = $1
            and publish_version_id = $2
        `,
        [routeId, publishVersionId],
      );
      await runQuery(
        `
          update routes
          set route_status = 'published', updated_at = now()
          where route_id = $1
        `,
        [routeId],
      );
    }

    await insertAdminOperationLog(
      `publish_version_${input.action}`,
      "route_publish_version",
      publishVersionId,
      {
        route_id: routeId,
        publish_version_id: publishVersionId,
        action: input.action,
      },
      input.comment,
    );

    const routeStatusResult = await runQuery<{ route_status: string }>(
      `
        select route_status
        from routes
        where route_id = $1
        limit 1
      `,
      [routeId],
    );

    return {
      route_id: routeId,
      publish_version_id: publishVersionId,
      route_status: routeStatusResult.rows[0]?.route_status ?? row.route_status,
      current_live_publish_version_id: await getCurrentLivePublishVersionId(routeId),
      comment: input.comment,
    };
  },
};
