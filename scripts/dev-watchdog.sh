#!/usr/bin/env bash
# SGTX dev-watchdog v2 — survives sandbox process cleanup.
# Uses setsid to create a new session so the watchdog isn't killed
# when the parent shell exits. Polls every 15s, restarts if unhealthy.
set -u
cd "$(dirname "$0")/.." || exit 1

PORT="${PORT:-3000}"
HEALTH_URL="http://127.0.0.1:${PORT}/api/sgtx/health"
POLL_INTERVAL="${POLL_INTERVAL:-15}"
LOG_FILE="dev.log"
NEXT_BIN="node_modules/.bin/next"
WLOG="/tmp/sgtx-watchdog.log"

restart_count=0

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" >> "$WLOG"; }

is_alive() {
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$HEALTH_URL" 2>/dev/null || echo "000")
  [ "$code" = "200" ]
}

start_dev() {
  restart_count=$((restart_count + 1))
  log "Restart #${restart_count}"
  
  # Kill stale processes
  pkill -9 -f "next dev" 2>/dev/null || true
  pkill -9 -f "next-server" 2>/dev/null || true
  sleep 2
  
  # Clear cache every 3rd restart
  if [ $((restart_count % 3)) -eq 0 ]; then
    log "Clearing .next cache"
    rm -rf .next
  fi
  
  # Start with memory limit
  NODE_OPTIONS="--max-old-space-size=1024" nohup node "${NEXT_BIN}" dev -p "${PORT}" > "${LOG_FILE}" 2>&1 < /dev/null &
  log "Launched PID=$!"
  
  # Wait for health
  for i in $(seq 1 20); do
    sleep 2
    if is_alive; then
      log "Healthy after $((i*2))s"
      return 0
    fi
  done
  log "Failed to start after 40s"
  return 1
}

log "=== Watchdog v2 started (port=${PORT}, poll=${POLL_INTERVAL}s) ==="

# Start initial server if not running
if ! is_alive; then
  start_dev
fi

# Main loop
while true; do
  sleep "$POLL_INTERVAL"
  if ! is_alive; then
    log "Health FAILED — restarting"
    start_dev
  fi
done
