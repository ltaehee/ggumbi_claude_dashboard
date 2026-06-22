import mysql from 'mysql2/promise';

async function main() {
  const pool = mysql.createPool(process.env.DATABASE_URL!);
  
  const [martRows] = await pool.execute('SELECT COUNT(*) as cnt FROM sales_daily_mart') as any;
  console.log('마트 행 수:', martRows[0].cnt);
  
  const [fileRows] = await pool.execute('SELECT DISTINCT sourceFilename FROM sales_daily_mart') as any;
  console.log('마트에 있는 파일:', fileRows.map((r: any) => r.sourceFilename));
  
  const [srcFileRows] = await pool.execute('SELECT DISTINCT sourceFilename FROM sales_records WHERE sourceFilename IS NOT NULL') as any;
  console.log('원본에 있는 파일:', srcFileRows.map((r: any) => r.sourceFilename));
  
  const [sampleRows] = await pool.execute('SELECT salesDate, yearMonth, yearStr, weekLabel, dept, channel, totalSalesAmt FROM sales_daily_mart LIMIT 5') as any;
  console.log('마트 샘플:', sampleRows);
  
  await pool.end();
}

main().catch(console.error);
