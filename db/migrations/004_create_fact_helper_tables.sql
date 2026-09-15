BEGIN;

CREATE TABLE route_tags (
  id BIGSERIAL PRIMARY KEY,
  route_id VARCHAR(64) NOT NULL REFERENCES routes(route_id) ON DELETE RESTRICT,
  tag_group VARCHAR(32) NOT NULL,
  tag_code VARCHAR(64) NOT NULL,
  tag_name VARCHAR(64) NOT NULL,
  is_core BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(route_id, tag_code)
);

CREATE TABLE route_weather_rules (
  id BIGSERIAL PRIMARY KEY,
  weather_rule_id VARCHAR(64) NOT NULL UNIQUE,
  route_id VARCHAR(64) NOT NULL REFERENCES routes(route_id) ON DELETE RESTRICT,
  scenario_type VARCHAR(32) NOT NULL,
  severity VARCHAR(16) NOT NULL,
  rule_text TEXT NOT NULL,
  action_text TEXT NOT NULL,
  threshold_config JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (scenario_type IN ('rain','thunder','heat','cold','wind','late_start')),
  CHECK (severity IN ('warn','avoid'))
);

CREATE TABLE route_checklist_profiles (
  id BIGSERIAL PRIMARY KEY,
  route_id VARCHAR(64) NOT NULL UNIQUE REFERENCES routes(route_id) ON DELETE RESTRICT,
  duration_bucket VARCHAR(32) NOT NULL,
  intensity_bucket VARCHAR(32) NOT NULL,
  terrain_tags JSONB NOT NULL,
  weather_sensitive_tags JSONB,
  mandatory_supply_codes JSONB NOT NULL,
  optional_supply_codes JSONB,
  emergency_supply_codes JSONB,
  checklist_note_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (duration_bucket IN ('half_day','one_day','long_half_day')),
  CHECK (intensity_bucket IN ('easy','moderate'))
);

CREATE TABLE route_faqs (
  id BIGSERIAL PRIMARY KEY,
  faq_id VARCHAR(64) NOT NULL UNIQUE,
  route_id VARCHAR(64) NOT NULL REFERENCES routes(route_id) ON DELETE RESTRICT,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  source_basis JSONB NOT NULL,
  generated_by_ai BOOLEAN NOT NULL DEFAULT false,
  reviewed_by_human BOOLEAN NOT NULL DEFAULT false,
  display_order INTEGER NOT NULL DEFAULT 100,
  embedding vector(1536),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE route_sources (
  id BIGSERIAL PRIMARY KEY,
  source_id VARCHAR(64) NOT NULL UNIQUE,
  route_id VARCHAR(64) NOT NULL REFERENCES routes(route_id) ON DELETE RESTRICT,
  source_type VARCHAR(32) NOT NULL,
  source_title VARCHAR(256) NOT NULL,
  source_url TEXT,
  source_summary TEXT NOT NULL,
  credibility_score INTEGER NOT NULL,
  used_for_fields JSONB NOT NULL,
  raw_text_excerpt TEXT,
  embedding vector(1536),
  checked_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (source_type IN ('official','map','travel_note','video','local_notice')),
  CHECK (credibility_score BETWEEN 1 AND 100)
);

CREATE TABLE route_user_reports (
  id BIGSERIAL PRIMARY KEY,
  report_id VARCHAR(64) NOT NULL UNIQUE,
  route_id VARCHAR(64) NOT NULL REFERENCES routes(route_id) ON DELETE RESTRICT,
  report_type VARCHAR(32) NOT NULL,
  proposal_title VARCHAR(128) NOT NULL,
  proposal_point geometry(Point, 4326) NOT NULL,
  proposal_text TEXT NOT NULL,
  screenshot_url TEXT,
  report_status VARCHAR(16) NOT NULL DEFAULT 'pending',
  review_comment TEXT,
  merged_target_id VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by VARCHAR(64),
  updated_by VARCHAR(64),
  CHECK (report_type IN ('node','exit_point','risk_point')),
  CHECK (report_status IN ('pending','accepted','rejected'))
);

CREATE TRIGGER trg_route_tags_set_updated_at
BEFORE UPDATE ON route_tags
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_route_weather_rules_set_updated_at
BEFORE UPDATE ON route_weather_rules
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_route_checklist_profiles_set_updated_at
BEFORE UPDATE ON route_checklist_profiles
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_route_faqs_set_updated_at
BEFORE UPDATE ON route_faqs
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_route_sources_set_updated_at
BEFORE UPDATE ON route_sources
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_route_user_reports_set_updated_at
BEFORE UPDATE ON route_user_reports
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

COMMIT;
