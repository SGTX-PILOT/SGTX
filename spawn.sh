#!/bin/bash
cd /home/z/my-project
# Double-fork technique
( exec ./node_modules/.bin/next dev -p 3000 > /home/z/my-project/dev.log 2>&1 ) &
PID=$!
echo "Spawned PID=$PID"
# Write PID file
echo $PID > /home/z/my-project/next.pid
# Wait briefly to confirm startup
sleep 5
if kill -0 $PID 2>/dev/null; then
  echo "Process alive after 5s"
fi
