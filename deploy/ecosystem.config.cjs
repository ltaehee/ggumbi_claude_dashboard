// pm2 프로세스 설정 — `pm2 start deploy/ecosystem.config.cjs` 로 실행
// 빌드 산출물(dist/index.js)을 NODE_ENV=production 으로 상시 구동
module.exports = {
  apps: [
    {
      name: "ggumbi",
      script: "dist/index.js",
      cwd: "/opt/app",
      // fork 모드: env(특히 TZ)가 프로세스 시작 시점에 적용되도록 (cluster 모드는 TZ를 못 잡음)
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: "3000",
        // 날짜 계산을 호스트 타임존과 무관하게 일관되게 (KST 서버에서 toISOString 하루밀림 방지)
        TZ: "UTC",
        NODE_OPTIONS: "--max-old-space-size=1536",
      },
      autorestart: true,
      max_memory_restart: "2000M",
      time: true,
    },
  ],
};
