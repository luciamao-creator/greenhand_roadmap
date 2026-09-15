BEGIN;

CREATE TABLE routes (
  id BIGSERIAL PRIMARY KEY,
  route_id VARCHAR(64) NOT NULL UNIQUE,
  route_slug VARCHAR(128) NOT NULL UNIQUE,
  route_name VARCHAR(128) NOT NULL,
  province_code VARCHAR(16) NOT NULL,
  province_name VARCHAR(32) NOT NULL,
  city_name VARCHAR(64) NOT NULL,
  area_name VARCHAR(64),
  route_type VARCHAR(32) NOT NULL,
  map_search_keyword VARCHAR(256),
  route_status VARCHAR(32) NOT NULL,
  agent_prefill_status VARCHAR(16) NOT NULL DEFAULT 'pending',
  map_sync_status VARCHAR(16) NOT NULL DEFAULT 'pending',
  credibility_level VARCHAR(4),
  beginner_friendly_level VARCHAR(16),
  duration_minutes INTEGER,
  distance_km NUMERIC(5,1),
  elevation_gain_m INTEGER,
  max_altitude_m INTEGER,
  best_season_text TEXT,
  start_point_name VARCHAR(128) NOT NULL,
  end_point_name VARCHAR(128) NOT NULL,
  transport_summary TEXT,
  route_logic_summary TEXT,
  exit_logic_summary TEXT,
  easiest_panic_point_text TEXT,
  not_for_whom_text TEXT,
  summary_short TEXT,
  beginner_fit_reason TEXT,
  cover_image_url TEXT,
  last_verified_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  last_prefill_at TIMESTAMPTZ,
  last_map_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by VARCHAR(64),
  updated_by VARCHAR(64),
  CHECK (route_status IN ('candidate','draft','pending_review','approved','published','paused','retired')),
  CHECK (agent_prefill_status IN ('pending','running','completed','failed')),
  CHECK (map_sync_status IN ('pending','running','completed','failed','missing')),
  CHECK (credibility_level IS NULL OR credibility_level IN ('A','B','C')),
  CHECK (beginner_friendly_level IS NULL OR beginner_friendly_level IN ('high','medium','low')),
  CHECK (route_type IN ('loop','out_and_back','one_way')),
  CHECK (duration_minutes IS NULL OR duration_minutes > 0),
  CHECK (distance_km IS NULL OR distance_km > 0),
  CHECK (elevation_gain_m IS NULL OR elevation_gain_m >= 0)
);

CREATE INDEX idx_routes_status_credibility
  ON routes (route_status, credibility_level);

CREATE INDEX idx_routes_region
  ON routes (province_code, city_name);

CREATE INDEX idx_routes_beginner_friendly
  ON routes (beginner_friendly_level);

CREATE INDEX idx_routes_status_prefill_sync
  ON routes (route_status, agent_prefill_status, map_sync_status);

CREATE TRIGGER trg_routes_set_updated_at
BEFORE UPDATE ON routes
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

COMMIT;
