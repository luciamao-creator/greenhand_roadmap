BEGIN;

ALTER TABLE routes
  ADD COLUMN route_anchor_points JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMIT;
