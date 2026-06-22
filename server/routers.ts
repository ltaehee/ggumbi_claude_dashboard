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
} from "./db";
import { calcPctSafe, prevMonthSamePeriod, prevYearSameDate } from "./bizUtils";
import { invokeLLM } from "./_core/llm";
import { syncNotionToDb, getNotionLastSyncedAt } from "./notionSync";
import { withCache, queryCache } from "./cache";
import { naverRankingRouter } from "./naverRankingRouter";

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
        })
      )
      .query(async ({ input }) => {
        const { startDate, endDate, ...filters } = input;
        const refDate = new Date(endDate);
        const refYear = refDate.getFullYear();

        const cacheKey = `kpi:${JSON.stringify(input)}`;
        const cached = queryCache.get<any>(cacheKey);
        if (cached) return cached;

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
          groupBy: z.enum(["weekLabel", "yearMonth", "yearStr"]),
          channels: z.array(z.string()).optional(),
          itemLarges: z.array(z.string()).optional(),
          itemMids: z.array(z.string()).optional(),
          itemSmalls: z.array(z.string()).optional(),
          itemNames: z.array(z.string()).optional(),
        })
      )
      .query(async ({ input }) => {
        return withCache(`trend:${JSON.stringify(input)}`, async () => {
          const rows = await getTrendDataFromMart(input).catch(() => getTrendData(input));
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
        })
      )
      .query(async ({ input }) => {
        return withCache(`itemTrend:${JSON.stringify(input)}`, async () => {
          return getItemTrendData(input);
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
        })
      )
      .query(async ({ input }) => {
        return withCache(`itemPerf:${JSON.stringify(input)}`, async () => {
        const curr = await getItemPerformanceFromMart(input).catch(() => getItemPerformance(input));

        // 전년 동기 비교
        const refDate = new Date(input.endDate);
        const prevYearEnd = prevYearSameDate(refDate);
        const prevYearStart = prevYearSameDate(new Date(input.startDate));
        const perfFn = async (p: Parameters<typeof getItemPerformanceFromMart>[0]) =>
          getItemPerformanceFromMart(p).catch(() => getItemPerformance(p));
        const prev = await perfFn({
          ...input,
          startDate: prevYearStart.toISOString().split("T")[0],
          endDate: prevYearEnd.toISOString().split("T")[0],
        });
        const prevMap = new Map(prev.map((p) => [p.label, p]));

        // 전월 동기간
        const { start: momStart, end: momEnd } = prevMonthSamePeriod(refDate);
        const mom = await perfFn({
          ...input,
          startDate: momStart.toISOString().split("T")[0],
          endDate: momEnd.toISOString().split("T")[0],
        });
        const momMap = new Map(mom.map((p) => [p.label, p]));

        // 변동비율 조회 (forecastPct 우선)
        const vcRows = await getVariableCostRowsForPeriod(input.startDate, input.endDate);
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
        const endDate = `${year}-${String(month).padStart(2, "0")}-31`;
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
