"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import BaiduMapPreview from "../../../../components/BaiduMapPreview";

type RouteWorkspace = {
  route_id: string;
  route_name: string;
  route_status: string;
  province_name: string;
  city_name: string;
  area_name?: string;
  start_point_name: string;
  end_point_name: string;
  route_type: string;
  map_search_keyword?: string;
  agent_prefill_status: string;
  map_sync_status: string;
  completion_ratio: number;
  evidence_coverage_level?: string;
  pending_user_report_count: number;
  risk_summary?: {
    risk_coefficient: number;
    risk_level: "low" | "medium" | "high";
    risk_color_token: "emerald" | "amber" | "rose";
    risk_reason_tags: string[];
  };
  updated_at?: string;
  panels?: {
    route?: {
      route_name?: string;
      area_name?: string;
      start_point_name?: string;
      end_point_name?: string;
      route_type?: string;
      map_search_keyword?: string;
      route_anchor_points?: Array<{
        anchor_name?: string;
        point?: {
          type?: "Point";
          coordinates?: [number, number];
        };
      }>;
      duration_minutes?: number | string;
      distance_km?: number | string;
      elevation_gain_m?: number | string;
      summary_short?: string;
      beginner_fit_reason?: string;
      route_logic_summary?: string;
      exit_logic_summary?: string;
      transport_summary?: string;
      best_season_text?: string;
    };
    route_geometry?: Record<string, any>;
    route_nodes?: Array<Record<string, unknown>>;
    route_exit_points?: Array<Record<string, unknown>>;
    route_risk_points?: Array<Record<string, unknown>>;
    route_tags?: Array<{ tag_code?: string; tag_name?: string }>;
    route_weather_rules?: Array<{
      weather_rule_id?: string;
      scenario_type?: string;
      severity?: string;
      rule_text?: string;
      action_text?: string;
    }>;
    route_checklist_profile?: {
      duration_bucket?: string;
      intensity_bucket?: string;
      terrain_tags?: string[];
      mandatory_supply_codes?: string[];
      emergency_supply_codes?: string[];
      checklist_note_text?: string;
    };
    route_faqs?: Array<{
      faq_id?: string;
      question?: string;
      answer?: string;
      source_basis?: string[];
    }>;
    route_sources?: Array<{
      source_id?: string;
      source_title?: string;
      source_url?: string;
      source_summary?: string;
      raw_text_excerpt?: string;
      credibility_score?: number;
      used_for_fields?: string[];
    }>;
  };
};

type ReviewDetail = {
  route_id: string;
  route_status: string;
  credibility_level?: string;
  blockers?: string[];
  risk_summary?: {
    risk_coefficient: number;
    risk_level: "low" | "medium" | "high";
    risk_color_token: "emerald" | "amber" | "rose";
    risk_reason_tags: string[];
  };
  review_checklist?: Array<{
    code: string;
    title: string;
    status: "passed" | "failed";
    message?: string;
  }>;
};

type PublishPreview = {
  route_id: string;
  preview_job_status: string;
  package_preview?: {
    package_type?: string;
    schema_version?: string;
    faq_count?: number;
    risk_point_count?: number;
    checksum?: string;
  };
  validation_summary?: {
    passed: boolean;
    issues: string[];
  };
};

type PublishVersion = {
  publish_version_id: string;
  package_id?: string;
  publish_status: string;
  version_summary?: string;
  checksum?: string;
  published_at?: string;
  published_by?: string;
};

type StructuredNodeGenerateResult = {
  route_id: string;
  generation_mode: string;
  force_refresh: boolean;
  counts: {
    route_nodes: number;
    route_exit_points: number;
    route_risk_points: number;
  };
};

type MergeTargetType = "route_nodes" | "route_exit_points" | "route_risk_points";

type UserReportItem = {
  report_id: string;
  report_type: "node" | "exit_point" | "risk_point";
  suggestion_action: "add" | "modify" | "delete";
  proposal_title: string;
  proposal_text: string;
  proposal_point?: {
    type: "Point";
    coordinates: [number, number];
  };
  report_status: "pending" | "accepted" | "rejected";
  review_comment?: string;
  merged_target_id?: string;
  merge_target_type?: MergeTargetType;
};

type DraftForm = {
  route_name: string;
  area_name: string;
  start_point_name: string;
  end_point_name: string;
  route_type: "loop" | "out_and_back" | "one_way";
  map_search_keyword: string;
  route_anchor_points: Array<{
    anchor_name: string;
    lng: string;
    lat: string;
  }>;
  summary_short: string;
  beginner_fit_reason: string;
  route_logic_summary: string;
  exit_logic_summary: string;
  transport_summary: string;
  best_season_text: string;
};

const initialDraftForm: DraftForm = {
  route_name: "",
  area_name: "",
  start_point_name: "",
  end_point_name: "",
  route_type: "one_way",
  map_search_keyword: "",
  route_anchor_points: [],
  summary_short: "",
  beginner_fit_reason: "",
  route_logic_summary: "",
  exit_logic_summary: "",
  transport_summary: "",
  best_season_text: "",
};

const statusTheme: Record<string, string> = {
  draft: "bg-amber-50 text-amber-700 border border-amber-200",
  pending_review: "bg-blue-50 text-blue-700 border border-blue-200",
  approved: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  published: "bg-green-50 text-green-700 border border-green-200",
  paused: "bg-gray-100 text-gray-700 border border-gray-200",
  retired: "bg-rose-50 text-rose-700 border border-rose-200",
  candidate: "bg-slate-100 text-slate-700 border border-slate-200",
};

const riskTheme: Record<"low" | "medium" | "high", string> = {
  low: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  medium: "bg-amber-50 text-amber-700 border border-amber-200",
  high: "bg-rose-50 text-rose-700 border border-rose-200",
};

function getRiskLabel(level?: "low" | "medium" | "high") {
  if (level === "high") return "高风险";
  if (level === "medium") return "中风险";
  return "低风险";
}

async function requestAdmin<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.message || "请求失败");
  }
  return payload.data as T;
}

function formatTime(value?: string) {
  if (!value) return "暂无";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatStructuredNodeGenerationMessage(result: StructuredNodeGenerateResult) {
  const parts = [`已生成 ${result.counts.route_nodes} 个关键节点`];
  parts.push(
    result.counts.route_risk_points > 0
      ? `${result.counts.route_risk_points} 个风险点`
      : "未识别到可信风险点",
  );
  parts.push(
    result.counts.route_exit_points > 0
      ? `${result.counts.route_exit_points} 个下撤点`
      : "未识别到可信下撤点",
  );
  return `${parts.join("，")}。`;
}

function getDefaultMergeTarget(reportType: UserReportItem["report_type"]): MergeTargetType {
  if (reportType === "exit_point") {
    return "route_exit_points";
  }
  if (reportType === "risk_point") {
    return "route_risk_points";
  }
  return "route_nodes";
}

function getReportTypeLabel(reportType: UserReportItem["report_type"]) {
  if (reportType === "exit_point") return "下撤点";
  if (reportType === "risk_point") return "风险点";
  return "关键节点";
}

function getSuggestionActionLabel(action: UserReportItem["suggestion_action"]) {
  if (action === "modify") return "修改";
  if (action === "delete") return "删除";
  return "新增";
}

function formatProposalPoint(point?: UserReportItem["proposal_point"]) {
  if (!point?.coordinates) {
    return "未附坐标";
  }
  return `${point.coordinates[0]}, ${point.coordinates[1]}`;
}

function getRouteTypeLabel(routeType?: string) {
  if (routeType === "loop") return "环线";
  if (routeType === "out_and_back") return "往返";
  return "单程";
}

function getRouteTypeBadgeTone(routeType?: string) {
  if (routeType === "loop") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (routeType === "out_and_back") return "border-blue-200 bg-blue-50 text-blue-700";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

function formatRouteAnchorDrafts(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is { anchor_name?: string; point?: { coordinates?: [number, number] } } => typeof item === "object" && item !== null)
    .map((item) => ({
      anchor_name: typeof item.anchor_name === "string" ? item.anchor_name : "",
      lng:
        Array.isArray(item.point?.coordinates) && Number.isFinite(item.point.coordinates[0])
          ? String(item.point.coordinates[0])
          : "",
      lat:
        Array.isArray(item.point?.coordinates) && Number.isFinite(item.point.coordinates[1])
          ? String(item.point.coordinates[1])
          : "",
    }))
    .filter((item) => item.anchor_name.trim() || item.lng.trim() || item.lat.trim());
}

function createEmptyRouteAnchorDraft() {
  return {
    anchor_name: "",
    lng: "",
    lat: "",
  };
}

function toStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function getRecordArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null);
}

function toMapRouteNodes(value: unknown) {
  return getRecordArray(value).map((item, index) => ({
    ...item,
    node_id: typeof item.node_id === "string" ? item.node_id : `node-${index}`,
  }));
}

function toMapExitPoints(value: unknown) {
  return getRecordArray(value).map((item, index) => ({
    ...item,
    exit_point_id: typeof item.exit_point_id === "string" ? item.exit_point_id : `exit-${index}`,
  }));
}

function toMapRiskPoints(value: unknown) {
  return getRecordArray(value).map((item, index) => ({
    ...item,
    risk_point_id: typeof item.risk_point_id === "string" ? item.risk_point_id : `risk-${index}`,
  }));
}

function getStructuredItemTitle(item: Record<string, unknown>) {
  const nodeName = typeof item.node_name === "string" ? item.node_name : undefined;
  const exitName = typeof item.exit_name === "string" ? item.exit_name : undefined;
  const riskTitle = typeof item.risk_title === "string" ? item.risk_title : undefined;
  return nodeName ?? exitName ?? riskTitle ?? "未命名点";
}

function getStructuredItemKind(item: Record<string, unknown>) {
  if (typeof item.node_type === "string") {
    return `节点 / ${item.node_type}`;
  }
  if (typeof item.exit_type === "string") {
    return `下撤 / ${item.exit_type}`;
  }
  if (typeof item.risk_type === "string") {
    return `风险 / ${item.risk_type}`;
  }
  return "结构化点";
}

function getGenerationBasisItems(item: Record<string, unknown>) {
  return getRecordArray(item.generation_basis);
}

function toFiniteNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function formatDistance(value: unknown) {
  const distance = toFiniteNumber(value);
  return typeof distance === "number" ? `${distance.toFixed(distance >= 10 ? 0 : 1)} km` : "待补齐";
}

function formatDuration(value: unknown) {
  const minutes = toFiniteNumber(value);
  if (typeof minutes !== "number") {
    return "待补齐";
  }
  const hours = Math.floor(minutes / 60);
  const remainMinutes = minutes % 60;
  if (hours <= 0) {
    return `${remainMinutes} 分钟`;
  }
  if (remainMinutes === 0) {
    return `${hours} 小时`;
  }
  return `${hours} 小时 ${remainMinutes} 分钟`;
}

function formatElevationGain(value: unknown) {
  const elevationGain = toFiniteNumber(value);
  return typeof elevationGain === "number" ? `${Math.round(elevationGain)} m` : "待补齐";
}

function formatPace(durationValue: unknown, distanceValue: unknown) {
  const minutes = toFiniteNumber(durationValue);
  const distanceKm = toFiniteNumber(distanceValue);
  if (typeof minutes !== "number" || typeof distanceKm !== "number" || distanceKm <= 0) {
    return "待补齐";
  }
  const pace = minutes / distanceKm;
  const paceMinutes = Math.floor(pace);
  const paceSeconds = Math.round((pace - paceMinutes) * 60);
  return `${paceMinutes}'${String(paceSeconds).padStart(2, "0")}" / km`;
}

export default function RouteDetailPage() {
  const params = useParams();
  const router = useRouter();
  const routeId = Array.isArray(params.id) ? params.id[0] : params.id;
  const splitPaneRef = useRef<HTMLDivElement>(null);
  const [route, setRoute] = useState<RouteWorkspace | null>(null);
  const [reviewDetail, setReviewDetail] = useState<ReviewDetail | null>(null);
  const [publishPreview, setPublishPreview] = useState<PublishPreview | null>(null);
  const [publishVersions, setPublishVersions] = useState<PublishVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewCredibility, setReviewCredibility] = useState<"A" | "B" | "C">("A");
  const [publishComment, setPublishComment] = useState("");
  const [draftForm, setDraftForm] = useState<DraftForm>(initialDraftForm);
  const [userReports, setUserReports] = useState<UserReportItem[]>([]);
  const [reportReviewComments, setReportReviewComments] = useState<Record<string, string>>({});
  const [reportMergeTargets, setReportMergeTargets] = useState<Record<string, MergeTargetType>>({});
  const [workspacePanelWidth, setWorkspacePanelWidth] = useState(46);
  const [workspaceCollapsed, setWorkspaceCollapsed] = useState(false);
  const [isResizing, setIsResizing] = useState(false);

  const baiduAk = process.env.NEXT_PUBLIC_BAIDU_MAP_BROWSER_AK ?? "";

  const loadWorkspace = async () => {
    if (!routeId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const [routeData, reviewData, versionData, reportData] = await Promise.all([
        requestAdmin<RouteWorkspace>(`/api/admin/routes/${routeId}`),
        requestAdmin<ReviewDetail>(`/api/admin/routes/${routeId}/review-detail`),
        requestAdmin<{ items: PublishVersion[] }>(`/api/admin/routes/${routeId}/publish-versions`),
        requestAdmin<{ items: UserReportItem[] }>(`/api/admin/routes/${routeId}/user-reports`),
      ]);
      const nextReports = reportData.items || [];
      setRoute(routeData);
      setReviewDetail(reviewData);
      setPublishVersions(versionData.items || []);
      setUserReports(nextReports);
      setReportMergeTargets((current) => {
        const next: Record<string, MergeTargetType> = {};
        for (const report of nextReports) {
          next[report.report_id] =
            current[report.report_id] ?? report.merge_target_type ?? getDefaultMergeTarget(report.report_type);
        }
        return next;
      });
      setReportReviewComments((current) => {
        const next: Record<string, string> = {};
        for (const report of nextReports) {
          next[report.report_id] = current[report.report_id] ?? report.review_comment ?? "";
        }
        return next;
      });
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "加载路线详情失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadWorkspace();
  }, [routeId]);

  useEffect(() => {
    if (!route) {
      return;
    }
    const panelRoute = route.panels?.route ?? {};
    setDraftForm({
      route_name: (panelRoute.route_name as string) || route.route_name || "",
      area_name: (panelRoute.area_name as string) || route.area_name || "",
      start_point_name: (panelRoute.start_point_name as string) || route.start_point_name || "",
      end_point_name: (panelRoute.end_point_name as string) || route.end_point_name || "",
      route_type: ((panelRoute.route_type as DraftForm["route_type"]) || route.route_type || "one_way") as DraftForm["route_type"],
      map_search_keyword: (panelRoute.map_search_keyword as string) || route.map_search_keyword || "",
      route_anchor_points: formatRouteAnchorDrafts(panelRoute.route_anchor_points),
      summary_short: (panelRoute.summary_short as string) || "",
      beginner_fit_reason: (panelRoute.beginner_fit_reason as string) || "",
      route_logic_summary: (panelRoute.route_logic_summary as string) || "",
      exit_logic_summary: (panelRoute.exit_logic_summary as string) || "",
      transport_summary: (panelRoute.transport_summary as string) || "",
      best_season_text: (panelRoute.best_season_text as string) || "",
    });
  }, [route]);

  useEffect(() => {
    if (!isResizing) {
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      const container = splitPaneRef.current;
      if (!container || workspaceCollapsed) {
        return;
      }

      const rect = container.getBoundingClientRect();
      if (rect.width <= 0) {
        return;
      }

      const nextWidth = ((event.clientX - rect.left) / rect.width) * 100;
      const clampedWidth = Math.min(62, Math.max(22, nextWidth));
      setWorkspacePanelWidth(clampedWidth);
    };

    const stopResizing = () => {
      setIsResizing(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", stopResizing);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", stopResizing);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, workspaceCollapsed]);

  useEffect(() => {
    const triggerResize = () => window.dispatchEvent(new Event("resize"));
    const rafId = window.requestAnimationFrame(triggerResize);
    const timerId = window.setTimeout(triggerResize, 180);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(timerId);
    };
  }, [workspaceCollapsed, workspacePanelWidth]);

  const workflowCards = useMemo(() => {
    return [
      { label: "路线主状态", value: route?.route_status || "-", tone: statusTheme[route?.route_status || "draft"] ?? statusTheme.draft },
      { label: "Agent 预填", value: route?.agent_prefill_status || "-" },
      { label: "地图同步", value: route?.map_sync_status || "-" },
      {
        label: "风险系数",
        value: `${route?.risk_summary?.risk_coefficient ?? 0} / ${getRiskLabel(route?.risk_summary?.risk_level)}`,
        tone: riskTheme[route?.risk_summary?.risk_level ?? "low"],
      },
      { label: "完整度", value: `${Math.round((route?.completion_ratio ?? 0) * 100)}%` },
    ];
  }, [route]);

  const metricCards = useMemo(() => {
    const panelRoute = route?.panels?.route;
    return [
      { label: "全程距离", value: formatDistance(panelRoute?.distance_km) },
      { label: "预计时间", value: formatDuration(panelRoute?.duration_minutes) },
      { label: "累计爬升", value: formatElevationGain(panelRoute?.elevation_gain_m) },
      { label: "平均配速", value: formatPace(panelRoute?.duration_minutes, panelRoute?.distance_km) },
    ];
  }, [route]);

  const routeTypeLabel = useMemo(() => getRouteTypeLabel(draftForm.route_type || route?.route_type), [draftForm.route_type, route?.route_type]);

  const generationEvidence = useMemo(() => {
    const panelRoute = route?.panels?.route;
    const textFields = [
      {
        label: "路线摘要",
        field: "summary_short",
        value: panelRoute?.summary_short,
      },
      {
        label: "路线逻辑",
        field: "route_logic_summary",
        value: panelRoute?.route_logic_summary,
      },
      {
        label: "下撤逻辑",
        field: "exit_logic_summary",
        value: panelRoute?.exit_logic_summary,
      },
      {
        label: "新手适配",
        field: "beginner_fit_reason",
        value: panelRoute?.beginner_fit_reason,
      },
      {
        label: "交通摘要",
        field: "transport_summary",
        value: panelRoute?.transport_summary,
      },
      {
        label: "最佳季节",
        field: "best_season_text",
        value: panelRoute?.best_season_text,
      },
    ].filter((item) => item.value && item.value.trim().length > 0);

    const sourceEntries = (route?.panels?.route_sources ?? [])
      .map((source) => ({
        ...source,
        used_for_fields: toStringArray(source.used_for_fields),
      }))
      .filter((source) => {
        if (source.used_for_fields.length === 0) {
          return true;
        }
        return source.used_for_fields.some((field) =>
          ["route_nodes", "route_exit_points", "route_risk_points", "route_logic_summary", "exit_logic_summary"].includes(field),
        );
      })
      .slice(0, 4);

    const faqEntries = (route?.panels?.route_faqs ?? [])
      .map((faq) => ({
        ...faq,
        source_basis: toStringArray(faq.source_basis),
      }))
      .filter((faq) => faq.source_basis.length > 0)
      .slice(0, 3);

    const weatherRules = (route?.panels?.route_weather_rules ?? []).slice(0, 3);
    const checklist = route?.panels?.route_checklist_profile;

    return {
      textFields,
      sourceEntries,
      faqEntries,
      weatherRules,
      checklist,
    };
  }, [route]);

  const runAction = async (key: string, action: () => Promise<void>) => {
    setBusyKey(key);
    setFeedback(null);
    try {
      await action();
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "操作失败",
      });
    } finally {
      setBusyKey(null);
    }
  };

  const handleDraftSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!routeId) return;
    await runAction("save_draft", async () => {
      const routeAnchorPoints = draftForm.route_anchor_points
        .map((item) => {
          const anchorName = item.anchor_name.trim();
          const hasLng = item.lng.trim() !== "";
          const hasLat = item.lat.trim() !== "";
          if (hasLng !== hasLat) {
            throw new Error(`锚点「${anchorName || "未命名锚点"}」的经纬度需要同时填写或同时留空。`);
          }
          const lng = hasLng ? Number(item.lng) : undefined;
          const lat = hasLat ? Number(item.lat) : undefined;
          if ((hasLng && !Number.isFinite(lng)) || (hasLat && !Number.isFinite(lat))) {
            throw new Error(`锚点「${anchorName || "未命名锚点"}」的经纬度格式无效。`);
          }
          if (!anchorName && !hasLng && !hasLat) {
            return null;
          }
          return {
            anchor_name: anchorName || undefined,
            point:
              typeof lng === "number" && typeof lat === "number"
                ? {
                    type: "Point",
                    coordinates: [lng, lat],
                  }
                : undefined,
          };
        })
        .filter(Boolean);
      await requestAdmin(`/api/admin/routes/${routeId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          route: {
            route_name: draftForm.route_name,
            area_name: draftForm.area_name || null,
            start_point_name: draftForm.start_point_name || null,
            end_point_name: draftForm.end_point_name || null,
            route_type: draftForm.route_type,
            map_search_keyword: draftForm.map_search_keyword || null,
            route_anchor_points: routeAnchorPoints,
            summary_short: draftForm.summary_short || null,
            beginner_fit_reason: draftForm.beginner_fit_reason || null,
            route_logic_summary: draftForm.route_logic_summary || null,
            exit_logic_summary: draftForm.exit_logic_summary || null,
            transport_summary: draftForm.transport_summary || null,
            best_season_text: draftForm.best_season_text || null,
          },
        }),
      });
      await loadWorkspace();
      setFeedback({ type: "success", message: "草稿内容已保存。" });
    });
  };

  const handleAgentPrefill = async () => {
    if (!routeId) return;
    await runAction("agent_prefill", async () => {
      await requestAdmin(`/api/admin/routes/${routeId}/agent-prefill`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modules: ["base_facts", "tags", "faq", "sources"],
          force_refresh: true,
        }),
      });
      await loadWorkspace();
      setFeedback({ type: "success", message: "已重新触发 Agent 预填。" });
    });
  };

  const handleMapSync = async () => {
    if (!routeId) return;
    await runAction("map_sync", async () => {
      await requestAdmin(`/api/admin/routes/${routeId}/map-sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sync_scope: ["geometry", "elevation_profile"],
          provider_hint: "baidu",
          force_refresh: true,
        }),
      });
      await loadWorkspace();
      setFeedback({ type: "success", message: "已触发地图同步。" });
    });
  };

  const handleStructuredNodeGenerate = async () => {
    if (!routeId) return;
    await runAction("structured_nodes", async () => {
      const result = await requestAdmin<StructuredNodeGenerateResult>(`/api/admin/routes/${routeId}/structured-nodes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          force_refresh: true,
        }),
      });
      await loadWorkspace();
      setFeedback({
        type: "success",
        message: formatStructuredNodeGenerationMessage(result),
      });
    });
  };

  const handleReviewAction = async (action: "submit_review" | "approve" | "return" | "pause" | "retire") => {
    if (!routeId) return;
    await runAction(action, async () => {
      await requestAdmin(`/api/admin/routes/${routeId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          credibility_level: action === "approve" ? reviewCredibility : undefined,
          comment: reviewComment || undefined,
        }),
      });
      await loadWorkspace();
      setFeedback({ type: "success", message: `已执行动作：${action}` });
    });
  };

  const handlePublishPreview = async () => {
    if (!routeId) return;
    await runAction("publish_preview", async () => {
      const result = await requestAdmin<PublishPreview>(`/api/admin/routes/${routeId}/publish-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force_refresh: true }),
      });
      setPublishPreview(result);
      setFeedback({ type: "success", message: "发布预检已生成。" });
    });
  };

  const handlePublish = async () => {
    if (!routeId) return;
    await runAction("publish", async () => {
      await requestAdmin(`/api/admin/routes/${routeId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: publishComment || undefined }),
      });
      await loadWorkspace();
      setFeedback({ type: "success", message: "路线已发布，并生成了新的发布版本。" });
    });
  };

  const handlePublishVersionAction = async (
    publishVersionId: string,
    action: "pause" | "invalidate" | "restore",
  ) => {
    if (!routeId) return;
    await runAction(`${action}_${publishVersionId}`, async () => {
      await requestAdmin(`/api/admin/routes/${routeId}/publish-versions/${publishVersionId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          comment: publishComment || undefined,
        }),
      });
      await loadWorkspace();
      setFeedback({ type: "success", message: `已执行版本动作：${action}` });
    });
  };

  const handleUserReportReview = async (report: UserReportItem, action: "accept" | "reject") => {
    if (!routeId) return;

    const reviewComment = reportReviewComments[report.report_id]?.trim() || undefined;
    const mergeTargetType =
      action === "accept" && report.suggestion_action !== "delete"
        ? reportMergeTargets[report.report_id] ?? getDefaultMergeTarget(report.report_type)
        : undefined;

    await runAction(`review_report_${report.report_id}_${action}`, async () => {
      await requestAdmin(`/api/admin/routes/${routeId}/user-reports/${report.report_id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          merge_target_type: mergeTargetType,
          review_comment: reviewComment,
        }),
      });
      await loadWorkspace();
      setFeedback({
        type: "success",
        message: action === "accept" ? `已接受建议：${report.proposal_title}` : `已驳回建议：${report.proposal_title}`,
      });
    });
  };

  if (loading) {
    return <div className="p-8 text-gray-500">加载路线详情中...</div>;
  }

  if (loadError) {
    return (
      <div className="p-8">
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-5 py-4 text-rose-700">{loadError}</div>
      </div>
    );
  }

  if (!route) {
    return <div className="p-8 text-red-500">未找到路线</div>;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="z-10 flex min-h-16 flex-shrink-0 items-center justify-between border-b border-gray-200 bg-white px-8 shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-gray-800">{route.route_name}</h1>
          <p className="mt-1 text-xs text-gray-500">
            {route.route_id} | 更新时间：{formatTime(route.updated_at)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/admin/routes")}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700"
          >
            返回列表
          </button>
          <button
            type="button"
            onClick={() => void loadWorkspace()}
            className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white"
          >
            刷新工作台
          </button>
        </div>
      </header>

      <div ref={splitPaneRef} className="flex min-h-0 flex-1 overflow-hidden">
        <div
          className={`min-h-0 overflow-auto bg-gray-50 ${isResizing ? "" : "transition-[width,padding] duration-150 ease-out"}`}
          style={{
            width: workspaceCollapsed ? 0 : `${workspacePanelWidth}%`,
            padding: workspaceCollapsed ? 0 : 24,
            borderRightWidth: workspaceCollapsed ? 0 : 1,
            borderRightStyle: "solid",
            borderRightColor: "rgb(229 231 235)",
          }}
        >
          <section className="mb-6 grid gap-3 md:grid-cols-4">
            {metricCards.map((card) => (
              <div key={card.label} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="text-xs font-semibold text-gray-500">{card.label}</div>
                <div className="mt-2 text-2xl font-bold text-gray-900">{card.value}</div>
              </div>
            ))}
          </section>

          <section className="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="font-medium text-gray-600">路线类型</span>
              <span className={`inline-flex rounded-full border px-3 py-1 font-semibold ${getRouteTypeBadgeTone(draftForm.route_type || route?.route_type)}`}>
                {routeTypeLabel}
              </span>
              <span className="text-gray-500">
                {draftForm.route_type === "loop"
                  ? "建议至少补 1-2 个环线锚点，避免只靠首尾点闭环。"
                  : draftForm.route_type === "out_and_back"
                    ? "建议补 1 个折返点或关键参照点，避免往返线路偏移。"
                    : "单程线可选填中间锚点，用于收紧步道走向。"}
              </span>
            </div>
          </section>

          <section className="mb-6 grid gap-4 md:grid-cols-2">
            {workflowCards.map((card) => (
              <div key={card.label} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="text-xs text-gray-500">{card.label}</div>
                {card.tone ? (
                  <div className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-sm font-semibold ${card.tone}`}>{card.value}</div>
                ) : (
                  <div className="mt-2 text-2xl font-bold text-gray-900">{card.value}</div>
                )}
              </div>
            ))}
          </section>

          {feedback ? (
            <section
              className={`mb-6 rounded-xl border px-5 py-4 text-sm ${
                feedback.type === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-rose-200 bg-rose-50 text-rose-700"
              }`}
            >
              {feedback.message}
            </section>
          ) : null}

          <section className="mb-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <h2 className="text-sm font-bold text-gray-800">主工作流动作</h2>
                <p className="mt-1 text-xs text-gray-500">从草稿到发布的关键动作都集中在这里。</p>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <button
                type="button"
                onClick={() => void handleAgentPrefill()}
                disabled={busyKey !== null}
                className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-left text-sm font-medium text-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busyKey === "agent_prefill" ? "触发中..." : "重新触发 Agent 预填"}
              </button>
              <button
                type="button"
                onClick={() => void handleMapSync()}
                disabled={busyKey !== null}
                className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-left text-sm font-medium text-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busyKey === "map_sync" ? "同步中..." : "触发地图同步"}
              </button>
              <button
                type="button"
                onClick={() => void handleStructuredNodeGenerate()}
                disabled={busyKey !== null}
                className="rounded-lg border border-violet-200 bg-violet-50 px-4 py-3 text-left text-sm font-medium text-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busyKey === "structured_nodes" ? "生成中..." : "生成结构化节点草稿"}
              </button>
              <button
                type="button"
                onClick={() => void handleReviewAction("submit_review")}
                disabled={busyKey !== null}
                className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-left text-sm font-medium text-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busyKey === "submit_review" ? "处理中..." : "送审"}
              </button>
              <button
                type="button"
                onClick={() => void handleReviewAction("approve")}
                disabled={busyKey !== null}
                className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-left text-sm font-medium text-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busyKey === "approve" ? "处理中..." : "审核通过"}
              </button>
              <button
                type="button"
                onClick={() => void handleReviewAction("return")}
                disabled={busyKey !== null}
                className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-left text-sm font-medium text-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busyKey === "return" ? "处理中..." : "退回修改"}
              </button>
              <button
                type="button"
                onClick={() => void handlePublishPreview()}
                disabled={busyKey !== null}
                className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-left text-sm font-medium text-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busyKey === "publish_preview" ? "生成中..." : "生成发布预检"}
              </button>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="font-medium text-gray-700">审核可信度</span>
                <select
                  value={reviewCredibility}
                  onChange={(event) => setReviewCredibility(event.target.value as "A" | "B" | "C")}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none transition focus:border-gray-500"
                >
                  <option value="A">A</option>
                  <option value="B">B</option>
                  <option value="C">C</option>
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium text-gray-700">发布备注</span>
                <input
                  value={publishComment}
                  onChange={(event) => setPublishComment(event.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none transition focus:border-gray-500"
                  placeholder="例如：补齐马峦山结构化节点后首版发布"
                />
              </label>
            </div>

            <label className="mt-4 block space-y-1 text-sm">
              <span className="font-medium text-gray-700">审核备注</span>
              <textarea
                value={reviewComment}
                onChange={(event) => setReviewComment(event.target.value)}
                className="min-h-[88px] w-full rounded-lg border border-gray-300 px-3 py-2 outline-none transition focus:border-gray-500"
                placeholder="记录送审说明、审核意见或退回原因"
              />
            </label>

            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void handlePublish()}
                disabled={busyKey !== null}
                className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-gray-400"
              >
                {busyKey === "publish" ? "发布中..." : "正式发布"}
              </button>
              <button
                type="button"
                onClick={() => void handleReviewAction("pause")}
                disabled={busyKey !== null}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                暂停路线
              </button>
              <button
                type="button"
                onClick={() => void handleReviewAction("retire")}
                disabled={busyKey !== null}
                className="rounded-md border border-rose-200 px-4 py-2 text-sm font-medium text-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                退役路线
              </button>
            </div>
          </section>

          <section className="mb-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <h2 className="text-sm font-bold text-gray-800">投稿与共创建议待审池</h2>
                <p className="mt-1 text-xs text-gray-500">这里统一承接 V1.2 候选路线点位和 V1.3 alpha 节点建议。</p>
              </div>
              <span className="inline-flex rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 border border-rose-200">
                待审 {route.pending_user_report_count}
              </span>
            </div>

            {userReports.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-sm text-gray-500">
                当前没有待审建议。
              </div>
            ) : (
              <div className="space-y-3">
                {userReports.map((report) => {
                  const busyReviewKeyAccept = `review_report_${report.report_id}_accept`;
                  const busyReviewKeyReject = `review_report_${report.report_id}_reject`;
                  const needsMergeTarget = report.suggestion_action !== "delete";
                  const selectedMergeTarget =
                    reportMergeTargets[report.report_id] ?? getDefaultMergeTarget(report.report_type);
                  const lacksPointForAccept = needsMergeTarget && !report.proposal_point;

                  return (
                    <div key={report.report_id} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-gray-900">{report.proposal_title}</div>
                          <div className="mt-1 text-xs text-gray-500">
                            {getReportTypeLabel(report.report_type)} | {getSuggestionActionLabel(report.suggestion_action)} |{" "}
                            {formatProposalPoint(report.proposal_point)}
                          </div>
                        </div>
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                            report.report_status === "accepted"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : report.report_status === "rejected"
                                ? "bg-rose-50 text-rose-700 border border-rose-200"
                                : "bg-amber-50 text-amber-700 border border-amber-200"
                          }`}
                        >
                          {report.report_status === "pending"
                            ? "待审"
                            : report.report_status === "accepted"
                              ? "已接受"
                              : "已驳回"}
                        </span>
                      </div>

                      <div className="mt-3 rounded-lg bg-white p-3 text-sm text-gray-700">{report.proposal_text}</div>

                      {needsMergeTarget ? (
                        <label className="mt-3 block space-y-1 text-sm">
                          <span className="font-medium text-gray-700">接受后合并到</span>
                          <select
                            value={selectedMergeTarget}
                            onChange={(event) =>
                              setReportMergeTargets((current) => ({
                                ...current,
                                [report.report_id]: event.target.value as MergeTargetType,
                              }))
                            }
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none transition focus:border-gray-500"
                            disabled={report.report_status !== "pending" || busyKey !== null}
                          >
                            <option value="route_nodes">关键节点</option>
                            <option value="route_risk_points">风险点</option>
                            <option value="route_exit_points">下撤点</option>
                          </select>
                        </label>
                      ) : null}

                      <label className="mt-3 block space-y-1 text-sm">
                        <span className="font-medium text-gray-700">审核备注</span>
                        <textarea
                          value={reportReviewComments[report.report_id] ?? ""}
                          onChange={(event) =>
                            setReportReviewComments((current) => ({
                              ...current,
                              [report.report_id]: event.target.value,
                            }))
                          }
                          className="min-h-[72px] w-full rounded-lg border border-gray-300 px-3 py-2 outline-none transition focus:border-gray-500"
                          placeholder={report.suggestion_action === "delete" ? "删除建议可直接写审核说明" : "接受可留空，驳回时必须填写原因"}
                          disabled={report.report_status !== "pending" || busyKey !== null}
                        />
                      </label>

                      {lacksPointForAccept ? (
                        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                          这条建议没有坐标，当前不能直接合并为正式点位；如需接受，先补点或让提交方补坐标。
                        </div>
                      ) : null}

                      {report.merged_target_id ? (
                        <div className="mt-3 text-xs text-gray-500">
                          已合并目标：{report.merge_target_type || "-"} / {report.merged_target_id}
                        </div>
                      ) : null}

                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void handleUserReportReview(report, "accept")}
                          disabled={report.report_status !== "pending" || busyKey !== null || lacksPointForAccept}
                          className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {busyKey === busyReviewKeyAccept ? "处理中..." : "接受并合并"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleUserReportReview(report, "reject")}
                          disabled={report.report_status !== "pending" || busyKey !== null}
                          className="rounded-md border border-rose-200 px-3 py-2 text-xs font-medium text-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {busyKey === busyReviewKeyReject ? "处理中..." : "驳回"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="mb-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <h2 className="text-sm font-bold text-gray-800">审核检查清单</h2>
                <p className="mt-1 text-xs text-gray-500">送审前先看基础事实、地图和用户上报是否达到要求。</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusTheme[route.route_status] ?? statusTheme.draft}`}>
                  {route.route_status}
                </span>
                {reviewDetail?.risk_summary ? (
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${riskTheme[reviewDetail.risk_summary.risk_level]}`}>
                    {reviewDetail.risk_summary.risk_coefficient} / {getRiskLabel(reviewDetail.risk_summary.risk_level)}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="space-y-3">
              {(reviewDetail?.review_checklist || []).map((item) => (
                <div key={item.code} className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium text-gray-900">{item.title}</div>
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                        item.status === "passed"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-rose-50 text-rose-700"
                      }`}
                    >
                      {item.status === "passed" ? "通过" : "未通过"}
                    </span>
                  </div>
                  {item.message ? <div className="mt-2 text-sm text-gray-600">{item.message}</div> : null}
                </div>
              ))}

              {reviewDetail?.blockers?.length ? (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {reviewDetail.blockers.join("；")}
                </div>
              ) : null}
              {reviewDetail?.risk_summary?.risk_reason_tags?.length ? (
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-600">
                  风险来源：{reviewDetail.risk_summary.risk_reason_tags.join(" / ")}
                </div>
              ) : null}
            </div>
          </section>

          <section className="mb-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <h2 className="text-sm font-bold text-gray-800">发布预检与版本</h2>
                <p className="mt-1 text-xs text-gray-500">先预检，再决定是否正式发布；已发布版本也可暂停、失效或恢复。</p>
              </div>
            </div>

            {publishPreview ? (
              <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
                <div className="text-sm font-semibold text-gray-900">最新发布预检</div>
                <div className="mt-2 grid gap-2 text-sm text-gray-600 md:grid-cols-2">
                  <div>预检状态：{publishPreview.preview_job_status}</div>
                  <div>Schema：{publishPreview.package_preview?.schema_version || "-"}</div>
                  <div>FAQ 数量：{publishPreview.package_preview?.faq_count ?? 0}</div>
                  <div>风险点数量：{publishPreview.package_preview?.risk_point_count ?? 0}</div>
                </div>
                <div className="mt-3">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                      publishPreview.validation_summary?.passed
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-rose-50 text-rose-700"
                    }`}
                  >
                    {publishPreview.validation_summary?.passed ? "预检通过" : "预检未通过"}
                  </span>
                </div>
                {publishPreview.validation_summary?.issues?.length ? (
                  <ul className="mt-3 space-y-2 text-sm text-rose-700">
                    {publishPreview.validation_summary.issues.map((issue) => (
                      <li key={issue} className="rounded-lg border border-rose-100 bg-white px-3 py-2">
                        {issue}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : (
              <div className="mb-4 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-sm text-gray-500">
                还没有生成发布预检，建议在正式发布前先跑一次。
              </div>
            )}

            <div className="space-y-3">
              {publishVersions.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-sm text-gray-500">
                  暂无发布版本。
                </div>
              ) : (
                publishVersions.map((version) => (
                  <div key={version.publish_version_id} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-gray-900">{version.publish_version_id}</div>
                        <div className="mt-1 text-xs text-gray-500">
                          {version.version_summary || "无版本说明"} | {formatTime(version.published_at)}
                        </div>
                      </div>
                      <span className="inline-flex rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-gray-700 border border-gray-200">
                        {version.publish_status}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void handlePublishVersionAction(version.publish_version_id, "pause")}
                        disabled={busyKey !== null}
                        className="rounded-md border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        暂停线上
                      </button>
                      <button
                        type="button"
                        onClick={() => void handlePublishVersionAction(version.publish_version_id, "invalidate")}
                        disabled={busyKey !== null}
                        className="rounded-md border border-rose-200 px-3 py-2 text-xs font-medium text-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        标记失效
                      </button>
                      <button
                        type="button"
                        onClick={() => void handlePublishVersionAction(version.publish_version_id, "restore")}
                        disabled={busyKey !== null}
                        className="rounded-md border border-emerald-200 px-3 py-2 text-xs font-medium text-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        恢复为当前线上
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="mb-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <h2 className="text-sm font-bold text-gray-800">草稿编辑区</h2>
                <p className="mt-1 text-xs text-gray-500">在这里修正运营可控字段，再继续走预填、送审和发布。</p>
              </div>
            </div>

            <form className="space-y-4" onSubmit={handleDraftSave}>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-1 text-sm">
                  <span className="font-medium text-gray-700">路线名称</span>
                  <input
                    value={draftForm.route_name}
                    onChange={(event) => setDraftForm((current) => ({ ...current, route_name: event.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none transition focus:border-gray-500"
                    required
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-medium text-gray-700">区域</span>
                  <input
                    value={draftForm.area_name}
                    onChange={(event) => setDraftForm((current) => ({ ...current, area_name: event.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none transition focus:border-gray-500"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-medium text-gray-700">起点名称</span>
                  <input
                    value={draftForm.start_point_name}
                    onChange={(event) => setDraftForm((current) => ({ ...current, start_point_name: event.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none transition focus:border-gray-500"
                    required
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-medium text-gray-700">终点名称 / 折返点</span>
                  <input
                    value={draftForm.end_point_name}
                    onChange={(event) => setDraftForm((current) => ({ ...current, end_point_name: event.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none transition focus:border-gray-500"
                    required
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-medium text-gray-700">路线类型</span>
                  <select
                    value={draftForm.route_type}
                    onChange={(event) =>
                      setDraftForm((current) => ({
                        ...current,
                        route_type: event.target.value as DraftForm["route_type"],
                      }))
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none transition focus:border-gray-500"
                  >
                    <option value="one_way">单程</option>
                    <option value="out_and_back">往返</option>
                    <option value="loop">环线</option>
                  </select>
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-medium text-gray-700">地图检索关键词</span>
                  <input
                    value={draftForm.map_search_keyword}
                    onChange={(event) => setDraftForm((current) => ({ ...current, map_search_keyword: event.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none transition focus:border-gray-500"
                    placeholder="例如：广州 东平防火站 凤凰山天池"
                  />
                </label>
                <div className="space-y-3 rounded-lg border border-dashed border-gray-300 p-4 text-sm md:col-span-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-gray-700">中间锚点</div>
                      <p className="mt-1 text-xs text-gray-500">优先填写 1-2 个明确参照地址；经纬度可选，但有经纬度会更稳。</p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setDraftForm((current) => ({
                          ...current,
                          route_anchor_points: [...current.route_anchor_points, createEmptyRouteAnchorDraft()],
                        }))
                      }
                      className="rounded-md border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700"
                    >
                      新增锚点
                    </button>
                  </div>
                  {draftForm.route_anchor_points.length === 0 ? (
                    <div className="rounded-lg bg-gray-50 px-3 py-4 text-xs text-gray-500">当前未设置锚点。环线、往返线建议至少补一个中间参照点。</div>
                  ) : (
                    <div className="space-y-3">
                      {draftForm.route_anchor_points.map((anchor, index) => (
                        <div key={`anchor-${index}`} className="grid gap-3 rounded-lg border border-gray-200 p-3 md:grid-cols-[minmax(0,2fr),minmax(0,1fr),minmax(0,1fr),auto]">
                          <input
                            value={anchor.anchor_name}
                            onChange={(event) =>
                              setDraftForm((current) => ({
                                ...current,
                                route_anchor_points: current.route_anchor_points.map((item, itemIndex) =>
                                  itemIndex === index ? { ...item, anchor_name: event.target.value } : item,
                                ),
                              }))
                            }
                            className="rounded-lg border border-gray-300 px-3 py-2 outline-none transition focus:border-gray-500"
                            placeholder={`锚点 ${index + 1} 名称，例如观景台、步道口、柱里水库`}
                          />
                          <input
                            value={anchor.lng}
                            onChange={(event) =>
                              setDraftForm((current) => ({
                                ...current,
                                route_anchor_points: current.route_anchor_points.map((item, itemIndex) =>
                                  itemIndex === index ? { ...item, lng: event.target.value } : item,
                                ),
                              }))
                            }
                            className="rounded-lg border border-gray-300 px-3 py-2 outline-none transition focus:border-gray-500"
                            placeholder="经度"
                          />
                          <input
                            value={anchor.lat}
                            onChange={(event) =>
                              setDraftForm((current) => ({
                                ...current,
                                route_anchor_points: current.route_anchor_points.map((item, itemIndex) =>
                                  itemIndex === index ? { ...item, lat: event.target.value } : item,
                                ),
                              }))
                            }
                            className="rounded-lg border border-gray-300 px-3 py-2 outline-none transition focus:border-gray-500"
                            placeholder="纬度"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setDraftForm((current) => ({
                                ...current,
                                route_anchor_points: current.route_anchor_points.filter((_, itemIndex) => itemIndex !== index),
                              }))
                            }
                            className="rounded-md border border-rose-200 px-3 py-2 text-xs font-medium text-rose-700"
                          >
                            删除
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <label className="space-y-1 text-sm md:col-span-2">
                  <span className="font-medium text-gray-700">短摘要</span>
                  <textarea
                    value={draftForm.summary_short}
                    onChange={(event) => setDraftForm((current) => ({ ...current, summary_short: event.target.value }))}
                    className="min-h-[84px] w-full rounded-lg border border-gray-300 px-3 py-2 outline-none transition focus:border-gray-500"
                  />
                </label>
                <label className="space-y-1 text-sm md:col-span-2">
                  <span className="font-medium text-gray-700">新手适配理由</span>
                  <textarea
                    value={draftForm.beginner_fit_reason}
                    onChange={(event) => setDraftForm((current) => ({ ...current, beginner_fit_reason: event.target.value }))}
                    className="min-h-[84px] w-full rounded-lg border border-gray-300 px-3 py-2 outline-none transition focus:border-gray-500"
                  />
                </label>
                <label className="space-y-1 text-sm md:col-span-2">
                  <span className="font-medium text-gray-700">路线逻辑摘要</span>
                  <textarea
                    value={draftForm.route_logic_summary}
                    onChange={(event) => setDraftForm((current) => ({ ...current, route_logic_summary: event.target.value }))}
                    className="min-h-[84px] w-full rounded-lg border border-gray-300 px-3 py-2 outline-none transition focus:border-gray-500"
                  />
                </label>
                <label className="space-y-1 text-sm md:col-span-2">
                  <span className="font-medium text-gray-700">下撤逻辑摘要</span>
                  <textarea
                    value={draftForm.exit_logic_summary}
                    onChange={(event) => setDraftForm((current) => ({ ...current, exit_logic_summary: event.target.value }))}
                    className="min-h-[84px] w-full rounded-lg border border-gray-300 px-3 py-2 outline-none transition focus:border-gray-500"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-medium text-gray-700">交通摘要</span>
                  <input
                    value={draftForm.transport_summary}
                    onChange={(event) => setDraftForm((current) => ({ ...current, transport_summary: event.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none transition focus:border-gray-500"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-medium text-gray-700">最佳季节</span>
                  <input
                    value={draftForm.best_season_text}
                    onChange={(event) => setDraftForm((current) => ({ ...current, best_season_text: event.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none transition focus:border-gray-500"
                  />
                </label>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={busyKey !== null}
                  className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-gray-400"
                >
                  {busyKey === "save_draft" ? "保存中..." : "保存草稿"}
                </button>
              </div>
            </form>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <h2 className="text-sm font-bold text-gray-800">当前内容产物</h2>
                <p className="mt-1 text-xs text-gray-500">这里集中看 Agent 预填和地图同步产出的内容密度。</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="grid gap-4 text-sm md:grid-cols-2">
                <div className="rounded-lg bg-gray-50 p-4">
                  <div className="text-xs font-semibold text-gray-600">核心基建事实</div>
                  <div className="mt-3 space-y-2 text-gray-700">
                    <div>区域：{route.province_name} / {route.city_name} / {route.area_name || "暂无"}</div>
                    <div>起点：{route.start_point_name}</div>
                    <div>终点：{route.end_point_name}</div>
                    <div>检索词：{route.map_search_keyword || "暂无"}</div>
                    <div>锚点：{(route.panels?.route?.route_anchor_points ?? []).length || 0}</div>
                  </div>
                </div>
                <div className="rounded-lg bg-gray-50 p-4">
                  <div className="text-xs font-semibold text-gray-600">结构化信息密度</div>
                  <div className="mt-3 space-y-2 text-gray-700">
                    <div>节点：{route.panels?.route_nodes?.length || 0}</div>
                    <div>风险：{route.panels?.route_risk_points?.length || 0}</div>
                    <div>下撤：{route.panels?.route_exit_points?.length || 0}</div>
                    <div>来源：{route.panels?.route_sources?.length || 0}</div>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="mb-1 text-xs font-semibold text-gray-600">短摘要</h3>
                <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-800">{route.panels?.route?.summary_short || "暂无"}</p>
              </div>

              <div>
                <h3 className="mb-1 text-xs font-semibold text-gray-600">结构化节点生成依据</h3>
                <div className="rounded-lg bg-gray-50 p-4">
                  <div className="grid gap-4 text-sm md:grid-cols-2">
                    <div>
                      <div className="font-medium text-gray-800">命中文本字段 ({generationEvidence.textFields.length})</div>
                      <div className="mt-2 space-y-2">
                        {generationEvidence.textFields.length === 0 ? (
                          <div className="text-gray-500">暂无可复用文本字段。</div>
                        ) : (
                          generationEvidence.textFields.map((item) => (
                            <div key={item.field} className="rounded-lg border border-gray-200 bg-white p-3">
                              <div className="text-xs font-semibold text-gray-600">{item.label}</div>
                              <div className="mt-1 text-sm text-gray-700">{item.value}</div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div>
                      <div className="font-medium text-gray-800">来源与摘录 ({generationEvidence.sourceEntries.length})</div>
                      <div className="mt-2 space-y-2">
                        {generationEvidence.sourceEntries.length === 0 ? (
                          <div className="text-gray-500">暂无可直接追溯的来源条目。</div>
                        ) : (
                          generationEvidence.sourceEntries.map((source) => (
                            <div key={source.source_id || source.source_title} className="rounded-lg border border-gray-200 bg-white p-3">
                              <div className="text-sm font-medium text-gray-800">{source.source_title || "未命名来源"}</div>
                              <div className="mt-1 text-xs text-gray-500">
                                覆盖字段：{source.used_for_fields.length > 0 ? source.used_for_fields.join(" / ") : "未标注"}
                              </div>
                              {source.source_summary ? (
                                <div className="mt-2 text-sm text-gray-700">{source.source_summary}</div>
                              ) : null}
                              {source.raw_text_excerpt ? (
                                <div className="mt-2 rounded bg-gray-50 p-2 text-xs leading-5 text-gray-600">{source.raw_text_excerpt}</div>
                              ) : null}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 text-sm md:grid-cols-2">
                    <div>
                      <div className="font-medium text-gray-800">FAQ 依据 ({generationEvidence.faqEntries.length})</div>
                      <div className="mt-2 space-y-2">
                        {generationEvidence.faqEntries.length === 0 ? (
                          <div className="text-gray-500">暂无带来源依据的 FAQ。</div>
                        ) : (
                          generationEvidence.faqEntries.map((faq) => (
                            <div key={faq.faq_id || faq.question} className="rounded-lg border border-gray-200 bg-white p-3">
                              <div className="text-sm font-medium text-gray-800">{faq.question || "未命名 FAQ"}</div>
                              <div className="mt-1 text-xs text-gray-500">{faq.source_basis.join("；")}</div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div>
                      <div className="font-medium text-gray-800">规则补充</div>
                      <div className="mt-2 space-y-2">
                        {generationEvidence.weatherRules.length > 0 ? (
                          generationEvidence.weatherRules.map((rule) => (
                            <div key={rule.weather_rule_id || `${rule.scenario_type}-${rule.severity}`} className="rounded-lg border border-gray-200 bg-white p-3">
                              <div className="text-sm font-medium text-gray-800">
                                {rule.scenario_type || "未命名场景"} / {rule.severity || "未标注等级"}
                              </div>
                              <div className="mt-1 text-sm text-gray-700">{rule.rule_text || "暂无规则文本"}</div>
                              {rule.action_text ? <div className="mt-1 text-xs text-gray-500">动作：{rule.action_text}</div> : null}
                            </div>
                          ))
                        ) : (
                          <div className="rounded-lg border border-gray-200 bg-white p-3 text-gray-500">暂无天气规则参与。</div>
                        )}

                        <div className="rounded-lg border border-gray-200 bg-white p-3">
                          <div className="text-sm font-medium text-gray-800">Checklist 画像</div>
                          {generationEvidence.checklist ? (
                            <div className="mt-1 space-y-1 text-sm text-gray-700">
                              <div>
                                时长 / 强度：{generationEvidence.checklist.duration_bucket || "未标注"} /{" "}
                                {generationEvidence.checklist.intensity_bucket || "未标注"}
                              </div>
                              <div>
                                地形标签：
                                {toStringArray(generationEvidence.checklist.terrain_tags).join(" / ") || "未标注"}
                              </div>
                              <div>
                                必备物资：
                                {toStringArray(generationEvidence.checklist.mandatory_supply_codes).join(" / ") || "未标注"}
                              </div>
                              {generationEvidence.checklist.checklist_note_text ? (
                                <div className="text-xs text-gray-500">{generationEvidence.checklist.checklist_note_text}</div>
                              ) : null}
                            </div>
                          ) : (
                            <div className="mt-1 text-sm text-gray-500">暂无 checklist 画像。</div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="mb-1 text-xs font-semibold text-gray-600">逐点依据预览</h3>
                <div className="space-y-3">
                  {[
                    ...(route.panels?.route_nodes ?? []),
                    ...(route.panels?.route_risk_points ?? []),
                    ...(route.panels?.route_exit_points ?? []),
                  ].length === 0 ? (
                    <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-500">暂无结构化点。</div>
                  ) : (
                    [
                      ...(route.panels?.route_nodes ?? []),
                      ...(route.panels?.route_risk_points ?? []),
                      ...(route.panels?.route_exit_points ?? []),
                    ].map((item, index) => {
                      const record = item as Record<string, unknown>;
                      const basisItems = getGenerationBasisItems(record);
                      return (
                        <div key={`${getStructuredItemTitle(record)}-${index}`} className="rounded-lg bg-gray-50 p-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-sm font-medium text-gray-800">{getStructuredItemTitle(record)}</div>
                            <div className="text-xs text-gray-500">{getStructuredItemKind(record)}</div>
                          </div>
                          {basisItems.length === 0 ? (
                            <div className="mt-2 text-sm text-gray-500">暂无逐点依据。</div>
                          ) : (
                            <div className="mt-2 space-y-2">
                              {basisItems.map((basis, basisIndex) => (
                                <div key={`${getStructuredItemTitle(record)}-basis-${basisIndex}`} className="rounded border border-gray-200 bg-white p-3">
                                  <div className="text-xs font-semibold text-gray-600">
                                    {(typeof basis.label === "string" && basis.label) ||
                                      (typeof basis.basis_type === "string" && basis.basis_type) ||
                                      "依据"}
                                  </div>
                                  {typeof basis.excerpt === "string" && basis.excerpt ? (
                                    <div className="mt-1 text-sm text-gray-700">{basis.excerpt}</div>
                                  ) : null}
                                  {Array.isArray(basis.matched_keywords) && basis.matched_keywords.length > 0 ? (
                                    <div className="mt-1 text-xs text-gray-500">
                                      关键词：{basis.matched_keywords.filter((item) => typeof item === "string").join(" / ")}
                                    </div>
                                  ) : null}
                                  {typeof basis.source_title === "string" && basis.source_title ? (
                                    <div className="mt-1 text-xs text-gray-500">来源：{basis.source_title}</div>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div>
                <h3 className="mb-1 text-xs font-semibold text-gray-600">新手适配理由</h3>
                <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-800">{route.panels?.route?.beginner_fit_reason || "暂无"}</p>
              </div>

              <div>
                <h3 className="mb-1 text-xs font-semibold text-gray-600">智能标签 ({route.panels?.route_tags?.length || 0})</h3>
                <div className="flex flex-wrap gap-2">
                  {(route.panels?.route_tags || []).map((tag) => (
                    <span key={tag.tag_code || tag.tag_name} className="rounded bg-green-50 px-2 py-1 text-xs text-green-700">
                      {tag.tag_name || tag.tag_code}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="mb-1 text-xs font-semibold text-gray-600">FAQ ({route.panels?.route_faqs?.length || 0})</h3>
                <div className="space-y-2">
                  {(route.panels?.route_faqs || []).map((faq) => (
                    <div key={faq.faq_id || faq.question} className="rounded-lg bg-gray-50 p-3 text-sm">
                      <div className="font-medium text-gray-800">Q: {faq.question}</div>
                      <div className="mt-1 text-gray-600">A: {faq.answer}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="mb-1 text-xs font-semibold text-gray-600">来源 ({route.panels?.route_sources?.length || 0})</h3>
                <div className="space-y-2">
                  {(route.panels?.route_sources || []).map((source) => (
                    <div key={source.source_id || source.source_url} className="rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
                      <div className="font-medium text-gray-800">{source.source_title || "未命名来源"}</div>
                      {source.source_url ? (
                        <a href={source.source_url} target="_blank" rel="noreferrer" className="mt-1 block text-blue-600 hover:underline">
                          {source.source_url}
                        </a>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </div>

        <div className="group relative flex w-4 flex-shrink-0 items-stretch justify-center bg-white">
          <div
            onMouseDown={() => {
              if (!workspaceCollapsed) {
                setIsResizing(true);
              }
            }}
            className={`absolute inset-y-0 left-1/2 z-0 w-4 -translate-x-1/2 ${workspaceCollapsed ? "cursor-default" : "cursor-col-resize"}`}
          />
          <div
            className={`absolute inset-y-0 left-1/2 w-px -translate-x-1/2 ${
              isResizing ? "bg-orange-400" : "bg-gray-200 group-hover:bg-gray-300"
            }`}
          />
          <button
            type="button"
            onClick={() => setWorkspaceCollapsed((value) => !value)}
            className="absolute top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 bg-white text-sm font-bold text-gray-700 shadow-sm"
            title={workspaceCollapsed ? "展开工作台" : "收起工作台"}
            aria-label={workspaceCollapsed ? "展开工作台" : "收起工作台"}
          >
            {workspaceCollapsed ? ">" : "<"}
          </button>
        </div>

        <div className="relative min-h-0 min-w-0 flex-1 bg-gray-900">
          {route.panels?.route_geometry?.route_polyline ? (
            <BaiduMapPreview
              ak={baiduAk}
              routePolyline={route.panels.route_geometry.route_polyline}
              overviewCenter={route.panels.route_geometry.overview_center}
              overviewZoom={route.panels.route_geometry.overview_zoom}
              routeNodes={toMapRouteNodes(route.panels?.route_nodes)}
              routeExitPoints={toMapExitPoints(route.panels?.route_exit_points)}
              routeRiskPoints={toMapRiskPoints(route.panels?.route_risk_points)}
              sourceProvider={route.panels?.route_geometry?.source_provider}
              syncedAt={route.panels?.route_geometry?.synced_at}
              startPointName={route.start_point_name}
              endPointName={route.end_point_name}
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400">
              <svg className="mb-4 h-12 w-12 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
                />
              </svg>
              <p>暂无轨迹数据，请先触发地图同步或补录真实路线几何。</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
