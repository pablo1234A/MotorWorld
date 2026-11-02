#!/usr/bin/env bash
# Start/stop API + workers (+ optional web) on the host without Docker.
# Usage: scripts/local_stack.sh start|stop|restart   (reads ENV_FILE, default .env)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RUN="${RUN_DIR:-$ROOT/backend/data/run}"
mkdir -p "$RUN"
VENV="${VENV:-$ROOT/.venv}"
ENV_FILE="${ENV_FILE:-$ROOT/.env}"

start_one() { # name, cmd...
  local name=$1; shift
  ( cd "$ROOT/backend" && set -a && { [ -f "$ENV_FILE" ] && . "$ENV_FILE" || true; } && set +a && . "$VENV/bin/activate" && setsid nohup "$@" >"$RUN/$name.log" 2>&1 & echo $! >"$RUN/$name.pid" )
  echo "started $name"
}
stop_all() {
  for f in "$RUN"/*.pid; do [ -f "$f" ] || continue; kill "$(cat "$f")" 2>/dev/null || true; rm -f "$f"; done
  # arq/uvicorn children
  sleep 1
}
case "${1:-start}" in
  start)
    start_one api uvicorn app.main:app --host 0.0.0.0 --port "${API_PORT:-8000}"
    start_one worker-generate arq app.worker.GenerateWorker
    start_one worker-media arq app.worker.MediaWorker
    if [ "${WITH_WEB:-0}" = "1" ]; then
      ( cd "$ROOT/frontend" && API_INTERNAL_URL="http://127.0.0.1:${API_PORT:-8000}" setsid nohup npx next start -p "${WEB_PORT:-3000}" >"$RUN/web.log" 2>&1 & echo $! >"$RUN/web.pid" )
      echo "started web"
    fi ;;
  stop) stop_all; echo stopped ;;
  restart) stop_all; exec "$0" start ;;
esac
