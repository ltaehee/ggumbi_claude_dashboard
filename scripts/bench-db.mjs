/**
 * DB 작업 시간 측정 (DELETE + INSERT 분리)
 */
import mysql from "mysql2/promise";
import { readFileSync } from "fs";
import { parse } from "fast-csv";
import { Readable } from "stream";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

async function parseCsv(buf) {
  return new Promise((resolve, reject) => {
    const rows = [];
    const str = buf.toString("utf-8").replace(/^\uFEFF/, "");
    Readable.from([str])
      .pipe(parse({ headers: true, trim: true }))
      .on("data", (r) => rows.push(r))
      .on("end", () => resolve(rows))
      .on("error", reject);
  });
}

const pool = mysql.createPool(DATABASE_URL);

async function main() {
  const buf = readFileSync("/home/ubuntu/upload/2605.csv");

  // 1. 파싱 시간
  let t = Date.now();
  const rows = await parseCsv(buf);
  console.log(`[1] CSV 파싱: ${Date.now() - t}ms (${rows.length}행)`);

  // 2. DELETE 시간
  const conn = await pool.getConnection();
  t = Date.now();
  const [delResult] = await conn.execute(
    "DELETE FROM sales_records WHERE sourceFilename = ?",
    ["2605.csv"]
  );
  console.log(`[2] DELETE: ${Date.now() - t}ms (${delResult.affectedRows}건)`);

  // 3. INSERT 시간 (1000행 청크 × 4 병렬)
  const CHUNK = 1000;
  const PARALLEL = 4;
  const chunks = [];
  for (let i = 0; i < rows.length; i += CHUNK) {
    chunks.push(rows.slice(i, i + CHUNK));
  }

  const insertChunk = async (chunk) => {
    const placeholders = chunk.map(() => "(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").join(",");
    const values = [];
    for (const r of chunk) {
      const salesDate = r["실적일자"] || null;
      const salesAmt = parseFloat((r["원화판매금액"] || "0").replace(/,/g, "")) || 0;
      const qty = parseFloat((r["수량"] || "0").replace(/,/g, "")) || 0;
      const grossProfit = parseFloat((r["이익액"] || "0").replace(/,/g, "")) || 0;
      const d = salesDate ? new Date(salesDate) : null;
      const year = d ? d.getFullYear() : 0;
      const month = d ? d.getMonth() + 1 : 0;
      values.push(
        salesDate, year, month,
        null, null, null,
        r["부서"] || null, r["거래처"] || null,
        r["품목대분류"] || null, r["품목중분류"] || null, r["품목소분류"] || null,
        r["품명"] || null, r["품번"] || null,
        String(qty), String(salesAmt), "0", String(grossProfit),
        "2605.csv"
      );
    }
    const sql = `INSERT INTO sales_records
      (salesDate, year, month, weekLabel, yearMonth, yearStr,
       dept, channel, itemLarge, itemMid, itemSmall, itemName, itemCode,
       qty, salesAmt, costPerUnit, grossProfit, sourceFilename)
      VALUES ${placeholders}`;
    await conn.execute(sql, values);
  };

  t = Date.now();
  for (let i = 0; i < chunks.length; i += PARALLEL) {
    await Promise.all(chunks.slice(i, i + PARALLEL).map(insertChunk));
  }
  console.log(`[3] INSERT (${CHUNK}행×${PARALLEL}병렬): ${Date.now() - t}ms`);

  conn.release();
  await pool.end();
}

main().catch(console.error);
