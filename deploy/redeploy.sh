#!/usr/bin/env bash
# 서버에서 빌드 + 재시작 (분리 실행용). 로그는 /root/build.log
cd /opt/app
echo "BUILD_START $(date +%H:%M:%S)" > /root/build.log
NODE_OPTIONS=--max-old-space-size=3072 pnpm build >> /root/build.log 2>&1
echo "BUILD_EXIT=$?" >> /root/build.log
pm2 restart ggumbi >> /root/build.log 2>&1
pm2 save >> /root/build.log 2>&1
echo "ALLDONE" >> /root/build.log
