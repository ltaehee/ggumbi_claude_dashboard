import "dotenv/config";
import { getItemPerformanceFromMart, getManagerMap } from "../server/db";

const norm = (s: string) => String(s ?? "").split(/\s+/).join(" ").trim();
const eok = (v: number) => (v / 1e8).toFixed(2) + "억";

// 2026 실적(품명별)
const perf = await getItemPerformanceFromMart({ startDate: "2026-01-01", endDate: "2026-12-31", dept: "국내사업팀", groupBy: "itemName", limit: 5000 });
// 담당 배정된 품명 집합 (product_targets에서 manager 있는 것)
const mm = await getManagerMap(2026);
const assigned = new Set<string>();
for (const m of mm) for (const n of m.itemNames) assigned.add(norm(n));

const withSales = perf.filter((r) => r.totalSales > 0);
const unassigned = withSales.filter((r) => !assigned.has(norm(r.label)));
const totalSales = withSales.reduce((s, r) => s + r.totalSales, 0);
const unassignedSales = unassigned.reduce((s, r) => s + r.totalSales, 0);

console.log("── 2026년 실적 기준 ──");
console.log("매출 있는 품명:", withSales.length, "개 / 총매출", eok(totalSales));
console.log("담당 배정된 품명:", assigned.size, "개");
console.log("");
console.log(`▶ 매출은 있는데 담당 미배정: ${unassigned.length}개  (매출 ${eok(unassignedSales)}, 전체의 ${(unassignedSales / totalSales * 100).toFixed(1)}%)`);
console.log("");
console.log("상위 20개 (매출순):");
for (const r of unassigned.sort((a, b) => b.totalSales - a.totalSales).slice(0, 20)) {
  console.log(`  ${eok(r.totalSales).padStart(8)}  ${r.label}`);
}
process.exit(0);
