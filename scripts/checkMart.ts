import mysql from 'mysql2/promise';

async function main() {
  const pool = mysql.createPool(process.env.DATABASE_URL!);

  const [rows] = await pool.execute('SELECT COUNT(*) as cnt FROM sales_daily_mart') as any;
  console.log('마트 테이블 행 수:', rows[0].cnt);

  const [srcRows] = await pool.execute('SELECT COUNT(*) as cnt FROM sales_records') as any;
  console.log('원본 테이블 행 수:', srcRows[0].cnt);

  const [fileRows] = await pool.execute('SELECT DISTINCT sourceFilename FROM sales_records WHERE sourceFilename IS NOT NULL LIMIT 10') as any;
  console.log('업로드된 파일:', fileRows.map((r: any) => r.sourceFilename));

  await pool.end();
}

main().catch(console.error);
