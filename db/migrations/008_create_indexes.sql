BEGIN;

CREATE INDEX idx_route_geometries_route_polyline_gist
  ON route_geometries USING GIST (route_polyline);

CREATE INDEX idx_route_geometries_start_point_gist
  ON route_geometries USING GIST (start_point);

CREATE INDEX idx_route_geometries_end_point_gist
  ON route_geometries USING GIST (end_point);

CREATE INDEX idx_route_geometries_bounding_box_gist
  ON route_geometries USING GIST (bounding_box);

CREATE INDEX idx_route_stages_route_id
  ON route_stages (route_id);

CREATE INDEX idx_route_nodes_route_type
  ON route_nodes (route_id, node_type);

CREATE INDEX idx_route_nodes_stage_order
  ON route_nodes (route_id, stage_order);

CREATE INDEX idx_route_nodes_point_gist
  ON route_nodes USING GIST (point);

CREATE INDEX idx_route_exit_points_route_stage
  ON route_exit_points (route_id, stage_order);

CREATE INDEX idx_route_exit_points_point_gist
  ON route_exit_points USING GIST (point);

CREATE INDEX idx_route_risk_points_route_stage
  ON route_risk_points (route_id, stage_order);

CREATE INDEX idx_route_risk_points_point_gist
  ON route_risk_points USING GIST (point);

CREATE INDEX idx_route_faqs_route_review_order
  ON route_faqs (route_id, reviewed_by_human, display_order);

CREATE INDEX idx_route_sources_route_type
  ON route_sources (route_id, source_type);

CREATE INDEX idx_route_sources_route_credibility
  ON route_sources (route_id, credibility_score);

CREATE INDEX idx_route_user_reports_route_status
  ON route_user_reports (route_id, report_type, report_status);

CREATE INDEX idx_route_user_reports_point_gist
  ON route_user_reports USING GIST (proposal_point);

CREATE INDEX idx_supply_items_group_status
  ON supply_items (supply_group, status);

CREATE INDEX idx_checklist_rule_templates_duration_intensity
  ON checklist_rule_templates (applicable_duration_bucket, applicable_intensity_bucket);

CREATE INDEX idx_checklist_rule_templates_weather_terrain
  ON checklist_rule_templates (applicable_weather_scenario, applicable_terrain_tag);

CREATE INDEX idx_checklist_rule_templates_supply_status
  ON checklist_rule_templates (supply_code, status);

CREATE INDEX idx_route_publish_versions_route_published_at
  ON route_publish_versions (route_id, published_at DESC);

CREATE INDEX idx_route_publish_versions_route_status
  ON route_publish_versions (route_id, publish_status);

CREATE INDEX idx_route_packages_route_created_at
  ON route_packages (route_id, created_at DESC);

CREATE INDEX idx_route_packages_package_json
  ON route_packages USING GIN (package_json);

CREATE INDEX idx_admin_operation_logs_target_created_at
  ON admin_operation_logs (target_type, target_id, created_at DESC);

CREATE INDEX idx_admin_operation_logs_operator_created_at
  ON admin_operation_logs (operator_id, created_at DESC);

CREATE INDEX idx_admin_operation_logs_action_created_at
  ON admin_operation_logs (action_type, created_at DESC);

CREATE INDEX idx_admin_async_jobs_route_created_at
  ON admin_async_jobs (route_id, created_at DESC);

CREATE INDEX idx_admin_async_jobs_type_status_created_at
  ON admin_async_jobs (job_type, job_status, created_at DESC);

CREATE INDEX idx_admin_async_jobs_status_created_at
  ON admin_async_jobs (job_status, created_at DESC);

CREATE INDEX idx_route_faqs_embedding_hnsw
  ON route_faqs USING hnsw (embedding vector_cosine_ops);

CREATE INDEX idx_route_sources_embedding_hnsw
  ON route_sources USING hnsw (embedding vector_cosine_ops);

COMMIT;
