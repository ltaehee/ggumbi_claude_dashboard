#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# NCP Ubuntu 22.04 서버 최초 1회 셋업 스크립트 (root로 실행)
#   sudo bash setup-server.sh
# ─────────────────────────────────────────────────────────────
set -e

echo "==> 패키지 업데이트"
apt-get update -y

echo "==> Node.js 20 설치"
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs git nginx

echo "==> pnpm(corepack) 활성화"
corepack enable
corepack prepare pnpm@10.4.1 --activate

echo "==> pm2 설치"
npm install -g pm2

echo "==> 완료. 버전 확인:"
node -v
pnpm -v
pm2 -v
echo "다음: /opt/app 에 코드를 올리고 deploy/README.md 의 3단계를 진행하세요."
