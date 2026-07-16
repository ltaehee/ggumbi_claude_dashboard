import "dotenv/config";
import { readFileSync } from "fs";
import { parseProductTargetFile } from "../server/excelPipeline";
import { getMonthlyTargetSums, getManagerMap } from "../server/db";

const F = "Z:/03_국내사업/▶17.이태희 AM/국내사업팀 대시보드/2026년_상품별_목표 - 복사본.xlsx";
const eok = (v: number) => (v / 1e8).toFixed(2) + "억";

const buf = readFileSync(F);
const res = await parseProductTargetFile(buf, "2026년_상품별_목표.xlsx", "verify-script");
console.log("파싱 결과:", res);
const year = res.year!;

const total = await getMonthlyTargetSums(year);
console.log("\n[전체] 연 목표:", eok(total.reduce((a, b) => a + b, 0)));
console.log("  월별:", total.map((v, i) => `${i + 1}월 ${eok(v)}`).join("  "));

console.log("\n[팀별]");
for (const team of ["매트사업팀", "육아용품사업팀"]) {
  const t = await getMonthlyTargetSums(year, { team });
  console.log("  ", team, eok(t.reduce((a, b) => a + b, 0)));
}

console.log("\n[담당자별]");
const mgrs = await getManagerMap(year);
for (const m of mgrs.sort((a, b) => a.team.localeCompare(b.team))) {
  const t = await getMonthlyTargetSums(year, { manager: m.manager });
  console.log("  ", m.manager, `(${m.team})`, eok(t.reduce((a, b) => a + b, 0)), "· 담당품명", m.itemNames.length + "개");
}
process.exit(0);
