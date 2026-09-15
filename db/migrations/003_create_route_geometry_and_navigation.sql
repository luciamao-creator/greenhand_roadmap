BEGIN;

CREATE TABLE route_geometries (
  id BIGSERIAL PRIMARY KEY,
  route_id VARCHAR(64) NOT NULL UNIQUE REFERENCES routes(route_id) ON DELETE RESTRICT,
  geometry_version INTEGER NOT NULL,
  route_polyline geometry(LineString, 4326) NOT NULL,
  start_point geometry(Point, 4326) NOT NULL,
  end_point geometry(Point, 4326) NOT NULL,
  overview_center geometry(Point, 4326) NOT NULL,
  bounding_box geometry(Polygon, 4326) NOT NULL,
  overview_zoom NUMERIC(4,1),
  elevation_profile_points JSONB,
  map_provider_hint VARCHAR(64),
  source_provider VARCHAR(64),
  synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (geometry_version >= 1)
);

CREATE TABLE route_stages (
  id BIGSERIAL PRIMARY KEY,
  stage_id VARCHAR(64) NOT NULL UNIQUE,
  route_id VARCHAR(64) NOT NULL REFERENCES routes(route_id) ON DELETE RESTRICT,
  stage_order INTEGER NOT NULL,
  stage_name VARCHAR(64) NOT NULL,
  stage_type VARCHAR(32) NOT NULL,
  start_node_id VARCHAR(64),
  end_node_id VARCHAR(64),
  stage_summary TEXT NOT NULL,
  expected_duration_minutes INTEGER,
  stage_risk_hint TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (stage_order >= 1),
  CHECK (stage_type IN ('approach','climb','traverse','descent','exit')),
  CHECK (expected_duration_minutes IS NULL OR expected_duration_minutes > 0),
  UNIQUE(route_id, stage_order)
);

CREATE TABLE route_nodes (
  id BIGSERIAL PRIMARY KEY,
  node_id VARCHAR(64) NOT NULL UNIQUE,
  route_id VARCHAR(64) NOT NULL REFERENCES routes(route_id) ON DELETE RESTRICT,
  node_type VARCHAR(32) NOT NULL,
  node_name VARCHAR(128) NOT NULL,
  point geometry(Point, 4326) NOT NULL,
  stage_order INTEGER,
  distance_from_start_m INTEGER,
  trigger_radius_m INTEGER NOT NULL,
  navigation_hint TEXT NOT NULL,
  wrong_choice_hint TEXT,
  display_priority INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (node_type IN ('start','end','key','fork','view','checkpoint')),
  CHECK (stage_order IS NULL OR stage_order >= 1),
  CHECK (distance_from_start_m IS NULL OR distance_from_start_m >= 0),
  CHECK (trigger_radius_m > 0)
);

CREATE TABLE route_exit_points (
  id BIGSERIAL PRIMARY KEY,
  exit_point_id VARCHAR(64) NOT NULL UNIQUE,
  route_id VARCHAR(64) NOT NULL REFERENCES routes(route_id) ON DELETE RESTRICT,
  exit_name VARCHAR(128) NOT NULL,
  point geometry(Point, 4326) NOT NULL,
  stage_order INTEGER,
  exit_type VARCHAR(32) NOT NULL,
  exit_condition_text TEXT NOT NULL,
  exit_action_text TEXT NOT NULL,
  exit_priority VARCHAR(16) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (stage_order IS NULL OR stage_order >= 1),
  CHECK (exit_type IN ('return','transport','safe_stop','scenic_turnback')),
  CHECK (exit_priority IN ('primary','secondary'))
);

CREATE TABLE route_risk_points (
  id BIGSERIAL PRIMARY KEY,
  risk_point_id VARCHAR(64) NOT NULL UNIQUE,
  route_id VARCHAR(64) NOT NULL REFERENCES routes(route_id) ON DELETE RESTRICT,
  risk_type VARCHAR(32) NOT NULL,
  risk_level VARCHAR(16) NOT NULL,
  point geometry(Point, 4326) NOT NULL,
  stage_order INTEGER,
  risk_title VARCHAR(128) NOT NULL,
  risk_text TEXT NOT NULL,
  safe_action_text TEXT NOT NULL,
  trigger_radius_m INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (stage_order IS NULL OR stage_order >= 1),
  CHECK (risk_level IN ('low','medium','high')),
  CHECK (trigger_radius_m > 0)
);

CREATE TRIGGER trg_route_geometries_set_updated_at
BEFORE UPDATE ON route_geometries
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_route_stages_set_updated_at
BEFORE UPDATE ON route_stages
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_route_nodes_set_updated_at
BEFORE UPDATE ON route_nodes
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_route_exit_points_set_updated_at
BEFORE UPDATE ON route_exit_points
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_route_risk_points_set_updated_at
BEFORE UPDATE ON route_risk_points
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

COMMIT;
