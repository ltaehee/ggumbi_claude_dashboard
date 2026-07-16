#!/usr/bin/env bash
PID=$(pm2 pid ggumbi)
echo "app_pid=$PID"
echo "--- app process env (TZ/NODE_ENV/PORT) ---"
tr '\0' '\n' < /proc/$PID/environ | grep -E '^(TZ|NODE_ENV|PORT)='
echo "--- 검증: app이 보는 날짜(UTC여야 함) ---"
# 앱과 동일한 TZ로 node 실행해 확인
TZ=$(tr '\0' '\n' < /proc/$PID/environ | grep '^TZ=' | cut -d= -f2) node -e 'console.log("now:", new Date().toString())'
