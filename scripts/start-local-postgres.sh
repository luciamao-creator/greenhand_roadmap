#!/usr/bin/env bash

set -euo pipefail

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

ensure_database_exists

log "PostgreSQL is ready"
log "Database URL: $(database_url)"
log "Log file: $PGLOG_FILE"
