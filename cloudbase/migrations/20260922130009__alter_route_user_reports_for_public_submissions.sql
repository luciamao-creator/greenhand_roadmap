BEGIN;

ALTER TABLE route_user_reports
  ALTER COLUMN proposal_point DROP NOT NULL;

ALTER TABLE route_user_reports
  ADD COLUMN proposal_action VARCHAR(16) NOT NULL DEFAULT 'add',
  ADD COLUMN merge_target_type VARCHAR(32);

ALTER TABLE route_user_reports
  ADD CONSTRAINT chk_route_user_reports_proposal_action
  CHECK (proposal_action IN ('add', 'modify', 'delete'));

ALTER TABLE route_user_reports
  ADD CONSTRAINT chk_route_user_reports_merge_target_type
  CHECK (
    merge_target_type IS NULL
    OR merge_target_type IN ('route_nodes', 'route_exit_points', 'route_risk_points')
  );

COMMIT;
