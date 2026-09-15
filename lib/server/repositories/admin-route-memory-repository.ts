import type {
  AdminRouteListQueryDTO,
  AgentPrefillStatus,
  AgentPrefillTriggerDTO,
  CreateRouteDraftDTO,
  MapSyncStatus,
  MapSyncTriggerDTO,
  PublishPreviewDTO,
  PublishRouteDTO,
  PublishVersionActionDTO,
  ReportStatus,
  ReviewActionDTO,
  RouteStatus,
  UpdateRouteDraftDTO,
  UserReportListQueryDTO,
  UserReportReviewDTO,
} from "../dto/admin-routes";
import type { CreatePublicUserReportDTO, CreateRouteCandidateDTO, SubmissionPointDTO } from "../dto/public-route-submissions";

type AgentPrefillModule = "base_facts" | "tags" | "faq" | "sources";
type MapSyncScope = "geometry" | "elevation_profile";

type UserReportRecord = {
  report_id: string;
  report_type: "node" | "exit_point" | "risk_point";
  suggestion_action: "add" | "modify" | "delete";
  proposal_title: string;
  proposal_text: string;
  proposal_point?: { type: "Point"; coordinates: [number, number] };
  screenshot_url?: string;
  report_status: ReportStatus;
  review_comment?: string;
  merged_target_id?: string;
  merge_target_type?: "route_nodes" | "route_exit_points" | "route_risk_points";
};

type PublishVersionRecord = {
  publish_version_id: string;
  package_id: string;
  publish_status: "published" | "rolled_back" | "invalid";
  version_summary?: string;
  checksum: string;
  published_at: string;
  published_by?: string;
};

type RouteRecord = {
  route_id: string;
  route_name: string;
  province_name: string;
  province_code: string;
  city_name: string;
  area_name?: string;
  start_point_name: string;
  end_point_name: string;
  route_type: string;
  route_status: RouteStatus;
  map_search_keyword?: string;
  agent_prefill_status: AgentPrefillStatus;
  map_sync_status: MapSyncStatus;
  completion_ratio: number;
  evidence_coverage_level: "low" | "medium" | "high";
  pending_user_report_count: number;
  credibility_level?: "A" | "B" | "C";
  updated_at: string;
  last_prefill_at?: string;
  last_map_synced_at?: string;
  review_comments: Array<{
    action: string;
    comment?: string;
    created_at: string;
  }>;
  publish_versions: PublishVersionRecord[];
  current_live_publish_version_id?: string;
  agent_prefill_modules: Array<{
    module: AgentPrefillModule;
    status: AgentPrefillStatus;
    suggestions_count?: number;
    source_basis?: string[];
  }>;
  map_sync_result?: {
    sync_scope: MapSyncScope[];
    provider_hint?: string;
    source_provider?: string;
    missing_fields: string[];
  };
  user_reports: UserReportRecord[];
  route?: Record<string, unknown>;
  route_geometry?: Record<string, unknown>;
  route_nodes?: Array<Record<string, unknown>>;
  route_exit_points?: Array<Record<string, unknown>>;
  route_risk_points?: Array<Record<string, unknown>>;
  route_tags?: Array<Record<string, unknown>>;
  route_weather_rules?: Array<Record<string, unknown>>;
  route_checklist_profile?: Record<string, unknown>;
  route_faqs?: Array<Record<string, unknown>>;
  route_sources?: Array<Record<string, unknown>>;
};

const provinceCodeMap: Record<string, string> = {
  四川: "sc",
  浙江: "zj",
  广东: "gd",
  福建: "fj",
};

const routeStore = new Map<string, RouteRecord>([
  [
    "zj-hz-jiuxi-longjing-001",
    {
      route_id: "zj-hz-jiuxi-longjing-001",
      route_name: "九溪到龙井轻徒步",
      province_name: "浙江",
      province_code: "zj",
      city_name: "杭州",
      area_name: "西湖景区",
      start_point_name: "九溪公交站",
      end_point_name: "龙井村",
      route_type: "one_way",
      route_status: "draft",
      map_search_keyword: "九溪 龙井 徒步",
      agent_prefill_status: "completed",
      map_sync_status: "completed",
      completion_ratio: 0.78,
      evidence_coverage_level: "medium",
      pending_user_report_count: 1,
      updated_at: "2026-09-05T18:00:00+08:00",
      last_prefill_at: "2026-09-05T16:30:00+08:00",
      last_map_synced_at: "2026-09-05T16:35:00+08:00",
      agent_prefill_modules: [
        { module: "base_facts", status: "completed", suggestions_count: 5, source_basis: ["地图 API", "景区公开信息"] },
        { module: "tags", status: "completed", suggestions_count: 3, source_basis: ["RAG 摘要"] },
        { module: "faq", status: "completed", suggestions_count: 4, source_basis: ["景区公开信息", "用户常见问题"] },
        { module: "sources", status: "completed", suggestions_count: 2, source_basis: ["官方来源", "地图来源"] },
      ],
      review_comments: [],
      publish_versions: [],
      map_sync_result: {
        sync_scope: ["geometry", "elevation_profile"],
        provider_hint: "amap-3d",
        source_provider: "amap",
        missing_fields: [],
      },
      user_reports: [
        {
          report_id: "report_001",
          report_type: "risk_point",
          suggestion_action: "add",
          proposal_title: "雨后石阶湿滑点",
          proposal_text: "用户上报：雨后这里更滑，建议增加风险提醒。",
          screenshot_url: "https://example.com/report-001.jpg",
          report_status: "pending",
        },
      ],
      route: {
        duration_minutes: 150,
        distance_km: 6.2,
        elevation_gain_m: 220,
        summary_short: "西湖周边成熟轻徒步样板线。",
      },
      route_tags: [{ tag_code: "newbie_friendly", tag_name: "新手友好", tag_group: "experience" }],
      route_sources: [{ source_id: "src_001", source_type: "official", source_title: "景区公开信息" }],
      route_faqs: [{ faq_id: "faq_001", question: "适合第一次徒步吗？", reviewed_by_human: false }],
    },
  ],
]);

function nowIso() {
  return new Date().toISOString();
}

function toGeoPoint(point?: SubmissionPointDTO) {
  if (!point) {
    return undefined;
  }
  return {
    type: "Point" as const,
    coordinates: [point.lng, point.lat] as [number, number],
  };
}

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

function toListItem(route: RouteRecord) {
  return {
    route_id: route.route_id,
    route_name: route.route_name,
    province_name: route.province_name,
    city_name: route.city_name,
    route_status: route.route_status,
    completion_ratio: route.completion_ratio,
    evidence_coverage_level: route.evidence_coverage_level,
    pending_user_report_count: route.pending_user_report_count,
    last_updated_at: route.updated_at,
  };
}

function buildReviewDetail(route: RouteRecord) {
  const reviewedSourceCount = route.route_sources?.length ?? 0;
  const checks = [
    {
      check_code: "base_facts_ready",
      check_name: "基础参数是否补齐",
      status: route.agent_prefill_status === "completed" ? "passed" : "failed",
    },
    {
      check_code: "geometry_ready",
      check_name: "地图同步状态是否明确",
      status: route.map_sync_status === "completed" || route.map_sync_status === "missing" ? "passed" : "failed",
    },
    {
      check_code: "user_reports_resolved",
      check_name: "高优先级用户上报是否处理",
      status: route.pending_user_report_count === 0 ? "passed" : "warning",
    },
  ];

  return {
    route_id: route.route_id,
    route_summary: {
      route_name: route.route_name,
      route_status: route.route_status,
      credibility_level_suggestion: route.credibility_level ?? "A",
    },
    completion_summary: {
      base_facts_ready: route.agent_prefill_status === "completed",
      geometry_ready: route.map_sync_status === "completed" || route.map_sync_status === "missing",
      risk_ready: (route.route_risk_points?.length ?? 0) > 0,
      evidence_ready: reviewedSourceCount > 0,
    },
    evidence_summary: {
      reviewed_source_count: reviewedSourceCount,
      coverage_level: route.evidence_coverage_level,
    },
    pending_user_report_count: route.pending_user_report_count,
    review_checklist: checks,
    latest_operation_logs: route.review_comments.slice(-3).map((item) => ({
      operation_type: item.action,
      operator_name: "开发桩",
      created_at: item.created_at,
    })),
  };
}

export const adminRouteMemoryRepository = {
  list(query: AdminRouteListQueryDTO) {
    const page = query.page ?? 1;
    const pageSize = query.page_size ?? 20;
    const filtered = [...routeStore.values()].filter((route) => {
      if (query.route_status && route.route_status !== query.route_status) {
        return false;
      }
      if (query.province_name && route.province_name !== query.province_name) {
        return false;
      }
      if (query.city_name && route.city_name !== query.city_name) {
        return false;
      }
      if (query.evidence_gap_only && route.evidence_coverage_level === "high") {
        return false;
      }
      if (query.risk_gap_only && (route.route_risk_points?.length ?? 0) > 0) {
        return false;
      }
      if (query.faq_unreviewed_only && !(route.route_faqs ?? []).some((faq) => faq.reviewed_by_human === false)) {
        return false;
      }
      return true;
    });

    const start = (page - 1) * pageSize;
    const items = filtered.slice(start, start + pageSize).map(toListItem);

    return {
      page,
      page_size: pageSize,
      has_more: start + pageSize < filtered.length,
      total: filtered.length,
      items,
    };
  },

  getById(routeId: string) {
    return routeStore.get(routeId);
  },

  create(input: CreateRouteDraftDTO) {
    const routeId = buildRouteId(input);
    const created: RouteRecord = {
      route_id: routeId,
      route_name: input.route_name,
      province_name: input.province_name,
      province_code: provinceCodeMap[input.province_name] ?? "cn",
      city_name: input.city_name,
      area_name: input.area_name,
      start_point_name: input.start_point_name,
      end_point_name: input.end_point_name,
      route_type: input.route_type,
      route_status: "draft",
      map_search_keyword: input.map_search_keyword,
      agent_prefill_status: input.trigger_agent_prefill === false ? "pending" : "running",
      map_sync_status: "pending",
      completion_ratio: 0.15,
      evidence_coverage_level: "low",
      pending_user_report_count: 0,
      updated_at: nowIso(),
      review_comments: [],
      publish_versions: [],
      agent_prefill_modules: [
        { module: "base_facts", status: "pending" },
        { module: "tags", status: "pending" },
        { module: "faq", status: "pending" },
        { module: "sources", status: "pending" },
      ],
      user_reports: [],
      route: {},
      route_tags: [],
      route_sources: [],
      route_faqs: [],
    };

    routeStore.set(routeId, created);
    return created;
  },

  createCandidate(input: CreateRouteCandidateDTO) {
    const routeId = buildRouteId({
      route_name: input.route_name,
      province_name: input.province_name,
      city_name: input.city_name,
      area_name: input.area_name,
      start_point_name: input.start_point.point_name,
      end_point_name: input.end_point.point_name,
      route_type: input.route_type,
      trigger_agent_prefill: false,
    });

    const submittedPointReports: UserReportRecord[] = [
      {
        report_id: `${routeId}_start`,
        report_type: "node",
        suggestion_action: "add",
        proposal_title: `起点候选：${input.start_point.point_name}`,
        proposal_text: `用户投稿起点。${input.user_description}`,
        proposal_point: toGeoPoint(input.start_point.point),
        report_status: "pending",
      },
      {
        report_id: `${routeId}_end`,
        report_type: "node",
        suggestion_action: "add",
        proposal_title: `终点候选：${input.end_point.point_name}`,
        proposal_text: `用户投稿终点。${input.user_description}`,
        proposal_point: toGeoPoint(input.end_point.point),
        report_status: "pending",
      },
      ...input.waypoints.map((waypoint, index) => ({
        report_id: `${routeId}_via_${index + 1}`,
        report_type: "node" as const,
        suggestion_action: "add" as const,
        proposal_title: `途经节点：${waypoint.point_name}`,
        proposal_text: `用户投稿途经节点 ${index + 1}。${input.user_description}`,
        proposal_point: toGeoPoint(waypoint.point),
        report_status: "pending" as ReportStatus,
      })),
    ];

    const created: RouteRecord = {
      route_id: routeId,
      route_name: input.route_name,
      province_name: input.province_name,
      province_code: provinceCodeMap[input.province_name] ?? "cn",
      city_name: input.city_name,
      area_name: input.area_name,
      start_point_name: input.start_point.point_name,
      end_point_name: input.end_point.point_name,
      route_type: input.route_type,
      route_status: "candidate",
      agent_prefill_status: "pending",
      map_sync_status: "missing",
      completion_ratio: 0.18,
      evidence_coverage_level: "low",
      pending_user_report_count: submittedPointReports.length,
      updated_at: nowIso(),
      review_comments: [
        {
          action: "candidate_created",
          comment: input.submitter_name ? `投稿人：${input.submitter_name}` : "用户投稿候选路线",
          created_at: nowIso(),
        },
      ],
      publish_versions: [],
      agent_prefill_modules: [
        { module: "base_facts", status: "pending" },
        { module: "tags", status: "pending" },
        { module: "faq", status: "pending" },
        { module: "sources", status: "pending" },
      ],
      user_reports: submittedPointReports,
      route: {
        summary_short: input.user_description,
        route_logic_summary: `用户提交的关键节点：${input.waypoints.map((item) => item.point_name).join(" -> ")}`,
        transport_summary: input.submitter_contact ?? undefined,
        beginner_fit_reason: input.submitter_name ? `投稿人：${input.submitter_name}` : undefined,
      },
      route_tags: [],
      route_sources: [],
      route_faqs: [],
    };

    routeStore.set(routeId, created);
    return created;
  },

  update(routeId: string, patch: UpdateRouteDraftDTO) {
    const existing = routeStore.get(routeId);
    if (!existing) {
      return undefined;
    }

    const next: RouteRecord = {
      ...existing,
      route: patch.route ? { ...(existing.route ?? {}), ...patch.route } : existing.route,
      route_geometry: patch.route_geometry
        ? { ...(existing.route_geometry ?? {}), ...patch.route_geometry }
        : existing.route_geometry,
      route_nodes: patch.route_nodes ?? existing.route_nodes,
      route_exit_points: patch.route_exit_points ?? existing.route_exit_points,
      route_risk_points: patch.route_risk_points ?? existing.route_risk_points,
      route_tags: patch.route_tags ?? existing.route_tags,
      route_weather_rules: patch.route_weather_rules ?? existing.route_weather_rules,
      route_checklist_profile: patch.route_checklist_profile ?? existing.route_checklist_profile,
      route_faqs: patch.route_faqs ?? existing.route_faqs,
      route_sources: patch.route_sources ?? existing.route_sources,
      updated_at: nowIso(),
    };

    const completedSections = [
      next.route && Object.keys(next.route).length > 0,
      next.route_geometry && Object.keys(next.route_geometry).length > 0,
      (next.route_nodes?.length ?? 0) > 0,
      (next.route_exit_points?.length ?? 0) > 0,
      (next.route_risk_points?.length ?? 0) > 0,
      (next.route_tags?.length ?? 0) > 0,
      next.route_checklist_profile && Object.keys(next.route_checklist_profile).length > 0,
      (next.route_faqs?.length ?? 0) > 0,
      (next.route_sources?.length ?? 0) > 0,
    ].filter(Boolean).length;

    next.completion_ratio = Number((completedSections / 9).toFixed(2));
    next.evidence_coverage_level =
      (next.route_sources?.length ?? 0) >= 3 ? "high" : (next.route_sources?.length ?? 0) >= 1 ? "medium" : "low";

    routeStore.set(routeId, next);
    return next;
  },

  triggerAgentPrefill(routeId: string, input: AgentPrefillTriggerDTO) {
    const existing = routeStore.get(routeId);
    if (!existing) {
      return undefined;
    }

    const nextModules = existing.agent_prefill_modules.map((item) =>
      input.modules.includes(item.module)
        ? {
            ...item,
            status: "completed" as AgentPrefillStatus,
            suggestions_count: item.module === "base_facts" ? 5 : item.module === "tags" ? 3 : 2,
            source_basis:
              item.module === "base_facts"
                ? ["地图 API", "公开资料摘要"]
                : item.module === "tags"
                  ? ["标签规则模板"]
                  : ["来源聚合结果"],
          }
        : item,
    );

    const next: RouteRecord = {
      ...existing,
      agent_prefill_status: "completed",
      last_prefill_at: nowIso(),
      agent_prefill_modules: nextModules,
      route: {
        ...(existing.route ?? {}),
        duration_minutes: (existing.route?.duration_minutes as number | undefined) ?? 150,
        distance_km: (existing.route?.distance_km as number | undefined) ?? 6.2,
        elevation_gain_m: (existing.route?.elevation_gain_m as number | undefined) ?? 220,
      },
      updated_at: nowIso(),
    };

    routeStore.set(routeId, next);
    return next;
  },

  getAgentPrefillStatus(routeId: string) {
    const existing = routeStore.get(routeId);
    if (!existing) {
      return undefined;
    }

    return {
      route_id: existing.route_id,
      agent_prefill_status: existing.agent_prefill_status,
      modules: existing.agent_prefill_modules,
      last_completed_at: existing.last_prefill_at,
    };
  },

  triggerMapSync(routeId: string, input: MapSyncTriggerDTO) {
    const existing = routeStore.get(routeId);
    if (!existing) {
      return undefined;
    }

    const missingFields = input.sync_scope.includes("elevation_profile") ? [] : ["elevation_profile"];
    const next: RouteRecord = {
      ...existing,
      map_sync_status: missingFields.length > 0 ? "missing" : "completed",
      last_map_synced_at: nowIso(),
      map_sync_result: {
        sync_scope: input.sync_scope,
        provider_hint: input.provider_hint,
        source_provider: input.provider_hint ? input.provider_hint.replace(/-3d$/, "") : "amap",
        missing_fields: missingFields,
      },
      route_geometry: {
        ...(existing.route_geometry ?? {}),
        source_provider: input.provider_hint ?? "amap-3d",
        synced_at: nowIso(),
      },
      updated_at: nowIso(),
    };

    routeStore.set(routeId, next);
    return next;
  },

  getMapSyncStatus(routeId: string) {
    const existing = routeStore.get(routeId);
    if (!existing) {
      return undefined;
    }

    return {
      route_id: existing.route_id,
      map_sync_status: existing.map_sync_status,
      provider_hint: existing.map_sync_result?.provider_hint,
      source_provider: existing.map_sync_result?.source_provider,
      sync_scope: existing.map_sync_result?.sync_scope ?? [],
      missing_fields: existing.map_sync_result?.missing_fields ?? [],
      last_synced_at: existing.last_map_synced_at,
    };
  },

  createUserReport(routeId: string, input: CreatePublicUserReportDTO) {
    const existing = routeStore.get(routeId);
    if (!existing) {
      return undefined;
    }

    const report: UserReportRecord = {
      report_id: `report_${Date.now().toString(36)}`,
      report_type: input.report_type,
      suggestion_action: input.suggestion_action,
      proposal_title: input.proposal_title,
      proposal_text: input.reporter_name ? `${input.proposal_text}\n投稿人：${input.reporter_name}` : input.proposal_text,
      proposal_point: toGeoPoint(input.proposal_point),
      report_status: "pending",
    };

    existing.user_reports = [report, ...existing.user_reports];
    existing.pending_user_report_count = existing.user_reports.filter((item) => item.report_status === "pending").length;
    existing.updated_at = nowIso();
    routeStore.set(routeId, existing);

    return {
      route_id: routeId,
      report_id: report.report_id,
      report_status: report.report_status,
      pending_user_report_count: existing.pending_user_report_count,
    };
  },

  listUserReports(routeId: string, query: UserReportListQueryDTO) {
    const existing = routeStore.get(routeId);
    if (!existing) {
      return undefined;
    }

    const items = existing.user_reports.filter((report) => {
      if (query.report_type && report.report_type !== query.report_type) {
        return false;
      }
      if (query.report_status && report.report_status !== query.report_status) {
        return false;
      }
      return true;
    });

    return {
      route_id: existing.route_id,
      items,
      total: items.length,
    };
  },

  reviewUserReport(routeId: string, reportId: string, input: UserReportReviewDTO) {
    const existing = routeStore.get(routeId);
    if (!existing) {
      return undefined;
    }

    const report = existing.user_reports.find((item) => item.report_id === reportId);
    if (!report) {
      return null;
    }

    if (input.action === "accept") {
      if (report.suggestion_action !== "delete" && !input.merge_target_type) {
        throw new Error("merge_target_type is required when accepting add/modify report");
      }
      if (report.suggestion_action !== "delete" && !report.proposal_point) {
        throw new Error("该建议未附坐标，请先在后台补点后再转为正式节点");
      }
      report.report_status = "accepted";
      report.merged_target_id = `${input.merge_target_type ?? "target"}_${Date.now().toString().slice(-4)}`;
      report.merge_target_type = input.merge_target_type;
      report.review_comment = input.review_comment;

      if (report.proposal_point && input.merge_target_type === "route_nodes") {
        existing.route_nodes = [
          {
            node_id: report.merged_target_id,
            node_type: "key",
            node_name: report.proposal_title,
            point: report.proposal_point,
            navigation_hint: report.proposal_text,
            display_priority: 100,
            generation_basis: [
              {
                basis_type: "user_report",
                label: "用户共创建议",
                report_id: report.report_id,
                excerpt: report.proposal_text,
              },
            ],
          },
          ...(existing.route_nodes ?? []),
        ];
      }
      if (report.proposal_point && input.merge_target_type === "route_exit_points") {
        existing.route_exit_points = [
          {
            exit_point_id: report.merged_target_id,
            exit_name: report.proposal_title,
            point: report.proposal_point,
            exit_type: "safe_stop",
            exit_condition_text: report.proposal_text,
            exit_action_text: "优先按现场指引下撤，必要时原路返回",
            exit_priority: "secondary",
            generation_basis: [
              {
                basis_type: "user_report",
                label: "用户共创建议",
                report_id: report.report_id,
                excerpt: report.proposal_text,
              },
            ],
          },
          ...(existing.route_exit_points ?? []),
        ];
      }
      if (report.proposal_point && input.merge_target_type === "route_risk_points") {
        existing.route_risk_points = [
          {
            risk_point_id: report.merged_target_id,
            risk_type: "user_reported",
            risk_level: "medium",
            point: report.proposal_point,
            risk_title: report.proposal_title,
            risk_text: report.proposal_text,
            safe_action_text: "放慢通行，必要时原路返回",
            generation_basis: [
              {
                basis_type: "user_report",
                label: "用户共创建议",
                report_id: report.report_id,
                excerpt: report.proposal_text,
              },
            ],
          },
          ...(existing.route_risk_points ?? []),
        ];
      }
    } else {
      report.report_status = "rejected";
      report.review_comment = input.review_comment;
    }

    existing.pending_user_report_count = existing.user_reports.filter((item) => item.report_status === "pending").length;
    existing.updated_at = nowIso();
    routeStore.set(routeId, existing);

    return {
      route_id: existing.route_id,
      report_id: report.report_id,
      report_status: report.report_status,
      merged_target_id: report.merged_target_id,
      review_comment: report.review_comment,
      pending_user_report_count: existing.pending_user_report_count,
    };
  },

  getReviewDetail(routeId: string) {
    const existing = routeStore.get(routeId);
    if (!existing) {
      return undefined;
    }

    return buildReviewDetail(existing);
  },

  runReviewAction(routeId: string, input: ReviewActionDTO) {
    const existing = routeStore.get(routeId);
    if (!existing) {
      return undefined;
    }

    if (input.action === "submit_review") {
      existing.route_status = "pending_review";
    }
    if (input.action === "approve") {
      existing.route_status = "approved";
      existing.credibility_level = input.credibility_level ?? "A";
    }
    if (input.action === "return") {
      existing.route_status = "draft";
    }
    if (input.action === "reject") {
      existing.route_status = "retired";
    }
    if (input.action === "pause") {
      existing.route_status = "paused";
    }
    if (input.action === "retire") {
      existing.route_status = "retired";
    }

    existing.review_comments.push({
      action: input.action,
      comment: input.comment,
      created_at: nowIso(),
    });
    existing.updated_at = nowIso();
    routeStore.set(routeId, existing);

    return {
      route_id: existing.route_id,
      route_status: existing.route_status,
      credibility_level: existing.credibility_level,
      comment: input.comment,
      review_checklist_summary: buildReviewDetail(existing).review_checklist,
    };
  },

  createPublishPreview(routeId: string, input: PublishPreviewDTO) {
    const existing = routeStore.get(routeId);
    if (!existing) {
      return undefined;
    }

    return {
      route_id: existing.route_id,
      preview_job_status: "completed",
      package_preview: {
        package_type: "route_package",
        schema_version: "1.0.0",
        faq_count: existing.route_faqs?.length ?? 0,
        risk_point_count: existing.route_risk_points?.length ?? 0,
        checksum: `sha256:preview_${existing.route_id}_${input.force_refresh ? "fresh" : "cached"}`,
      },
      validation_summary: {
        passed: existing.route_status === "approved" || existing.route_status === "published",
        issues:
          existing.route_status === "approved" || existing.route_status === "published"
            ? []
            : ["route status is not approved yet"],
      },
    };
  },

  publish(routeId: string, input: PublishRouteDTO) {
    const existing = routeStore.get(routeId);
    if (!existing) {
      return undefined;
    }

    const versionNumber = existing.publish_versions.length + 1;
    const publishVersionId = `pub_${existing.route_id}_v${versionNumber}`;
    const packageId = `pkg_${existing.route_id}_v${versionNumber}`;
    const publishedAt = nowIso();

    const version: PublishVersionRecord = {
      publish_version_id: publishVersionId,
      package_id: packageId,
      publish_status: "published",
      version_summary: input.comment ?? `第 ${versionNumber} 次发布`,
      checksum: `sha256:${publishVersionId}`,
      published_at: publishedAt,
      published_by: "开发桩",
    };

    existing.route_status = "published";
    existing.publish_versions = [version, ...existing.publish_versions];
    existing.current_live_publish_version_id = publishVersionId;
    existing.updated_at = publishedAt;
    routeStore.set(routeId, existing);

    return {
      route_id: existing.route_id,
      route_status: existing.route_status,
      publish_version_id: publishVersionId,
      package_id: packageId,
      published_at: publishedAt,
    };
  },

  listPublishVersions(routeId: string) {
    const existing = routeStore.get(routeId);
    if (!existing) {
      return undefined;
    }

    return {
      route_id: existing.route_id,
      items: existing.publish_versions,
      current_live_publish_version_id: existing.current_live_publish_version_id,
    };
  },

  runPublishVersionAction(routeId: string, publishVersionId: string, input: PublishVersionActionDTO) {
    const existing = routeStore.get(routeId);
    if (!existing) {
      return undefined;
    }

    const version = existing.publish_versions.find((item) => item.publish_version_id === publishVersionId);
    if (!version) {
      return null;
    }

    if (input.action === "pause") {
      existing.route_status = "paused";
    }
    if (input.action === "invalidate") {
      version.publish_status = "invalid";
    }
    if (input.action === "restore") {
      existing.route_status = "published";
      existing.current_live_publish_version_id = version.publish_version_id;
      version.publish_status = "published";
    }

    existing.updated_at = nowIso();
    routeStore.set(routeId, existing);

    return {
      route_id: existing.route_id,
      publish_version_id: version.publish_version_id,
      route_status: existing.route_status,
      current_live_publish_version_id: existing.current_live_publish_version_id,
      comment: input.comment,
    };
  },
};
