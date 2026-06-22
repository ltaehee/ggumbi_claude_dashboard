// pm2 프로세스 설정 — `pm2 start deploy/ecosystem.config.cjs` 로 실행
// 빌드 산출물(dist/index.js)을 NODE_ENV=production 으로 상시 구동
module.exports = {
  apps: [
    {
      name: "ggumbi",
      script: "dist/index.js",
      cwd: "/opt/app",
      env: {
        NODE_ENV: "production",
        PORT: "3000",
      },
      instances: 1,
      autorestart: true,
      max_memory_restart: "500M",
      time: true,
    },
  ],
};
