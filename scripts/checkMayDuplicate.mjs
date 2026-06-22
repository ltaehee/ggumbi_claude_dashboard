import { createPool } from 'mysql2/promise';
import * as dotenv from 'dotenv';
dotenv.config();

const pool = createPool({ uri: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const [rows] = await pool.execute(`
  SELECT COALESCE(sourceFilename, 'NULL_FILE') as srcFile, COUNT(*) as cnt, 
         MIN(salesDate) as minD, MAX(salesDate) as maxD, 
         SUM(salesAmt) as totalAmt 
  FROM sales_records 
  WHERE salesDate >= '2026-05-01' AND salesDate <= '2026-05-31' 
  GROUP BY sourceFilename ORDER BY cnt DESC
`);
console.log('=== 5월 데이터 sourceFilename별 현황 ===');
console.table(rows);

// 전체 5월 합계
const [total] = await pool.execute(`
  SELECT COUNT(*) as totalRows, SUM(salesAmt) as totalAmt 
  FROM sales_records 
  WHERE salesDate >= '2026-05-01' AND salesDate <= '2026-05-31'
`);
console.log('=== 5월 전체 합계 ===');
console.table(total);

await pool.end();
