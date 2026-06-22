# NCP 배포 가이드 (꿈비 대시보드)

Node + Express(tRPC) + 빌드된 React 단일 프로세스를 **NCP Server(Ubuntu) + pm2 + nginx + HTTPS**로 상시 운영한다.
DB는 기존 TiDB Cloud를 그대로 사용한다. (로그인은 비밀번호 게이트 — 마누스 OAuth 불필요)

> ✅ 로컬에서 `pnpm build` + 프로덕션 실행(`node dist/index.js`) 검증 완료.

---

## 1단계. NCP 서버 생성 (콘솔)

1. **Server**(VPC) 생성
   - VPC + Public Subnet 생성 → Server 생성
   - OS: **Ubuntu 22.04** / 사양: **[Compact] 2vCPU·4GB** (테스트면 Micro)
   - **인증키(.pem)** 새로 생성·다운로드
2. **공인 IP** 발급 후 서버에 할당
3. **ACG(방화벽)** 인바운드:
   | 프로토콜 | 포트 | 소스 |
   |---|---|---|
   | TCP | 22 | 내 IP |
   | TCP | 80 | 0.0.0.0/0 |
   | TCP | 443 | 0.0.0.0/0 |
4. 콘솔에서 **관리자 비밀번호 확인**(.pem으로 복호화)

## 2단계. 서버 기본 셋업 (SSH)

```bash
ssh root@<공인IP>
# 코드 업로드(아래 3단계) 후, 또는 먼저 수동 설치:
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs git nginx
corepack enable && corepack prepare pnpm@10.4.1 --activate
npm install -g pm2
```
(또는 코드 올린 뒤 `sudo bash /opt/app/deploy/setup-server.sh` 한 방)

## 3단계. 앱 배포

```bash
# 코드 올리기: GitHub 비공개 repo 권장 (또는 WinSCP로 업로드)
git clone https://github.com/<your>/<repo>.git /opt/app
cd /opt/app

# .env 생성 — 로컬 .env 값 그대로, 단 NODE_ENV=production
cp deploy/.env.production.example .env
nano .env          # DATABASE_URL, JWT_SECRET 등 실제 값 입력

pnpm install
pnpm build
pm2 start deploy/ecosystem.config.cjs
pm2 save
pm2 startup        # 출력되는 명령 1줄 실행 → 재부팅 자동 시작
```
→ `http://<공인IP>:3000` 접속되면 성공. (ACG에 3000 임시 허용 시 확인 가능, 확인 후 닫기)

## 4단계. nginx + 도메인 + HTTPS

```bash
# DNS: 도메인 A레코드 → 공인 IP

cp /opt/app/deploy/nginx-ggumbi.conf /etc/nginx/sites-available/ggumbi
nano /etc/nginx/sites-available/ggumbi      # server_name 을 실제 도메인으로
ln -s /etc/nginx/sites-available/ggumbi /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# HTTPS (무료)
apt install -y certbot python3-certbot-nginx
certbot --nginx -d your-domain.com
```
→ `https://your-domain.com` 팀원 상시 접속.

## 5단계. TiDB 접속 허용 + 검증

- TiDB Cloud 콘솔 → Cluster → **Connection / Allowed IPs** 에 NCP 서버 공인 IP 추가 (또는 0.0.0.0/0)
- `pm2 logs ggumbi` 에서 `Server running` + `[Mart Build] 마트 최신 상태` 확인

---

## 운영 명령

```bash
pm2 logs ggumbi          # 로그
pm2 restart ggumbi       # 재시작
pm2 status               # 상태
bash deploy/deploy.sh    # 코드 업데이트 후 재배포(pull→install→build→restart)
```

## 참고
- `.env` 는 절대 git 커밋 금지(.gitignore 포함). 서버에서 직접 작성.
- 도메인 없이 IP만으로도 동작하나, HTTPS·쿠키 안정성을 위해 도메인 권장.
- 서버(한국)와 DB(미국 TiDB) 거리로 느리면 → NCP `Cloud DB for MySQL`(한국) 이전 고려.
