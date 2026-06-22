import { rebuildMartFromAllRecords, getMartRowCount } from "../server/db";

async function main() {
  const before = await getMartRowCount();
  console.log(`[Mart Build] 빌드 전 마트 행 수: ${before}`);
  
  const result = await rebuildMartFromAllRecords();
  console.log(`[Mart Build] 완료: ${result.filenames.join(", ")} (${result.built}행)`);
  
  const after = await getMartRowCount();
  console.log(`[Mart Build] 빌드 후 마트 행 수: ${after}`);
}

main().catch(console.error);
