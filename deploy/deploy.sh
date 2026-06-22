#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# 코드 업데이트 후 재배포 (/opt/app 에서 실행)
#   bash deploy/deploy.sh
# ─────────────────────────────────────────────────────────────
set -e
cd /opt/app

echo "==> 최신 코드 가져오기"
git pull

echo "==> 의존성 설치"
pnpm install --frozen-lockfile

echo "==> 빌드"
pnpm build

echo "==> 재시작"
pm2 restart ggumbi
pm2 save
echo "==> 완료"
