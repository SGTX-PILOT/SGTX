#!/bin/bash
cd /home/z/my-project
export NEXT_TELEMETRY_DISABLED=1

# Start server
nohup node node_modules/.bin/next dev -p 3000 > dev.log 2>&1 < /dev/null &

# Wait for health
for i in $(seq 1 20); do
  sleep 2
  if curl -s -o /dev/null -w "%{http_code}" --max-time 3 http://127.0.0.1:3000/api/sgtx/health 2>/dev/null | grep -q "200"; then
    echo "Server healthy after $((i*2))s"
    break
  fi
done

# Keep-alive loop: restart if dead
while true; do
  sleep 5
  H=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 http://127.0.0.1:3000/api/sgtx/health 2>/dev/null)
  if [ "$H" != "200" ]; then
    pkill -9 -f "next dev" 2>/dev/null
    pkill -9 -f "next-server" 2>/dev/null
    sleep 1
    nohup node node_modules/.bin/next dev -p 3000 > dev.log 2>&1 < /dev/null &
    sleep 8
  fi
done
