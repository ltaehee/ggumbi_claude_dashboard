/**
 * naverRankingRouter.ts
 * 네이버 쇼핑 랭킹 분석 tRPC 라우터
 *
 * ⚠️ db.execute(sql`...`) 결과는 [RowDataPacket[], FieldPacket[]] 형태로 반환됨.
 *    실제 데이터는 항상 result[0] 에 있음.
 * ⚠️ `rank` 는 MySQL 예약어이므로 raw SQL 에서 반드시 백틱으로 감싸야 함.
 */
import { publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { getDb } from "./db";
import { naverFavorites, naverMemos, naverBrandKeywords } from "../drizzle/schema";
import { sql } from "drizzle-orm";
import {
  syncNaverRankingsFromSheet,
  updateSheetNote,
} from "./naverSheetSync";

/** db.execute() 결과에서 실제 행 배열을 추출하는 헬퍼 */
function rows<T = any>(result: unknown): T[] {
  if (Array.isArray(result) && Array.isArray(result[0])) {
    return result[0] as T[];
  }
  if (Array.isArray(result)) return result as T[];
  return [];
}

export const naverRankingRouter = router({
  // ─── 구글 시트에서 동기화 ──────────────────────────────────────────────────
  syncFromSheet: publicProcedure.mutation(async () => {
    const result = await syncNaverRankingsFromSheet();
    return result;
  }),

  // ─── 사용 가능한 키워드 목록 ──────────────────────────────────────────────
  getKeywords: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const result = await db.execute(
      sql`SELECT DISTINCT keyword FROM naver_rankings ORDER BY keyword`
    );
    return rows(result).map((r: any) => String(r.keyword));
  }),

  // ─── 날짜 목록 (특정 키워드 또는 전체) ──────────────────────────────────
  getDates: publicProcedure
    .input(z.object({ keyword: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      // keyword = "" 이면 전체
      const result = input.keyword
        ? await db.execute(
            sql`SELECT DISTINCT recordedDate FROM naver_rankings
                WHERE keyword = ${input.keyword}
                ORDER BY recordedDate DESC
                LIMIT 90`
          )
        : await db.execute(
            sql`SELECT DISTINCT recordedDate FROM naver_rankings
                ORDER BY recordedDate DESC
                LIMIT 90`
          );
      return rows(result).map((r: any) => String(r.recordedDate));
    }),

  // ─── 랭킹 데이터 전체 (특정 날짜 기준, 키워드 전체 지원) ─────────────────
  getRankings: publicProcedure
    .input(
      z.object({
        keyword: z.string(), // "" = 전체
        date: z.string().optional(),
        search: z.string().optional(), // 검색어
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { date: "", prevDate: null, rows: [] };

      const isAll = !input.keyword;

      // 대상 날짜 결정
      let targetDate = input.date;
      if (!targetDate) {
        const latest = isAll
          ? await db.execute(sql`SELECT MAX(recordedDate) as d FROM naver_rankings`)
          : await db.execute(
              sql`SELECT MAX(recordedDate) as d FROM naver_rankings WHERE keyword = ${input.keyword}`
            );
        const latestVal = rows(latest)[0]?.d;
        targetDate = latestVal ? String(latestVal) : "";
      }
      if (!targetDate) return { date: "", prevDate: null, rows: [] };

      // 전날 날짜
      const prevResult = isAll
        ? await db.execute(
            sql`SELECT DISTINCT recordedDate FROM naver_rankings
                WHERE recordedDate < ${targetDate}
                ORDER BY recordedDate DESC LIMIT 1`
          )
        : await db.execute(
            sql`SELECT DISTINCT recordedDate FROM naver_rankings
                WHERE keyword = ${input.keyword} AND recordedDate < ${targetDate}
                ORDER BY recordedDate DESC LIMIT 1`
          );
      const prevDate: string | null = rows(prevResult)[0]?.recordedDate
        ? String(rows(prevResult)[0].recordedDate)
        : null;

      // 오늘 데이터 (검색 포함)
      let todayResult;
      const searchLike = input.search ? `%${input.search}%` : null;

      if (isAll) {
        if (searchLike) {
          todayResult = await db.execute(
            sql`SELECT productCode, \`rank\`, productName, price, seller, recordedAt, keyword
                FROM naver_rankings
                WHERE recordedDate = ${targetDate}
                  AND (productName LIKE ${searchLike} OR productCode LIKE ${searchLike} OR seller LIKE ${searchLike})
                ORDER BY keyword ASC, \`rank\` ASC
                LIMIT 2000`
          );
        } else {
          todayResult = await db.execute(
            sql`SELECT productCode, \`rank\`, productName, price, seller, recordedAt, keyword
                FROM naver_rankings
                WHERE recordedDate = ${targetDate}
                ORDER BY keyword ASC, \`rank\` ASC
                LIMIT 2000`
          );
        }
      } else {
        if (searchLike) {
          todayResult = await db.execute(
            sql`SELECT productCode, \`rank\`, productName, price, seller, recordedAt
                FROM naver_rankings
                WHERE keyword = ${input.keyword} AND recordedDate = ${targetDate}
                  AND (productName LIKE ${searchLike} OR productCode LIKE ${searchLike} OR seller LIKE ${searchLike})
                ORDER BY \`rank\` ASC`
          );
        } else {
          todayResult = await db.execute(
            sql`SELECT productCode, \`rank\`, productName, price, seller, recordedAt
                FROM naver_rankings
                WHERE keyword = ${input.keyword} AND recordedDate = ${targetDate}
                ORDER BY \`rank\` ASC`
          );
        }
      }
      const todayData = rows(todayResult);

      // 전날 순위 맵
      let prevRankMap: Record<string, number> = {};
      if (prevDate) {
        const prevData = isAll
          ? await db.execute(
              sql`SELECT productCode, \`rank\` FROM naver_rankings WHERE recordedDate = ${prevDate}`
            )
          : await db.execute(
              sql`SELECT productCode, \`rank\` FROM naver_rankings
                  WHERE keyword = ${input.keyword} AND recordedDate = ${prevDate}`
            );
        for (const r of rows(prevData)) {
          prevRankMap[String(r.productCode)] = Number(r.rank);
        }
      }

      // 즐겨찾기 (상품코드 단위)
      const favResult = await db.execute(sql`SELECT productCode FROM naver_favorites`);
      const favSet = new Set(rows(favResult).map((r: any) => String(r.productCode)));

      // 메모
      const memoResult = input.keyword
        ? await db.execute(
            sql`SELECT productCode, memo FROM naver_memos WHERE keyword = ${input.keyword}`
          )
        : await db.execute(sql`SELECT productCode, memo FROM naver_memos`);
      const memoMap: Record<string, string> = {};
      for (const r of rows(memoResult)) {
        memoMap[String(r.productCode)] = String(r.memo);
      }

      const dataRows = todayData.map((r: any, idx: number) => {
        const code = String(r.productCode);
        const prevRank = prevRankMap[code] ?? null;
        const rankChange = prevRank !== null ? prevRank - Number(r.rank) : null;
        return {
          rowKey: `rk-${targetDate}-${code}-${idx}`,
          productCode: code,
          rank: Number(r.rank),
          productName: r.productName ? String(r.productName) : null,
          price: r.price !== null && r.price !== undefined ? Number(r.price) : null,
          seller: r.seller ? String(r.seller) : null,
          recordedAt: r.recordedAt as Date,
          keyword: r.keyword ? String(r.keyword) : input.keyword,
          prevRank,
          rankChange,
          isFavorite: favSet.has(code),
          memo: memoMap[code] ?? null,
        };
      });

      return { date: targetDate, prevDate, rows: dataRows };
    }),

  // ─── 급상승 TOP5 ──────────────────────────────────────────────────────────
  getTopRisers: publicProcedure
    .input(z.object({ keyword: z.string(), date: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      const isAll = !input.keyword;

      let targetDate = input.date;
      if (!targetDate) {
        const latest = isAll
          ? await db.execute(sql`SELECT MAX(recordedDate) as d FROM naver_rankings`)
          : await db.execute(
              sql`SELECT MAX(recordedDate) as d FROM naver_rankings WHERE keyword = ${input.keyword}`
            );
        targetDate = rows(latest)[0]?.d ? String(rows(latest)[0].d) : "";
      }
      if (!targetDate) return [];

      const prevResult = isAll
        ? await db.execute(
            sql`SELECT DISTINCT recordedDate FROM naver_rankings
                WHERE recordedDate < ${targetDate}
                ORDER BY recordedDate DESC LIMIT 1`
          )
        : await db.execute(
            sql`SELECT DISTINCT recordedDate FROM naver_rankings
                WHERE keyword = ${input.keyword} AND recordedDate < ${targetDate}
                ORDER BY recordedDate DESC LIMIT 1`
          );
      const prevDate: string | null = rows(prevResult)[0]?.recordedDate
        ? String(rows(prevResult)[0].recordedDate)
        : null;
      if (!prevDate) return [];

      const result = isAll
        ? await db.execute(
            sql`SELECT t.productCode, t.\`rank\` as todayRank, t.productName, t.seller,
                       p.\`rank\` as prevRank
                FROM naver_rankings t
                JOIN naver_rankings p
                  ON t.productCode = p.productCode
                 AND p.recordedDate = ${prevDate}
                WHERE t.recordedDate = ${targetDate}
                  AND p.\`rank\` > t.\`rank\`
                ORDER BY (p.\`rank\` - t.\`rank\`) DESC
                LIMIT 5`
          )
        : await db.execute(
            sql`SELECT t.productCode, t.\`rank\` as todayRank, t.productName, t.seller,
                       p.\`rank\` as prevRank
                FROM naver_rankings t
                JOIN naver_rankings p
                  ON t.productCode = p.productCode
                 AND p.keyword = ${input.keyword}
                 AND p.recordedDate = ${prevDate}
                WHERE t.keyword = ${input.keyword}
                  AND t.recordedDate = ${targetDate}
                  AND p.\`rank\` > t.\`rank\`
                ORDER BY (p.\`rank\` - t.\`rank\`) DESC
                LIMIT 5`
          );

      return rows(result).map((r: any) => ({
        productCode: String(r.productCode),
        productName: r.productName ? String(r.productName) : null,
        seller: r.seller ? String(r.seller) : null,
        todayRank: Number(r.todayRank),
        prevRank: Number(r.prevRank),
        rankChange: Number(r.prevRank) - Number(r.todayRank),
      }));
    }),

  // ─── 시계열 그래프 데이터 (단일) ──────────────────────────────────────────
  getRankingHistory: publicProcedure
    .input(
      z.object({
        keyword: z.string(),
        productCode: z.string(),
        days: z.number().default(30),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const result = await db.execute(
        sql`SELECT recordedDate, \`rank\`, productName, price
            FROM naver_rankings
            WHERE keyword = ${input.keyword}
              AND productCode = ${input.productCode}
            ORDER BY recordedDate ASC
            LIMIT ${input.days}`
      );
      return rows(result).map((r: any) => ({
        date: String(r.recordedDate),
        rank: Number(r.rank),
        productName: r.productName ? String(r.productName) : null,
        price: r.price !== null ? Number(r.price) : null,
      }));
    }),

  // ─── 시계열 그래프 데이터 (멀티 상품) ────────────────────────────────────
  getRankingHistoryMulti: publicProcedure
    .input(
      z.object({
        keyword: z.string(),
        productCodes: z.array(z.string()).max(10),
        days: z.number().default(30),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return {};
      if (input.productCodes.length === 0) return {};

      const result: Record<
        string,
        { date: string; rank: number; productName: string | null }[]
      > = {};

      for (const code of input.productCodes) {
        const res = await db.execute(
          sql`SELECT recordedDate, \`rank\`, productName
              FROM naver_rankings
              WHERE keyword = ${input.keyword}
                AND productCode = ${code}
              ORDER BY recordedDate ASC
              LIMIT ${input.days}`
        );
        result[code] = rows(res).map((r: any) => ({
          date: String(r.recordedDate),
          rank: Number(r.rank),
          productName: r.productName ? String(r.productName) : null,
        }));
      }

      return result;
    }),

  // ─── 즐겨찾기 토글 (상품코드 단위) ─────────────────────────────────────────
  toggleFavorite: publicProcedure
    .input(z.object({ productCode: z.string(), productName: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { isFavorite: false };
      const existing = await db.execute(
        sql`SELECT id FROM naver_favorites WHERE productCode = ${input.productCode} LIMIT 1`
      );
      if (rows(existing).length > 0) {
        await db.execute(
          sql`DELETE FROM naver_favorites WHERE productCode = ${input.productCode}`
        );
        return { isFavorite: false };
      } else {
        await db.insert(naverFavorites).values({
          productCode: input.productCode,
          productName: input.productName ?? null,
        });
        return { isFavorite: true };
      }
    }),

  // ─── 즐겨찾기 목록 조회 (상품코드 단위) ──────────────────────────────────────
  getFavoriteList: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const result = await db.execute(
      sql`SELECT f.id, f.productCode, f.productName, f.createdAt
          FROM naver_favorites f
          ORDER BY f.createdAt DESC`
    );
    return rows(result).map((r: any) => ({
      id: Number(r.id),
      productCode: String(r.productCode),
      productName: r.productName ? String(r.productName) : null,
      createdAt: r.createdAt ? new Date(r.createdAt) : null,
    }));
  }),

  // ─── 상품 검색 (그래프 추가용, 즐겨찾기 상단 정렬) ────────────────────────────
  searchProducts: publicProcedure
    .input(z.object({ keyword: z.string(), query: z.string(), limit: z.number().default(20) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      // 즐겨찾기 상품코드 목록
      const favResult = await db.execute(
        sql`SELECT productCode FROM naver_favorites`
      );
      const favSet = new Set(rows(favResult).map((r: any) => String(r.productCode)));

      const q = `%${input.query}%`;
      const result = input.keyword
        ? await db.execute(
            sql`SELECT DISTINCT productCode, productName, seller
                FROM naver_rankings
                WHERE keyword = ${input.keyword}
                  AND (productName LIKE ${q} OR productCode LIKE ${q})
                ORDER BY productName ASC
                LIMIT ${input.limit}`
          )
        : await db.execute(
            sql`SELECT DISTINCT productCode, productName, seller
                FROM naver_rankings
                WHERE productName LIKE ${q} OR productCode LIKE ${q}
                ORDER BY productName ASC
                LIMIT ${input.limit}`
          );

      const items = rows(result).map((r: any) => ({
        productCode: String(r.productCode),
        productName: r.productName ? String(r.productName) : null,
        seller: r.seller ? String(r.seller) : null,
        isFavorite: favSet.has(String(r.productCode)),
      }));

      // 즐겨찾기 상단 정렬
      items.sort((a, b) => {
        if (a.isFavorite && !b.isFavorite) return -1;
        if (!a.isFavorite && b.isFavorite) return 1;
        return 0;
      });
      return items;
    }),

  // ─── 메모 저장/수정 (DB + 구글 시트 H열 동기화) ──────────────────────────
  upsertMemo: publicProcedure
    .input(
      z.object({
        keyword: z.string(),
        productCode: z.string(),
        memo: z.string(),
        recordedDate: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { success: false };
      const existing = await db.execute(
        sql`SELECT id FROM naver_memos
            WHERE keyword = ${input.keyword} AND productCode = ${input.productCode}
            LIMIT 1`
      );
      if (rows(existing).length > 0) {
        await db.execute(
          sql`UPDATE naver_memos SET memo = ${input.memo}
              WHERE keyword = ${input.keyword} AND productCode = ${input.productCode}`
        );
      } else {
        await db.insert(naverMemos).values({
          keyword: input.keyword,
          productCode: input.productCode,
          memo: input.memo,
        });
      }

      let sheetUpdated = false;
      if (input.recordedDate) {
        const sheetResult = await updateSheetNote(
          input.productCode,
          input.recordedDate,
          input.keyword,
          input.memo
        );
        sheetUpdated = sheetResult.success;
      }

      return { success: true, sheetUpdated };
    }),

  // ─── 메모 삭제 ──────────────────────────────────────────────────────────────
  deleteMemo: publicProcedure
    .input(z.object({ keyword: z.string(), productCode: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { success: false };
      await db.execute(
        sql`DELETE FROM naver_memos
            WHERE keyword = ${input.keyword} AND productCode = ${input.productCode}`
      );
      return { success: true };
    }),

  // ─── 브랜드 키워드 목록 조회 ─────────────────────────────────────────────
  getBrandKeywords: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const result = await db.execute(
      sql`SELECT CAST(id AS CHAR) as id, keyword FROM naver_brand_keywords ORDER BY createdAt ASC`
    );
    return rows(result).map((r: any) => ({
      id: String(r.id),
      keyword: String(r.keyword),
    }));
  }),

  // ─── 브랜드 키워드 추가 ──────────────────────────────────────────────────
  addBrandKeyword: publicProcedure
    .input(z.object({ keyword: z.string().min(1).max(64) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { success: false };

      const kw = input.keyword.trim();
      const existing = await db.execute(
        sql`SELECT id FROM naver_brand_keywords WHERE keyword = ${kw} LIMIT 1`
      );
      if (rows(existing).length > 0) return { success: true, duplicate: true };

      await db.insert(naverBrandKeywords).values({ keyword: kw });
      return { success: true, duplicate: false };
    }),

  // ─── 브랜드 키워드 삭제 ──────────────────────────────────────────────────
  removeBrandKeyword: publicProcedure
    .input(z.object({ id: z.union([z.number(), z.string()]) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { success: false };
      await db.execute(
        sql`DELETE FROM naver_brand_keywords WHERE CAST(id AS CHAR) = ${String(input.id)}`
      );
      return { success: true };
    }),

  // ─── 즐겨찾기 목록 전체 조회 (히스토리 차트용, 상품코드 단위) ───────────────
  getAllFavorites: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const result = await db.execute(
      sql`SELECT f.productCode,
              COALESCE(f.productName,
                (SELECT r.productName FROM naver_rankings r
                 WHERE r.productCode = f.productCode
                 ORDER BY r.recordedDate DESC LIMIT 1)) as productName
          FROM naver_favorites f
          ORDER BY f.createdAt DESC`
    );
    return rows(result).map((r: any) => ({
      productCode: String(r.productCode),
      productName: r.productName ? String(r.productName) : null,
    }));
  }),

  // ─── 상품코드 기반 히스토리 (모든 키워드, 키워드별 시리즈) ──────────────────────
  getRankingHistoryByProduct: publicProcedure
    .input(
      z.object({
        productCodes: z.array(z.string()).max(10),
        days: z.number().default(90),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db || input.productCodes.length === 0) return {};

      // 결과: { [productCode]: { [keyword]: { date, rank }[] } }
      const result: Record<string, Record<string, { date: string; rank: number; productName: string | null }[]>> = {};

      for (const code of input.productCodes) {
        const res = await db.execute(
          sql`SELECT recordedDate, keyword, \`rank\`, productName
              FROM naver_rankings
              WHERE productCode = ${code}
              ORDER BY recordedDate ASC
              LIMIT ${input.days * 20}`
        );
        const byKeyword: Record<string, { date: string; rank: number; productName: string | null }[]> = {};
        for (const r of rows(res) as any[]) {
          const kw = String(r.keyword);
          if (!byKeyword[kw]) byKeyword[kw] = [];
          byKeyword[kw].push({
            date: String(r.recordedDate),
            rank: Number(r.rank),
            productName: r.productName ? String(r.productName) : null,
          });
        }
        result[code] = byKeyword;
      }

      return result;
    }),

  // ─── 마지막 동기화 시각 ──────────────────────────────────────────────────────
  getLastSyncedAt: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { lastSyncedAt: null };
    const result = await db.execute(
      sql`SELECT MAX(createdAt) as lastSync FROM naver_rankings`
    );
    const r = rows(result)[0];
    return { lastSyncedAt: r?.lastSync ? new Date(r.lastSync) : null };
  }),
});
