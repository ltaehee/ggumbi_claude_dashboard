import { createConnection } from "mysql2/promise";
import * as dotenv from "dotenv";
dotenv.config();

const conn = await createConnection(process.env.DATABASE_URL);
try {
  // 실제 컬럼명 확인
  const [cols] = await conn.query("SHOW COLUMNS FROM naver_rankings");
  console.log("=== COLUMNS ===");
  for (const c of cols) {
    console.log(c.Field, c.Type);
  }

  // 샘플 쿼리 - 컬럼명 확인
  const [rows] = await conn.query("SELECT * FROM naver_rankings LIMIT 1");
  console.log("\n=== SAMPLE ROW KEYS ===");
  if (rows[0]) console.log(Object.keys(rows[0]));

  // 문제 쿼리 직접 테스트
  const [rows2] = await conn.execute(
    "SELECT productCode, `rank`, productName, price, seller, recordedAt FROM naver_rankings WHERE keyword = ? AND recordedDate = ? ORDER BY `rank` ASC LIMIT 3",
    ["강아지계단", "2026-06-02"]
  );
  console.log("\n=== QUERY TEST ===");
  console.log(JSON.stringify(rows2[0]));
} catch (e) {
  console.error("ERR:", e.message);
} finally {
  conn.end();
}
