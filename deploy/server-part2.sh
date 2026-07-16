#!/usr/bin/env bash
set -e

echo "===== nginx IPv6 listen 제거 후 기동 ====="
sed -i '/listen \[::\]:80/d' /etc/nginx/sites-available/default
systemctl restart nginx
systemctl enable nginx >/dev/null 2>&1
echo "NGINX_ACTIVE=$(systemctl is-active nginx)"

echo "===== pnpm + pm2 설치 ====="
corepack enable
corepack prepare pnpm@10.4.1 --activate
npm install -g pm2 >/dev/null 2>&1
echo "PNPM=$(pnpm -v)  PM2=$(pm2 -v)"

echo "===== 코드 배치 + .env 설정 ====="
mkdir -p /opt/app
tar -xzf /root/deploy-app.tar.gz -C /opt/app
cp /root/dotenv /opt/app/.env
sed -i 's/^NODE_ENV=development/NODE_ENV=production/' /opt/app/.env
echo "ENV: $(grep -E '^NODE_ENV|^PORT' /opt/app/.env | tr '\n' ' ')"
echo "파일 목록:"; ls /opt/app | tr '\n' ' '; echo
echo "PART2_DONE"
