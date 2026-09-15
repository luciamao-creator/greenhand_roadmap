export type RouteStatus =
  | "candidate"
  | "draft"
  | "pending_review"
  | "approved"
  | "published"
  | "paused"
  | "retired";

export type RouteType = "loop" | "out_and_back" | "one_way";
export type AgentPrefillStatus = "pending" | "running" | "completed" | "failed";
export type MapSyncStatus = "pending" | "running" | "completed" | "failed" | "missing";
export type ReportType = "node" | "exit_point" | "risk_point";
export type ReportStatus = "pending" | "accepted" | "rejected";
export type ReviewAction = "submit_review" | "approve" | "return" | "reject" | "pause" | "retire";
export type PublishVersionAction = "pause" | "invalidate" | "restore";

export type AdminRouteListQueryDTO = {
  route_status?: RouteStatus;
  province_name?: string;
  city_name?: string;
  evidence_gap_only?: boolean;
  risk_gap_only?: boolean;
  faq_unreviewed_only?: boolean;
  page?: number;
  page_size?: number;
};

export type CreateRouteDraftDTO = {
  route_name: string;
  province_name: string;
  city_name: string;
  area_name?: string;
  start_point_name: string;
  end_point_name: string;
  route_type: RouteType;
  map_search_keyword?: string;
  trigger_agent_prefill?: boolean;
};

export type AgentPrefillTriggerDTO = {
  modules: Array<"base_facts" | "tags" | "faq" | "sources">;
  force_refresh?: boolean;
};

export type MapSyncTriggerDTO = {
  sync_scope: Array<"geometry" | "elevation_profile">;
  provider_hint?: string;
  force_refresh?: boolean;
};

export type StructuredNodeGenerateDTO = {
  force_refresh?: boolean;
};

export type UserReportListQueryDTO = {
  report_type?: ReportType;
  report_status?: ReportStatus;
};

export type UserReportReviewDTO = {
  action: "accept" | "reject";
  merge_target_type?: "route_nodes" | "route_exit_points" | "route_risk_points";
  review_comment?: string;
};

export type ReviewActionDTO = {
  action: ReviewAction;
  credibility_level?: "A" | "B" | "C";
  comment?: string;
};

export type PublishPreviewDTO = {
  force_refresh?: boolean;
};

export type PublishRouteDTO = {
  comment?: string;
};

export type PublishVersionActionDTO = {
  action: PublishVersionAction;
  comment?: string;
};

export type UpdateRouteDraftDTO = {
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
