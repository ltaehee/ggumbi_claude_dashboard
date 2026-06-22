/**
 * 동일 파일명 재업로드 시 기존 데이터 삭제 후 교체 로직 테스트
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// DB 함수 mock
vi.mock("./db", () => ({
  bulkInsertSales: vi.fn(async (rows: unknown[]) => rows.length),
  deleteSalesByFilename: vi.fn(async (_filename: string) => 0),
  getAllBomCosts: vi.fn(async () => new Map()),
  insertUploadRecord: vi.fn(async () => {}),
  deleteMartByFilename: vi.fn(async (_filename: string) => 0),
  buildMartFromFilename: vi.fn(async (_filename: string) => 0),
}));

import * as db from "./db";
import * as XLSX from "xlsx";
import { parseSalesFile } from "./excelPipeline";

/** 최소한의 매출 CSV Buffer 생성 */
function makeSalesCsv(rows: Record<string, string | number>[]): Buffer {
  const headers = Object.keys(rows[0]).join(",");
  const lines = rows.map((r) => Object.values(r).join(","));
  return Buffer.from([headers, ...lines].join("\n"), "utf-8");
}

const sampleRows = [
  {
    실적일자: "2026-05-01",
    원화판매금액: 1000000,
    수량: 10,
    부서: "국내사업팀",
    거래처: "쿠팡",
    품목대분류: "유아용품",
    품목중분류: "침구",
    품목소분류: "이불",
    품명: "테스트이불",
    품번: "TEST001",
    이익액: 200000,
  },
];

describe("parseSalesFile - 동일 파일명 덮어쓰기", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("최초 업로드 시 deleteSalesByFilename이 0을 반환하면 replaced=false", async () => {
    vi.mocked(db.deleteSalesByFilename).mockResolvedValue(0);
    vi.mocked(db.bulkInsertSales).mockResolvedValue(1);

    const buf = makeSalesCsv(sampleRows);
    const result = await parseSalesFile(buf, "2605.csv", "user1");

    expect(result.error).toBeUndefined();
    expect(result.rowCount).toBe(1);
    expect(result.replaced).toBe(false);
    expect(result.deletedCount).toBe(0);
    expect(db.deleteSalesByFilename).toHaveBeenCalledWith("2605.csv");
  });

  it("재업로드 시 deleteSalesByFilename이 기존 건수를 반환하면 replaced=true", async () => {
    vi.mocked(db.deleteSalesByFilename).mockResolvedValue(150);
    vi.mocked(db.bulkInsertSales).mockResolvedValue(1);

    const buf = makeSalesCsv(sampleRows);
    const result = await parseSalesFile(buf, "2605.csv", "user1");

    expect(result.replaced).toBe(true);
    expect(result.deletedCount).toBe(150);
    expect(result.rowCount).toBe(1);
  });

  it("bulkInsertSales 호출 시 sourceFilename이 파일명으로 설정됨", async () => {
    vi.mocked(db.deleteSalesByFilename).mockResolvedValue(0);
    vi.mocked(db.bulkInsertSales).mockResolvedValue(1);

    const buf = makeSalesCsv(sampleRows);
    await parseSalesFile(buf, "2605.csv", "user1");

    const callArgs = vi.mocked(db.bulkInsertSales).mock.calls[0][0];
    expect(callArgs.length).toBeGreaterThan(0);
    expect(callArgs[0].sourceFilename).toBe("2605.csv");
  });

  it("insertUploadRecord는 항상 한 번 호출됨", async () => {
    vi.mocked(db.deleteSalesByFilename).mockResolvedValue(50);
    vi.mocked(db.bulkInsertSales).mockResolvedValue(1);

    const buf = makeSalesCsv(sampleRows);
    await parseSalesFile(buf, "2605.csv");

    expect(db.insertUploadRecord).toHaveBeenCalledTimes(1);
    expect(db.insertUploadRecord).toHaveBeenCalledWith(
      expect.objectContaining({ filename: "2605.csv", fileType: "sales" })
    );
  });

  it("파싱 오류 시 deleteSalesByFilename이 호출되지 않음", async () => {
    const emptyBuf = Buffer.from("", "utf-8");
    const result = await parseSalesFile(emptyBuf, "empty.csv");

    expect(result.error).toBeDefined();
    expect(db.deleteSalesByFilename).not.toHaveBeenCalled();
  });
});
