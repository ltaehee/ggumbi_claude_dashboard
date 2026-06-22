/**
 * 엑셀/CSV 업로드 파이프라인
 * xlsx / csv 파일을 파싱하여 DB에 적재
 *
 * 실제 파일 컬럼 구조 (2604.csv / 2605.csv 기준):
 *   구분, 실적번호, 실적일자, 거래처, 거래처번호, 유통구조, 부서, 담당자,
 *   품명, 품번, 규격, 단위, 수량, 기준단위, 기준단위수량, 통화, 환율,
 *   판매기준가, 판매단가, 판매금액, 부가세액, 판매금액계,
 *   원화판매금액, 원화부가세액, 원화판매금액계,
 *   품목자산분류, 품목대분류, 품목중분류, 품목소분류,
 *   유상사급여부, 예상이익기준 총원가, 이익액, 이익률(%)
 */
import * as XLSX from "xlsx";
import { parse as fastCsvParse } from "fast-csv";
import { Readable } from "stream";
import {
  buildMartFromFilename,
  bulkInsertSales,
  deleteMartByFilename,
  deleteSalesByFilename,
  getAllBomCosts,
  insertUploadRecord,
  upsertBomCosts,
  upsertInventory,
  upsertPromotions,
  upsertSalesTargets,
} from "./db";
import { buildLabels, parseDate, parseNum } from "./bizUtils";

export type FileType = "sales" | "bom" | "target" | "promotion" | "inventory";

// ─── CSV 빠른 파서 (fast-csv 사용) ────────────────────────────────────────────────────────────
async function parseCsvBuffer(buffer: Buffer): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    const rows: Record<string, unknown>[] = [];
    // BOM 제거
    const str = buffer.toString("utf-8").replace(/^\uFEFF/, "");
    const stream = Readable.from([str]);
    stream
      .pipe(fastCsvParse({ headers: true, trim: true }))
      .on("data", (row: Record<string, unknown>) => rows.push(row))
      .on("end", () => resolve(rows))
      .on("error", reject);
  });
}

// ─── 워크북 읽기 (xlsx + csv 모두 지원) ───────────────────────────────────────────────
function readWorkbook(buffer: Buffer, filename: string): XLSX.WorkBook {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "csv") {
    // CSV는 raw string으로 읽어 인코딩 처리
    const str = buffer.toString("utf-8").replace(/^\uFEFF/, ""); // BOM 제거
    return XLSX.read(str, { type: "string", cellDates: true });
  }
  return XLSX.read(buffer, { type: "buffer", cellDates: true });
}

function sheetToRows(wb: XLSX.WorkBook, sheetIndex = 0): Record<string, unknown>[] {
  const sheetName = wb.SheetNames[sheetIndex];
  if (!sheetName) return [];
  const ws = wb.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(ws, { defval: null }) as Record<string, unknown>[];
}

// ─── Sales parser ──────────────────────────────────────────────────────────────
export async function parseSalesFile(
  buffer: Buffer,
  filename: string,
  uploadedBy?: string
): Promise<{ rowCount: number; error?: string; replaced?: boolean; deletedCount?: number }> {
  try {
    const ext = filename.split(".").pop()?.toLowerCase() ?? "";
    // CSV 파일은 fast-csv로 빠르게 파싱, xlsx는 XLSX 라이브러리 사용
    let rows: Record<string, unknown>[];
    if (ext === "csv") {
      rows = await parseCsvBuffer(buffer);
    } else {
      const wb = readWorkbook(buffer, filename);
      rows = sheetToRows(wb);
    }
    if (rows.length === 0) return { rowCount: 0, error: "데이터가 없습니다." };

    const firstRow = rows[0];
    const cols = Object.keys(firstRow);

    const findCol = (...candidates: string[]) =>
      candidates.find((c) => cols.includes(c)) ?? null;

    // 실제 파일 컬럼명 우선, 대체명 포함
    const dateCol = findCol("실적일자", "날짜", "Date", "date");
    // 원화판매금액 (부가세 제외 실매출) 우선, 없으면 판매금액
    const salesCol = findCol("원화판매금액", "원화판매금액계", "판매금액", "매출액", "SalesAmt");
    const qtyCol = findCol("수량", "기준단위수량", "판매수량", "Qty", "qty");
    const deptCol = findCol("부서", "Dept", "dept");
    const channelCol = findCol("거래처", "유통구조", "채널", "Channel", "channel");
    const itemLargeCol = findCol("품목대분류", "대분류");
    const itemMidCol = findCol("품목중분류", "중분류");
    const itemSmallCol = findCol("품목소분류", "소분류");
    const itemNameCol = findCol("품명", "상품명", "ItemName");
    const itemCodeCol = findCol("품번", "상품코드", "ItemCode");
    // ※ 이익액(AF열), 이익률(AG열)은 ERP 계산값으로 신뢰하지 않음 → 항상 무시
    // 예상이익기준 총원가 컬럼 (값이 0이 아닌 경우에만 사용)
    const totalCostCol = findCol("예상이익기준 총원가", "totalCost");
    console.log(`[parseSalesFile] 컬럼 감지 - 파일: ${filename}, 총원가컬럼: ${totalCostCol ?? 'NONE'}, 매출컬럼: ${salesCol ?? 'NONE'}`);

    if (!dateCol) {
      return { rowCount: 0, error: `필수 컬럼 '실적일자'를 찾을 수 없습니다. 감지된 컬럼: ${cols.slice(0, 10).join(", ")}` };
    }
    if (!salesCol) {
      return { rowCount: 0, error: `필수 컬럼 '원화판매금액' 또는 '판매금액'을 찾을 수 없습니다. 감지된 컬럼: ${cols.slice(0, 10).join(", ")}` };
    }

    // BOM 원가 맵 캐시: 월별로 로드 (같은 월은 재사용)
    const bomMapCache = new Map<string, Map<string, number>>();
    const getBomMapForMonth = async (yyyymm: string): Promise<Map<string, number>> => {
      if (!bomMapCache.has(yyyymm)) {
        const map = await getAllBomCosts(yyyymm);
        bomMapCache.set(yyyymm, map);
      }
      return bomMapCache.get(yyyymm)!;
    };
    console.log(`[parseSalesFile] BOM 원가 맵 - 월별 동적 로드 모드`);

    const parsed: Parameters<typeof bulkInsertSales>[0] = [];

    for (const row of rows) {
      // 국내사업팀 데이터만 저장 (타 부서 행 스킵)
      const rowDept = deptCol ? String(row[deptCol] ?? "").trim() : "";
      if (rowDept && rowDept !== "국내사업팀") continue;

      const salesDate = parseDate(row[dateCol]);
      if (!salesDate) continue;

      const salesAmt = parseNum(row[salesCol]);
      const qty = qtyCol ? parseNum(row[qtyCol]) : 0;
      const itemCode = itemCodeCol ? String(row[itemCodeCol] ?? "").trim() : "";

      let grossProfit: number;
      let costPerUnit: number;

      // 1순위: 예상이익기준 총원가 컬럼이 있고 값이 0이 아닌 경우
      const erpTotalCost = totalCostCol ? parseNum(row[totalCostCol]) : 0;
      if (totalCostCol && erpTotalCost !== 0) {
        grossProfit = salesAmt - erpTotalCost;
        costPerUnit = qty > 0 ? erpTotalCost / qty : 0;
      } else {
        // 2순위: 해당 매출 월의 BOM 파일 기준으로 원가 적용
        // 예: 4월 매출 → BOM 202604, 5월 매출 → BOM 202605
        const yr = salesDate.getUTCFullYear();
        const mo = String(salesDate.getUTCMonth() + 1).padStart(2, "0");
        const yyyymm = `${yr}${mo}`;
        const bomMap = await getBomMapForMonth(yyyymm);
        const unitCost = bomMap.get(itemCode) ?? 0;
        costPerUnit = unitCost;
        grossProfit = salesAmt - unitCost * qty;
      }
      const dateStr = salesDate.toISOString().split("T")[0];
      const labels = buildLabels(salesDate);

      parsed.push({
        salesDate: dateStr,
        year: salesDate.getUTCFullYear(),
        month: salesDate.getUTCMonth() + 1,
        ...labels,
        dept: deptCol ? String(row[deptCol] ?? "").trim() || undefined : undefined,
        channel: channelCol ? String(row[channelCol] ?? "").trim() || undefined : undefined,
        itemLarge: itemLargeCol ? String(row[itemLargeCol] ?? "").trim() || undefined : undefined,
        itemMid: itemMidCol ? String(row[itemMidCol] ?? "").trim() || undefined : undefined,
        itemSmall: itemSmallCol ? String(row[itemSmallCol] ?? "").trim() || undefined : undefined,
        itemName: itemNameCol ? String(row[itemNameCol] ?? "").trim() || undefined : undefined,
        itemCode: itemCode || undefined,
        qty,
        salesAmt,
        costPerUnit,
        grossProfit,
      });
    }

    if (parsed.length === 0) {
      return { rowCount: 0, error: "유효한 데이터 행이 없습니다. 실적일자 형식을 확인해주세요." };
    }

    // ─── 동일 파일명 재업로드 시 기존 데이터 삭제 후 교체 ───────────────────────
    const deletedCount = await deleteSalesByFilename(filename);
    if (deletedCount > 0) {
      console.log(`[parseSalesFile] 기존 데이터 ${deletedCount}건 삭제 (파일명: ${filename})`);
    }
    // 마트 테이블에서도 기존 집계 삭제
    await deleteMartByFilename(filename);

    // sourceFilename 컬럼에 파일명 기록 (덮어쓰기 추적용)
    const parsedWithSource = parsed.map((r) => ({ ...r, sourceFilename: filename }));

    const rowCount = await bulkInsertSales(parsedWithSource);

    // 마트 테이블에 집계 데이터 빌드 (조회 속도 최적화)
    try {
      const martRows = await buildMartFromFilename(filename);
      console.log(`[parseSalesFile] 마트 집계 ${martRows}건 생성 (파일명: ${filename})`);
    } catch (martErr) {
      console.warn("[parseSalesFile] 마트 집계 실패 (조회는 원본 테이블로 폴백):", martErr);
    }

    await insertUploadRecord({ filename, fileType: "sales", rowCount, uploadedBy });
    return { rowCount, replaced: deletedCount > 0, deletedCount };
  } catch (e) {
    console.error("[parseSalesFile] error:", e);
    return { rowCount: 0, error: String(e) };
  }
}

// ─── BOM parser ────────────────────────────────────────────────────────────────
/**
 * 파일명에서 YYYYMM 추출
 * 예: 'BOM 202605.xlsx' -> '202605'
 *     'BOM2605.xlsx'    -> '202605' (26xx -> 20xx 자동 보완)
 *     'BOM 202604.xlsx' -> '202604'
 * 실패 시 null 반환
 */
function extractYearMonthFromFilename(filename: string): string | null {
  // 6자리 YYYYMM 먼저 시도
  const m6 = filename.match(/(20\d{4})/);
  if (m6) return m6[1];
  // 4자리 YYMM (e.g. 2605 -> 202605)
  const m4 = filename.match(/(\d{4})/);
  if (m4) {
    const raw = m4[1];
    const yy = parseInt(raw.slice(0, 2), 10);
    const mm = parseInt(raw.slice(2, 4), 10);
    if (yy >= 20 && yy <= 99 && mm >= 1 && mm <= 12) {
      return `20${raw}`;
    }
  }
  return null;
}

export async function parseBomFile(
  buffer: Buffer,
  filename: string,
  uploadedBy?: string
): Promise<{ rowCount: number; error?: string; yearMonth?: string }> {
  try {
    // 파일명에서 연월 추출
    const yearMonth = extractYearMonthFromFilename(filename);
    if (!yearMonth) {
      return {
        rowCount: 0,
        error: `파일명에서 연월을 추출할 수 없습니다.\n파일명 형식: 'BOM 202605.xlsx' 또는 'BOM2605.xlsx'`,
      };
    }

    const wb = readWorkbook(buffer, filename);
    let rows = sheetToRows(wb);
    if (rows.length === 0) return { rowCount: 0, error: "데이터가 없습니다." };

    // 헤더 자동 감지: 1행 콜럼명에 '품번'이 없으면 2행을 헤더로 재파싱 (e.g. 제목 행이 있는 파일)
    const firstRowCols = Object.keys(rows[0]);
    const hasHeader = firstRowCols.some((c) =>
      ["품번", "BOM_품번", "ItemCode", "제조원가", "품명"].includes(c)
    );
    if (!hasHeader) {
      // 1행을 스킵하고 2행을 헤더로 사용
      const ws = wb.Sheets[wb.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json(ws, { defval: null, range: 1 }) as Record<string, unknown>[];
      if (rows.length === 0) return { rowCount: 0, error: "데이터가 없습니다." };
    }

    const firstRow = rows[0];
    const cols = Object.keys(firstRow);

    const findCol = (...candidates: string[]) =>
      candidates.find((c) => cols.includes(c)) ?? null;

    // 품번 콜럼 감지
    const codeCol = findCol("품번", "BOM_품번", "ItemCode", cols[6] ?? "");
    // 원가 콜럼 감지 - 우선순위: 제조원가 > 총원가 > 재료비+노무비 > 단가/원가
    const costCol = findCol("제조원가", "BOM_제조원가", "총원가", "단가", "원가");
    const materialCol = !costCol ? findCol("재료비", "재료원가") : null;
    const laborCol = materialCol ? findCol("노무비", "노무원가") : null;

    if (!codeCol || (!costCol && !materialCol)) {
      return { rowCount: 0, error: `품번/원가 컬럼을 찾을 수 없습니다. 감지된 컬럼: ${cols.slice(0, 15).join(", ")}` };
    }

    console.log(`[parseBomFile] yearMonth: ${yearMonth}, 원가 컬럼: ${costCol ?? `${materialCol}+${laborCol}`}, 품번 컬럼: ${codeCol}`);

    const bomRows = rows
      .map((r) => {
        const itemCode = String(r[codeCol] ?? "").trim();
        let costPerUnit: number;
        if (costCol) {
          costPerUnit = parseNum(r[costCol]);
        } else {
          const mat = parseNum(r[materialCol!]);
          const lab = laborCol ? parseNum(r[laborCol]) : 0;
          costPerUnit = mat + lab;
        }
        return { itemCode, costPerUnit };
      })
      .filter((r) => r.itemCode);

    const rowCount = await upsertBomCosts(bomRows, yearMonth);
    await insertUploadRecord({ filename, fileType: "bom", rowCount, uploadedBy });
    return { rowCount, yearMonth };
  } catch (e) {
    return { rowCount: 0, error: String(e) };
  }
}

// ─── Target parser ─────────────────────────────────────────────────────────────
export async function parseTargetFile(
  buffer: Buffer,
  filename: string,
  uploadedBy?: string
): Promise<{ rowCount: number; error?: string }> {
  try {
    const wb = readWorkbook(buffer, filename);
    const rows = sheetToRows(wb);
    if (rows.length === 0) return { rowCount: 0, error: "데이터가 없습니다." };

    const yearMatch = filename.match(/(\d{4})/);
    const fileYear = yearMatch ? parseInt(yearMatch[1]) : new Date().getFullYear();

    const firstRow = rows[0];
    const cols = Object.keys(firstRow);

    const deptCol = cols.find((c) => c.includes("부서") || c.toLowerCase().includes("dept")) ?? cols[0];
    const itemMidCol = cols.find((c) => c.includes("중분류") || c.includes("품목")) ?? cols[1] ?? "";

    const targetRows: Parameters<typeof upsertSalesTargets>[0] = [];

    for (const row of rows) {
      const dept = String(row[deptCol] ?? "").trim();
      const itemMid = String(row[itemMidCol] ?? "").trim();
      if (!dept || !itemMid) continue;

      for (let m = 1; m <= 12; m++) {
        const monthKey =
          cols.find((c) => c === String(m) || c === `${m}월` || c === `M${m}`) ??
          cols[m];
        if (!monthKey) continue;
        const targetAmt = parseNum(row[monthKey]);
        if (targetAmt > 0) {
          targetRows.push({ dept, itemMid, year: fileYear, month: m, targetAmt });
        }
      }
    }

    const rowCount = await upsertSalesTargets(targetRows);
    await insertUploadRecord({ filename, fileType: "target", rowCount, uploadedBy });
    return { rowCount };
  } catch (e) {
    return { rowCount: 0, error: String(e) };
  }
}

// ─── Promotion parser ──────────────────────────────────────────────────────────
export async function parsePromotionFile(
  buffer: Buffer,
  filename: string,
  uploadedBy?: string
): Promise<{ rowCount: number; error?: string }> {
  try {
    const wb = readWorkbook(buffer, filename);
    const rows = sheetToRows(wb);
    if (rows.length === 0) return { rowCount: 0, error: "데이터가 없습니다." };

    const firstRow = rows[0];
    const cols = Object.keys(firstRow);
    const findCol = (...candidates: string[]) =>
      candidates.find((c) => cols.includes(c)) ?? null;

    const channelCol = findCol("거래처", "채널", "channel");
    const eventCol = findCol("행사내용", "행사명", "event");
    const startCol = findCol("행사시작", "시작일", "startDate");
    const endCol = findCol("행사종료", "종료일", "endDate");
    const targetAmtCol = findCol("목표매출", "목표", "targetAmt");
    const achievedAmtCol = findCol("달성매출", "실적", "achievedAmt");
    const noteCol = findCol("비고", "note");
    const deptCol = findCol("부서", "dept");

    const promoRows: Parameters<typeof upsertPromotions>[0] = [];

    for (const row of rows) {
      const startDate = startCol ? parseDate(row[startCol]) : null;
      const endDate = endCol ? parseDate(row[endCol]) : null;

      promoRows.push({
        dept: deptCol ? String(row[deptCol] ?? "").trim() || undefined : undefined,
        channel: channelCol ? String(row[channelCol] ?? "").trim() || undefined : undefined,
        eventName: eventCol ? String(row[eventCol] ?? "").trim() || undefined : undefined,
        startDate: startDate ? startDate.toISOString().split("T")[0] : undefined,
        endDate: endDate ? endDate.toISOString().split("T")[0] : undefined,
        targetAmt: targetAmtCol ? parseNum(row[targetAmtCol]) : 0,
        achievedAmt: achievedAmtCol ? parseNum(row[achievedAmtCol]) : 0,
        note: noteCol ? String(row[noteCol] ?? "").trim() || undefined : undefined,
      });
    }

    const rowCount = await upsertPromotions(promoRows);
    await insertUploadRecord({ filename, fileType: "promotion", rowCount, uploadedBy });
    return { rowCount };
  } catch (e) {
    return { rowCount: 0, error: String(e) };
  }
}

// ─── Inventory parser ──────────────────────────────────────────────────────────
export async function parseInventoryFile(
  buffer: Buffer,
  filename: string,
  uploadedBy?: string
): Promise<{ rowCount: number; error?: string }> {
  try {
    const wb = readWorkbook(buffer, filename);
    const rows = sheetToRows(wb);
    if (rows.length === 0) return { rowCount: 0, error: "데이터가 없습니다." };

    const firstRow = rows[0];
    const cols = Object.keys(firstRow);
    const findCol = (...candidates: string[]) =>
      candidates.find((c) => cols.includes(c)) ?? null;

    const codeCol = findCol("품번", "상품코드", "ItemCode", cols[6] ?? "");
    const stockCol = findCol("현재재고", "재고", "Stock", cols[10] ?? "");
    const nameCol = findCol("품명", "상품명", "ItemName");
    const expiryCol = findCol("유통기한", "expiry");

    if (!codeCol || !stockCol) {
      return { rowCount: 0, error: `품번/재고 컬럼을 찾을 수 없습니다. 감지된 컬럼: ${cols.slice(0, 15).join(", ")}` };
    }

    const invRows: Parameters<typeof upsertInventory>[0] = [];

    for (const row of rows) {
      const itemCode = String(row[codeCol] ?? "").trim();
      if (!itemCode) continue;
      const expiryDate = expiryCol ? parseDate(row[expiryCol]) : null;
      invRows.push({
        itemCode,
        itemName: nameCol ? String(row[nameCol] ?? "").trim() || undefined : undefined,
        currentStock: parseNum(row[stockCol]),
        expiryDate: expiryDate ? expiryDate.toISOString().split("T")[0] : undefined,
      });
    }

    const rowCount = await upsertInventory(invRows);
    await insertUploadRecord({ filename, fileType: "inventory", rowCount, uploadedBy });
    return { rowCount };
  } catch (e) {
    return { rowCount: 0, error: String(e) };
  }
}
