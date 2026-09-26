BEGIN;

CREATE TABLE supply_items (
  id BIGSERIAL PRIMARY KEY,
  supply_code VARCHAR(64) NOT NULL UNIQUE,
  supply_name VARCHAR(128) NOT NULL,
  supply_group VARCHAR(32) NOT NULL,
  default_required BOOLEAN NOT NULL DEFAULT false,
  description TEXT,
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (supply_group IN ('basic','weather','emergency','optional')),
  CHECK (status IN ('active','inactive'))
);

CREATE TABLE checklist_rule_templates (
  id BIGSERIAL PRIMARY KEY,
  rule_code VARCHAR(64) NOT NULL UNIQUE,
  rule_name VARCHAR(128) NOT NULL,
  applicable_duration_bucket VARCHAR(32),
  applicable_intensity_bucket VARCHAR(32),
  applicable_weather_scenario VARCHAR(32),
  applicable_terrain_tag VARCHAR(64),
  supply_code VARCHAR(64) NOT NULL REFERENCES supply_items(supply_code) ON DELETE RESTRICT,
  required_level VARCHAR(16) NOT NULL,
  reason_template TEXT,
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (required_level IN ('required','recommended','conditional')),
  CHECK (status IN ('active','inactive'))
);

CREATE TRIGGER trg_supply_items_set_updated_at
BEFORE UPDATE ON supply_items
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_checklist_rule_templates_set_updated_at
BEFORE UPDATE ON checklist_rule_templates
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

COMMIT;
