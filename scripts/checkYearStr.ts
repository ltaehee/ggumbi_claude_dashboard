import mysql from 'mysql2/promise';

async function main() {
  const pool = mysql.createPool(process.env.DATABASE_URL!);
  const [rows] = await pool.execute('SELECT DISTINCT yearStr, yearMonth, weekLabel FROM sales_records LIMIT 10') as any;
  console.log('yearStr 샘플:', rows);
  await pool.end();
}

main().catch(console.error);
