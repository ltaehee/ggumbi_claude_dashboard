#!/usr/bin/env bash
set -e

echo "===== [1/4] 스왑 4GB 추가 (Micro 1GB RAM 빌드 대비) ====="
if [ ! -f /swapfile ]; then
  fallocate -l 4G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=4096
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
free -m

echo "===== [2/4] 패키지 설치 (Node 20, git, nginx) ====="
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs git nginx

echo "===== [3/4] pnpm + pm2 ====="
corepack enable
corepack prepare pnpm@10.4.1 --activate
npm install -g pm2

echo "===== [4/4] 버전 확인 ====="
node -v
pnpm -v
pm2 -v
nginx -v
mkdir -p /opt/app
echo "BOOTSTRAP_DONE"
