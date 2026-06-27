#!/usr/bin/env bash
# SGTX dev-watchdog — keeps `next dev` alive on port 3000.
# Polls /api/sgtx/health every 20s; if non-200 (or unreachable), kills stale
# next processes, optionally clears .next cache (every 5th restart), and
# relaunches with `nohup node node_modules/.bin/next dev -p 3000 > dev.log 2>&1 &`.
#
# Usage:
#   ./scripts/dev-watchdog.sh            # runs forever
#   RESTART_LIMIT=10 ./scripts/...       # exit after N restarts
#   POLL_INTERVAL=20 ./scripts/...       # override poll interval (seconds)
set -u

cd "$(dirname "$0")/.." || exit 1

PORT="${PORT:-3000}"
HEALTH_URL="http://127.0.0.1:${PORT}/api/sgtx/health"
POLL_INTERVAL="${POLL_INTERVAL:-20}"
RESTART_LIMIT="${RESTART_LIMIT:-0}"   # 0 = unlimited
LOG_FILE="dev.log"
NEXT_BIN="node_modules/.bin/next"

restart_count=0

log() {
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" | tee -a "watchdog.log"
}

is_alive() {
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$HEALTH_URL" 2>/dev/null || echo "000")
  [ "$code" = "200" ]
}

kill_stale_next() {
  log "Killing stale next processes on port ${PORT}..."
  # Try pkill first (matches `next dev` and `next-server`).
  pkill -f "next dev" 2>/dev/null || true
  pkill -f "next-server" 2>/dev/null || true
  # Fall back to anything still bound to the port.
  if command -v fuser >/dev/null 2>&1; then
    fuser -k "${PORT}/tcp" 2>/dev/null || true
  fi
  sleep 2
}

clear_next_cache() {
  log "Clearing .next cache (every 5th restart)..."
  rm -rf .next
}

start_dev() {
  restart_count=$((restart_count + 1))
  log "Restart #${restart_count} — launching next dev on port ${PORT}"
  if [ "$((restart_count % 5))" = "0" ]; then
    clear_next_cache
  fi
  nohup node "${NEXT_BIN}" dev -p "${PORT}" > "${LOG_FILE}" 2>&1 &
  log "next dev PID=$! — waiting up to 30s for health endpoint..."
  for _ in $(seq 1 30); do
    sleep 1
    if is_alive; then
      log "Health endpoint OK after ${_}s"
      return 0
    fi
  done
  log "Health endpoint still down after 30s — will retry next cycle"
  return 1
}

log "=== SGTX dev-watchdog starting (port=${PORT}, interval=${POLL_INTERVAL}s) ==="

while true; do
  if ! is_alive; then
    log "Health check FAILED — initiating restart sequence"
    kill_stale_next
    if ! start_dev; then
      log "start_dev did not return healthy — continuing to poll"
    fi
    if [ "${RESTART_LIMIT}" -gt 0 ] && [ "${restart_count}" -ge "${RESTART_LIMIT}" ]; then
      log "Reached RESTART_LIMIT=${RESTART_LIMIT} — exiting watchdog"
      exit 1
    fi
  else
    # Healthy — quiet log every cycle, verbose only on restart.
    : # uncomment next line for verbose heartbeat: log "OK"
  fi
  sleep "${POLL_INTERVAL}"
done
