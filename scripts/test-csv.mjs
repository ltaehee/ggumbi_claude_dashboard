/**
 * CSV 파이프라인 로컬 테스트 스크립트
 * DB 없이 파싱 로직만 검증
 */
import * as XLSX from "xlsx";
import { readFileSync } from "fs";

function parseNum(v) {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return isNaN(v) ? 0 : v;
  const s = String(v).replace(/,/g, "").trim();
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function parseDate(v) {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  const s = String(v).trim();
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function readWorkbook(buffer, filename) {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "csv") {
    const str = buffer.toString("utf-8").replace(/^\uFEFF/, "");
    return XLSX.read(str, { type: "string", cellDates: true });
  }
  return XLSX.read(buffer, { type: "buffer", cellDates: true });
}

function sheetToRows(wb, sheetIndex = 0) {
  const sheetName = wb.SheetNames[sheetIndex];
  if (!sheetName) return [];
  const ws = wb.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(ws, { defval: null });
}

const files = ["/home/ubuntu/upload/2604.csv", "/home/ubuntu/upload/2605.csv"];

for (const filepath of files) {
  const filename = filepath.split("/").pop();
  const buffer = readFileSync(filepath);
  const wb = readWorkbook(buffer, filename);
  const rows = sheetToRows(wb);

  console.log(`\n=== ${filename} ===`);
  console.log(`총 행 수: ${rows.length}`);

  if (rows.length === 0) {
    console.log("❌ 데이터 없음");
    continue;
  }

  const cols = Object.keys(rows[0]);
  console.log(`컬럼 수: ${cols.length}`);
  console.log(`컬럼 목록: ${cols.join(", ")}`);

  const findCol = (...candidates) => candidates.find((c) => cols.includes(c)) ?? null;

  const dateCol = findCol("실적일자", "날짜", "Date", "date");
  const salesCol = findCol("원화판매금액", "원화판매금액계", "판매금액", "매출액", "SalesAmt");
  const qtyCol = findCol("수량", "기준단위수량", "판매수량", "Qty", "qty");
  const deptCol = findCol("부서", "Dept", "dept");
  const channelCol = findCol("거래처", "유통구조", "채널", "Channel", "channel");
  const itemLargeCol = findCol("품목대분류", "대분류");
  const itemMidCol = findCol("품목중분류", "중분류");
  const profitCol = findCol("이익액", "매출이익", "grossProfit");

  console.log(`\n컬럼 매핑:`);
  console.log(`  실적일자: ${dateCol}`);
  console.log(`  매출금액: ${salesCol}`);
  console.log(`  수량: ${qtyCol}`);
  console.log(`  부서: ${deptCol}`);
  console.log(`  거래처: ${channelCol}`);
  console.log(`  품목대분류: ${itemLargeCol}`);
  console.log(`  품목중분류: ${itemMidCol}`);
  console.log(`  이익액: ${profitCol}`);

  if (!dateCol || !salesCol) {
    console.log("❌ 필수 컬럼 없음");
    continue;
  }

  // 샘플 3행 파싱
  let validCount = 0;
  let invalidCount = 0;
  for (const row of rows) {
    const d = parseDate(row[dateCol]);
    if (!d) { invalidCount++; continue; }
    const amt = parseNum(row[salesCol]);
    validCount++;
  }

  console.log(`\n파싱 결과: 유효 ${validCount}행, 날짜 파싱 실패 ${invalidCount}행`);

  // 샘플 첫 행 출력
  const sample = rows[0];
  const d = parseDate(sample[dateCol]);
  const amt = parseNum(sample[salesCol]);
  const qty = qtyCol ? parseNum(sample[qtyCol]) : 0;
  const profit = profitCol ? parseNum(sample[profitCol]) : null;
  console.log(`\n샘플 첫 행:`);
  console.log(`  날짜: ${d?.toISOString().split("T")[0]}`);
  console.log(`  매출: ${amt.toLocaleString()}원`);
  console.log(`  수량: ${qty}`);
  if (profit !== null) console.log(`  이익액: ${profit.toLocaleString()}원`);
  console.log(`✅ 파싱 성공`);
}
