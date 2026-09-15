#!/usr/bin/env bash

set -euo pipefail

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

ensure_database_exists

log "Ensuring schema_migrations tracking table"
psql_db -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
CREATE TABLE IF NOT EXISTS schema_migrations (
  filename VARCHAR(255) PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
SQL

migration_count="$(psql_db -Atqc "select count(*) from schema_migrations;")"
routes_exists="$(psql_db -Atqc "select to_regclass('public.routes') is not null;")"

shopt -s nullglob
migration_files=("$PROJECT_ROOT"/db/migrations/*.sql)

if [ ${#migration_files[@]} -eq 0 ]; then
  fail "No migration files found in $PROJECT_ROOT/db/migrations"
fi

if [ "$migration_count" = "0" ] && [ "$routes_exists" = "t" ]; then
  log "Detected existing schema without migration history, baselining current migration files"
  for file in "${migration_files[@]}"; do
    filename="$(basename "$file")"
    psql_db -v ON_ERROR_STOP=1 -c \
      "insert into schema_migrations (filename) values ('$filename') on conflict (filename) do nothing;" \
      >/dev/null
  done
fi

for file in "${migration_files[@]}"; do
  filename="$(basename "$file")"
  applied="$(psql_db -Atqc "select 1 from schema_migrations where filename = '$filename';")"

  if [ "$applied" = "1" ]; then
    log "Skipping $filename"
    continue
  fi

  log "Applying $filename"
  psql_db -v ON_ERROR_STOP=1 -f "$file" >/dev/null
  psql_db -v ON_ERROR_STOP=1 -c \
    "insert into schema_migrations (filename) values ('$filename');" \
    >/dev/null
done

log "Migrations complete"
