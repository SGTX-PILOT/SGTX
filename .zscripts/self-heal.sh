#!/bin/bash
cd /home/z/my-project
exec 2>&1

while true; do
  # Start server
  node node_modules/.bin/next dev -p 3000 > dev.log 2>&1 &
  SRV_PID=$!
  echo $SRV_PID > .zscripts/dev.pid
  
  # Wait for health
  for i in $(seq 1 15); do
    sleep 2
    if curl -s -o /dev/null -w "%{http_code}" --max-time 3 http://127.0.0.1:3000/api/sgtx/health 2>/dev/null | grep -q "200"; then
      break
    fi
  done
  
  # Wait for it to die
  wait $SRV_PID 2>/dev/null
  echo "Server died, restarting..."
  sleep 1
done
