#!/usr/bin/env bash

set -euo pipefail

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

ensure_node_path
ensure_database_exists

routes_exists="$(psql_db -Atqc "select to_regclass('public.routes') is not null;")"
if [ "$routes_exists" != "t" ]; then
  fail "Schema is not initialized. Run 'bash scripts/run-migrations.sh' first"
fi

export ADMIN_REPOSITORY_DRIVER="${ADMIN_REPOSITORY_DRIVER:-pg}"
export DATABASE_URL="${DATABASE_URL:-$(database_url)}"
export PORT="${PORT:-3001}"

log "Starting Next.js admin backend in pg mode on port $PORT"

cd "$PROJECT_ROOT"
npm run dev -- --port "$PORT"
