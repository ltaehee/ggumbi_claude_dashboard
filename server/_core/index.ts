import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import uploadRoute from "../uploadRoute";
import { syncNotionToDb } from "../notionSync";
import { runIndexMigrations } from "../dbMigrate";
import { rebuildMartFromAllRecords, getMartRowCount, ensureAccountsTable, seedAdminAccount } from "../db";
import { ENV } from "./env";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  app.use(uploadRoute);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });

  // DB 인덱스 마이그레이션 (서버 시작 후 백그라운드 실행, 서버 기동을 막지 않음)
  setTimeout(() => {
    runIndexMigrations().catch((e) =>
      console.warn("[DB Migrate] 인덱스 마이그레이션 오류:", e)
    );
  }, 3_000);

  // 계정 테이블 생성 + 관리자 시드 (taehee / 0000)
  setTimeout(async () => {
    try {
      await ensureAccountsTable();
      const bcrypt = await import("bcryptjs");
      await seedAdminAccount("taehee", bcrypt.hashSync("0000", 10));
      console.log("[Accounts] 계정 테이블 준비 + 관리자(taehee) 시드 완료");
    } catch (e) {
      console.warn("[Accounts] 초기화 오류:", e);
    }
  }, 2_000);

  // 집계 마트 초기 빌드: 마트가 비어 있으면 sales_records에서 자동 빌드
  setTimeout(async () => {
    try {
      const martCount = await getMartRowCount();
      if (martCount === 0) {
        console.log("[Mart Build] 마트 테이블이 비어 있습니다. 초기 빌드를 시작합니다...");
        const result = await rebuildMartFromAllRecords();
        console.log(`[Mart Build] 초기 빌드 완료: ${result.filenames.length}개 파일, ${result.built}행 집계`);
      } else {
        // 마트에 없는 파일이 있으면 추가 빌드
        const result = await rebuildMartFromAllRecords();
        if (result.filenames.length > 0) {
          console.log(`[Mart Build] 누락 파일 빌드 완료: ${result.filenames.join(", ")} (${result.built}행)`);
        } else {
          console.log(`[Mart Build] 마트 최신 상태 (${martCount}행)`);
        }
      }
    } catch (e) {
      console.warn("[Mart Build] 마트 초기 빌드 오류:", e);
    }
  }, 8_000);

  // 노션 자동 동기화: 서버 시작 시 1회 + 1시간 주기 반복
  if (ENV.notionApiKey && ENV.notionDatabaseId) {
    const runSync = async () => {
      try {
        const result = await syncNotionToDb();
        console.log(`[Notion Sync] 동기화 완료: ${result.total}개 항목, ${result.upserted}개 Upsert`);
        if (result.errors.length > 0) {
          console.warn("[Notion Sync] 오류:", result.errors);
        }
      } catch (err) {
        console.error("[Notion Sync] 실패:", err);
      }
    };
    // 서버 시작 5초 후 첫 동기화
    setTimeout(runSync, 5_000);
    // 1시간(3600초) 주기 자동 동기화
    setInterval(runSync, 60 * 60 * 1_000);
  } else {
    console.warn("[Notion Sync] NOTION_API_KEY 또는 NOTION_DATABASE_ID가 설정되지 않아 자동 동기화를 건너맕니다.");
  }
}

startServer().catch(console.error);
