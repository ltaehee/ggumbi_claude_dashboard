import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import {
  aggregateSales,
  aggregateSalesFromMart,
  deleteBomCost,
  deleteSalesRecord,
  deleteSalesByDateRange,
  deleteSalesTarget,
  getAllBomCostsList,
  getAllSalesTargets,
  getAppSetting,
  getDepts,
  getInventoryMap,
  getItemPerformance,
  getPromotionsByMonth,
  getRecentSales30d,
  getSalesForDOC,
  getSalesRange,
  getSalesRecordsPaged,
  getTargetsByDeptYear,
  getUploadHistory,
  insertSalesTarget,
  setAppSetting,
  updateBomCost,
  updateSalesTarget,
  getAllItemMappings,
  upsertItemMapping,
  deleteItemMapping,
  getChannelDrilldown,
  getChannelDrilldownFromMart,
  getFilterOptions,
  getFilterOptionsFromMart,
  getTopItems,
  getTopItemsFromMart,
  getItemPerformanceFromMart,
  getSimulatorData,
  getAllPromotions,
  insertPromotion,
  updatePromotion,
  deletePromotion,
  getItemTrendData,
  getTrendDataFromMart,
  getSalesAnalysisMemo,
  upsertSalesAnalysisMemo,
  getAllNewProducts,
  insertNewProduct,
  updateNewProduct,
  deleteNewProduct,
  getNewProductItemNames,
  getDistinctItemNamesFromSales,
  getItemMetaByName,
  rebuildMartFromAllRecords,
  getAllVariableCosts,
  getVariableCostsByYear,
  upsertVariableCost,
  deleteVariableCost,
  getContribMarginForPeriod,
  getVariableCostRowsForPeriod,
  getAccount,
  createAccount,
  listAccounts,
  setAccountApproved,
  deleteAccount,
  getProductTargetYears,
  getManagerMap,
  getTeamItemNames,
  getMonthlyTargetSums,
  getScopedItemNames,
  getMapManagers,
  getAllManagers,
  getUnassignedSkus,
  getUnassignedSummary,
  assignSkuManager,
  applyOverrideToMart,
  assignSmallManager,
} from "./db";
import { calcPctSafe, prevMonthSamePeriod, prevYearSameDate } from "./bizUtils";
import { invokeLLM } from "./_core/llm";
import { syncNotionToDb, getNotionLastSyncedAt } from "./notionSync";
import { withCache, queryCache } from "./cache";
import { naverRankingRouter } from "./naverRankingRouter";

// 담당/팀 → 담당 품명(itemNames)으로 서버측 변환 (URL 길이 문제 회피 + 정밀 매칭)
async function applyTargetScope<T extends Record<string, any>>(input: T): Promise<T> {
  const manager: string | undefined = input.manager;
  const team: string | undefined = input.team;
  if (!manager && !team) return input;

  // 담당자/팀 → 담당 품명 목록 (마트에 baked된 manager 기준: 품번 오버라이드→소분류 매핑 해석 결과)
  let names = await getScopedItemNames({ manager, team }).catch(() => [] as string[]);

  // 폴백: 마트에 담당자 정보가 아직 없으면(담당 파일 업로드 전) product_targets 품명 스코핑
  if (names.length === 0) {
    const year: number = input.targetYear ?? new Date(input.endDate ?? Date.now()).getFullYear();
    if (manager) {
      const mm = await getManagerMap(year).catch(() => []);
      names = mm.find((x) => x.manager === manager)?.itemNames ?? [];
    } else if (team) {
      names = await getTeamItemNames(year, team).catch(() => []);
    }
  }
  if (names.length === 0) names = ["__none__"]; // 매칭 없음 → 빈 결과 유도
  const existing: string[] | undefined = input.itemNames;
  const merged = existing && existing.length ? existing.filter((n) => names.includes(n)) : names;
  return { ...input, itemNames: merged.length ? merged : ["__none__"] };
}

/** 팀 → 집계 필터 (마트 baked manager 기준 담당 품명). 월간 리포트용 */
async function teamScopeFilt(
  year: number,
  team?: string | null
): Promise<{ itemNames?: string[] }> {
  if (!team) return {};
  let names = await getScopedItemNames({ team }).catch(() => [] as string[]);
  if (names.length === 0) names = await getTeamItemNames(year, team).catch(() => []);
  return { itemNames: names.length ? names : ["__none__"] };
}

export const appRouter = router({
  system: systemRouter,
  naverRanking: naverRankingRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ─── Dashboard meta ──────────────────────────────────────────────────────────
  dashboard: router({
    getDepts: publicProcedure.query(() => getDepts()),
    getSalesRange: publicProcedure.query(() => getSalesRange()),
    getUploadHistory: publicProcedure.query(() => getUploadHistory()),
  }),

  // ─── KPI metrics ─────────────────────────────────────────────────────────────
  kpi: router({
    getSummary: publicProcedure
      .input(
        z.object({
          startDate: z.string(),
          endDate: z.string(),
          dept: z.string().optional(),
          itemLarge: z.string().optional(),
          itemMid: z.string().optional(),
          itemSmall: z.string().optional(),
          itemName: z.string().optional(),
          // 다중 선택 필터
          channels: z.array(z.string()).optional(),
          itemLarges: z.array(z.string()).optional(),
          itemMids: z.array(z.string()).optional(),
          itemSmalls: z.array(z.string()).optional(),
          itemNames: z.array(z.string()).optional(),
          // 담당/팀 필터 (서버에서 담당 품명으로 변환)
          manager: z.string().optional(),
          team: z.string().optional(),
          targetYear: z.number().optional(),
        })
      )
      .query(async ({ input }) => {
        const cacheKey = `kpi:${JSON.stringify(input)}`;
        const cached = queryCache.get<any>(cacheKey);
        if (cached) return cached;

        const { startDate, endDate, manager: _m, team: _t, targetYear: _ty, ...filters } = await applyTargetScope(input);

        // 진행 중인 기간 보정: 실제 데이터가 있는 마지막 날짜로 비교 기준일(refDate)을 clamp.
        // 예) 7월을 선택했지만 데이터가 7/6까지만 있으면, 작년·전월도 같은 1~6일 구간으로 비교
        //     (그렇지 않으면 6일치 vs 지난달 30일치를 비교해 YoY/MoM이 -80%처럼 왜곡됨)
        const salesRange = await getSalesRange().catch(() => ({ min: null, max: null }));
        const maxDataDate = salesRange.max ? String(salesRange.max).slice(0, 10) : null;
        const effectiveEnd = maxDataDate && maxDataDate < endDate ? maxDataDate : endDate;
        const refDate = new Date(effectiveEnd);
        const refYear = refDate.getFullYear();

        // 마트 기반 집계 (폴백: 원본 테이블)
        const aggFn = async (p: Parameters<typeof aggregateSalesFromMart>[0]) =>
          aggregateSalesFromMart(p).catch(() => aggregateSales(p));

        // 선택 기간 현재
        const curr = await aggFn({ startDate, endDate, ...filters });

        // YTD (올해 1월 1일 ~ endDate)
        const ytdStart = `${refYear}-01-01`;
        const ytd = await aggFn({ startDate: ytdStart, endDate, ...filters });

        // YTD 작년 동기 (작년 1월 1일 ~ 작년 동일날짜)
        const prevYearEnd = prevYearSameDate(refDate);
        const prevYearEndStr = prevYearEnd.toISOString().split("T")[0];
        const prevYtdStart = `${refYear - 1}-01-01`;
        const ytdPrev = await aggFn({
          startDate: prevYtdStart,
          endDate: prevYearEndStr,
          ...filters,
        });

        // YoY (전년 동일 기간)
        const prevYearStart = prevYearSameDate(new Date(startDate));
        const yoy = await aggFn({
          startDate: prevYearStart.toISOString().split("T")[0],
          endDate: prevYearEndStr,
          ...filters,
        });

        // MoM (전월 동기간)
        const { start: momStart, end: momEnd } = prevMonthSamePeriod(refDate);
        const mom = await aggFn({
          startDate: momStart.toISOString().split("T")[0],
          endDate: momEnd.toISOString().split("T")[0],
          ...filters,
        });

        const asp = curr.totalQty > 0 ? curr.totalSales / curr.totalQty : 0;
        const aspPrev = yoy.totalQty > 0 ? yoy.totalSales / yoy.totalQty : 0;
        const marginRate =
          curr.totalSales > 0 ? (curr.totalProfit / curr.totalSales) * 100 : 0;

        // 공헌이익 계산 (변동비 안분)
        const contribMargin = await getContribMarginForPeriod({ startDate, endDate, ...filters });
        const contribMarginRate = curr.totalSales > 0 ? (contribMargin / curr.totalSales) * 100 : 0;

        // YTD 공헌이익 (올해 / 작년 동기)
        const [ytdContrib, ytdPrevContrib] = await Promise.all([
          getContribMarginForPeriod({ startDate: ytdStart, endDate, ...filters }),
          getContribMarginForPeriod({ startDate: prevYtdStart, endDate: prevYearEndStr, ...filters }),
        ]);

        const result = {
          // 선택 기간
          currSales: curr.totalSales,
          currQty: curr.totalQty,
          currProfit: curr.totalProfit,
          contribMargin,
          contribMarginRate,
          asp,
          marginRate,
          // YTD
          ytdSales: ytd.totalSales,
          ytdPrevSales: ytdPrev.totalSales,
          ytdGrowthPct: calcPctSafe(ytd.totalSales, ytdPrev.totalSales),
          // YTD 매출이익 / 공헌이익
          ytdProfit: ytd.totalProfit,
          ytdPrevProfit: ytdPrev.totalProfit,
          ytdContrib,
          ytdPrevContrib,
          // YoY
          yoySales: yoy.totalSales,
          yoyPct: calcPctSafe(curr.totalSales, yoy.totalSales),
          yoyQtyPct: calcPctSafe(curr.totalQty, yoy.totalQty),
          yoyAspPct: calcPctSafe(asp, aspPrev),
          // MoM
          momSales: mom.totalSales,
          momPct: calcPctSafe(curr.totalSales, mom.totalSales),
          momQtyPct: calcPctSafe(curr.totalQty, mom.totalQty),
        };
        queryCache.set(cacheKey, result, 5 * 60 * 1000);
        return result;
      }),
  }),

  // ─── Filter options (계층형 필터 드롭다운) ─────────────────────────────────────
  filters: router({
    getOptions: publicProcedure
      .input(
        z.object({
          dept: z.string().optional(),
          level: z.enum(["channel", "itemLarge", "itemMid", "itemSmall", "itemName"]),
          parentChannel: z.string().optional(),
          parentLarge: z.string().optional(),
          parentMid: z.string().optional(),
          parentSmall: z.string().optional(),
          // 매출 기준 정렬을 위한 날짜 범위
          startDate: z.string().optional(),
          endDate: z.string().optional(),
        })
      )
      .query(async ({ input }) => {
        return getFilterOptionsFromMart(input).catch(() => getFilterOptions(input));
      }),

    getTopItems: publicProcedure
      .input(
        z.object({
          startDate: z.string(),
          endDate: z.string(),
          dept: z.string().optional(),
          type: z.enum(["channel", "itemLarge", "itemMid", "itemSmall", "itemName"]),
          limit: z.number().optional(),
          channels: z.array(z.string()).optional(),
          itemLarges: z.array(z.string()).optional(),
          itemMids: z.array(z.string()).optional(),
          itemSmalls: z.array(z.string()).optional(),
          itemNames: z.array(z.string()).optional(),
        })
      )
      .query(async ({ input }) => {
        return getTopItemsFromMart(input).catch(() => getTopItems(input));
      }),
  }),

  // ─── Sales analysis ───────────────────────────────────────────────────────────
  sales: router({
    getTrend: publicProcedure
      .input(
        z.object({
          startDate: z.string(),
          endDate: z.string(),
          dept: z.string().optional(),
          groupBy: z.enum(["weekLabel", "yearMonth", "yearStr", "day"]),
          channels: z.array(z.string()).optional(),
          itemLarges: z.array(z.string()).optional(),
          itemMids: z.array(z.string()).optional(),
          itemSmalls: z.array(z.string()).optional(),
          itemNames: z.array(z.string()).optional(),
          manager: z.string().optional(),
          team: z.string().optional(),
          targetYear: z.number().optional(),
        })
      )
      .query(async ({ input }) => {
        return withCache(`trend:${JSON.stringify(input)}`, async () => {
          const scoped = await applyTargetScope(input);
          const rows = await getTrendDataFromMart(scoped).catch(() => getTrendData(scoped));
          return rows.map((r, i) => ({
            ...r,
            pctChange: i > 0 ? calcPctSafe(r.totalSales, rows[i - 1].totalSales) : null,
            qtyPctChange: i > 0 ? calcPctSafe(r.totalQty, rows[i - 1].totalQty) : null,
          }));
        });
      }),

    getItemTrend: publicProcedure
      .input(
        z.object({
          startDate: z.string(),
          endDate: z.string(),
          dept: z.string().optional(),
          groupBy: z.enum(["weekLabel", "yearMonth"]),
          groupField: z.enum(["itemName", "itemLarge", "itemMid", "channel"]),
          limit: z.number().optional(),
          channels: z.array(z.string()).optional(),
          itemLarges: z.array(z.string()).optional(),
          itemMids: z.array(z.string()).optional(),
          itemSmalls: z.array(z.string()).optional(),
          itemNames: z.array(z.string()).optional(),
          manager: z.string().optional(),
          team: z.string().optional(),
          targetYear: z.number().optional(),
        })
      )
      .query(async ({ input }) => {
        return withCache(`itemTrend:${JSON.stringify(input)}`, async () => {
          const scoped = await applyTargetScope(input);
          return getItemTrendData(scoped);
        });
      }),

    getItemPerf: publicProcedure
      .input(
        z.object({
          startDate: z.string(),
          endDate: z.string(),
          dept: z.string().optional(),
          groupBy: z.enum(["itemName", "itemLarge", "itemMid", "itemSmall", "channel"]),
          limit: z.number().optional(),
          channels: z.array(z.string()).optional(),
          itemLarges: z.array(z.string()).optional(),
          itemMids: z.array(z.string()).optional(),
          itemSmalls: z.array(z.string()).optional(),
          itemNames: z.array(z.string()).optional(),
          manager: z.string().optional(),
          team: z.string().optional(),
          targetYear: z.number().optional(),
        })
      )
      .query(async ({ input }) => {
        return withCache(`itemPerf:${JSON.stringify(input)}`, async () => {
        const scoped = await applyTargetScope(input);
        const curr = await getItemPerformanceFromMart(scoped).catch(() => getItemPerformance(scoped));

        // 전년 동기 비교
        const refDate = new Date(scoped.endDate);
        const prevYearEnd = prevYearSameDate(refDate);
        const prevYearStart = prevYearSameDate(new Date(scoped.startDate));
        const perfFn = async (p: Parameters<typeof getItemPerformanceFromMart>[0]) =>
          getItemPerformanceFromMart(p).catch(() => getItemPerformance(p));
        const prev = await perfFn({
          ...scoped,
          startDate: prevYearStart.toISOString().split("T")[0],
          endDate: prevYearEnd.toISOString().split("T")[0],
        });
        const prevMap = new Map(prev.map((p) => [p.label, p]));

        // 전월 동기간
        const { start: momStart, end: momEnd } = prevMonthSamePeriod(refDate);
        const mom = await perfFn({
          ...scoped,
          startDate: momStart.toISOString().split("T")[0],
          endDate: momEnd.toISOString().split("T")[0],
        });
        const momMap = new Map(mom.map((p) => [p.label, p]));

        // 변동비율 조회 (forecastPct 우선)
        const vcRows = await getVariableCostRowsForPeriod(scoped.startDate, scoped.endDate);
        const rowsWithPct = vcRows.filter((r) => r.forecastPct !== null && r.forecastPct > 0);
        const avgPct = rowsWithPct.length > 0
          ? rowsWithPct.reduce((s, r) => s + (r.forecastPct as number), 0) / rowsWithPct.length
          : null;
        // amount 기반 안분을 위한 전체 변동비 합계
        const totalVcAmount = vcRows.reduce((s, r) => s + r.amount, 0);
        // 전체 매출 합계 (안분 기준)
        const totalSalesSum = curr.reduce((s, r) => s + r.totalSales, 0);

        return curr.map((r) => {
          const p = prevMap.get(r.label);
          const m = momMap.get(r.label);
          const marginRate = r.totalSales > 0 ? (r.totalProfit / r.totalSales) * 100 : 0;
          let contribMarginRate: number | null = null;
          let contribMargin: number | null = null;
          if (avgPct !== null) {
            // forecastPct 방식: 각 행의 매출이익 - (매출 × avgPct/100) → 행별 공헌이익률
            const variableCost = r.totalSales * (avgPct / 100);
            contribMargin = r.totalProfit - variableCost;
            contribMarginRate = r.totalSales > 0 ? (contribMargin / r.totalSales) * 100 : 0;
          } else if (totalVcAmount > 0 && totalSalesSum > 0) {
            // amount 방식: 행별 매출 비중으로 변동비 안분
            const allocatedVc = totalVcAmount * (r.totalSales / totalSalesSum);
            contribMargin = r.totalProfit - allocatedVc;
            contribMarginRate = r.totalSales > 0 ? (contribMargin / r.totalSales) * 100 : 0;
          }
          return {
            ...r,
            prevSales: p?.totalSales ?? 0,
            yoyPct: calcPctSafe(r.totalSales, p?.totalSales ?? 0),
            momSales: m?.totalSales ?? 0,
            momPct: calcPctSafe(r.totalSales, m?.totalSales ?? 0),
            marginRate,
            contribMargin,
            contribMarginRate,
          };
        });
        }); // end withCache
      }),
  }),

  // ─── Analysis Memos (AI 분석 + 수동 메모) ──────────────────────────────────────────────
  analysisMemo: router({
    get: publicProcedure
      .input(z.object({ filterKey: z.string(), startDate: z.string(), endDate: z.string() }))
      .query(async ({ input }) => {
        return getSalesAnalysisMemo(input.filterKey, input.startDate, input.endDate);
      }),

    saveManualMemo: publicProcedure
      .input(z.object({ filterKey: z.string(), startDate: z.string(), endDate: z.string(), manualMemo: z.string() }))
      .mutation(async ({ input }) => {
        await upsertSalesAnalysisMemo({
          filterKey: input.filterKey,
          startDate: input.startDate,
          endDate: input.endDate,
          manualMemo: input.manualMemo,
        });
        return { success: true };
      }),

    generateAI: publicProcedure
      .input(z.object({
        filterKey: z.string(),
        startDate: z.string(),
        endDate: z.string(),
        kpiSummary: z.string(), // 프론트엔드에서 직렬화한 KPI 요약
      }))
      .mutation(async ({ input }) => {
        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `당신은 전문 매출 데이터 분석가입니다. 주어진 KPI 데이터를 바탕으로 \n실질적인 비즈니스 인사이트를 제공하세요. \n한국어로 작성하며, 주요 지표의 특이사항, 성장/감소 요인, \n개선 제안을 간결하게 3개 이내로 정리하세요. 마크다운 형식으로 작성하세요.`,
            },
            {
              role: "user",
              content: `분석 기간: ${input.startDate} ~ ${input.endDate}\n필터: ${input.filterKey}\n\nKPI 데이터:\n${input.kpiSummary}`,
            },
          ],
        });
        const rawContent = response?.choices?.[0]?.message?.content;
        const aiText = typeof rawContent === "string" ? rawContent : "";
        await upsertSalesAnalysisMemo({
          filterKey: input.filterKey,
          startDate: input.startDate,
          endDate: input.endDate,
          aiAnalysis: aiText,
          aiGeneratedAt: new Date(),
        });
        return { aiAnalysis: aiText, generatedAt: new Date().toISOString() };
      }),

    clearAI: publicProcedure
      .input(z.object({ filterKey: z.string(), startDate: z.string(), endDate: z.string() }))
      .mutation(async ({ input }) => {
        await upsertSalesAnalysisMemo({
          filterKey: input.filterKey,
          startDate: input.startDate,
          endDate: input.endDate,
          aiAnalysis: null,
          aiGeneratedAt: null,
        });
        return { success: true };
      }),
  }),

  // ─── Channel drilldown ─────────────────────────────────────────────────────────
  channel: router({
    getDrilldown: publicProcedure
      .input(
        z.object({
          startDate: z.string(),
          endDate: z.string(),
          dept: z.string().optional(),
          channels: z.array(z.string()).optional(),
          itemLarges: z.array(z.string()).optional(),
          itemMids: z.array(z.string()).optional(),
          itemSmalls: z.array(z.string()).optional(),
          itemNames: z.array(z.string()).optional(),
          level: z.enum(["channel", "large", "item"]),
          parentChannel: z.string().optional(),
          parentLarge: z.string().optional(),
        })
      )
      .query(async ({ input }) => {
        return withCache(`drilldown:${JSON.stringify(input)}`, async () => {
        const { startDate, endDate, ...rest } = input;
        const drillFn = async (p: Parameters<typeof getChannelDrilldownFromMart>[0]) =>
          getChannelDrilldownFromMart(p).catch(() => getChannelDrilldown(p));
        const curr = await drillFn({ startDate, endDate, ...rest });

        // YoY 비교
        const refDate = new Date(endDate);
        const prevYearEnd = prevYearSameDate(refDate);
        const prevYearStart = prevYearSameDate(new Date(startDate));
        const prev = await drillFn({
          startDate: prevYearStart.toISOString().split("T")[0],
          endDate: prevYearEnd.toISOString().split("T")[0],
          ...rest,
        });
        const prevMap = new Map(prev.map((p) => [p.label, p]));

        // MoM 비교
        const { start: momStart, end: momEnd } = prevMonthSamePeriod(refDate);
        const mom = await drillFn({
          startDate: momStart.toISOString().split("T")[0],
          endDate: momEnd.toISOString().split("T")[0],
          ...rest,
        });
        const momMap = new Map(mom.map((p) => [p.label, p]));

        // 변동비율 조회 (forecastPct 우선)
        const vcRowsCh = await getVariableCostRowsForPeriod(startDate, endDate);
        const rowsWithPctCh = vcRowsCh.filter((r) => r.forecastPct !== null && r.forecastPct > 0);
        const avgPctCh = rowsWithPctCh.length > 0
          ? rowsWithPctCh.reduce((s, r) => s + (r.forecastPct as number), 0) / rowsWithPctCh.length
          : null;
        // amount 기반 안분을 위한 전체 변동비 합계
        const totalVcAmountCh = vcRowsCh.reduce((s, r) => s + r.amount, 0);
        // 전체 매출 합계 (안분 기준)
        const totalSalesSumCh = curr.reduce((s, r) => s + r.totalSales, 0);

        return curr.map((r) => {
          const p = prevMap.get(r.label);
          const m = momMap.get(r.label);
          const marginRate = r.totalSales > 0 ? (r.totalProfit / r.totalSales) * 100 : 0;
          let contribMarginRate: number | null = null;
          let contribMarginCh: number | null = null;
          if (avgPctCh !== null) {
            // forecastPct 방식: 행별 매출이익 - (매출 × avgPct/100)
            const variableCost = r.totalSales * (avgPctCh / 100);
            contribMarginCh = r.totalProfit - variableCost;
            contribMarginRate = r.totalSales > 0 ? (contribMarginCh / r.totalSales) * 100 : 0;
          } else if (totalVcAmountCh > 0 && totalSalesSumCh > 0) {
            // amount 방식: 행별 매출 비중으로 변동비 안분
            const allocatedVc = totalVcAmountCh * (r.totalSales / totalSalesSumCh);
            contribMarginCh = r.totalProfit - allocatedVc;
            contribMarginRate = r.totalSales > 0 ? (contribMarginCh / r.totalSales) * 100 : 0;
          }
          return {
            ...r,
            yoyPct: calcPctSafe(r.totalSales, p?.totalSales ?? 0),
            momPct: calcPctSafe(r.totalSales, m?.totalSales ?? 0),
            marginRate,
            contribMargin: contribMarginCh,
            contribMarginRate,
          };
        });
        }); // end withCache
      }),
  }),
  // ─── Targets & promotions ─────────────────────────────────────────────────────
  targets: router({
    // YTD 월별 목표 조회 (dept + year 기준, itemMid='__total__' 행)
    getYtdGoals: publicProcedure
      .input(z.object({ dept: z.string(), year: z.number() }))
      .query(async ({ input }) => {
        const rows = await getTargetsByDeptYear(input.dept, input.year);
        const ytdRows = rows.filter((r) => r.itemMid === "__total__");
        const result: Record<number, number> = {};
        for (let m = 1; m <= 12; m++) {
          const row = ytdRows.find((r) => r.month === m);
          result[m] = row ? parseFloat(String(row.targetAmt ?? "0")) : 0;
        }
        return result;
      }),
    // YTD 월별 목표 일괄 저장 (1~12월)
    upsertYtdGoals: publicProcedure
      .input(
        z.object({
          dept: z.string(),
          year: z.number(),
          goals: z.record(z.string(), z.number()),
        })
      )
      .mutation(async ({ input }) => {
        for (let m = 1; m <= 12; m++) {
          const amt = input.goals[String(m)] ?? 0;
          await insertSalesTarget({
            dept: input.dept,
            itemMid: "__total__",
            year: input.year,
            month: m,
            targetAmt: amt,
          });
        }
        return { success: true };
      }),
    getByDeptYear: publicProcedure
      .input(z.object({ dept: z.string(), year: z.number() }))
      .query(async ({ input }) => {
        const targets = await getTargetsByDeptYear(input.dept, input.year);
        return targets.map((t) => ({
          ...t,
          targetAmt: parseFloat(String(t.targetAmt ?? "0")),
        }));
      }),

    getMonthSummary: publicProcedure
      .input(z.object({ dept: z.string(), year: z.number(), month: z.number() }))
      .query(async ({ input }) => {
        const { dept, year, month } = input;
        const targets = await getTargetsByDeptYear(dept, year);
        const monthTargets = targets.filter((t) => t.month === month);
        const totalTarget = monthTargets.reduce(
          (s, t) => s + parseFloat(String(t.targetAmt ?? "0")),
          0
        );

        const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
        // 해당 월의 실제 마지막 날 (6월=30, 2월=28 등). '-31' 고정 시 무효 날짜로 집계가 0이 되는 버그 방지
        const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
        const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
        const actual = await aggregateSales({ startDate, endDate, dept });

        // 연간 누적
        const ytdStart = `${year}-01-01`;
        const ytd = await aggregateSales({ startDate: ytdStart, endDate, dept });
        const allTargets = targets.reduce(
          (s, t) => s + parseFloat(String(t.targetAmt ?? "0")),
          0
        );
        const cumTargets = targets
          .filter((t) => t.month <= month)
          .reduce((s, t) => s + parseFloat(String(t.targetAmt ?? "0")), 0);

        return {
          monthTarget: totalTarget,
          monthActual: actual.totalSales,
          monthAchievePct: totalTarget > 0 ? (actual.totalSales / totalTarget) * 100 : 0,
          ytdActual: ytd.totalSales,
          ytdTarget: cumTargets,
          ytdAchievePct: cumTargets > 0 ? (ytd.totalSales / cumTargets) * 100 : 0,
          annualTarget: allTargets,
          annualActual: ytd.totalSales,
          annualAchievePct: allTargets > 0 ? (ytd.totalSales / allTargets) * 100 : 0,
          byItemMid: monthTargets.map((t) => ({
            itemMid: t.itemMid,
            target: parseFloat(String(t.targetAmt ?? "0")),
          })),
        };
      }),
  }),

  // ─── 월간 종합 리포트 (월전체 분석 페이지) ──────────────────────────────────────
  report: router({
    // 월간 + 연누계 KPI(매출/매출이익/공헌이익) + 월별 막대(전년/올해/목표) 종합
    getMonthly: publicProcedure
      .input(z.object({ dept: z.string(), year: z.number(), month: z.number(), team: z.string().optional() }))
      .query(async ({ input }) => {
        const { dept, year, month, team } = input;
        const aggFn = async (p: Parameters<typeof aggregateSalesFromMart>[0]) =>
          aggregateSalesFromMart(p).catch(() => aggregateSales(p));
        const contribFn = (p: Parameters<typeof getContribMarginForPeriod>[0]) =>
          getContribMarginForPeriod(p);
        const pad = (n: number) => String(n).padStart(2, "0");
        const rangeOf = (y: number, m: number) => {
          const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
          return { start: `${y}-${pad(m)}-01`, end: `${y}-${pad(m)}-${pad(last)}` };
        };
        const rate = (a: number, b: number) => (b > 0 ? (a / b) * 100 : 0);

        // 팀 필터: 실적은 팀 담당 품명(itemNames)으로, 목표는 팀 월목표로
        const filt = await teamScopeFilt(year, team);
        const teamMonthly = team ? await getMonthlyTargetSums(year, { team }) : null;

        // 진행 중인 달 보정: 데이터 최종일까지만 있으면 전년·전월도 같은 '일자'까지만 비교
        // (예: 7월 데이터가 7/6까지면 작년 7/1~7/6, 전월 6/1~6/6 으로 비교 — YoY/MoM 왜곡 방지)
        const salesRange = await getSalesRange().catch(() => ({ min: null, max: null }));
        const maxData = salesRange.max ? String(salesRange.max).slice(0, 10) : null;
        const curFull = rangeOf(year, month);
        const inProgress = !!maxData && maxData >= curFull.start && maxData < curFull.end;
        const cutDay = inProgress && maxData ? new Date(maxData).getUTCDate() : null;
        const endWithCut = (y: number, m: number) => {
          const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
          const d = cutDay ? Math.min(cutDay, last) : last;
          return `${y}-${pad(m)}-${pad(d)}`;
        };

        // 해당 월 / 전년 동월 / 전월 기간
        const cur = { start: curFull.start, end: inProgress && maxData ? maxData : curFull.end };
        const py = { start: `${year - 1}-${pad(month)}-01`, end: endWithCut(year - 1, month) };
        const pmYear = month === 1 ? year - 1 : year;
        const pmMonth = month === 1 ? 12 : month - 1;
        const pm = { start: `${pmYear}-${pad(pmMonth)}-01`, end: endWithCut(pmYear, pmMonth) };

        // 목표: 팀 선택 시 팀 월목표, 아니면 dept+year __total__ 행
        const targetRows = await getTargetsByDeptYear(dept, year);
        const totalRows = targetRows.filter((r) => r.itemMid === "__total__");
        const goal = (m: number) => {
          if (teamMonthly) return teamMonthly[m - 1] ?? 0;
          const r = totalRows.find((x) => x.month === m);
          return r ? parseFloat(String(r.targetAmt ?? "0")) : 0;
        };

        // 집계 (병렬)
        const [curAgg, pyAgg, pmAgg, curC, pyC, pmC] = await Promise.all([
          aggFn({ startDate: cur.start, endDate: cur.end, dept, ...filt }),
          aggFn({ startDate: py.start, endDate: py.end, dept, ...filt }),
          aggFn({ startDate: pm.start, endDate: pm.end, dept, ...filt }),
          contribFn({ startDate: cur.start, endDate: cur.end, dept, ...filt }),
          contribFn({ startDate: py.start, endDate: py.end, dept, ...filt }),
          contribFn({ startDate: pm.start, endDate: pm.end, dept, ...filt }),
        ]);

        // 연누계 (1/1 ~ 해당 월말, 전년 동기 — 진행 중이면 같은 일자까지)
        const ytdEnd = cur.end;
        const ytdPyEnd = endWithCut(year - 1, month);
        const [ytdCur, ytdPy, ytdCurC, ytdPyC] = await Promise.all([
          aggFn({ startDate: `${year}-01-01`, endDate: ytdEnd, dept, ...filt }),
          aggFn({ startDate: `${year - 1}-01-01`, endDate: ytdPyEnd, dept, ...filt }),
          contribFn({ startDate: `${year}-01-01`, endDate: ytdEnd, dept, ...filt }),
          contribFn({ startDate: `${year - 1}-01-01`, endDate: ytdPyEnd, dept, ...filt }),
        ]);

        const monthTarget = goal(month);
        let ytdTarget = 0;
        for (let m = 1; m <= month; m++) ytdTarget += goal(m);

        // 월별 막대 (전년/올해 매출 + 목표)
        const [trendCur, trendPrev] = await Promise.all([
          getTrendDataFromMart({ startDate: `${year}-01-01`, endDate: `${year}-12-31`, dept, groupBy: "yearMonth", ...filt }).catch(() =>
            getTrendData({ startDate: `${year}-01-01`, endDate: `${year}-12-31`, dept, groupBy: "yearMonth", ...filt })
          ),
          getTrendDataFromMart({ startDate: `${year - 1}-01-01`, endDate: `${year - 1}-12-31`, dept, groupBy: "yearMonth", ...filt }).catch(() =>
            getTrendData({ startDate: `${year - 1}-01-01`, endDate: `${year - 1}-12-31`, dept, groupBy: "yearMonth", ...filt })
          ),
        ]);
        const monthOf = (minDate: string) => new Date(minDate).getUTCMonth() + 1;
        const curByMonth: Record<number, number> = {};
        const prevByMonth: Record<number, number> = {};
        trendCur.forEach((r) => { if (r.minDate) curByMonth[monthOf(r.minDate)] = r.totalSales; });
        trendPrev.forEach((r) => { if (r.minDate) prevByMonth[monthOf(r.minDate)] = r.totalSales; });
        const bars = Array.from({ length: 12 }, (_, i) => {
          const m = i + 1;
          return { month: m, curr: curByMonth[m] ?? 0, prev: prevByMonth[m] ?? 0, target: goal(m) };
        });

        return {
          year,
          prevYear: year - 1,
          month,
          maxDataDate: maxData, // 데이터가 있는 마지막 날짜 (예: '2026-07-06'), 없으면 null
          inProgress,           // 선택한 달이 진행 중(부분 데이터)인지
          monthKpi: {
            sales: {
              curr: curAgg.totalSales,
              target: monthTarget,
              achievePct: rate(curAgg.totalSales, monthTarget),
              prevYear: pyAgg.totalSales,
              yoyPct: calcPctSafe(curAgg.totalSales, pyAgg.totalSales),
              prevMonth: pmAgg.totalSales,
              momPct: calcPctSafe(curAgg.totalSales, pmAgg.totalSales),
            },
            profit: {
              curr: curAgg.totalProfit,
              rate: rate(curAgg.totalProfit, curAgg.totalSales),
              prevYearRate: rate(pyAgg.totalProfit, pyAgg.totalSales),
              prevYear: pyAgg.totalProfit,
              prevMonth: pmAgg.totalProfit,
              yoyPct: calcPctSafe(curAgg.totalProfit, pyAgg.totalProfit),
              momPct: calcPctSafe(curAgg.totalProfit, pmAgg.totalProfit),
            },
            contrib: {
              curr: curC,
              rate: rate(curC, curAgg.totalSales),
              prevYearRate: rate(pyC, pyAgg.totalSales),
              prevYear: pyC,
              prevMonth: pmC,
              yoyPct: calcPctSafe(curC, pyC),
              momPct: calcPctSafe(curC, pmC),
            },
          },
          ytdKpi: {
            sales: {
              curr: ytdCur.totalSales,
              target: ytdTarget,
              achievePct: rate(ytdCur.totalSales, ytdTarget),
              prevYear: ytdPy.totalSales,
              yoyPct: calcPctSafe(ytdCur.totalSales, ytdPy.totalSales),
            },
            profit: {
              curr: ytdCur.totalProfit,
              rate: rate(ytdCur.totalProfit, ytdCur.totalSales),
              prevYearRate: rate(ytdPy.totalProfit, ytdPy.totalSales),
              prevYear: ytdPy.totalProfit,
              yoyPct: calcPctSafe(ytdCur.totalProfit, ytdPy.totalProfit),
            },
            contrib: {
              curr: ytdCurC,
              rate: rate(ytdCurC, ytdCur.totalSales),
              prevYearRate: rate(ytdPyC, ytdPy.totalSales),
              prevYear: ytdPyC,
              yoyPct: calcPctSafe(ytdCurC, ytdPyC),
            },
          },
          bars,
        };
      }),

    // 수동 인사이트 (채널/카테고리 × 성과/부진요인/해결방안), 월+팀별 저장
    getInsight: publicProcedure
      .input(z.object({ year: z.number(), month: z.number(), team: z.string().optional() }))
      .query(async ({ input }) => {
        const key = `report_insight_${input.year}_${input.month}${input.team ? `_${input.team}` : ""}`;
        const raw = await getAppSetting(key);
        if (!raw) return null;
        try { return JSON.parse(raw); } catch { return null; }
      }),

    saveInsight: publicProcedure
      .input(
        z.object({
          year: z.number(),
          month: z.number(),
          team: z.string().optional(),
          data: z.object({
            channel: z.array(z.object({ label: z.string(), seonggwa: z.string(), buojin: z.string(), haegyeol: z.string() })),
            category: z.array(z.object({ label: z.string(), seonggwa: z.string(), buojin: z.string(), haegyeol: z.string() })),
          }),
        })
      )
      .mutation(async ({ input }) => {
        const key = `report_insight_${input.year}_${input.month}${input.team ? `_${input.team}` : ""}`;
        await setAppSetting(key, JSON.stringify(input.data));
        return { success: true };
      }),

    // ── AI 분석: 월전체요약 / 채널별 / 카테고리별 (월+팀+종류별 저장, 수동수정 가능) ──
    getAiAnalysis: publicProcedure
      .input(z.object({ year: z.number(), month: z.number(), team: z.string().optional(), kind: z.enum(["summary", "channel", "category"]) }))
      .query(async ({ input }) => {
        const key = `report_ai_${input.kind}_${input.year}_${input.month}${input.team ? `_${input.team}` : ""}`;
        const raw = await getAppSetting(key);
        if (!raw) return null;
        try { return JSON.parse(raw) as { text: string; generatedAt: string; editedAt?: string }; } catch { return null; }
      }),

    // 수동 수정 저장
    saveAiAnalysis: publicProcedure
      .input(z.object({ year: z.number(), month: z.number(), team: z.string().optional(), kind: z.enum(["summary", "channel", "category"]), text: z.string() }))
      .mutation(async ({ input }) => {
        const key = `report_ai_${input.kind}_${input.year}_${input.month}${input.team ? `_${input.team}` : ""}`;
        const raw = await getAppSetting(key);
        let generatedAt = new Date().toISOString();
        try { if (raw) generatedAt = JSON.parse(raw).generatedAt ?? generatedAt; } catch {}
        await setAppSetting(key, JSON.stringify({ text: input.text, generatedAt, editedAt: new Date().toISOString() }));
        return { success: true };
      }),

    generateAiAnalysis: publicProcedure
      .input(z.object({ dept: z.string(), year: z.number(), month: z.number(), team: z.string().optional(), kind: z.enum(["summary", "channel", "category"]) }))
      .mutation(async ({ input }) => {
        const { dept, year, month, team, kind } = input;
        const pad = (n: number) => String(n).padStart(2, "0");
        const rangeOf = (y: number, m: number) => {
          const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
          return { start: `${y}-${pad(m)}-01`, end: `${y}-${pad(m)}-${pad(last)}` };
        };
        const eok = (v: number) => {
          const e = Math.floor(Math.abs(v) / 1e8);
          const man = Math.floor((Math.abs(v) % 1e8) / 1e4);
          return (v < 0 ? "-" : "") + (e ? `${e}억 ` : "") + (man ? `${man.toLocaleString()}만` : (e ? "" : "0"));
        };
        const fmtPctStr = (v: number | null) => (v == null ? "비교불가" : `${v >= 0 ? "+" : ""}${v.toFixed(0)}%`);
        const perfFn = (p: any) => getItemPerformanceFromMart(p).catch(() => getItemPerformance(p));

        const cur = rangeOf(year, month);
        const py = rangeOf(year - 1, month);
        const pmY = month === 1 ? year - 1 : year;
        const pmM = month === 1 ? 12 : month - 1;
        const pm = rangeOf(pmY, pmM);
        const filt = await teamScopeFilt(year, team);
        const scopeLabel = team ? team : "국내사업팀 전체";

        const monthAgg = await aggregateSalesFromMart({ startDate: cur.start, endDate: cur.end, dept, ...filt }).catch(() => aggregateSales({ startDate: cur.start, endDate: cur.end, dept, ...filt }));
        if (monthAgg.totalSales === 0) return { text: "해당 월/팀에 매출 데이터가 없습니다.", generatedAt: new Date().toISOString() };
        const total = monthAgg.totalSales;

        // 그룹별 상위 매출 라인 (전월/전년 대비 포함)
        const perfLines = async (groupBy: "channel" | "itemMid" | "itemName", limit: number, excludeEtc: boolean) => {
          let curr = await perfFn({ startDate: cur.start, endDate: cur.end, dept, groupBy, limit: limit + (excludeEtc ? 6 : 0), ...filt });
          if (excludeEtc) curr = curr.filter((r: any) => !/기타/.test(r.label));
          curr = curr.slice(0, limit);
          const names = curr.map((r: any) => r.label);
          const fk = groupBy === "channel" ? "channels" : groupBy === "itemMid" ? "itemMids" : "itemNames";
          const [prevY, prevM] = await Promise.all([
            perfFn({ startDate: py.start, endDate: py.end, dept, groupBy, [fk]: names, ...filt }),
            perfFn({ startDate: pm.start, endDate: pm.end, dept, groupBy, [fk]: names, ...filt }),
          ]);
          const pyMap = new Map(prevY.map((r: any) => [r.label, r.totalSales]));
          const pmMap = new Map(prevM.map((r: any) => [r.label, r.totalSales]));
          return curr.map((r: any, i: number) => {
            const yoy = calcPctSafe(r.totalSales, (pyMap.get(r.label) as number) ?? 0);
            const mom = calcPctSafe(r.totalSales, (pmMap.get(r.label) as number) ?? 0);
            const share = total > 0 ? ((r.totalSales / total) * 100).toFixed(0) : "0";
            const nm = groupBy === "itemMid" ? String(r.label).replace(/_[A-Z]{2}$/, "") : r.label;
            return `${i + 1}. ${nm} — 매출 ${eok(r.totalSales)} (비중 ${share}%), 전월비 ${fmtPctStr(mom)}, 전년비 ${fmtPctStr(yoy)}`;
          });
        };

        let system = "";
        let user = "";
        if (kind === "summary") {
          const [pyAgg, curC, goalArr] = await Promise.all([
            aggregateSalesFromMart({ startDate: py.start, endDate: py.end, dept, ...filt }).catch(() => ({ totalSales: 0, totalProfit: 0, totalQty: 0 })),
            getContribMarginForPeriod({ startDate: cur.start, endDate: cur.end, dept, ...filt }),
            getMonthlyTargetSums(year, team ? { team } : {}),
          ]);
          const goal = goalArr[month - 1] ?? 0;
          const marginRate = total > 0 ? (monthAgg.totalProfit / total) * 100 : 0;
          const contribRate = total > 0 ? (curC / total) * 100 : 0;
          const salesYoY = calcPctSafe(total, pyAgg.totalSales);
          const achieve = goal > 0 ? (total / goal) * 100 : null;
          const topCh = (await perfFn({ startDate: cur.start, endDate: cur.end, dept, groupBy: "channel", limit: 3, ...filt })).map((r: any) => `${r.label}(${eok(r.totalSales)})`);
          const topCatRaw = await perfFn({ startDate: cur.start, endDate: cur.end, dept, groupBy: "itemMid", limit: 8, ...filt });
          const topCat = topCatRaw.filter((r: any) => !/기타/.test(r.label)).slice(0, 3).map((r: any) => `${String(r.label).replace(/_[A-Z]{2}$/, "")}(${eok(r.totalSales)})`);
          system = `당신은 꿈비(영유아 브랜드) 국내사업팀 매출 분석가입니다. 주어진 이번 달 실적 데이터만 근거로 팀장이 30초에 읽을 '월 전체 요약'을 한국어로 작성하세요. 규칙: 불릿(-) 3개 이내 + 마지막 줄 "👉 한줄평:". 숫자 근거 필수, 데이터에 없는 내용 금지, 간결하게. 마크다운.`;
          user = `대상: ${year}년 ${month}월 · ${scopeLabel}
매출액: ${eok(total)}${goal > 0 ? ` (목표 ${eok(goal)}, 달성 ${achieve!.toFixed(0)}%)` : ""}, 전년비 ${fmtPctStr(salesYoY)}
매출이익: ${eok(monthAgg.totalProfit)} (이익률 ${marginRate.toFixed(1)}%)
공헌이익: ${eok(curC)} (공헌이익률 ${contribRate.toFixed(1)}%)
상위 채널: ${topCh.join(", ")}
상위 카테고리: ${topCat.join(", ")}`;
        } else if (kind === "channel") {
          const lines = await perfLines("channel", 8, false);
          system = `당신은 꿈비 국내사업팀 매출 분석가입니다. 주어진 '채널별 매출' 데이터만 근거로 채널 성과를 간결히 분석하세요. 규칙: 불릿(-) 4개 이내, 각 한 줄, 숫자 근거 필수, 없는 내용 금지. 잘된 채널·부진 채널·특이점 위주. 마지막 줄 "👉 권장 액션:" 1개. 마크다운.`;
          user = `대상: ${year}년 ${month}월 · ${scopeLabel} (총매출 ${eok(total)})\n\n채널별 매출:\n${lines.join("\n")}`;
        } else {
          const lines = await perfLines("itemMid", 8, true);
          system = `당신은 꿈비 국내사업팀 매출 분석가입니다. 주어진 '카테고리(중분류)별 매출' 데이터만 근거로 간결히 분석하세요. 규칙: 불릿(-) 4개 이내, 각 한 줄, 숫자 근거 필수, 없는 내용 금지. 성장·부진 카테고리 위주. 마지막 줄 "👉 권장 액션:" 1개. 마크다운.`;
          user = `대상: ${year}년 ${month}월 · ${scopeLabel} (총매출 ${eok(total)})\n\n카테고리(중분류)별 매출:\n${lines.join("\n")}`;
        }

        const response = await invokeLLM({ messages: [{ role: "system", content: system }, { role: "user", content: user }] });
        const rawContent = response?.choices?.[0]?.message?.content;
        const text = typeof rawContent === "string" ? rawContent : "분석 생성에 실패했습니다.";
        const generatedAt = new Date().toISOString();
        const key = `report_ai_${kind}_${year}_${month}${team ? `_${team}` : ""}`;
        await setAppSetting(key, JSON.stringify({ text, generatedAt }));
        return { text, generatedAt };
      }),
  }),

  // ─── SKU별 목표 (담당/팀 매핑) ──────────────────────────────────────────────────
  productTargets: router({
    getYears: publicProcedure.query(() => getProductTargetYears()),
    // 담당자 목록 + 팀 + 담당 품명수 (매출/수익 분석 담당 필터용)
    getManagers: publicProcedure
      .input(z.object({ year: z.number() }))
      .query(async ({ input }) => {
        // 1순위: '담당자 지정' 매핑(전체 담당자, 소분류 기준). 없으면 product_targets 폴백.
        const mapMgrs = await getMapManagers().catch(() => []);
        if (mapMgrs.length) {
          return mapMgrs.sort((a, b) => a.team.localeCompare(b.team) || b.count - a.count);
        }
        const mm = await getManagerMap(input.year);
        return mm
          .map((m) => ({ manager: m.manager, team: m.team, count: m.itemNames.length }))
          .sort((a, b) => a.team.localeCompare(b.team) || b.count - a.count);
      }),
  }),

  // ─── 담당자 미지정 SKU 관리 ─────────────────────────────────────────────────────
  managerAssign: router({
    // 담당자 미지정 SKU 목록 (마트 manager IS NULL, 매출 큰 순). 기간 옵션.
    getUnassigned: publicProcedure
      .input(z.object({ startDate: z.string().optional(), endDate: z.string().optional() }).optional())
      .query(async ({ input }) => getUnassignedSkus(input ?? {})),
    // 미지정 요약 (건수 + 매출)
    getUnassignedSummary: publicProcedure
      .input(z.object({ startDate: z.string().optional(), endDate: z.string().optional() }).optional())
      .query(async ({ input }) => getUnassignedSummary(input ?? {})),
    // 지정 가능한 담당자/팀 목록
    getManagers: publicProcedure.query(() => getAllManagers()),
    // 이 SKU(품번)만 담당자 지정 (manual override)
    assignSku: publicProcedure
      .input(z.object({
        itemCode: z.string(), manager: z.string(), team: z.string(),
        itemName: z.string().optional(), itemSmall: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        await assignSkuManager(input);
        await applyOverrideToMart(input.itemCode, input.manager, input.team);
        queryCache.invalidateAll();
        return { success: true };
      }),
    // 이 소분류 전체를 한 담당자로 지정 (소분류 매핑 등록 + 미지정 행 채움)
    assignSmall: publicProcedure
      .input(z.object({ itemSmall: z.string(), manager: z.string(), team: z.string() }))
      .mutation(async ({ input }) => {
        await assignSmallManager(input.itemSmall, input.manager, input.team);
        queryCache.invalidateAll();
        return { success: true };
      }),
  }),

  promotions: router({
    getByMonth: publicProcedure
      .input(z.object({ year: z.number(), month: z.number() }))
      .query(async ({ input }) => {
        const rows = await getPromotionsByMonth(input.year, input.month);
        return rows.map((r) => ({
          ...r,
          targetAmt: parseFloat(String(r.targetAmt ?? "0")),
          achievedAmt: parseFloat(String(r.achievedAmt ?? "0")),
          startDate: r.startDate ? String(r.startDate) : null,
          endDate: r.endDate ? String(r.endDate) : null,
        }));
      }),

    getAll: publicProcedure
      .input(z.object({ dept: z.string().optional(), year: z.number().optional() }).optional())
      .query(async ({ input }) => getAllPromotions(input ?? {})),

    insert: publicProcedure
      .input(
        z.object({
          dept: z.string().optional(),
          channel: z.string().optional(),
          eventName: z.string().optional(),
          startDate: z.string().optional(),
          endDate: z.string().optional(),
          targetAmt: z.number().optional(),
          achievedAmt: z.number().optional(),
          note: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        await insertPromotion(input);
        return { success: true };
      }),

    update: publicProcedure
      .input(
        z.object({
          id: z.number(),
          eventName: z.string().optional(),
          startDate: z.string().optional(),
          endDate: z.string().optional(),
          targetAmt: z.number().optional(),
          achievedAmt: z.number().optional(),
          note: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await updatePromotion(id, data);
        return { success: true };
      }),

    delete: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deletePromotion(input.id);
        return { success: true };
      }),

    // ─── 노션 동기화 API ─────────────────────────────────────────────────────
    // 백그라운드 job 맵 (메모리 내 상태 관리)
    syncFromNotion: publicProcedure
      .mutation(async () => {
        // 백그라운드에서 동기화 실행 (즉시 반환)
        setImmediate(async () => {
          try {
            await syncNotionToDb();
          } catch (e) {
            console.error("[Notion Sync] Background sync error:", e);
          }
        });
        return { total: 0, upserted: 0, syncedAt: new Date().toISOString(), errors: [], pending: true };
      }),

    getLastSyncedAt: publicProcedure
      .query(async () => {
        const ts = await getNotionLastSyncedAt();
        return { lastSyncedAt: ts };
      }),
  }),

  // ─── Simulator ────────────────────────────────────────────────────────────────
  simulator: router({
    getMonthData: publicProcedure
      .input(
        z.object({
          dept: z.string(),
          year: z.number(),
          month: z.number(),
          todayStr: z.string(),
        })
      )
      .query(async ({ input }) => {
        return getSimulatorData(input);
      }),

    forecast: publicProcedure
      .input(
        z.object({
          elapsedSales: z.number(),
          elapsedDays: z.number(),
          totalDaysInMonth: z.number(),
          targetAmt: z.number(),
          growthRate: z.number().default(0),   // % 추가 성장률 (0 = 현재 추세 유지)
          marginRate: z.number().default(30),  // 마진율 %
        })
      )
      .query(async ({ input }) => {
        const { elapsedSales, elapsedDays, totalDaysInMonth, targetAmt, growthRate, marginRate } = input;
        const remainingDays = Math.max(0, totalDaysInMonth - elapsedDays);
        const dailyAvg = elapsedDays > 0 ? elapsedSales / elapsedDays : 0;
        const adjustedDailyAvg = dailyAvg * (1 + growthRate / 100);
        const forecastedTotal = elapsedSales + adjustedDailyAvg * remainingDays;
        const forecastedProfit = forecastedTotal * (marginRate / 100);
        const achieveRate = targetAmt > 0 ? (forecastedTotal / targetAmt) * 100 : 0;
        const gap = forecastedTotal - targetAmt;

        return {
          forecastedTotal,
          forecastedProfit,
          achieveRate,
          gap,
          dailyAvg,
          adjustedDailyAvg,
          remainingDays,
        };
      }),
  }),

  // ─── DOC analysis ─────────────────────────────────────────────────────────────
  doc: router({
    analyze: publicProcedure
      .input(
        z.object({
          lyStartDate: z.string(),
          lyEndDate: z.string(),
          forecastDays: z.number(),
          growthRate: z.number().default(1.0),
          dept: z.string().optional(),
        })
      )
      .query(async ({ input }) => {
        const { lyStartDate, lyEndDate, forecastDays, growthRate, dept } = input;

        // 전년 시즌 판매
        const lySales = await getSalesForDOC({ startDate: lyStartDate, endDate: lyEndDate, dept });
        const lySalesMap = new Map(
          lySales.map((r) => [r.itemCode ?? "", Number(r.totalQty ?? 0)])
        );

        // 최근 30일 판매
        const recent30 = await getRecentSales30d(dept);
        const recent30Map = new Map(
          recent30.map((r) => [r.itemCode ?? "", Number(r.totalQty ?? 0)])
        );

        // 재고
        const invMap = await getInventoryMap();

        // 아이템 목록 (전년 시즌 + 재고 합집합)
        const allCodes = new Set([...Array.from(lySalesMap.keys()), ...Array.from(invMap.keys())]);

                // itemCode -> meta 맵 (분류 정보)
        const lySalesMetaMap = new Map(
          lySales.map((r) => [r.itemCode ?? "", { itemName: r.itemName, itemLarge: r.itemLarge, itemMid: r.itemMid, itemSmall: r.itemSmall }])
        );
        const results = Array.from(allCodes)
          .filter((code) => code)
          .map((code) => {
            const lySeasonal = (lySalesMap.get(code) ?? 0) * growthRate;
            const seasonDailyAvg = forecastDays > 0 ? lySeasonal / forecastDays : 0;
            const recent30qty = recent30Map.get(code) ?? 0;
            const recentDailyAvg = recent30qty / 30;
            const currentStock = invMap.get(code) ?? 0;
            const docRecent = recentDailyAvg > 0 ? currentStock / recentDailyAvg : 999;
            const docSeason = seasonDailyAvg > 0 ? currentStock / seasonDailyAvg : 999;
            const status =
              docSeason < forecastDays
                ? "부족"
                : docSeason < forecastDays * 1.5
                  ? "주의"
                  : "양호";
            const meta = lySalesMetaMap.get(code);
            return {
              itemCode: code,
              itemName: meta?.itemName ?? code,
              itemLarge: meta?.itemLarge ?? null,
              itemMid: meta?.itemMid ?? null,
              itemSmall: meta?.itemSmall ?? null,
              currentStock,
              recent30qty,
              recentDailyAvg: Math.round(recentDailyAvg * 10) / 10,
              lySeasonal: Math.round(lySeasonal),
              seasonDailyAvg: Math.round(seasonDailyAvg * 10) / 10,
              docRecent: Math.round(docRecent * 10) / 10,
              docSeason: Math.round(docSeason * 10) / 10,
              status,
            };
          })
          .sort((a, b) => a.docSeason - b.docSeason);

        return results;
      }),
  }),

  // ─── AI assistant ─────────────────────────────────────────────────────────────
  upload: router({
    getHistory: publicProcedure
      .input(z.object({ limit: z.number().optional() }).optional())
      .query(async ({ input }) => getUploadHistory(input?.limit)),
    rebuildMart: publicProcedure
      .mutation(async () => {
        const result = await rebuildMartFromAllRecords(true);
        queryCache.invalidateAll();
        return { built: result.built, filenames: result.filenames };
      }),
  }),

  ai: router({
    analyze: publicProcedure
      .input(
        z.object({
          dept: z.string().optional(),
          startDate: z.string(),
          endDate: z.string(),
          query: z.string(),
          kpiContext: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { dept, startDate, endDate, query } = input;

        // 채널별 TOP 10
        const channelTop = await getItemPerformance({
          startDate,
          endDate,
          dept,
          groupBy: "channel",
          limit: 10,
        });
        // 품목별 TOP 10
        const itemTop = await getItemPerformance({
          startDate,
          endDate,
          dept,
          groupBy: "itemName",
          limit: 10,
        });
        // KPI
        const kpi = await aggregateSales({ startDate, endDate, dept });

        const channelSummary = channelTop
          .map((r) => `${r.label}: ${r.totalSales.toLocaleString()}원`)
          .join(", ");
        const itemSummary = itemTop
          .map((r) => `${r.label}: ${r.totalSales.toLocaleString()}원`)
          .join(", ");

        const prompt = `당신은 꿈비(Ggumbi) 회사의 전문 영업 데이터 분석가입니다.

분석 대상: ${dept} 부서
분석 기간: ${startDate} ~ ${endDate}
총 매출: ${kpi.totalSales.toLocaleString()}원
총 수량: ${kpi.totalQty.toLocaleString()}개
매출이익: ${kpi.totalProfit.toLocaleString()}원

채널별 매출 TOP 10: ${channelSummary}
품목별 매출 TOP 10: ${itemSummary}

분석 요청: ${query}

위 데이터를 바탕으로 한국어로 전문적인 분석 리포트를 작성해주세요. 
구체적인 수치를 인용하고, 실행 가능한 인사이트와 개선 방안을 제시해주세요.`;

        const response = await invokeLLM({
          messages: [
            { role: "system", content: "당신은 영업 데이터 분석 전문가입니다. 한국어로 답변하세요." },
            { role: "user", content: prompt },
          ],
        });

        const rawContent = response?.choices?.[0]?.message?.content;
        const content = typeof rawContent === "string" ? rawContent : (rawContent ? JSON.stringify(rawContent) : "분석 결과를 생성할 수 없습니다.");
        return { content };
      }),
  }),

  // ─── Dashboard password gate ────────────────────────────────────────────────
  gate: router({
    verify: publicProcedure
      .input(z.object({ password: z.string() }))
      .mutation(async ({ input }) => {
        const bcrypt = await import("bcryptjs");
        const stored = await getAppSetting("dashboard_password");
        if (!stored) throw new Error("비밀번호 설정이 없습니다.");
        const ok = bcrypt.compareSync(input.password, stored);
        if (!ok) throw new Error("비밀번호가 올바르지 않습니다.");
        return { success: true };
      }),
  }),

  // ─── 회원 계정 (아이디/비밀번호 + 관리자 승인) ─────────────────────────────────
  auth: router({
    // 회원가입: 누구나 가능, 승인 대기 상태로 생성
    signup: publicProcedure
      .input(z.object({ id: z.string().trim().min(2, "아이디는 2자 이상").max(64), password: z.string().min(4, "비밀번호는 4자 이상") }))
      .mutation(async ({ input }) => {
        const exists = await getAccount(input.id);
        if (exists) throw new Error("이미 존재하는 아이디입니다.");
        const bcrypt = await import("bcryptjs");
        await createAccount(input.id, bcrypt.hashSync(input.password, 10));
        return { success: true };
      }),
    // 로그인: 성공 시 역할/승인여부 반환 (승인 안 됐으면 approved=false)
    login: publicProcedure
      .input(z.object({ id: z.string().trim(), password: z.string() }))
      .mutation(async ({ input }) => {
        const acc = await getAccount(input.id);
        if (!acc) throw new Error("아이디 또는 비밀번호가 올바르지 않습니다.");
        const bcrypt = await import("bcryptjs");
        if (!bcrypt.compareSync(input.password, acc.passwordHash)) {
          throw new Error("아이디 또는 비밀번호가 올바르지 않습니다.");
        }
        return { id: acc.id, role: acc.role, approved: !!acc.approved };
      }),
    // 관리자: 계정 목록/승인/해제/삭제
    listAccounts: publicProcedure.query(() => listAccounts()),
    approve: publicProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input }) => { await setAccountApproved(input.id, true); return { success: true }; }),
    revoke: publicProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input }) => { await setAccountApproved(input.id, false); return { success: true }; }),
    remove: publicProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input }) => { await deleteAccount(input.id); return { success: true }; }),
  }),

  // ─── Team(사업팀) ↔ 중분류 매핑 ────────────────────────────────────────────────
  // appSettings 에 JSON 저장: { "매트사업팀": ["중분류A", ...], "육아용품사업팀": [...] }
  team: router({
    getMap: publicProcedure.query(async () => {
      const raw = await getAppSetting("team_item_mids");
      if (!raw) return {} as Record<string, string[]>;
      try {
        const parsed = JSON.parse(raw);
        return (parsed && typeof parsed === "object" ? parsed : {}) as Record<string, string[]>;
      } catch {
        return {} as Record<string, string[]>;
      }
    }),
    setMap: publicProcedure
      .input(z.object({ map: z.record(z.string(), z.array(z.string())) }))
      .mutation(async ({ input }) => {
        await setAppSetting("team_item_mids", JSON.stringify(input.map));
        return { success: true };
      }),
  }),

  // ─── Admin: data management ─────────────────────────────────────────────────
  admin: router({
    // 비밀번호 변경
    changePassword: publicProcedure
      .input(z.object({ currentPassword: z.string(), newPassword: z.string().min(4) }))
      .mutation(async ({ input }) => {
        const bcrypt = await import("bcryptjs");
        const stored = await getAppSetting("dashboard_password");
        if (!stored) throw new Error("비밀번호 설정이 없습니다.");
        const ok = bcrypt.compareSync(input.currentPassword, stored);
        if (!ok) throw new Error("현재 비밀번호가 올바르지 않습니다.");
        const newHash = bcrypt.hashSync(input.newPassword, 10);
        await setAppSetting("dashboard_password", newHash);
        return { success: true };
      }),

    // 매출 데이터 조회 (페이지네이션)
    getSalesRecords: publicProcedure
      .input(
        z.object({
          startDate: z.string().optional(),
          endDate: z.string().optional(),
          dept: z.string().optional(),
          page: z.number().default(1),
          pageSize: z.number().default(20),
        })
      )
      .query(async ({ input }) => {
        return getSalesRecordsPaged(input);
      }),

    // 매출 레코드 단건 삭제
    deleteSalesRecord: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteSalesRecord(input.id);
        return { success: true };
      }),

    // 기간별 매출 데이터 일괄 삭제 (재업로드 전 덮어쓰기용)
    deleteSalesByRange: publicProcedure
      .input(
        z.object({
          startDate: z.string(),
          endDate: z.string(),
          dept: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const count = await deleteSalesByDateRange(input.startDate, input.endDate, input.dept);
        return { success: true, deletedCount: count };
      }),

    // 목표값 전체 조회
    getAllTargets: publicProcedure.query(async () => {
      return getAllSalesTargets();
    }),

    // 목표값 수정
    updateTarget: publicProcedure
      .input(z.object({ id: z.number(), targetAmt: z.number() }))
      .mutation(async ({ input }) => {
        await updateSalesTarget(input.id, input.targetAmt);
        return { success: true };
      }),

    // 목표값 삭제
    deleteTarget: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteSalesTarget(input.id);
        return { success: true };
      }),

    // 목표값 신규 추가
    insertTarget: publicProcedure
      .input(
        z.object({
          dept: z.string(),
          itemMid: z.string(),
          year: z.number(),
          month: z.number(),
          targetAmt: z.number(),
        })
      )
      .mutation(async ({ input }) => {
        await insertSalesTarget(input);
        return { success: true };
      }),

    // BOM 원가 전체 조회
    getAllBomCosts: publicProcedure.query(async () => {
      return getAllBomCostsList();
    }),

    // BOM 원가 수정
    updateBomCost: publicProcedure
      .input(z.object({ id: z.number(), costPerUnit: z.number() }))
      .mutation(async ({ input }) => {
        await updateBomCost(input.id, input.costPerUnit);
        return { success: true };
      }),

    // BOM 원가 삭제
    deleteBomCost: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteBomCost(input.id);
        return { success: true };
      }),

    // 품목 매핑 전체 조회
    getAllItemMappings: publicProcedure.query(async () => {
      return getAllItemMappings();
    }),

    // 품목 매핑 Upsert (신규 추가 또는 수정)
    upsertItemMapping: publicProcedure
      .input(
        z.object({
          itemCode: z.string().min(1),
          itemName: z.string().optional(),
          itemLarge: z.string().optional(),
          itemMid: z.string().optional(),
          itemSmall: z.string().optional(),
          dept: z.string().optional(),
          note: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        await upsertItemMapping(input);
        return { success: true };
      }),

    // 품목 매핑 삭제
    deleteItemMapping: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteItemMapping(input.id);
        return { success: true };
      }),

    // 신상품 전체 조회
    getAllNewProducts: publicProcedure.query(async () => {
      return getAllNewProducts();
    }),

    // 신상품 등록
    insertNewProduct: publicProcedure
      .input(
        z.object({
          itemName: z.string().min(1),
          itemCode: z.string().optional(),
          itemLarge: z.string().optional(),
          itemMid: z.string().optional(),
          itemSmall: z.string().optional(),
          launchDate: z.string().optional(),
          note: z.string().optional(),
          addedBy: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        await insertNewProduct({
          itemName: input.itemName,
          itemCode: input.itemCode,
          itemLarge: input.itemLarge,
          itemMid: input.itemMid,
          itemSmall: input.itemSmall,
          launchDate: input.launchDate,
          note: input.note,
          addedBy: input.addedBy,
        });
        return { success: true };
      }),

    // 신상품 수정
    updateNewProduct: publicProcedure
      .input(
        z.object({
          id: z.number(),
          itemName: z.string().min(1).optional(),
          itemCode: z.string().optional(),
          itemLarge: z.string().optional(),
          itemMid: z.string().optional(),
          itemSmall: z.string().optional(),
          launchDate: z.string().optional(),
          note: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { id, itemName, itemCode, itemLarge, itemMid, itemSmall, launchDate, note } = input;
        await updateNewProduct(id, { itemName, itemCode, itemLarge, itemMid, itemSmall, launchDate, note });
        return { success: true };
      }),

    // 신상품 삭제
    deleteNewProduct: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteNewProduct(input.id);
        return { success: true };
      }),
  }),

  // ─── Variable Costs (월별 변동비) ────────────────────────────────────────────
  variableCosts: router({
    getAll: publicProcedure.query(async () => {
      return getAllVariableCosts();
    }),
    getByYear: publicProcedure
      .input(z.object({ year: z.number() }))
      .query(async ({ input }) => {
        return getVariableCostsByYear(input.year);
      }),
    upsert: publicProcedure
      .input(z.object({
        year: z.number().min(2020).max(2099),
        month: z.number().min(1).max(12),
        amount: z.number().min(0),
        forecastPct: z.number().min(0).max(100).nullable().optional(),
        note: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        await upsertVariableCost(input.year, input.month, input.amount, input.forecastPct ?? null, input.note);
        queryCache.invalidateAll();
        return { success: true };
      }),
    delete: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteVariableCost(input.id);
        queryCache.invalidateAll();
        return { success: true };
      }),
  }),

  // ─── New Products (신상품 필터용 공개 API) ────────────────────────────────────
  newProducts: router({
    getItemNames: publicProcedure.query(async () => {
      return getNewProductItemNames();
    }),
    getDistinctSalesItemNames: publicProcedure.query(async () => {
      return getDistinctItemNamesFromSales();
    }),
    getItemMetaByName: publicProcedure
      .input(z.object({ itemName: z.string() }))
      .query(async ({ input }) => {
        return getItemMetaByName(input.itemName);
      }),
  }),
});

// ─── Import helper (needed by sales.getTrend) ──────────────────────────────────
import { getTrendData } from "./db";
export type AppRouter = typeof appRouter;

// ─── Naver Ranking Router ────────────────────────────────────────────────────
export { naverRankingRouter } from "./naverRankingRouter";
