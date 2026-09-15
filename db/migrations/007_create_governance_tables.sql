BEGIN;

CREATE TABLE admin_operation_logs (
  id BIGSERIAL PRIMARY KEY,
  operator_id VARCHAR(64),
  operator_name VARCHAR(128),
  action_type VARCHAR(64) NOT NULL,
  target_type VARCHAR(64) NOT NULL,
  target_id VARCHAR(64) NOT NULL,
  before_snapshot JSONB,
  after_snapshot JSONB,
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE admin_async_jobs (
  id BIGSERIAL PRIMARY KEY,
  job_id VARCHAR(64) NOT NULL UNIQUE,
  job_type VARCHAR(32) NOT NULL,
  route_id VARCHAR(64) NOT NULL REFERENCES routes(route_id) ON DELETE RESTRICT,
  job_status VARCHAR(16) NOT NULL DEFAULT 'pending',
  payload_json JSONB,
  result_json JSONB,
  retry_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_by VARCHAR(64),
  CHECK (job_type IN ('agent_prefill','map_sync','publish_preview','publish_package')),
  CHECK (job_status IN ('pending','running','succeeded','failed','cancelled')),
  CHECK (retry_count >= 0)
);

COMMIT;
