BEGIN;

ALTER TABLE route_nodes
  ADD COLUMN generation_basis JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE route_exit_points
  ADD COLUMN generation_basis JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE route_risk_points
  ADD COLUMN generation_basis JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMIT;
