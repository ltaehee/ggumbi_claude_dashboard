import {
  bigint,
  date,
  decimal,
  float,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

// ─── Core auth table ───────────────────────────────────────────────────────────
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Upload history ────────────────────────────────────────────────────────────
export const uploadedFiles = mysqlTable("uploaded_files", {
  id: int("id").autoincrement().primaryKey(),
  filename: varchar("filename", { length: 255 }).notNull(),
  fileType: mysqlEnum("fileType", ["sales", "bom", "target", "promotion", "inventory", "managerMap"]).notNull(),
  rowCount: int("rowCount").default(0),
  uploadedAt: timestamp("uploadedAt").defaultNow().notNull(),
  uploadedBy: varchar("uploadedBy", { length: 64 }),
}, (t) => ({
  filenameUniq: uniqueIndex("uploaded_files_filename_uniq").on(t.filename),
}));

export type UploadedFile = typeof uploadedFiles.$inferSelect;

// ─── Sales records (매출 원장) ──────────────────────────────────────────────────
export const salesRecords = mysqlTable("sales_records", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  // 날짜
  salesDate: date("salesDate").notNull(),
  year: int("year").notNull(),
  month: int("month").notNull(),
  weekLabel: varchar("weekLabel", { length: 32 }),   // e.g. "2026년 1월 3주차"
  yearMonth: varchar("yearMonth", { length: 16 }),   // e.g. "2026-01월"
  yearStr: varchar("yearStr", { length: 8 }),        // e.g. "2026년"
  // 조직
  dept: varchar("dept", { length: 64 }),             // 부서
  channel: varchar("channel", { length: 128 }),      // 거래처
  // 품목 분류
  itemLarge: varchar("itemLarge", { length: 64 }),   // 품목대분류
  itemMid: varchar("itemMid", { length: 64 }),       // 품목중분류
  itemSmall: varchar("itemSmall", { length: 64 }),   // 품목소분류
  itemName: varchar("itemName", { length: 128 }),    // 품명
  itemCode: varchar("itemCode", { length: 64 }),     // 품번
  // 수치
  qty: decimal("qty", { precision: 15, scale: 2 }).default("0"),
  salesAmt: decimal("salesAmt", { precision: 18, scale: 2 }).default("0"),   // 원화판매금액계
  costPerUnit: decimal("costPerUnit", { precision: 15, scale: 4 }).default("0"), // 제조원가_단가
  grossProfit: decimal("grossProfit", { precision: 18, scale: 2 }).default("0"), // 매출이익
  sourceFilename: varchar("sourceFilename", { length: 255 }), // 업로드 파일명 (덮어쓰기 추적용)
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  // 기간 필터 핵심 인덱스 (getTopItems, aggregateSales 등 모든 날짜 범위 쿼리에 사용)
  idxSalesDate: index("idx_sr_sales_date").on(t.salesDate),
  // 부서 + 날짜 복합 인덱스 (dept 필터 시 날짜 범위 쿼리 최적화)
  idxDeptDate: index("idx_sr_dept_date").on(t.dept, t.salesDate),
  // 분류별 집계 인덱스
  idxChannel: index("idx_sr_channel").on(t.channel),
  idxItemLarge: index("idx_sr_item_large").on(t.itemLarge),
  idxItemMid: index("idx_sr_item_mid").on(t.itemMid),
  idxItemSmall: index("idx_sr_item_small").on(t.itemSmall),
  idxItemName: index("idx_sr_item_name").on(t.itemName),
  // sourceFilename 인덱스 (덮어쓰기 DELETE 쿼리 최적화)
  idxSourceFilename: index("idx_sr_source_filename").on(t.sourceFilename),
}));

export type SalesRecord = typeof salesRecords.$inferSelect;

// ─── BOM costs (원가 마스터 - 월별 관리) ─────────────────────────────────────────
// yearMonth: 'YYYYMM' 형식 (예: '202605') - BOM 파일명에서 추출
// 같은 품번이라도 월별로 다른 원가를 가질 수 있음
export const bomCosts = mysqlTable(
  "bom_costs",
  {
    id: int("id").autoincrement().primaryKey(),
    yearMonth: varchar("yearMonth", { length: 6 }).notNull(), // 'YYYYMM' e.g. '202605'
    itemCode: varchar("itemCode", { length: 64 }).notNull(),
    costPerUnit: decimal("costPerUnit", { precision: 15, scale: 4 }).default("0"),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => ({
    uniqYearMonthCode: uniqueIndex("uq_bom_yearmonth_code").on(t.yearMonth, t.itemCode),
    idxYearMonth: index("idx_bom_yearmonth").on(t.yearMonth),
  })
);

export type BomCost = typeof bomCosts.$inferSelect;

// ─── Sales targets (월별 목표) ──────────────────────────────────────────────────
export const salesTargets = mysqlTable(
  "sales_targets",
  {
    id: int("id").autoincrement().primaryKey(),
    dept: varchar("dept", { length: 64 }).notNull(),
    itemMid: varchar("itemMid", { length: 64 }).notNull(),  // 품목중분류
    year: int("year").notNull(),
    month: int("month").notNull(),
    targetAmt: decimal("targetAmt", { precision: 18, scale: 2 }).default("0"),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => ({
    uniqDeptItemYearMonth: uniqueIndex("uq_sales_targets_dept_item_year_month").on(t.dept, t.itemMid, t.year, t.month),
  })
);

export type SalesTarget = typeof salesTargets.$inferSelect;

// ─── Promotions (프로모션 행사) ─────────────────────────────────────────────────
export const promotions = mysqlTable("promotions", {
  id: int("id").autoincrement().primaryKey(),
  notionPageId: varchar("notionPageId", { length: 64 }).unique(), // 노션 페이지 ID (Upsert 키)
  dept: varchar("dept", { length: 64 }),
  channel: varchar("channel", { length: 128 }),
  eventName: varchar("eventName", { length: 255 }),
  startDate: date("startDate"),
  endDate: date("endDate"),
  targetAmt: decimal("targetAmt", { precision: 18, scale: 2 }).default("0"),
  achievedAmt: decimal("achievedAmt", { precision: 18, scale: 2 }).default("0"),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Promotion = typeof promotions.$inferSelect;

// ─── Inventory (재고) ───────────────────────────────────────────────────────────
export const inventory = mysqlTable("inventory", {
  id: int("id").autoincrement().primaryKey(),
  itemCode: varchar("itemCode", { length: 64 }).notNull(),
  itemName: varchar("itemName", { length: 128 }),
  currentStock: decimal("currentStock", { precision: 15, scale: 2 }).default("0"),
  expiryDate: date("expiryDate"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Inventory = typeof inventory.$inferSelect;

// ─── App settings (앱 설정 마스터) ──────────────────────────────────────────────────
export const appSettings = mysqlTable("app_settings", {
  id: int("id").autoincrement().primaryKey(),
  settingKey: varchar("settingKey", { length: 128 }).notNull().unique(),
  settingValue: text("settingValue").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AppSetting = typeof appSettings.$inferSelect;

// ─── Item mappings (품목 매핑 마스터) ────────────────────────────────────────────
export const itemMappings = mysqlTable("item_mappings", {
  id: int("id").autoincrement().primaryKey(),
  itemCode: varchar("itemCode", { length: 64 }).notNull().unique(),
  itemName: varchar("itemName", { length: 128 }),
  itemLarge: varchar("itemLarge", { length: 64 }),   // 품목대분류
  itemMid: varchar("itemMid", { length: 64 }),       // 품목중분류
  itemSmall: varchar("itemSmall", { length: 64 }),   // 품목소분류
  dept: varchar("dept", { length: 64 }),             // 담당부서
  note: text("note"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ItemMapping = typeof itemMappings.$inferSelect;

// ─── Naver Rankings (네이버 쇼핑 랭킹 데이터) ──────────────────────────────────────
export const naverRankings = mysqlTable(
  "naver_rankings",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    recordedAt: timestamp("recordedAt").notNull(),          // 일시 (구글 시트 '일시' 컬럼)
    recordedDate: date("recordedDate").notNull(),            // 날짜만 (YYYY-MM-DD)
    keyword: varchar("keyword", { length: 128 }).notNull(), // 키워드
    productCode: varchar("productCode", { length: 64 }).notNull(), // 상품코드 (고유 식별자)
    rank: int("rank").notNull(),                             // 순위
    productName: varchar("productName", { length: 512 }),   // 상품명
    price: int("price"),                                     // 가격 (숫자, 원 단위)
    seller: varchar("seller", { length: 256 }),              // 판매처
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("idx_naver_rankings_unique").on(t.keyword, t.recordedDate, t.productCode),
  ]
);
export type NaverRanking = typeof naverRankings.$inferSelect;

// ─── Naver Favorites (즐겨찾기) ──────────────────────────────────────────────────
export const naverFavorites = mysqlTable("naver_favorites", {
  id: int("id").autoincrement().primaryKey(),
  productCode: varchar("productCode", { length: 64 }).notNull().unique(), // 상품코드 (유니크)
  productName: varchar("productName", { length: 512 }),                   // 상품명 (표시용)
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type NaverFavorite = typeof naverFavorites.$inferSelect;

// ─── Naver Memos (비고 메모) ─────────────────────────────────────────────────────
export const naverMemos = mysqlTable("naver_memos", {
  id: int("id").autoincrement().primaryKey(),
  productCode: varchar("productCode", { length: 64 }).notNull(), // 상품코드
  keyword: varchar("keyword", { length: 128 }).notNull(),         // 키워드
  memo: text("memo").notNull(),                                    // 메모 내용
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type NaverMemo = typeof naverMemos.$inferSelect;

// ─── Naver Brand Keywords (브랜드 강조 키워드) ──────────────────────────────────
export const naverBrandKeywords = mysqlTable("naver_brand_keywords", {
  id: int("id").autoincrement().primaryKey(),
  keyword: varchar("keyword", { length: 128 }).notNull(), // 브랜드 키워드 (예: 꿈비, 리코코)
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type NaverBrandKeyword = typeof naverBrandKeywords.$inferSelect;

// ─── Sales Analysis Memos (매출 분석 메모 - AI 분석 + 수동 메모) ──────────────────
// Key: filterKey(대필터 ID) + startDate + endDate
export const salesAnalysisMemos = mysqlTable(
  "sales_analysis_memos",
  {
    id: int("id").autoincrement().primaryKey(),
    filterKey: varchar("filterKey", { length: 128 }).notNull(), // 대필터 ID (dept or 'all')
    startDate: varchar("startDate", { length: 10 }).notNull(),  // YYYY-MM-DD
    endDate: varchar("endDate", { length: 10 }).notNull(),      // YYYY-MM-DD
    aiAnalysis: text("aiAnalysis"),                              // AI 분석 결과
    aiGeneratedAt: timestamp("aiGeneratedAt"),                   // AI 분석 생성 시각
    manualMemo: text("manualMemo"),                              // 수동 입력 메모
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    uniqueIndex("idx_sales_memos_key").on(t.filterKey, t.startDate, t.endDate),
  ]
);
export type SalesAnalysisMemo = typeof salesAnalysisMemos.$inferSelect;

// ─── Sales Daily Mart (집계 마트 테이블 - 조회 성능 최적화) ─────────────────────────
// 파일 업로드 시 salesRecords에서 미리 집계해서 저장
// 조회 API는 이 테이블만 읽어 0.1~0.3초 내 응답
export const salesDailyMart = mysqlTable(
  "sales_daily_mart",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    salesDate: date("salesDate").notNull(),
    yearMonth: varchar("yearMonth", { length: 16 }).notNull(),   // e.g. "2026-01월"
    yearStr: varchar("yearStr", { length: 8 }).notNull(),        // e.g. "2026년"
    weekLabel: varchar("weekLabel", { length: 32 }),             // e.g. "2026년 1월 3주차"
    dept: varchar("dept", { length: 64 }),
    channel: varchar("channel", { length: 64 }),
    itemLarge: varchar("itemLarge", { length: 128 }),
    itemMid: varchar("itemMid", { length: 128 }),
    itemSmall: varchar("itemSmall", { length: 128 }),
    itemName: varchar("itemName", { length: 256 }),
    itemCode: varchar("itemCode", { length: 64 }),
    totalSalesAmt: decimal("totalSalesAmt", { precision: 18, scale: 2 }).notNull().default("0"),
    totalQty: decimal("totalQty", { precision: 15, scale: 2 }).notNull().default("0"),
    totalGrossProfit: decimal("totalGrossProfit", { precision: 18, scale: 2 }).notNull().default("0"),
    rowCount: int("rowCount").notNull().default(0),
    sourceFilename: varchar("sourceFilename", { length: 255 }),
    manager: varchar("manager", { length: 64 }),   // 담당자 (품번 오버라이드→소분류 매핑 해석 결과, 미지정 시 NULL)
    team: varchar("team", { length: 64 }),          // 팀
  },
  (t) => [
    index("mart_date_dept").on(t.salesDate, t.dept),
    index("mart_dept").on(t.dept),
    index("mart_yearmonth_dept").on(t.yearMonth, t.dept),
    index("mart_channel").on(t.channel),
    index("mart_itemlarge").on(t.itemLarge),
    index("mart_itemname").on(t.itemName),
    index("mart_source").on(t.sourceFilename),
    index("mart_manager").on(t.manager),
    index("mart_team").on(t.team),
  ]
);
export type SalesDailyMart = typeof salesDailyMart.$inferSelect;

// ─── New Products (신상품 관리 - 수동 등록) ──────────────────────────────────────
// 사용자가 수동으로 신상품으로 지정한 품목 목록
// itemName 기준으로 매출 데이터와 조인하여 신상품 필터 적용
export const newProducts = mysqlTable(
  "new_products",
  {
    id: int("id").autoincrement().primaryKey(),
    itemName: varchar("itemName", { length: 256 }).notNull(),   // 품명 (sales_records.itemName과 매칭)
    itemCode: varchar("itemCode", { length: 64 }),              // 상품코드 (선택)
    itemLarge: varchar("itemLarge", { length: 128 }),           // 대분류 (참고용)
    itemMid: varchar("itemMid", { length: 128 }),               // 중분류 (참고용)
    itemSmall: varchar("itemSmall", { length: 128 }),           // 소분류 (참고용)
    launchDate: date("launchDate"),                             // 출시일 (선택)
    note: text("note"),                                         // 비고
    addedBy: varchar("addedBy", { length: 64 }),                // 등록자
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    uniqueIndex("idx_new_products_itemname").on(t.itemName),
    index("idx_new_products_itemcode").on(t.itemCode),
  ]
);
export type NewProduct = typeof newProducts.$inferSelect;
export type InsertNewProduct = typeof newProducts.$inferInsert;

// ─── Monthly Variable Costs (월별 변동비) ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export const monthlyVariableCosts = mysqlTable(
  "monthly_variable_costs",
  {
    id: int("id").autoincrement().primaryKey(),
    year: int("year").notNull(),                          // 연도 (예: 2026)
    month: int("month").notNull(),                        // 월 (1~12)
    amount: bigint("amount", { mode: "number" }).notNull().default(0), // 변동비 총액 (원)
    forecastPct: decimal("forecastPct", { precision: 6, scale: 2 }),    // 예측 변동비율 (%)
    note: text("note"),                                   // 비고
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    uniqueIndex("idx_mvc_year_month").on(t.year, t.month),
  ]
);
export type MonthlyVariableCost = typeof monthlyVariableCosts.$inferSelect;
export type InsertMonthlyVariableCost = typeof monthlyVariableCosts.$inferInsert;
