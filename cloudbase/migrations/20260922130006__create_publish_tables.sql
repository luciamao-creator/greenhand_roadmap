BEGIN;

CREATE TABLE route_publish_versions (
  id BIGSERIAL PRIMARY KEY,
  publish_version_id VARCHAR(64) NOT NULL UNIQUE,
  route_id VARCHAR(64) NOT NULL REFERENCES routes(route_id) ON DELETE RESTRICT,
  schema_version VARCHAR(16) NOT NULL,
  content_version INTEGER NOT NULL,
  geometry_version INTEGER NOT NULL,
  faq_version INTEGER NOT NULL,
  checklist_version INTEGER NOT NULL,
  publish_status VARCHAR(16) NOT NULL DEFAULT 'published',
  generated_at TIMESTAMPTZ NOT NULL,
  published_at TIMESTAMPTZ NOT NULL,
  published_by VARCHAR(64),
  package_checksum VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (content_version >= 1),
  CHECK (geometry_version >= 1),
  CHECK (faq_version >= 1),
  CHECK (checklist_version >= 1),
  CHECK (publish_status IN ('published','rolled_back','invalid'))
);

CREATE TABLE route_packages (
  id BIGSERIAL PRIMARY KEY,
  package_id VARCHAR(64) NOT NULL UNIQUE,
  publish_version_id VARCHAR(64) NOT NULL UNIQUE REFERENCES route_publish_versions(publish_version_id) ON DELETE RESTRICT,
  route_id VARCHAR(64) NOT NULL REFERENCES routes(route_id) ON DELETE RESTRICT,
  package_schema_version VARCHAR(16) NOT NULL,
  package_json JSONB NOT NULL,
  package_size_bytes INTEGER,
  checksum VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (package_size_bytes IS NULL OR package_size_bytes >= 0)
);

COMMIT;
