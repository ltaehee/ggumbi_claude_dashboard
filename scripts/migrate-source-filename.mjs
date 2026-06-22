/**
 * DB 마이그레이션: sales_records에 sourceFilename 컬럼 추가
 *                  uploaded_files에 UNIQUE 인덱스 추가
 */
import mysql from "mysql2/promise";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFileSync, existsSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, "../.env");
if (existsSync(envPath)) dotenv.config({ path: envPath });

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const conn = await mysql.createConnection(dbUrl);

try {
  // 1) sales_records에 sourceFilename 컬럼 추가 (없으면)
  const [cols] = await conn.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sales_records' AND COLUMN_NAME = 'sourceFilename'`
  );
  if (cols.length === 0) {
    await conn.query("ALTER TABLE `sales_records` ADD COLUMN `sourceFilename` varchar(255)");
    console.log("✓ sales_records.sourceFilename 컬럼 추가 완료");
  } else {
    console.log("- sales_records.sourceFilename 이미 존재");
  }

  // 2) uploaded_files UNIQUE 인덱스 추가 (없으면)
  const [idxs] = await conn.query(
    `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'uploaded_files' AND INDEX_NAME = 'uploaded_files_filename_uniq'`
  );
  if (idxs.length === 0) {
    // 기존 중복 파일명이 있으면 최신 것만 남기고 삭제
    await conn.query(`
      DELETE uf1 FROM uploaded_files uf1
      INNER JOIN uploaded_files uf2
        ON uf1.filename = uf2.filename AND uf1.id < uf2.id
    `);
    await conn.query(
      "CREATE UNIQUE INDEX `uploaded_files_filename_uniq` ON `uploaded_files` (`filename`)"
    );
    console.log("✓ uploaded_files UNIQUE 인덱스 추가 완료");
  } else {
    console.log("- uploaded_files UNIQUE 인덱스 이미 존재");
  }

  console.log("마이그레이션 완료!");
} catch (err) {
  console.error("마이그레이션 실패:", err.message);
  process.exit(1);
} finally {
  await conn.end();
}
