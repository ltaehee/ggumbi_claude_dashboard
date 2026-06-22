import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import {
  appSettings,
  bomCosts,
  inventory,
  itemMappings,
  newProducts,
  promotions,
  salesAnalysisMemos,
  salesDailyMart,
  salesRecords,
  salesTargets,
  uploadedFiles,
  users,
} from "../drizzle/schema";
import type { InsertUser, InsertNewProduct } from "../drizzle/schema";

let _db: ReturnType<typeof drizzle> | null = null;
let _rawPool: mysql.Pool | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

/** raw mysql2 pool for bulk operations */
function getRawPool(): mysql.Pool {
  if (!_rawPool && process.env.DATABASE_URL) {
    _rawPool = mysql.createPool(process.env.DATABASE_URL);
  }
  if (!_rawPool) throw new Error("No DATABASE_URL");
  return _rawPool;
}

// ─── Auth helpers ──────────────────────────────────────────────────────────────
export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};

  (["name", "email", "loginMethod"] as const).forEach((field) => {
    const value = user[field];
    if (value === undefined) return;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  });

  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ─── Upload history ────────────────────────────────────────────────────────────
export async function insertUploadRecord(data: {
  filename: string;
  fileType: "sales" | "bom" | "target" | "promotion" | "inventory";
  rowCount: number;
  uploadedBy?: string;
}) {
  const db = await getDb();
  if (!db) return;
  // 동일 파일명이 이미 업로드된 경우 upsert (업로드 시각 갱신)
  await db
    .insert(uploadedFiles)
    .values(data)
    .onDuplicateKeyUpdate({
      set: {
        fileType: data.fileType,
        rowCount: data.rowCount,
        uploadedAt: new Date(),
        uploadedBy: data.uploadedBy ?? null,
      },
    });
}

/**
 * 동일 파일명으로 저장된 sales_records 삭제
 * 업로드 전 호출하여 기존 데이터를 완전히 대체
 */
/** 파일명에서 확장자를 제거한 stem 반환 (예: '2605.csv' -> '2605') */
function getFileStem(filename: string): string {
  return filename.replace(/\.[^.]+$/, '');
}

export async function deleteSalesByFilename(filename: string): Promise<number> {
  const pool = getRawPool();
  const stem = getFileStem(filename);
  // 확장자 무시: stem이 같으면 동일 파일로 처리 (예: 2605.csv = 2605.xlsx)
  const [result] = await pool.execute(
    "DELETE FROM sales_records WHERE REPLACE(REPLACE(sourceFilename, '.csv', ''), '.xlsx', '') = ?",
    [stem]
  ) as [mysql.ResultSetHeader, unknown];
  return result.affectedRows ?? 0;
}

export async function getUploadHistory(limit = 50) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(uploadedFiles)
    .orderBy(desc(uploadedFiles.uploadedAt))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    fileName: r.filename,
    fileType: r.fileType,
    rowCount: r.rowCount,
    status: "success" as const,
    uploadedAt: r.uploadedAt ? r.uploadedAt.toISOString() : null,
  }));
}

// ─── BOM costs ─────────────────────────────────────────────────────────────────
/**
 * BOM 원가 upsert - 월별 관리
 * yearMonth: 'YYYYMM' 형식 (e.g. '202605')
 */
export async function upsertBomCosts(
  rows: { itemCode: string; costPerUnit: number }[],
  yearMonth: string
) {
  const db = await getDb();
  if (!db) return 0;
  let count = 0;
  for (const row of rows) {
    await db
      .insert(bomCosts)
      .values({ yearMonth, itemCode: row.itemCode, costPerUnit: String(row.costPerUnit) })
      .onDuplicateKeyUpdate({ set: { costPerUnit: String(row.costPerUnit) } });
    count++;
  }
  return count;
}

/**
 * 특정 월(YYYYMM)의 BOM 원가 맵 반환
 * 해당 월 BOM이 없으면 가장 최근 월 BOM으로 폴백
 */
export async function getAllBomCosts(yearMonth?: string): Promise<Map<string, number>> {
  const db = await getDb();
  if (!db) return new Map();

  // 등록된 모든 월 목록 (내림차순)
  const allYMs = await db
    .selectDistinct({ ym: bomCosts.yearMonth })
    .from(bomCosts)
    .orderBy(sql`yearMonth DESC`);
  if (allYMs.length === 0) return new Map();

  let targetYM: string;
  if (!yearMonth) {
    // 미지정 시 가장 최신 월
    targetYM = allYMs[0].ym;
  } else {
    const ymList = allYMs.map((r) => r.ym);
    if (ymList.includes(yearMonth)) {
      // 해당 월 BOM 존재
      targetYM = yearMonth;
    } else {
      // 해당 월 BOM 없음 → 가장 가까운 이전 월 BOM 사용, 없으면 가장 오래된 월
      const earlier = ymList.filter((ym) => ym <= yearMonth);
      targetYM = earlier.length > 0 ? earlier[0] : ymList[ymList.length - 1];
      console.log(`[BOM] ${yearMonth} BOM 없음 → ${targetYM} BOM으로 대체`);
    }
  }

  const rows = await db.select().from(bomCosts).where(eq(bomCosts.yearMonth, targetYM));
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.itemCode, parseFloat(String(r.costPerUnit ?? "0")));
  return map;
}

// ─── Sales records ─────────────────────────────────────────────────────────────
export async function bulkInsertSales(
  rows: {
    salesDate: string;
    year: number;
    month: number;
    weekLabel?: string;
    yearMonth?: string;
    yearStr?: string;
    dept?: string;
    channel?: string;
    itemLarge?: string;
    itemMid?: string;
    itemSmall?: string;
    itemName?: string;
    itemCode?: string;
    qty: number;
    salesAmt: number;
    costPerUnit: number;
    grossProfit: number;
    sourceFilename?: string; // 덮어쓰기 추적용
  }[]
) {
  if (rows.length === 0) return 0;
  const pool = getRawPool();
  const conn = await pool.getConnection();
  try {
    // 대량 INSERT: 3000행씩 멀티로우 INSERT로 속도 최적화
    const CHUNK = 3000;
    const PARALLEL = 8;
    const chunks: (typeof rows)[] = [];
    for (let i = 0; i < rows.length; i += CHUNK) {
      chunks.push(rows.slice(i, i + CHUNK));
    }

    const insertChunk = async (chunk: typeof rows) => {
      const placeholders = chunk.map(() => "(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").join(",");
      const values: any[] = [];
      for (const r of chunk) {
        values.push(
          r.salesDate,
          r.year,
          r.month,
          r.weekLabel ?? null,
          r.yearMonth ?? null,
          r.yearStr ?? null,
          r.dept ?? null,
          r.channel ?? null,
          r.itemLarge ?? null,
          r.itemMid ?? null,
          r.itemSmall ?? null,
          r.itemName ?? null,
          r.itemCode ?? null,
          String(r.qty),
          String(r.salesAmt),
          String(r.costPerUnit),
          String(r.grossProfit),
          r.sourceFilename ?? null
        );
      }
      // 스키마의 camelCase 콼럼명 그대로 사용
      const sqlStr = `INSERT INTO sales_records
        (salesDate, year, month, weekLabel, yearMonth, yearStr,
         dept, channel, itemLarge, itemMid, itemSmall, itemName, itemCode,
         qty, salesAmt, costPerUnit, grossProfit, sourceFilename)
        VALUES ${placeholders}`;
      await conn.execute(sqlStr, values);
    };

    // PARALLEL개씩 병렬 실행
    for (let i = 0; i < chunks.length; i += PARALLEL) {
      await Promise.all(chunks.slice(i, i + PARALLEL).map(insertChunk));
    }

    return rows.length;
  } finally {
    conn.release();
  }
}

export async function getDepts(): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .selectDistinct({ dept: salesRecords.dept })
    .from(salesRecords)
    .where(sql`dept IS NOT NULL`);
  return rows
    .map((r) => r.dept ?? "")
    .filter(Boolean)
    .sort();
}

export async function getSalesRange(): Promise<{ min: string | null; max: string | null }> {
  const db = await getDb();
  if (!db) return { min: null, max: null };
  const rows = await db
    .select({
      min: sql<string>`MIN(salesDate)`,
      max: sql<string>`MAX(salesDate)`,
    })
    .from(salesRecords);
  return rows[0] ?? { min: null, max: null };
}

// ─── KPI aggregation ───────────────────────────────────────────────────────────
export async function aggregateSales(params: {
  startDate: string;
  endDate: string;
  dept?: string;
  itemLarge?: string;
  itemMid?: string;
  itemSmall?: string;
  itemName?: string;
  // 다중 선택 필터 (배열)
  channels?: string[];
  itemLarges?: string[];
  itemMids?: string[];
  itemSmalls?: string[];
  itemNames?: string[];
}): Promise<{ totalSales: number; totalQty: number; totalProfit: number }> {
  const db = await getDb();
  if (!db) return { totalSales: 0, totalQty: 0, totalProfit: 0 };
  const conditions = [
    sql`salesDate >= ${params.startDate}`,
    sql`salesDate <= ${params.endDate}`,
  ];
  if (params.dept) conditions.push(eq(salesRecords.dept, params.dept));
  if (params.itemLarge) conditions.push(eq(salesRecords.itemLarge, params.itemLarge));
  if (params.itemMid) conditions.push(eq(salesRecords.itemMid, params.itemMid));
  if (params.itemSmall) conditions.push(eq(salesRecords.itemSmall, params.itemSmall));
  if (params.itemName) conditions.push(eq(salesRecords.itemName, params.itemName));
  // 다중 선택 필터
  if (params.channels?.length) conditions.push(inArray(salesRecords.channel, params.channels));
  if (params.itemLarges?.length) conditions.push(inArray(salesRecords.itemLarge, params.itemLarges));
  if (params.itemMids?.length) conditions.push(inArray(salesRecords.itemMid, params.itemMids));
  if (params.itemSmalls?.length) conditions.push(inArray(salesRecords.itemSmall, params.itemSmalls));
  if (params.itemNames?.length) conditions.push(inArray(salesRecords.itemName, params.itemNames));

  const rows = await db
    .select({
      totalSales: sql<number>`SUM(CAST(${salesRecords.salesAmt} AS DECIMAL(18,2)))`,
      totalQty: sql<number>`SUM(CAST(${salesRecords.qty} AS DECIMAL(15,2)))`,
      // BOM 원가가 있으면 매출 - 원가×수량, 없으면 0으로 처리
      totalProfit: sql<number>`SUM(
        CASE
          WHEN ${bomCosts.costPerUnit} IS NOT NULL
          THEN CAST(${salesRecords.salesAmt} AS DECIMAL(18,2)) - CAST(${bomCosts.costPerUnit} AS DECIMAL(18,2)) * CAST(${salesRecords.qty} AS DECIMAL(15,2))
          ELSE 0
        END
      )`,
    })
    .from(salesRecords)
    .leftJoin(bomCosts, eq(salesRecords.itemCode, bomCosts.itemCode))
    .where(and(...conditions));

  const r = rows[0];
  return {
    totalSales: Number(r?.totalSales ?? 0),
    totalQty: Number(r?.totalQty ?? 0),
    totalProfit: Number(r?.totalProfit ?? 0),
  };
}

// ─── Trend data ────────────────────────────────────────────────────────────────
export async function getTrendData(params: {
  startDate: string;
  endDate: string;
  dept?: string;
  groupBy: "weekLabel" | "yearMonth" | "yearStr";
  channels?: string[];
  itemLarges?: string[];
  itemMids?: string[];
  itemSmalls?: string[];
  itemNames?: string[];
}) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [
    sql`salesDate >= ${params.startDate}`,
    sql`salesDate <= ${params.endDate}`,
  ];
  if (params.dept) conditions.push(eq(salesRecords.dept, params.dept));
  if (params.channels?.length) conditions.push(inArray(salesRecords.channel, params.channels));
  if (params.itemLarges?.length) conditions.push(inArray(salesRecords.itemLarge, params.itemLarges));
  if (params.itemMids?.length) conditions.push(inArray(salesRecords.itemMid, params.itemMids));
  if (params.itemSmalls?.length) conditions.push(inArray(salesRecords.itemSmall, params.itemSmalls));
  if (params.itemNames?.length) conditions.push(inArray(salesRecords.itemName, params.itemNames));

  const groupCol =
    params.groupBy === "weekLabel"
      ? salesRecords.weekLabel
      : params.groupBy === "yearMonth"
        ? salesRecords.yearMonth
        : salesRecords.yearStr;

  const rows = await db
    .select({
      label: groupCol,
      totalSales: sql<number>`SUM(salesAmt)`,
      totalQty: sql<number>`SUM(CAST(qty AS DECIMAL(15,2)))`,
      minDate: sql<string>`MIN(salesDate)`,
      maxDate: sql<string>`MAX(salesDate)`,
    })
    .from(salesRecords)
    .where(and(...conditions))
    .groupBy(groupCol)
    .orderBy(sql`MIN(salesDate)`);

  return rows.map((r) => ({
    label: r.label ?? "",
    totalSales: Number(r.totalSales ?? 0),
    totalQty: Number(r.totalQty ?? 0),
    minDate: r.minDate,
    maxDate: r.maxDate,
  }));
}

// ─── Item performance ──────────────────────────────────────────────────────────
export async function getItemPerformance(params: {
  startDate: string;
  endDate: string;
  dept?: string;
  groupBy: "itemName" | "itemLarge" | "itemMid" | "itemSmall" | "channel";
  limit?: number;
  channels?: string[];
  itemLarges?: string[];
  itemMids?: string[];
  itemSmalls?: string[];
  itemNames?: string[];
}) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [
    sql`salesDate >= ${params.startDate}`,
    sql`salesDate <= ${params.endDate}`,
  ];
  if (params.dept) conditions.push(eq(salesRecords.dept, params.dept));
  if (params.channels?.length) conditions.push(inArray(salesRecords.channel, params.channels));
  if (params.itemLarges?.length) conditions.push(inArray(salesRecords.itemLarge, params.itemLarges));
  if (params.itemMids?.length) conditions.push(inArray(salesRecords.itemMid, params.itemMids));
  if (params.itemSmalls?.length) conditions.push(inArray(salesRecords.itemSmall, params.itemSmalls));
  if (params.itemNames?.length) conditions.push(inArray(salesRecords.itemName, params.itemNames));

  const groupColMap = {
    itemName: salesRecords.itemName,
    itemLarge: salesRecords.itemLarge,
    itemMid: salesRecords.itemMid,
    itemSmall: salesRecords.itemSmall,
    channel: salesRecords.channel,
  };
  const groupCol = groupColMap[params.groupBy];

  const rows = await db
    .select({
      label: groupCol,
      totalSales: sql<number>`SUM(CAST(${salesRecords.salesAmt} AS DECIMAL(18,2)))`,
      totalQty: sql<number>`SUM(CAST(${salesRecords.qty} AS DECIMAL(15,2)))`,
      // BOM 원가 JOIN 기반 실제 이익 계산
      totalProfit: sql<number>`SUM(
        CASE
          WHEN ${bomCosts.costPerUnit} IS NOT NULL
          THEN CAST(${salesRecords.salesAmt} AS DECIMAL(18,2)) - CAST(${bomCosts.costPerUnit} AS DECIMAL(18,2)) * CAST(${salesRecords.qty} AS DECIMAL(15,2))
          ELSE 0
        END
      )`,
    })
    .from(salesRecords)
    .leftJoin(bomCosts, eq(salesRecords.itemCode, bomCosts.itemCode))
    .where(and(...conditions))
    .groupBy(groupCol)
    .orderBy(sql`SUM(CAST(${salesRecords.salesAmt} AS DECIMAL(18,2))) DESC`)
    .limit(params.limit ?? 20);

  return rows.map((r) => ({
    label: r.label ?? "싸지정",
    totalSales: Number(r.totalSales ?? 0),
    totalQty: Number(r.totalQty ?? 0),
    totalProfit: Number(r.totalProfit ?? 0),
  }));
}

// ─── Sales targets ─────────────────────────────────────────────────────────────
export async function upsertSalesTargets(
  rows: { dept: string; itemMid: string; year: number; month: number; targetAmt: number }[]
) {
  const db = await getDb();
  if (!db) return 0;
  for (const row of rows) {
    await db
      .insert(salesTargets)
      .values({ ...row, targetAmt: String(row.targetAmt) })
      .onDuplicateKeyUpdate({ set: { targetAmt: String(row.targetAmt) } });
  }
  return rows.length;
}

export async function getTargetsByDeptYear(dept: string, year: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(salesTargets)
    .where(and(eq(salesTargets.dept, dept), eq(salesTargets.year, year)));
}

// ─── Promotions ────────────────────────────────────────────────────────────────
export async function upsertPromotions(
  rows: {
    dept?: string;
    channel?: string;
    eventName?: string;
    startDate?: string;
    endDate?: string;
    targetAmt?: number;
    achievedAmt?: number;
    note?: string;
  }[]
) {
  const db = await getDb();
  if (!db) return 0;
  for (const row of rows) {
    const { startDate, endDate, targetAmt, achievedAmt, ...rest } = row;
    await db.insert(promotions).values({
      ...rest,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      targetAmt: String(targetAmt ?? 0),
      achievedAmt: String(achievedAmt ?? 0),
    });
  }
  return rows.length;
}

// ─── 노션 동기화 전용 Upsert (notionPageId 기반) ─────────────────────────────
export async function upsertPromotionsFromNotion(
  rows: {
    notionPageId: string;
    eventName: string;
    startDate: string | null;
    endDate: string | null;
    channel: string | null;
    dept: string | null;
    targetAmt: number | null;
    achievedAmt: number | null;
    note: string | null;
  }[]
): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  let count = 0;
  for (const row of rows) {
    const values = {
      notionPageId: row.notionPageId,
      eventName: row.eventName,
      dept: row.dept ?? undefined,
      channel: row.channel ?? undefined,
      startDate: row.startDate ? new Date(row.startDate) : undefined,
      endDate: row.endDate ? new Date(row.endDate) : undefined,
      targetAmt: String(row.targetAmt ?? 0),
      achievedAmt: String(row.achievedAmt ?? 0),
      note: row.note ?? undefined,
    };
    await db
      .insert(promotions)
      .values(values)
      .onDuplicateKeyUpdate({
        set: {
          eventName: values.eventName,
          dept: values.dept,
          channel: values.channel,
          startDate: values.startDate,
          endDate: values.endDate,
          targetAmt: values.targetAmt,
          achievedAmt: values.achievedAmt,
          note: values.note,
        },
      });
    count++;
  }
  return count;
}

export async function getPromotionsByMonth(year: number, month: number) {
  const db = await getDb();
  if (!db) return [];
  const startStr = `${year}-${String(month).padStart(2, "0")}-01`;
  const endStr = `${year}-${String(month).padStart(2, "0")}-31`;
  const rows = await db
    .select()
    .from(promotions)
    .where(sql`(startDate <= ${endStr} AND endDate >= ${startStr})`);
  return rows.map((r) => ({
    ...r,
    startDate: r.startDate ? (r.startDate as Date).toISOString().split("T")[0] : null,
    endDate: r.endDate ? (r.endDate as Date).toISOString().split("T")[0] : null,
    targetAmt: parseFloat(String(r.targetAmt ?? "0")),
    achievedAmt: parseFloat(String(r.achievedAmt ?? "0")),
  }));
}

// ─── Inventory ─────────────────────────────────────────────────────────────────
export async function upsertInventory(
  rows: { itemCode: string; itemName?: string; currentStock: number; expiryDate?: string }[]
) {
  const db = await getDb();
  if (!db) return 0;
  for (const row of rows) {
    const { expiryDate, currentStock, ...rest } = row;
    await db
      .insert(inventory)
      .values({
        ...rest,
        currentStock: String(currentStock),
        expiryDate: expiryDate ? new Date(expiryDate) : undefined,
      })
      .onDuplicateKeyUpdate({
        set: {
          currentStock: String(currentStock),
          itemName: row.itemName,
        },
      });
  }
  return rows.length;
}

export async function getInventoryMap(): Promise<Map<string, number>> {
  const db = await getDb();
  if (!db) return new Map();
  const rows = await db.select().from(inventory);
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.itemCode, parseFloat(String(r.currentStock ?? "0")));
  return map;
}

// ─── DOC analysis ──────────────────────────────────────────────────────────────
export async function getSalesForDOC(params: {
  startDate: string;
  endDate: string;
  dept?: string;
}) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [
    sql`salesDate >= ${params.startDate}`,
    sql`salesDate <= ${params.endDate}`,
  ];
  if (params.dept) conditions.push(eq(salesRecords.dept, params.dept));

  return db
    .select({
      itemCode: salesRecords.itemCode,
      itemName: salesRecords.itemName,
      itemLarge: salesRecords.itemLarge,
      itemMid: salesRecords.itemMid,
      itemSmall: salesRecords.itemSmall,
      totalQty: sql<number>`SUM(CAST(qty AS DECIMAL(15,2)))`,
    })
    .from(salesRecords)
    .where(and(...conditions))
    .groupBy(salesRecords.itemCode, salesRecords.itemName, salesRecords.itemLarge, salesRecords.itemMid, salesRecords.itemSmall);
}

export async function getRecentSales30d(dept?: string) {
  const db = await getDb();
  if (!db) return [];
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffStr = cutoff.toISOString().split("T")[0];

  const conditions = [gte(salesRecords.salesDate, cutoffStr as unknown as Date)];
  if (dept) conditions.push(eq(salesRecords.dept, dept));

  return db
    .select({
      itemCode: salesRecords.itemCode,
      totalQty: sql<number>`SUM(CAST(qty AS DECIMAL(15,2)))`,
    })
    .from(salesRecords)
    .where(and(...conditions))
    .groupBy(salesRecords.itemCode);
}

// ─── App settings (비밀번호 등 앱 설정) ───────────────────────────────────────────
export async function getAppSetting(key: string): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.settingKey, key))
    .limit(1);
  return rows[0]?.settingValue ?? null;
}

export async function setAppSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .insert(appSettings)
    .values({ settingKey: key, settingValue: value })
    .onDuplicateKeyUpdate({ set: { settingValue: value } });
}

// ─── Admin: Sales records management ──────────────────────────────────────────
export async function getSalesRecordsPaged(params: {
  startDate?: string;
  endDate?: string;
  dept?: string;
  page: number;
  pageSize: number;
}) {
  const db = await getDb();
  if (!db) return { rows: [], total: 0 };
  const { startDate, endDate, dept, page, pageSize } = params;

  const conditions: ReturnType<typeof sql>[] = [];
  if (startDate) conditions.push(sql`salesDate >= ${startDate}`);
  if (endDate) conditions.push(sql`salesDate <= ${endDate}`);
  if (dept) conditions.push(eq(salesRecords.dept, dept));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, countRows] = await Promise.all([
    db
      .select()
      .from(salesRecords)
      .where(whereClause)
      .orderBy(desc(salesRecords.salesDate))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(salesRecords)
      .where(whereClause),
  ]);

  return {
    rows: rows.map((r) => ({
      id: r.id,
      salesDate: r.salesDate ? String(r.salesDate).split("T")[0] : "",
      dept: r.dept ?? "",
      channel: r.channel ?? "",
      itemLarge: r.itemLarge ?? "",
      itemMid: r.itemMid ?? "",
      itemName: r.itemName ?? "",
      itemCode: r.itemCode ?? "",
      qty: Number(r.qty ?? 0),
      salesAmt: Number(r.salesAmt ?? 0),
      costPerUnit: Number(r.costPerUnit ?? 0),
      grossProfit: Number(r.grossProfit ?? 0),
    })),
    total: Number(countRows[0]?.count ?? 0),
  };
}

export async function deleteSalesRecord(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(salesRecords).where(eq(salesRecords.id, id));
}

export async function deleteSalesByDateRange(startDate: string, endDate: string, dept?: string): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const conditions = [
    sql`salesDate >= ${startDate}`,
    sql`salesDate <= ${endDate}`,
  ];
  if (dept) conditions.push(eq(salesRecords.dept, dept));
  await db.delete(salesRecords).where(and(...conditions));
  return 0; // MySQL2 delete result count not easily accessible via Drizzle ORM
}

// ─── Admin: Sales targets management ──────────────────────────────────────────
export async function getAllSalesTargets() {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(salesTargets)
    .orderBy(salesTargets.year, salesTargets.month, salesTargets.dept);
  return rows.map((r) => ({
    id: r.id,
    dept: r.dept,
    itemMid: r.itemMid,
    year: r.year,
    month: r.month,
    targetAmt: Number(r.targetAmt ?? 0),
    updatedAt: r.updatedAt ? r.updatedAt.toISOString() : null,
  }));
}

export async function updateSalesTarget(id: number, targetAmt: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(salesTargets)
    .set({ targetAmt: String(targetAmt) })
    .where(eq(salesTargets.id, id));
}

export async function deleteSalesTarget(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(salesTargets).where(eq(salesTargets.id, id));
}

export async function insertSalesTarget(data: {
  dept: string;
  itemMid: string;
  year: number;
  month: number;
  targetAmt: number;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .insert(salesTargets)
    .values({ ...data, targetAmt: String(data.targetAmt) })
    .onDuplicateKeyUpdate({ set: { targetAmt: String(data.targetAmt) } });
}

// ─── Admin: BOM costs management ──────────────────────────────────────────────
export async function getAllBomCostsList() {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(bomCosts).orderBy(bomCosts.yearMonth, bomCosts.itemCode);
  return rows.map((r) => ({
    id: r.id,
    yearMonth: r.yearMonth,
    itemCode: r.itemCode,
    costPerUnit: Number(r.costPerUnit ?? 0),
    updatedAt: r.updatedAt ? r.updatedAt.toISOString() : null,
  }));
}

/** BOM이 등록된 월 목록 (내림차순) */
export async function getBomYearMonths(): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .selectDistinct({ ym: bomCosts.yearMonth })
    .from(bomCosts)
    .orderBy(sql`yearMonth DESC`);
  return rows.map((r) => r.ym);
}

export async function updateBomCost(id: number, costPerUnit: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(bomCosts)
    .set({ costPerUnit: String(costPerUnit) })
    .where(eq(bomCosts.id, id));
}

export async function deleteBomCost(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(bomCosts).where(eq(bomCosts.id, id));
}

// ─── Admin: Item mappings management ──────────────────────────────────────────
export async function getAllItemMappings() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(itemMappings).orderBy(itemMappings.itemCode);
}

export async function upsertItemMapping(data: {
  itemCode: string;
  itemName?: string;
  itemLarge?: string;
  itemMid?: string;
  itemSmall?: string;
  dept?: string;
  note?: string;
}) {
  const db = await getDb();
  if (!db) return;
  await db
    .insert(itemMappings)
    .values(data)
    .onDuplicateKeyUpdate({
      set: {
        itemName: data.itemName ?? null,
        itemLarge: data.itemLarge ?? null,
        itemMid: data.itemMid ?? null,
        itemSmall: data.itemSmall ?? null,
        dept: data.dept ?? null,
        note: data.note ?? null,
      },
    });
}

export async function deleteItemMapping(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(itemMappings).where(eq(itemMappings.id, id));
}

// ─── Channel drilldown ────────────────────────────────────────────────────────
/**
 * 채널별 드릴다운 집계: 채널 → 대분류 → 품명 계층
 * level: 'channel' | 'large' | 'item'
 */
export async function getChannelDrilldown(params: {
  startDate: string;
  endDate: string;
  dept?: string;
  channels?: string[];
  itemLarges?: string[];
  itemMids?: string[];
  itemSmalls?: string[];
  itemNames?: string[];
  level: "channel" | "large" | "item";
  parentChannel?: string;
  parentLarge?: string;
}) {
  const db = await getDb();
  if (!db) return [];

  const conditions: ReturnType<typeof sql>[] = [
    sql`salesDate >= ${params.startDate}`,
    sql`salesDate <= ${params.endDate}`,
  ];
  if (params.dept) conditions.push(eq(salesRecords.dept, params.dept));
  if (params.parentChannel) conditions.push(eq(salesRecords.channel, params.parentChannel));
  if (params.parentLarge) conditions.push(eq(salesRecords.itemLarge, params.parentLarge));
  if (params.channels && params.channels.length > 0)
    conditions.push(sql`channel IN (${sql.join(params.channels.map((c) => sql`${c}`), sql`, `)})`);
  if (params.itemLarges && params.itemLarges.length > 0)
    conditions.push(sql`itemLarge IN (${sql.join(params.itemLarges.map((c) => sql`${c}`), sql`, `)})`);
  if (params.itemMids && params.itemMids.length > 0)
    conditions.push(sql`itemMid IN (${sql.join(params.itemMids.map((c) => sql`${c}`), sql`, `)})`);
  if (params.itemSmalls && params.itemSmalls.length > 0)
    conditions.push(sql`itemSmall IN (${sql.join(params.itemSmalls.map((c) => sql`${c}`), sql`, `)})`);
  if (params.itemNames && params.itemNames.length > 0)
    conditions.push(sql`itemName IN (${sql.join(params.itemNames.map((c) => sql`${c}`), sql`, `)})`);

  const groupCol =
    params.level === "channel"
      ? salesRecords.channel
      : params.level === "large"
        ? salesRecords.itemLarge
        : salesRecords.itemName;

  const rows = await db
    .select({
      label: groupCol,
      itemCode: salesRecords.itemCode,
      totalSales: sql<number>`SUM(CAST(${salesRecords.salesAmt} AS DECIMAL(18,2)))`,
      totalQty: sql<number>`SUM(CAST(${salesRecords.qty} AS DECIMAL(15,2)))`,
      // BOM 원가 JOIN 기반 실제 이익 계산
      totalProfit: sql<number>`SUM(
        CASE
          WHEN ${bomCosts.costPerUnit} IS NOT NULL
          THEN CAST(${salesRecords.salesAmt} AS DECIMAL(18,2)) - CAST(${bomCosts.costPerUnit} AS DECIMAL(18,2)) * CAST(${salesRecords.qty} AS DECIMAL(15,2))
          ELSE 0
        END
      )`,
    })
    .from(salesRecords)
    .leftJoin(bomCosts, eq(salesRecords.itemCode, bomCosts.itemCode))
    .where(and(...conditions))
    .groupBy(groupCol, salesRecords.itemCode)
    .orderBy(sql`SUM(CAST(${salesRecords.salesAmt} AS DECIMAL(18,2))) DESC`);

  // label 기준으로 재집계 (itemCode 중복 제거)
  const labelMap = new Map<string, { totalSales: number; totalQty: number; totalProfit: number }>();
  for (const r of rows) {
    const key = r.label ?? "미지정";
    const existing = labelMap.get(key) ?? { totalSales: 0, totalQty: 0, totalProfit: 0 };
    existing.totalSales += Number(r.totalSales ?? 0);
    existing.totalQty += Number(r.totalQty ?? 0);
    existing.totalProfit += Number(r.totalProfit ?? 0);
    labelMap.set(key, existing);
  }

  return Array.from(labelMap.entries())
    .map(([label, v]) => ({ label, ...v }))
    .sort((a, b) => b.totalSales - a.totalSales);
}

// ─── Filter options (계층형 필터 드롭다운용) ─────────────────────────────────────
export async function getFilterOptions(params: {
  dept?: string;
  level: "channel" | "itemLarge" | "itemMid" | "itemSmall" | "itemName";
  parentChannel?: string;
  parentLarge?: string;
  parentMid?: string;
  parentSmall?: string;
  // 매출 기준 정렬을 위한 날짜 범위 (없으면 전체 기간 기준)
  startDate?: string;
  endDate?: string;
}): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];

  const conditions: ReturnType<typeof sql>[] = [];
  if (params.dept) conditions.push(eq(salesRecords.dept, params.dept));
  if (params.parentChannel) conditions.push(eq(salesRecords.channel, params.parentChannel));
  if (params.parentLarge) conditions.push(eq(salesRecords.itemLarge, params.parentLarge));
  if (params.parentMid) conditions.push(eq(salesRecords.itemMid, params.parentMid));
  if (params.parentSmall) conditions.push(eq(salesRecords.itemSmall, params.parentSmall));
  if (params.startDate) conditions.push(sql`salesDate >= ${params.startDate}`);
  if (params.endDate) conditions.push(sql`salesDate <= ${params.endDate}`);

  const colMap = {
    channel: salesRecords.channel,
    itemLarge: salesRecords.itemLarge,
    itemMid: salesRecords.itemMid,
    itemSmall: salesRecords.itemSmall,
    itemName: salesRecords.itemName,
  };
  const col = colMap[params.level];

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  // 매출액 높은 순으로 정렬
  const rows = await db
    .select({
      val: col,
      gmv: sql<number>`SUM(salesAmt)`,
    })
    .from(salesRecords)
    .where(whereClause)
    .groupBy(col)
    .orderBy(sql`SUM(salesAmt) DESC`);

  return rows
    .map((r) => r.val ?? "")
    .filter(Boolean);
}

// ─── Top items for quick chip filter ──────────────────────────────────────────
export async function getTopItems(params: {
  startDate: string;
  endDate: string;
  dept?: string;
  type: "channel" | "itemLarge" | "itemMid" | "itemSmall" | "itemName";
  limit?: number;
}): Promise<{ label: string; totalSales: number }[]> {
  const db = await getDb();
  if (!db) return [];

  const conditions: ReturnType<typeof sql>[] = [
    sql`salesDate >= ${params.startDate}`,
    sql`salesDate <= ${params.endDate}`,
  ];
  if (params.dept) conditions.push(eq(salesRecords.dept, params.dept));

  const colMap = {
    channel: salesRecords.channel,
    itemLarge: salesRecords.itemLarge,
    itemMid: salesRecords.itemMid,
    itemSmall: salesRecords.itemSmall,
    itemName: salesRecords.itemName,
  };
  const col = colMap[params.type] ?? salesRecords.channel;

  const rows = await db
    .select({
      label: col,
      totalSales: sql<number>`SUM(salesAmt)`,
    })
    .from(salesRecords)
    .where(and(...conditions))
    .groupBy(col)
    .orderBy(sql`SUM(salesAmt) DESC`)
    .limit(params.limit ?? 8);

  return rows
    .filter((r) => r.label)
    .map((r) => ({
      label: r.label ?? "",
      totalSales: Number(r.totalSales ?? 0),
    }));
}

// ─── Simulator: 마감 예측 연산 ─────────────────────────────────────────────────
export async function getSimulatorData(params: {
  dept: string;
  year: number;
  month: number;
  todayStr: string;
}) {
  const db = await getDb();
  if (!db) return { elapsedSales: 0, elapsedDays: 0, totalDaysInMonth: 0, targetAmt: 0 };

  const { dept, year, month, todayStr } = params;
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = todayStr;

  // 이번 달 현재까지 매출
  const actual = await aggregateSales({ startDate, endDate, dept });

  // 이번 달 목표
  const targets = await getTargetsByDeptYear(dept, year);
  const monthTargets = targets.filter((t) => t.month === month);
  const totalTarget = monthTargets.reduce(
    (s, t) => s + parseFloat(String(t.targetAmt ?? "0")),
    0
  );

  // 경과 일수 계산
  const today = new Date(todayStr);
  const firstDay = new Date(year, month - 1, 1);
  const elapsedDays = Math.max(1, Math.ceil((today.getTime() - firstDay.getTime()) / 86400000) + 1);

  // 해당 월 총 일수
  const totalDaysInMonth = new Date(year, month, 0).getDate();

  return {
    elapsedSales: actual.totalSales,
    elapsedQty: actual.totalQty,
    elapsedProfit: actual.totalProfit,
    elapsedDays,
    totalDaysInMonth,
    targetAmt: totalTarget,
  };
}

// ─── Promotions: 전체 목록 (달력 바인딩용) ────────────────────────────────────
export async function getAllPromotions(params?: { dept?: string; year?: number }) {
  const db = await getDb();
  if (!db) return [];

  const conditions: ReturnType<typeof sql>[] = [];
  if (params?.dept) conditions.push(eq(promotions.dept, params.dept));
  if (params?.year) {
    const startStr = `${params.year}-01-01`;
    const endStr = `${params.year}-12-31`;
    conditions.push(sql`(startDate <= ${endStr} AND endDate >= ${startStr})`);
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  const rows = await db
    .select()
    .from(promotions)
    .where(whereClause)
    .orderBy(promotions.startDate);

  return rows.map((r) => ({
    id: r.id,
    dept: r.dept ?? "",
    channel: r.channel ?? "",
    eventName: r.eventName ?? "",
    startDate: r.startDate ? (r.startDate as Date).toISOString().split("T")[0] : null,
    endDate: r.endDate ? (r.endDate as Date).toISOString().split("T")[0] : null,
    targetAmt: parseFloat(String(r.targetAmt ?? "0")),
    achievedAmt: parseFloat(String(r.achievedAmt ?? "0")),
    note: r.note ?? "",
  }));
}

// ─── Admin: Promotion CRUD ────────────────────────────────────────────────────
export async function insertPromotion(data: {
  dept?: string;
  channel?: string;
  eventName?: string;
  startDate?: string;
  endDate?: string;
  targetAmt?: number;
  achievedAmt?: number;
  note?: string;
}) {
  const db = await getDb();
  if (!db) return;
  const { startDate, endDate, targetAmt, achievedAmt, ...rest } = data;
  await db.insert(promotions).values({
    ...rest,
    startDate: startDate ? new Date(startDate) : undefined,
    endDate: endDate ? new Date(endDate) : undefined,
    targetAmt: String(targetAmt ?? 0),
    achievedAmt: String(achievedAmt ?? 0),
  });
}

export async function updatePromotion(
  id: number,
  data: {
    eventName?: string;
    startDate?: string;
    endDate?: string;
    targetAmt?: number;
    achievedAmt?: number;
    note?: string;
  }
) {
  const db = await getDb();
  if (!db) return;
  const { startDate, endDate, targetAmt, achievedAmt, ...rest } = data;
  const updateSet: Record<string, unknown> = { ...rest };
  if (startDate !== undefined) updateSet.startDate = new Date(startDate);
  if (endDate !== undefined) updateSet.endDate = new Date(endDate);
  if (targetAmt !== undefined) updateSet.targetAmt = String(targetAmt);
  if (achievedAmt !== undefined) updateSet.achievedAmt = String(achievedAmt);
  await db.update(promotions).set(updateSet).where(eq(promotions.id, id));
}

export async function deletePromotion(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(promotions).where(eq(promotions.id, id));
}

// ─── 개별 상품별 트렌드 (비교 라인 차트용) ────────────────────────────────────────
export async function getItemTrendData(params: {
  startDate: string;
  endDate: string;
  dept?: string;
  groupBy: "weekLabel" | "yearMonth";
  itemNames?: string[];
  itemLarges?: string[];
  itemMids?: string[];
  channels?: string[];
  groupField: "itemName" | "itemLarge" | "itemMid" | "channel";
  limit?: number;
}) {
  const db = await getDb();
  if (!db) return { data: [], keys: [] };

  const { startDate, endDate, dept, groupBy, itemNames, itemLarges, itemMids, channels, groupField, limit = 8 } = params;

  const conditions = [
    sql`salesDate >= ${startDate}`,
    sql`salesDate <= ${endDate}`,
  ];
  if (dept) conditions.push(eq(salesRecords.dept, dept));
  if (channels?.length) conditions.push(inArray(salesRecords.channel, channels));
  if (itemLarges?.length) conditions.push(inArray(salesRecords.itemLarge, itemLarges));
  if (itemMids?.length) conditions.push(inArray(salesRecords.itemMid, itemMids));
  if (itemNames?.length) conditions.push(inArray(salesRecords.itemName, itemNames));

  const timeCol = groupBy === "weekLabel" ? salesRecords.weekLabel : salesRecords.yearMonth;
  const itemCol =
    groupField === "itemName" ? salesRecords.itemName :
    groupField === "itemLarge" ? salesRecords.itemLarge :
    groupField === "itemMid" ? salesRecords.itemMid :
    salesRecords.channel;

  // 상위 N개 항목 추출 (매출 기준)
  const topItems = await db
    .select({
      itemKey: itemCol,
      totalSales: sql<number>`SUM(salesAmt)`,
    })
    .from(salesRecords)
    .where(and(...conditions))
    .groupBy(itemCol)
    .orderBy(sql`SUM(salesAmt) DESC`)
    .limit(limit);

  const topKeys = topItems.map((r) => r.itemKey).filter(Boolean) as string[];
  if (topKeys.length === 0) return { data: [], keys: [] };

  // 각 항목별 시계열 데이터
  const rows = await db
    .select({
      timeLabel: timeCol,
      itemKey: itemCol,
      totalSales: sql<number>`SUM(salesAmt)`,
      totalQty: sql<number>`SUM(CAST(qty AS DECIMAL(15,2)))`,
    })
    .from(salesRecords)
    .where(and(...conditions, inArray(itemCol, topKeys)))
    .groupBy(timeCol, itemCol)
    .orderBy(sql`MIN(salesDate)`);

  // 시계열 레이블 목록 수집
  const labelSet = new Set(rows.map((r) => r.timeLabel ?? ""));
  const allLabels = Array.from(labelSet).sort();

  // 피벗: { label, [item1]: sales, [item2]: sales, ... }[]
  const pivotMap = new Map<string, Record<string, number | string>>();
  for (const label of allLabels) {
    pivotMap.set(label, { label });
  }
  for (const row of rows) {
    const label = row.timeLabel ?? "";
    const key = row.itemKey ?? "기타";
    const entry = pivotMap.get(label);
    if (entry) {
      entry[key] = Number(row.totalSales ?? 0);
      entry[`${key}_qty`] = Number(row.totalQty ?? 0);
    }
  }

  return {
    data: Array.from(pivotMap.values()),
    keys: topKeys,
  };
}

// ─── Sales Analysis Memos ──────────────────────────────────────────────────────

export async function getSalesAnalysisMemo(filterKey: string, startDate: string, endDate: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(salesAnalysisMemos)
    .where(
      and(
        eq(salesAnalysisMemos.filterKey, filterKey),
        eq(salesAnalysisMemos.startDate, startDate),
        eq(salesAnalysisMemos.endDate, endDate)
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function upsertSalesAnalysisMemo(data: {
  filterKey: string;
  startDate: string;
  endDate: string;
  aiAnalysis?: string | null;
  aiGeneratedAt?: Date | null;
  manualMemo?: string;
}) {
  const db = await getDb();
  if (!db) return;
  await db
    .insert(salesAnalysisMemos)
    .values({
      filterKey: data.filterKey,
      startDate: data.startDate,
      endDate: data.endDate,
      aiAnalysis: data.aiAnalysis ?? null,
      aiGeneratedAt: data.aiGeneratedAt ?? null,
      manualMemo: data.manualMemo ?? null,
    })
    .onDuplicateKeyUpdate({
      set: {
        ...(data.aiAnalysis !== undefined ? { aiAnalysis: data.aiAnalysis } : {}),
        ...(data.aiGeneratedAt !== undefined ? { aiGeneratedAt: data.aiGeneratedAt } : {}),
        ...(data.manualMemo !== undefined ? { manualMemo: data.manualMemo } : {}),
        updatedAt: new Date(),
      },
    });
}

// ─── Sales Daily Mart helpers ──────────────────────────────────────────────────

/** 파일명 기준 마트 데이터 삭제 (재업로드 시 기존 집계 제거) */
export async function deleteMartByFilename(filename: string): Promise<number> {
  const pool = getRawPool();
  const stem = getFileStem(filename);
  // 확장자 무시: stem이 같으면 동일 파일로 처리
  const [result] = await pool.execute(
    "DELETE FROM sales_daily_mart WHERE REPLACE(REPLACE(sourceFilename, '.csv', ''), '.xlsx', '') = ?",
    [stem]
  ) as [mysql.ResultSetHeader, unknown];
  return result.affectedRows ?? 0;
}

/** salesRecords에서 특정 파일의 데이터를 집계하여 마트 테이블에 삽입 */
export async function buildMartFromFilename(filename: string): Promise<number> {
  const pool = getRawPool();
  // salesRecords에서 해당 파일 데이터를 날짜×부서×채널×분류별로 집계 후 마트에 INSERT
  const [result] = await pool.execute(
    `INSERT INTO sales_daily_mart
      (salesDate, yearMonth, yearStr, weekLabel, dept, channel,
       itemLarge, itemMid, itemSmall, itemName, itemCode,
       totalSalesAmt, totalQty, totalGrossProfit, rowCount, sourceFilename)
     SELECT
       salesDate,
       yearMonth,
       yearStr,
       weekLabel,
       dept,
       channel,
       itemLarge,
       itemMid,
       itemSmall,
       itemName,
       itemCode,
       SUM(salesAmt) AS totalSalesAmt,
       SUM(qty) AS totalQty,
       SUM(COALESCE(grossProfit, 0)) AS totalGrossProfit,
       COUNT(*) AS rowCount,
       ? AS sourceFilename
     FROM sales_records
     WHERE sourceFilename = ?
     GROUP BY salesDate, yearMonth, yearStr, weekLabel, dept, channel,
              itemLarge, itemMid, itemSmall, itemName, itemCode`,
    [filename, filename]
  ) as [mysql.ResultSetHeader, unknown];
  return result.affectedRows ?? 0;
}

/** 마트 테이블 기반 getTopItems (빠른 조회) */
export async function getTopItemsFromMart(params: {
  startDate: string;
  endDate: string;
  dept?: string;
  type: "channel" | "itemLarge" | "itemMid" | "itemSmall" | "itemName";
  limit?: number;
  channels?: string[];
  itemLarges?: string[];
  itemMids?: string[];
  itemSmalls?: string[];
  itemNames?: string[];
}): Promise<{ label: string; totalSales: number }[]> {
  const pool = getRawPool();
  const conditions: string[] = [
    "salesDate >= ?",
    "salesDate <= ?",
  ];
  const values: any[] = [params.startDate, params.endDate];

  if (params.dept) { conditions.push("dept = ?"); values.push(params.dept); }
  if (params.channels?.length) {
    conditions.push(`channel IN (${params.channels.map(() => "?").join(",")})`);
    values.push(...params.channels);
  }
  if (params.itemLarges?.length) {
    conditions.push(`itemLarge IN (${params.itemLarges.map(() => "?").join(",")})`);
    values.push(...params.itemLarges);
  }
  if (params.itemMids?.length) {
    conditions.push(`itemMid IN (${params.itemMids.map(() => "?").join(",")})`);
    values.push(...params.itemMids);
  }
  if (params.itemSmalls?.length) {
    conditions.push(`itemSmall IN (${params.itemSmalls.map(() => "?").join(",")})`);
    values.push(...params.itemSmalls);
  }
  if (params.itemNames?.length) {
    conditions.push(`itemName IN (${params.itemNames.map(() => "?").join(",")})`);
    values.push(...params.itemNames);
  }

  const colName = params.type; // channel, itemLarge, etc.
  const limit = params.limit ?? 8;
  const where = conditions.join(" AND ");

  const [rows] = await pool.execute(
    `SELECT ${colName} AS label, SUM(totalSalesAmt) AS totalSales
     FROM sales_daily_mart
     WHERE ${where} AND ${colName} IS NOT NULL AND ${colName} != ''
     GROUP BY ${colName}
     ORDER BY SUM(totalSalesAmt) DESC
     LIMIT ${limit}`,
    values
  ) as [Array<{ label: string; totalSales: string }>, unknown];

  return rows.map((r) => ({ label: r.label, totalSales: Number(r.totalSales ?? 0) }));
}

/** 마트 테이블 기반 getFilterOptions (빠른 조회) */
export async function getFilterOptionsFromMart(params: {
  dept?: string;
  level: "channel" | "itemLarge" | "itemMid" | "itemSmall" | "itemName";
  parentChannel?: string;
  parentLarge?: string;
  parentMid?: string;
  parentSmall?: string;
  startDate?: string;
  endDate?: string;
}): Promise<string[]> {
  const pool = getRawPool();
  const conditions: string[] = [];
  const values: any[] = [];

  if (params.dept) { conditions.push("dept = ?"); values.push(params.dept); }
  if (params.parentChannel) { conditions.push("channel = ?"); values.push(params.parentChannel); }
  if (params.parentLarge) { conditions.push("itemLarge = ?"); values.push(params.parentLarge); }
  if (params.parentMid) { conditions.push("itemMid = ?"); values.push(params.parentMid); }
  if (params.parentSmall) { conditions.push("itemSmall = ?"); values.push(params.parentSmall); }
  if (params.startDate) { conditions.push("salesDate >= ?"); values.push(params.startDate); }
  if (params.endDate) { conditions.push("salesDate <= ?"); values.push(params.endDate); }

  const colName = params.level;
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")} AND ${colName} IS NOT NULL AND ${colName} != ''` : `WHERE ${colName} IS NOT NULL AND ${colName} != ''`;

  const [rows] = await pool.execute(
    `SELECT ${colName} AS val, SUM(totalSalesAmt) AS gmv
     FROM sales_daily_mart
     ${where}
     GROUP BY ${colName}
     ORDER BY SUM(totalSalesAmt) DESC`,
    values
  ) as [Array<{ val: string; gmv: string }>, unknown];

  return rows.map((r) => r.val).filter(Boolean);
}

/** 마트 테이블 기반 aggregateSales (빠른 조회) */
export async function aggregateSalesFromMart(params: {
  startDate: string;
  endDate: string;
  dept?: string;
  channels?: string[];
  itemLarges?: string[];
  itemMids?: string[];
  itemSmalls?: string[];
  itemNames?: string[];
}): Promise<{ totalSales: number; totalQty: number; totalProfit: number }> {
  const pool = getRawPool();
  const conditions: string[] = ["salesDate >= ?", "salesDate <= ?"];
  const values: any[] = [params.startDate, params.endDate];

  if (params.dept) { conditions.push("dept = ?"); values.push(params.dept); }
  if (params.channels?.length) {
    conditions.push(`channel IN (${params.channels.map(() => "?").join(",")})`);
    values.push(...params.channels);
  }
  if (params.itemLarges?.length) {
    conditions.push(`itemLarge IN (${params.itemLarges.map(() => "?").join(",")})`);
    values.push(...params.itemLarges);
  }
  if (params.itemMids?.length) {
    conditions.push(`itemMid IN (${params.itemMids.map(() => "?").join(",")})`);
    values.push(...params.itemMids);
  }
  if (params.itemSmalls?.length) {
    conditions.push(`itemSmall IN (${params.itemSmalls.map(() => "?").join(",")})`);
    values.push(...params.itemSmalls);
  }
  if (params.itemNames?.length) {
    conditions.push(`itemName IN (${params.itemNames.map(() => "?").join(",")})`);
    values.push(...params.itemNames);
  }

  const where = conditions.join(" AND ");
  const [rows] = await pool.execute(
    `SELECT SUM(totalSalesAmt) AS totalSales, SUM(totalQty) AS totalQty, SUM(totalGrossProfit) AS totalProfit
     FROM sales_daily_mart WHERE ${where}`,
    values
  ) as [Array<{ totalSales: string; totalQty: string; totalProfit: string }>, unknown];

  const r = rows[0];
  return {
    totalSales: Number(r?.totalSales ?? 0),
    totalQty: Number(r?.totalQty ?? 0),
    totalProfit: Number(r?.totalProfit ?? 0),
  };
}

/** 마트 테이블 기반 getTrendData (빠른 조회) */
export async function getTrendDataFromMart(params: {
  startDate: string;
  endDate: string;
  dept?: string;
  groupBy: "weekLabel" | "yearMonth" | "yearStr";
  channels?: string[];
  itemLarges?: string[];
  itemMids?: string[];
  itemSmalls?: string[];
  itemNames?: string[];
}): Promise<Array<{ label: string; totalSales: number; totalQty: number; minDate: string; maxDate: string }>> {
  const pool = getRawPool();
  const conditions: string[] = ["salesDate >= ?", "salesDate <= ?"];
  const values: any[] = [params.startDate, params.endDate];

  if (params.dept) { conditions.push("dept = ?"); values.push(params.dept); }
  if (params.channels?.length) {
    conditions.push(`channel IN (${params.channels.map(() => "?").join(",")})`);
    values.push(...params.channels);
  }
  if (params.itemLarges?.length) {
    conditions.push(`itemLarge IN (${params.itemLarges.map(() => "?").join(",")})`);
    values.push(...params.itemLarges);
  }
  if (params.itemMids?.length) {
    conditions.push(`itemMid IN (${params.itemMids.map(() => "?").join(",")})`);
    values.push(...params.itemMids);
  }
  if (params.itemSmalls?.length) {
    conditions.push(`itemSmall IN (${params.itemSmalls.map(() => "?").join(",")})`);
    values.push(...params.itemSmalls);
  }
  if (params.itemNames?.length) {
    conditions.push(`itemName IN (${params.itemNames.map(() => "?").join(",")})`);
    values.push(...params.itemNames);
  }

  const groupCol = params.groupBy; // weekLabel, yearMonth, yearStr
  const where = conditions.join(" AND ");

    const [rows] = await pool.execute(
    `SELECT ${groupCol} AS label,
            SUM(totalSalesAmt) AS totalSales,
            SUM(totalQty) AS totalQty,
            MIN(salesDate) AS minDate,
            MAX(salesDate) AS maxDate
     FROM sales_daily_mart
     WHERE ${where}
     GROUP BY ${groupCol}
     ORDER BY MIN(salesDate)`,
    values
  ) as [Array<{ label: string; totalSales: string; totalQty: string; minDate: string; maxDate: string }>, unknown];
  return rows.map((r) => ({
    label: r.label ?? "",
    totalSales: Number(r.totalSales ?? 0),
    totalQty: Number(r.totalQty ?? 0),
    minDate: r.minDate ?? "",
    maxDate: r.maxDate ?? "",
  }));
}

/** 마트 테이블이 비어 있을 때 sales_records에서 전체 초기 빌드.
 * forceRebuild=true 시 마트를 TRUNCATE 후 전체 재집계 */
export async function rebuildMartFromAllRecords(forceRebuild = false): Promise<{ built: number; filenames: string[] }> {
  const pool = getRawPool();

  if (forceRebuild) {
    await pool.execute(`DELETE FROM sales_daily_mart`);
    console.log('[Mart Build] 마트 전체 삭제 완료 (강제 재빌드)');
  }

  // 1) sourceFilename이 있는 파일 중 마트에 없는 것만 추가 빌드
  const [fileRows] = await pool.execute(
    `SELECT DISTINCT sourceFilename
     FROM sales_records
     WHERE sourceFilename IS NOT NULL
       AND sourceFilename NOT IN (
         SELECT DISTINCT sourceFilename FROM sales_daily_mart WHERE sourceFilename IS NOT NULL
       )`
  ) as [Array<{ sourceFilename: string }>, unknown];

  const filenames = fileRows.map((r) => r.sourceFilename).filter(Boolean);
  let totalBuilt = 0;

  for (const filename of filenames) {
    const count = await buildMartFromFilename(filename);
    totalBuilt += count;
    console.log(`[Mart Build] ${filename}: ${count}행 집계`);
  }

  // 2) sourceFilename = NULL인 레거시 데이터가 마트에 없으면 집계
  const [nullCheck] = await pool.execute(
    `SELECT COUNT(*) as cnt FROM sales_daily_mart WHERE sourceFilename IS NULL`
  ) as [Array<{ cnt: number }>, unknown];
  const nullMartCount = Number(nullCheck[0]?.cnt ?? 0);

  if (nullMartCount === 0) {
    const [nullResult] = await pool.execute(
      `INSERT INTO sales_daily_mart
        (salesDate, yearMonth, yearStr, weekLabel, dept, channel,
         itemLarge, itemMid, itemSmall, itemName, itemCode,
         totalSalesAmt, totalQty, totalGrossProfit, rowCount, sourceFilename)
       SELECT
         salesDate, yearMonth, yearStr, weekLabel, dept, channel,
         itemLarge, itemMid, itemSmall, itemName, itemCode,
         SUM(salesAmt) AS totalSalesAmt,
         SUM(qty) AS totalQty,
         SUM(COALESCE(grossProfit, 0)) AS totalGrossProfit,
         COUNT(*) AS rowCount,
         NULL AS sourceFilename
       FROM sales_records
       WHERE sourceFilename IS NULL
       GROUP BY salesDate, yearMonth, yearStr, weekLabel, dept, channel,
                itemLarge, itemMid, itemSmall, itemName, itemCode`
    ) as [mysql.ResultSetHeader, unknown];
    const nullBuilt = nullResult.affectedRows ?? 0;
    if (nullBuilt > 0) {
      console.log(`[Mart Build] 레거시(NULL) 데이터 ${nullBuilt}행 집계 완료`);
      totalBuilt += nullBuilt;
      filenames.push('__legacy__');
    }
  }

  return { built: totalBuilt, filenames };
}

/** 마트 테이블 행 수 조회 */
export async function getMartRowCount(): Promise<number> {
  const pool = getRawPool();
  const [rows] = await pool.execute(
    "SELECT COUNT(*) as cnt FROM sales_daily_mart"
  ) as [Array<{ cnt: number }>, unknown];
  return Number(rows[0]?.cnt ?? 0);
}

/** 마트 테이블 기반 getItemPerformance (빠른 조회) */
export async function getItemPerformanceFromMart(params: {
  startDate: string;
  endDate: string;
  dept?: string;
  groupBy: "itemName" | "itemLarge" | "itemMid" | "itemSmall" | "channel";
  limit?: number;
  channels?: string[];
  itemLarges?: string[];
  itemMids?: string[];
  itemSmalls?: string[];
  itemNames?: string[];
}): Promise<Array<{ label: string; totalSales: number; totalQty: number; totalProfit: number }>> {
  const pool = getRawPool();
  const conditions: string[] = ["salesDate >= ?", "salesDate <= ?"];
  const values: any[] = [params.startDate, params.endDate];

  if (params.dept) { conditions.push("dept = ?"); values.push(params.dept); }
  if (params.channels?.length) {
    conditions.push(`channel IN (${params.channels.map(() => "?").join(",")})`);
    values.push(...params.channels);
  }
  if (params.itemLarges?.length) {
    conditions.push(`itemLarge IN (${params.itemLarges.map(() => "?").join(",")})`);
    values.push(...params.itemLarges);
  }
  if (params.itemMids?.length) {
    conditions.push(`itemMid IN (${params.itemMids.map(() => "?").join(",")})`);
    values.push(...params.itemMids);
  }
  if (params.itemSmalls?.length) {
    conditions.push(`itemSmall IN (${params.itemSmalls.map(() => "?").join(",")})`);
    values.push(...params.itemSmalls);
  }
  if (params.itemNames?.length) {
    conditions.push(`itemName IN (${params.itemNames.map(() => "?").join(",")})`);
    values.push(...params.itemNames);
  }

  const colName = params.groupBy;
  const limit = params.limit ?? 50;
  const where = conditions.join(" AND ");

  const [rows] = await pool.execute(
    `SELECT ${colName} AS label,
            SUM(totalSalesAmt) AS totalSales,
            SUM(totalQty) AS totalQty,
            SUM(totalGrossProfit) AS totalProfit
     FROM sales_daily_mart
     WHERE ${where} AND ${colName} IS NOT NULL AND ${colName} != ''
     GROUP BY ${colName}
     ORDER BY SUM(totalSalesAmt) DESC
     LIMIT ${limit}`,
    values
  ) as [Array<{ label: string; totalSales: string; totalQty: string; totalProfit: string }>, unknown];

  return rows.map((r) => ({
    label: r.label ?? "",
    totalSales: Number(r.totalSales ?? 0),
    totalQty: Number(r.totalQty ?? 0),
    totalProfit: Number(r.totalProfit ?? 0),
  }));
}

/** 마트 테이블 기반 getChannelDrilldown (빠른 조회) */
export async function getChannelDrilldownFromMart(params: {
  startDate: string;
  endDate: string;
  dept?: string;
  channels?: string[];
  itemLarges?: string[];
  itemMids?: string[];
  itemSmalls?: string[];
  itemNames?: string[];
  level: "channel" | "large" | "item";
  parentChannel?: string;
  parentLarge?: string;
}): Promise<Array<{ label: string; totalSales: number; totalQty: number; totalProfit: number }>> {
  const pool = getRawPool();
  const conditions: string[] = ["salesDate >= ?", "salesDate <= ?"];
  const values: any[] = [params.startDate, params.endDate];

  if (params.dept) { conditions.push("dept = ?"); values.push(params.dept); }
  if (params.parentChannel) { conditions.push("channel = ?"); values.push(params.parentChannel); }
  if (params.parentLarge) { conditions.push("itemLarge = ?"); values.push(params.parentLarge); }
  if (params.channels?.length) {
    conditions.push(`channel IN (${params.channels.map(() => "?").join(",")})`);
    values.push(...params.channels);
  }
  if (params.itemLarges?.length) {
    conditions.push(`itemLarge IN (${params.itemLarges.map(() => "?").join(",")})`);
    values.push(...params.itemLarges);
  }
  if (params.itemMids?.length) {
    conditions.push(`itemMid IN (${params.itemMids.map(() => "?").join(",")})`);
    values.push(...params.itemMids);
  }
  if (params.itemSmalls?.length) {
    conditions.push(`itemSmall IN (${params.itemSmalls.map(() => "?").join(",")})`);
    values.push(...params.itemSmalls);
  }
  if (params.itemNames?.length) {
    conditions.push(`itemName IN (${params.itemNames.map(() => "?").join(",")})`);
    values.push(...params.itemNames);
  }

  const colName = params.level === "channel" ? "channel"
    : params.level === "large" ? "itemLarge"
    : "itemName";

  const where = conditions.join(" AND ");

  const [rows] = await pool.execute(
    `SELECT ${colName} AS label,
            SUM(totalSalesAmt) AS totalSales,
            SUM(totalQty) AS totalQty,
            SUM(totalGrossProfit) AS totalProfit
     FROM sales_daily_mart
     WHERE ${where} AND ${colName} IS NOT NULL AND ${colName} != ''
     GROUP BY ${colName}
     ORDER BY SUM(totalSalesAmt) DESC`,
    values
  ) as [Array<{ label: string; totalSales: string; totalQty: string; totalProfit: string }>, unknown];

  return rows.map((r) => ({
    label: r.label ?? "",
    totalSales: Number(r.totalSales ?? 0),
    totalQty: Number(r.totalQty ?? 0),
    totalProfit: Number(r.totalProfit ?? 0),
  }));
}

// ─── New Products (신상품 관리) ──────────────────────────────────────────────────

/** 신상품 전체 조회 */
export async function getAllNewProducts() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(newProducts).orderBy(desc(newProducts.createdAt));
}

/** 신상품 등록 */
export async function insertNewProduct(data: {
  itemName: string;
  itemCode?: string;
  itemLarge?: string;
  itemMid?: string;
  itemSmall?: string;
  launchDate?: string;
  note?: string;
  addedBy?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error('DB not available');
  const { launchDate, ...rest } = data;
  await db.insert(newProducts).values({
    ...rest,
    launchDate: launchDate ? new Date(launchDate) : null,
  });
}

/** 신상품 수정 */
export async function updateNewProduct(id: number, data: {
  itemName?: string;
  itemCode?: string;
  itemLarge?: string;
  itemMid?: string;
  itemSmall?: string;
  launchDate?: string;
  note?: string;
  addedBy?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error('DB not available');
  const { launchDate, ...rest } = data;
  await db.update(newProducts).set({
    ...rest,
    ...(launchDate !== undefined ? { launchDate: launchDate ? new Date(launchDate) : null } : {}),
  }).where(eq(newProducts.id, id));
}

/** 신상품 삭제 */
export async function deleteNewProduct(id: number) {
  const db = await getDb();
  if (!db) throw new Error('DB not available');
  await db.delete(newProducts).where(eq(newProducts.id, id));
}

/** 신상품 itemName 목록만 조회 (필터 적용용) */
export async function getNewProductItemNames(): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select({ itemName: newProducts.itemName }).from(newProducts);
  return rows.map((r: { itemName: string }) => r.itemName);
}

/** sales_records에서 중복 제거된 품명 목록 반환 (신상품 등록 시 선택용) */
export async function getDistinctItemNamesFromSales(): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .selectDistinct({ itemName: salesRecords.itemName })
    .from(salesRecords)
    .orderBy(salesRecords.itemName);
  return rows
    .map((r: { itemName: string | null }) => r.itemName ?? "")
    .filter((n: string) => n.length > 0);
}

export async function getItemMetaByName(itemName: string): Promise<{
  itemCode: string | null;
  itemLarge: string | null;
  itemMid: string | null;
  itemSmall: string | null;
} | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select({
      itemCode: salesRecords.itemCode,
      itemLarge: salesRecords.itemLarge,
      itemMid: salesRecords.itemMid,
      itemSmall: salesRecords.itemSmall,
    })
    .from(salesRecords)
    .where(eq(salesRecords.itemName, itemName))
    .limit(1);
  if (rows.length === 0) return null;
  return rows[0];
}

// ─── Monthly Variable Costs (월별 변동비) ────────────────────────────────────
import { monthlyVariableCosts } from "../drizzle/schema";

/** 특정 연도/월의 변동비 조회 */
export async function getVariableCost(year: number, month: number): Promise<{ id: number; year: number; month: number; amount: number; note: string | null } | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(monthlyVariableCosts)
    .where(and(eq(monthlyVariableCosts.year, year), eq(monthlyVariableCosts.month, month)))
    .limit(1);
  if (rows.length === 0) return null;
  const r = rows[0];
  return { id: r.id, year: r.year, month: r.month, amount: Number(r.amount), note: r.note };
}

/** 연도별 변동비 목록 조회 */
export async function getVariableCostsByYear(year: number): Promise<Array<{ id: number; year: number; month: number; amount: number; note: string | null }>> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(monthlyVariableCosts)
    .where(eq(monthlyVariableCosts.year, year))
    .orderBy(monthlyVariableCosts.month);
  return rows.map((r) => ({ id: r.id, year: r.year, month: r.month, amount: Number(r.amount), note: r.note }));
}

/** 전체 변동비 목록 조회 */
export async function getAllVariableCosts(): Promise<Array<{ id: number; year: number; month: number; amount: number; forecastPct: number | null; note: string | null; updatedAt: Date | null }>> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(monthlyVariableCosts)
    .orderBy(desc(monthlyVariableCosts.year), monthlyVariableCosts.month);
  return rows.map((r) => ({
    id: r.id,
    year: r.year,
    month: r.month,
    amount: Number(r.amount),
    forecastPct: r.forecastPct !== null && r.forecastPct !== undefined ? Number(r.forecastPct) : null,
    note: r.note,
    updatedAt: r.updatedAt ?? null,
  }));
}

/** 변동비 upsert (연도+월 기준) */
export async function upsertVariableCost(year: number, month: number, amount: number, forecastPct?: number | null, note?: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const existing = await getVariableCost(year, month);
  const pctStr = forecastPct !== null && forecastPct !== undefined ? String(forecastPct) : null;
  if (existing) {
    await db
      .update(monthlyVariableCosts)
      .set({ amount, forecastPct: pctStr, note: note ?? null })
      .where(eq(monthlyVariableCosts.id, existing.id));
  } else {
    await db
      .insert(monthlyVariableCosts)
      .values({ year, month, amount, forecastPct: pctStr, note: note ?? null });
  }
}

/** 변동비 삭제 */
export async function deleteVariableCost(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(monthlyVariableCosts).where(eq(monthlyVariableCosts.id, id));
}

/**
 * 기간 내 월별 변동비 합산 조회 (startDate ~ endDate에 걸친 월들의 변동비 합계)
 * 공헌이익 안분에 사용
 */
export async function getTotalVariableCostForPeriod(startDate: string, endDate: string): Promise<number> {
  const pool = getRawPool();
  const start = new Date(startDate);
  const end = new Date(endDate);
  const months: Array<{ year: number; month: number }> = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cur <= end) {
    months.push({ year: cur.getFullYear(), month: cur.getMonth() + 1 });
    cur.setMonth(cur.getMonth() + 1);
  }
  if (months.length === 0) return 0;
  const placeholders = months.map(() => "(year = ? AND month = ?)").join(" OR ");
  const values: number[] = months.flatMap((m) => [m.year, m.month]);
  const [rows] = await pool.execute(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM monthly_variable_costs WHERE ${placeholders}`,
    values
  ) as [Array<{ total: string }>, unknown];
  return Number(rows[0]?.total ?? 0);
}

/**
 * 기간 내 월별 변동비 데이터 조회 (amount + forecastPct 포함)
 */
export async function getVariableCostRowsForPeriod(startDate: string, endDate: string): Promise<Array<{ year: number; month: number; amount: number; forecastPct: number | null }>> {
  const pool = getRawPool();
  const start = new Date(startDate);
  const end = new Date(endDate);
  const months: Array<{ year: number; month: number }> = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cur <= end) {
    months.push({ year: cur.getFullYear(), month: cur.getMonth() + 1 });
    cur.setMonth(cur.getMonth() + 1);
  }
  if (months.length === 0) return [];
  const placeholders = months.map(() => "(year = ? AND month = ?)").join(" OR ");
  const values: number[] = months.flatMap((m) => [m.year, m.month]);
  const [rows] = await pool.execute(
    `SELECT year, month, amount, forecastPct FROM monthly_variable_costs WHERE ${placeholders}`,
    values
  ) as [Array<{ year: number; month: number; amount: string; forecastPct: string | null }>, unknown];
  return rows.map((r) => ({
    year: Number(r.year),
    month: Number(r.month),
    amount: Number(r.amount),
    forecastPct: r.forecastPct !== null && r.forecastPct !== undefined ? Number(r.forecastPct) : null,
  }));
}

/**
 * 전체 기간 매출 대비 필터 조건 매출 비율로 변동비 안분
 * forecastPct(예측 변동비율 %)가 입력된 경우: contribMargin = grossProfit × (1 - forecastPct/100)
 * amount(원 단위 변동비)만 있는 경우: contribMargin = grossProfit - (totalVariableCost * filteredSales / totalPeriodSales)
 * 둘 다 없는 경우: contribMargin = grossProfit (변동비 미입력)
 */
export async function getContribMarginForPeriod(params: {
  startDate: string;
  endDate: string;
  dept?: string;
  channels?: string[];
  itemLarges?: string[];
  itemMids?: string[];
  itemSmalls?: string[];
  itemNames?: string[];
}): Promise<number> {
  const { startDate, endDate, ...filters } = params;
  const filtered = await aggregateSalesFromMart({ startDate, endDate, ...filters }).catch(() =>
    aggregateSales({ startDate, endDate, ...filters })
  );

  // 기간 내 변동비 행 조회 (forecastPct 포함)
  const vcRows = await getVariableCostRowsForPeriod(startDate, endDate);

  // forecastPct가 하나라도 있으면 가중 평균 forecastPct로 계산
  const rowsWithPct = vcRows.filter((r) => r.forecastPct !== null && r.forecastPct > 0);
  if (rowsWithPct.length > 0) {
    // 기간 내 월 수 기준 단순 평균 forecastPct 사용
    const avgPct = rowsWithPct.reduce((s, r) => s + (r.forecastPct as number), 0) / rowsWithPct.length;
    // 공헌이익 = 매출이익 - (매출 × avgPct / 100)
    const variableCostFromSales = filtered.totalSales * (avgPct / 100);
    return filtered.totalProfit - variableCostFromSales;
  }

  // forecastPct 없는 경우: amount 기반 안분
  const totalVariableCost = vcRows.reduce((s, r) => s + r.amount, 0);
  if (totalVariableCost === 0) {
    return filtered.totalProfit;
  }
  const total = await aggregateSalesFromMart({ startDate, endDate }).catch(() =>
    aggregateSales({ startDate, endDate })
  );
  const ratio = total.totalSales > 0 ? filtered.totalSales / total.totalSales : 0;
  const allocatedVariableCost = totalVariableCost * ratio;
  return filtered.totalProfit - allocatedVariableCost;
}
