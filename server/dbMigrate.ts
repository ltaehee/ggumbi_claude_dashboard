/**
 * 서버 시작 시 실행되는 DB 마이그레이션 헬퍼
 * - IF NOT EXISTS 방식으로 중복 실행 안전
 * - 인덱스 생성 실패 시 서버 시작을 막지 않음 (경고만 출력)
 * - raw mysql2 pool 사용 (DDL은 파라미터 바인딩 불필요)
 */
import mysql from "mysql2/promise";

const INDEX_MIGRATIONS: { name: string; ddl: string }[] = [
  {
    name: "idx_sr_sales_date",
    ddl: "CREATE INDEX idx_sr_sales_date ON sales_records (salesDate)",
  },
  {
    name: "idx_sr_dept_date",
    ddl: "CREATE INDEX idx_sr_dept_date ON sales_records (dept, salesDate)",
  },
  {
    name: "idx_sr_channel",
    ddl: "CREATE INDEX idx_sr_channel ON sales_records (channel)",
  },
  {
    name: "idx_sr_item_large",
    ddl: "CREATE INDEX idx_sr_item_large ON sales_records (itemLarge)",
  },
  {
    name: "idx_sr_item_mid",
    ddl: "CREATE INDEX idx_sr_item_mid ON sales_records (itemMid)",
  },
  {
    name: "idx_sr_item_small",
    ddl: "CREATE INDEX idx_sr_item_small ON sales_records (itemSmall)",
  },
  {
    name: "idx_sr_item_name",
    ddl: "CREATE INDEX idx_sr_item_name ON sales_records (itemName)",
  },
  {
    name: "idx_sr_source_filename",
    ddl: "CREATE INDEX idx_sr_source_filename ON sales_records (sourceFilename)",
  },
];

export async function runIndexMigrations() {
  if (!process.env.DATABASE_URL) {
    console.warn("[DB Migrate] DATABASE_URL 없음 - 인덱스 마이그레이션 건너뜀");
    return;
  }

  let conn: mysql.Connection | null = null;
  try {
    conn = await mysql.createConnection(process.env.DATABASE_URL);
  } catch (e) {
    console.warn("[DB Migrate] DB 연결 실패 - 인덱스 마이그레이션 건너뜀:", e);
    return;
  }

  // 현재 존재하는 인덱스 목록 조회
  let existingIndexes: Set<string> = new Set();
  try {
    const [rows] = await conn.execute(
      "SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sales_records'"
    );
    for (const row of rows as any[]) {
      const name = row.INDEX_NAME ?? row.index_name;
      if (name) existingIndexes.add(name);
    }
  } catch (e) {
    console.warn("[DB Migrate] 인덱스 목록 조회 실패:", e);
  }

  let created = 0;
  let skipped = 0;

  for (const migration of INDEX_MIGRATIONS) {
    if (existingIndexes.has(migration.name)) {
      skipped++;
      continue;
    }
    try {
      await conn.execute(migration.ddl);
      console.log(`[DB Migrate] 인덱스 생성: ${migration.name}`);
      created++;
    } catch (e: any) {
      // Duplicate key name 오류는 무시 (이미 존재)
      if (e?.message?.includes("Duplicate key name") || e?.code === "ER_DUP_KEYNAME") {
        skipped++;
      } else {
        console.warn(`[DB Migrate] 인덱스 생성 실패 (${migration.name}):`, e?.message ?? e);
      }
    }
  }

  try {
    await conn.end();
  } catch (_) {}

  if (created > 0 || skipped > 0) {
    console.log(`[DB Migrate] 인덱스 마이그레이션 완료: ${created}개 생성, ${skipped}개 이미 존재`);
  }
}
