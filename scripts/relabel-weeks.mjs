/**
 * 기존 데이터의 weekLabel 재라벨링 (일회성 유지보수 스크립트)
 *
 * 배경: 과거 업로드 시 salesDate는 UTC(toISOString) 기준으로 저장됐지만
 *       weekLabel은 서버 로컬 타임존의 getDay()로 계산되어 주차 경계가 어긋났음.
 *       이 스크립트는 저장된 salesDate(캘린더 값)를 기준으로 올바른 일~토 주차로 다시 계산해
 *       sales_records, sales_daily_mart 두 테이블의 weekLabel을 갱신한다.
 *
 * 실행: corepack pnpm@10.4.1 exec tsx scripts/relabel-weeks.mjs
 */
import "dotenv/config";
import mysql from "mysql2/promise";
import { weekLabelFromYMD } from "../server/bizUtils.ts";

const pool = mysql.createPool(process.env.DATABASE_URL);

async function relabel(table) {
  // 저장된 캘린더 날짜를 타임존 영향 없이 문자열로 읽음
  const [dates] = await pool.execute(
    `SELECT DISTINCT DATE_FORMAT(salesDate, '%Y-%m-%d') AS d FROM ${table} WHERE salesDate IS NOT NULL`
  );

  // 올바른 weekLabel별로 날짜를 묶어 IN 절로 일괄 업데이트
  const byLabel = new Map();
  for (const { d } of dates) {
    const [y, m, dd] = d.split("-").map(Number);
    const label = weekLabelFromYMD(y, m, dd);
    if (!byLabel.has(label)) byLabel.set(label, []);
    byLabel.get(label).push(d);
  }

  let changed = 0;
  for (const [label, ds] of byLabel) {
    const placeholders = ds.map(() => "?").join(",");
    const [res] = await pool.execute(
      `UPDATE ${table} SET weekLabel = ? WHERE salesDate IN (${placeholders})`,
      [label, ...ds]
    );
    changed += res.affectedRows ?? 0;
  }
  console.log(`  ${table}: ${dates.length}개 날짜 처리, ${changed}행 라벨 변경됨`);
}

console.log("주차 라벨 재계산 시작...");
await relabel("sales_records");
await relabel("sales_daily_mart");

// 검증: 최근 경계 구간 확인
const [check] = await pool.execute(
  `SELECT weekLabel, MIN(DATE_FORMAT(salesDate,'%Y-%m-%d')) AS s, MAX(DATE_FORMAT(salesDate,'%Y-%m-%d')) AS e
   FROM sales_daily_mart
   WHERE salesDate >= '2026-05-24' AND salesDate <= '2026-06-15'
   GROUP BY weekLabel ORDER BY MIN(salesDate)`
);
console.log("\n검증 (마트, 5/24~6/15):");
for (const r of check) console.log(`  ${r.weekLabel}  =  ${r.s} ~ ${r.e}`);

await pool.end();
console.log("\n완료.");
