#!/bin/bash
cd /home/z/my-project
while true; do
  H=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 http://127.0.0.1:3000/api/sgtx/health 2>/dev/null)
  if [ "$H" != "200" ]; then
    pkill -9 -f "next dev" 2>/dev/null
    pkill -9 -f "next-server" 2>/dev/null
    sleep 1
    nohup node node_modules/.bin/next dev -p 3000 > dev.log 2>&1 < /dev/null &
    echo $! > .zscripts/dev.pid
    sleep 6
  fi
  sleep 2
done
