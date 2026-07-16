import express from "express";
import multer from "multer";
import {
  parseBomFile,
  parseInventoryFile,
  parsePromotionFile,
  parseSalesFile,
  parseTargetFile,
  parseProductTargetFile,
  parseItemManagerFile,
  type FileType,
} from "./excelPipeline";
import { queryCache } from "./cache";
import { rebuildMartFromAllRecords, getUnassignedSummary } from "./db";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// ─── 업로드 작업 상태 저장 (메모리) ────────────────────────────────────────────
type JobStatus =
  | { status: "pending" }
  | { status: "processing"; filename: string; step?: string; progress?: number }
  | { status: "done"; rowCount: number; replaced: boolean; deletedCount: number; filename: string; martBuilt?: number; unassignedCount?: number; unassignedSales?: number }
  | { status: "error"; error: string; filename: string };

const jobs = new Map<string, JobStatus>();

// 30분 후 자동 정리
function scheduleCleanup(jobId: string) {
  setTimeout(() => jobs.delete(jobId), 30 * 60 * 1000);
}

// ─── POST /api/upload ─────────────────────────────────────────────────────────
router.post("/api/upload", upload.single("file"), async (req, res) => {
  const file = req.file;
  if (!file) {
    return res.status(400).json({ success: false, error: "파일이 없습니다." });
  }

  const fileType = (req.body?.fileType as FileType) || "sales";
  const uploadedBy = req.body?.uploadedBy ?? "unknown";
  const jobId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  jobs.set(jobId, { status: "processing", filename: file.originalname });

  // 백그라운드에서 파싱 + DB 적재 실행 (응답은 즉시 반환)
  setImmediate(async () => {
    try {
      let result: { rowCount: number; error?: string; replaced?: boolean; deletedCount?: number };

      // 단계 1: 파일 파싱 및 DB 적재
      jobs.set(jobId, { status: "processing", filename: file.originalname, step: "parsing", progress: 10 });

      switch (fileType) {
        case "sales":
          result = await parseSalesFile(file.buffer, file.originalname, uploadedBy);
          break;
        case "bom":
          result = await parseBomFile(file.buffer, file.originalname, uploadedBy);
          break;
        case "target":
          result = await parseTargetFile(file.buffer, file.originalname, uploadedBy);
          break;
        case "productTarget":
          result = await parseProductTargetFile(file.buffer, file.originalname, uploadedBy);
          break;
        case "managerMap":
          result = await parseItemManagerFile(file.buffer, file.originalname, uploadedBy);
          break;
        case "promotion":
          result = await parsePromotionFile(file.buffer, file.originalname, uploadedBy);
          break;
        case "inventory":
          result = await parseInventoryFile(file.buffer, file.originalname, uploadedBy);
          break;
        default:
          jobs.set(jobId, { status: "error", error: "알 수 없는 파일 타입", filename: file.originalname });
          scheduleCleanup(jobId);
          return;
      }

      if (result.error) {
        jobs.set(jobId, { status: "error", error: result.error, filename: file.originalname });
      } else {
        // 단계 2: 매출/BOM/담당자지정 파일인 경우 마트 자동 재빌드
        //  - 담당자 지정(managerMap): 품번 오버라이드/소분류 매핑이 바뀌므로 마트의 담당자 baking 갱신 필요
        let martBuilt = 0;
        if (fileType === "bom" || fileType === "sales" || fileType === "managerMap") {
          jobs.set(jobId, { status: "processing", filename: file.originalname, step: "rebuilding", progress: 70 });
          try {
            const martResult = await rebuildMartFromAllRecords(true);
            martBuilt = martResult.built;
            console.log(`[Upload] 마트 재빌드 완료: ${martBuilt}행`);
          } catch (e) {
            console.warn("[Upload] 마트 재빌드 오류 (무시):", e);
          }
        }

        // 담당자 미지정 SKU 요약 (매출/담당자지정 업로드 후)
        let unassignedCount: number | undefined;
        let unassignedSales: number | undefined;
        if (fileType === "sales" || fileType === "managerMap") {
          try {
            const u = await getUnassignedSummary();
            unassignedCount = u.count;
            unassignedSales = u.totalSales;
          } catch (e) {
            console.warn("[Upload] 미지정 SKU 집계 오류 (무시):", e);
          }
        }

        queryCache.invalidateAll();
        jobs.set(jobId, {
          status: "done",
          rowCount: result.rowCount,
          replaced: result.replaced ?? false,
          deletedCount: result.deletedCount ?? 0,
          filename: file.originalname,
          martBuilt,
          unassignedCount,
          unassignedSales,
        });
      }
    } catch (e) {
      console.error("[Upload] Background error:", e);
      jobs.set(jobId, { status: "error", error: String(e), filename: file.originalname });
    }
    scheduleCleanup(jobId);
  });

  // 즉시 jobId 반환 (처리는 백그라운드에서 계속)
  return res.json({ success: true, jobId, status: "processing" });
});

// ─── GET /api/upload/status/:jobId ────────────────────────────────────────────
router.get("/api/upload/status/:jobId", (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: "작업을 찾을 수 없습니다." });
  }
  return res.json(job);
});

export default router;
