#!/usr/bin/env bash
set -e
cd /opt/app

echo "===== pm2로 앱 상시 실행 ====="
pm2 delete ggumbi 2>/dev/null || true
pm2 start /opt/app/deploy/ecosystem.config.cjs
pm2 save
# 서버 재부팅 시 자동 시작 (systemd 등록)
pm2 startup systemd -u root --hp /root 2>/dev/null | grep -E '^sudo' | bash || true
pm2 save
pm2 status

echo "===== nginx 리버스 프록시 (80 -> 3000) ====="
cp /root/nginx-ip.conf /etc/nginx/sites-available/ggumbi
ln -sf /etc/nginx/sites-available/ggumbi /etc/nginx/sites-enabled/ggumbi
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx
echo "NGINX_ACTIVE=$(systemctl is-active nginx)"

echo "===== 응답 테스트 ====="
sleep 4
curl -s -o /dev/null -w "APP(3000) HTTP_%{http_code} size=%{size_download}\n" http://127.0.0.1:3000/ || echo "3000 응답 실패"
curl -s -o /dev/null -w "WEB(80)   HTTP_%{http_code} size=%{size_download}\n" http://127.0.0.1/ || echo "80 응답 실패"
echo "PART3_DONE"
