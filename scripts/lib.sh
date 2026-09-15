#!/usr/bin/env bash

set -euo pipefail

PROJECT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
TOOLS_DIR="$PROJECT_ROOT/.tools"
LOCAL_NODE_BIN_DIR="$TOOLS_DIR/node/bin"
LOCAL_POSTGRES_MOUNT="$TOOLS_DIR/PostgresMount"
LOCAL_POSTGRES_APP="$LOCAL_POSTGRES_MOUNT/Postgres.app"
LOCAL_POSTGRES_DMG="$TOOLS_DIR/Postgres-2.9.6-16.dmg"

PGDATA_DIR="${PGDATA_DIR:-$TOOLS_DIR/pgdata}"
PGLOG_FILE="${PGLOG_FILE:-$TOOLS_DIR/postgres.log}"
PGHOST="${PGHOST:-127.0.0.1}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-postgres}"
PGDATABASE="${PGDATABASE:-hiking_route_admin}"

log() {
  printf '[route-admin] %s\n' "$*"
}

fail() {
  printf '[route-admin] ERROR: %s\n' "$*" >&2
  exit 1
}

database_url() {
  printf '%s\n' "${DATABASE_URL:-postgres://postgres:postgres@${PGHOST}:${PGPORT}/${PGDATABASE}}"
}

ensure_node_path() {
  if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
    return
  fi

  if [ ! -x "$LOCAL_NODE_BIN_DIR/node" ]; then
    fail "Node.js not found. Expected local runtime at $LOCAL_NODE_BIN_DIR"
  fi

  export PATH="$LOCAL_NODE_BIN_DIR:$PATH"

  if ! command -v npm >/dev/null 2>&1; then
    fail "npm is unavailable even after loading the local Node.js runtime"
  fi
}

mount_local_postgres_dmg() {
  if [ ! -f "$LOCAL_POSTGRES_DMG" ]; then
    return 1
  fi

  mkdir -p "$LOCAL_POSTGRES_MOUNT"

  if [ ! -d "$LOCAL_POSTGRES_APP" ]; then
    log "Mounting project-local Postgres.app DMG"
    hdiutil attach "$LOCAL_POSTGRES_DMG" -mountpoint "$LOCAL_POSTGRES_MOUNT" -nobrowse -quiet >/dev/null
  fi

  [ -d "$LOCAL_POSTGRES_APP" ]
}

ensure_postgres_path() {
  if command -v pg_ctl >/dev/null 2>&1 && command -v psql >/dev/null 2>&1; then
    return
  fi

  if [ -x "$LOCAL_POSTGRES_APP/Contents/Versions/latest/bin/pg_ctl" ]; then
    export PATH="$LOCAL_POSTGRES_APP/Contents/Versions/latest/bin:$PATH"
    return
  fi

  if mount_local_postgres_dmg && [ -x "$LOCAL_POSTGRES_APP/Contents/Versions/latest/bin/pg_ctl" ]; then
    export PATH="$LOCAL_POSTGRES_APP/Contents/Versions/latest/bin:$PATH"
    return
  fi

  fail "PostgreSQL tools not found. Install PostgreSQL locally or place Postgres.app DMG at $LOCAL_POSTGRES_DMG"
}

wait_for_postgres() {
  local attempts=30

  until pg_isready -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" >/dev/null 2>&1; do
    attempts=$((attempts - 1))
    if [ "$attempts" -le 0 ]; then
      fail "PostgreSQL did not become ready on ${PGHOST}:${PGPORT}. Check $PGLOG_FILE"
    fi
    sleep 1
  done
}

ensure_pgdata_initialized() {
  if [ -f "$PGDATA_DIR/PG_VERSION" ]; then
    return
  fi

  mkdir -p "$PGDATA_DIR"
  log "Initializing local PostgreSQL data directory at $PGDATA_DIR"
  initdb -D "$PGDATA_DIR" --username="$PGUSER" --auth=trust >/dev/null
}

start_local_postgres() {
  ensure_postgres_path
  ensure_pgdata_initialized

  if pg_isready -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" >/dev/null 2>&1; then
    log "PostgreSQL is already running on ${PGHOST}:${PGPORT}"
  else
    log "Starting local PostgreSQL on ${PGHOST}:${PGPORT}"
    pg_ctl -D "$PGDATA_DIR" -l "$PGLOG_FILE" -o "-p $PGPORT" start >/dev/null
  fi

  wait_for_postgres
}

ensure_database_exists() {
  start_local_postgres

  local exists
  exists="$(
    psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d postgres -Atqc \
      "select 1 from pg_database where datname = '$PGDATABASE';"
  )"

  if [ "$exists" != "1" ]; then
    log "Creating database $PGDATABASE"
    createdb -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" "$PGDATABASE"
  fi
}

psql_db() {
  psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" "$@"
}
