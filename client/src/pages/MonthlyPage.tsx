import { useState, useMemo } from "react";
import { AppLayout } from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { fmtAmt, fmtQty, fmtPct } from "@/lib/format";
import { DeltaBadge } from "@/components/DeltaBadge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { getDefaultFilter } from "@/components/DateRangeFilter";

const MONTHS = ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"];

export default function MonthlyPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const dept = "국내사업팀";
  const deptParam = dept;

  const startDate = format(startOfMonth(new Date(year, month - 1)), "yyyy-MM-dd");
  const endDate = format(endOfMonth(new Date(year, month - 1)), "yyyy-MM-dd");

  const kpiQuery = trpc.kpi.getSummary.useQuery({ startDate, endDate, dept: deptParam });

  // 12개월 추세
  const trendStart = format(startOfMonth(subMonths(new Date(year, month - 1), 11)), "yyyy-MM-dd");
  const trendQuery = trpc.sales.getTrend.useQuery({
    startDate: trendStart,
    endDate,
    dept: deptParam,
    groupBy: "yearMonth",
  });

  const channelQuery = trpc.sales.getItemPerf.useQuery({
    startDate,
    endDate,
    dept: deptParam,
    groupBy: "channel",
    limit: 10,
  });

  const itemQuery = trpc.sales.getItemPerf.useQuery({
    startDate,
    endDate,
    dept: deptParam,
    groupBy: "itemMid",
    limit: 10,
  });

  const years = [now.getFullYear() - 1, now.getFullYear()];

  const kpi = kpiQuery.data as any;

  return (
    <AppLayout
      title="월간 실적 요약"
      subtitle="월피미 · 전월비/전년동월비 분석"
      actions={
        <div className="flex items-center gap-2">
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="h-8 text-xs w-24"><SelectValue /></SelectTrigger>
            <SelectContent>
              {years.map((y) => <SelectItem key={y} value={String(y)}>{y}년</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
            <SelectTrigger className="h-8 text-xs w-20"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MONTHS.map((m, i) => <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      }
    >
      <div className="space-y-5">
        {/* KPI summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "월 매출", value: fmtAmt(kpi?.currSales), yoy: kpi?.yoyPct, mom: kpi?.momPct },
            { label: "판매 수량", value: fmtQty(kpi?.currQty), yoy: kpi?.yoyQtyPct, mom: kpi?.momQtyPct },
            { label: "매출이익", value: fmtAmt(kpi?.currProfit), yoy: null, mom: null },
            { label: "이익률", value: `${kpi?.marginRate?.toFixed(1) ?? "0.0"}%`, yoy: null, mom: null },
          ].map((card, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-4">
              <div className="text-xs text-muted-foreground mb-1">{card.label}</div>
              {kpiQuery.isLoading ? (
                <Skeleton className="h-7 w-24" />
              ) : (
                <>
                  <div className="text-xl font-bold tabular-nums">{card.value}</div>
                  <div className="flex gap-2 mt-1 flex-wrap">
                    {card.yoy != null && <DeltaBadge value={card.yoy} label="YoY" />}
                    {card.mom != null && <DeltaBadge value={card.mom} label="MoM" />}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>

        {/* 12-month trend */}
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-foreground mb-4">12개월 매출 추세</h3>
          {trendQuery.isLoading ? (
            <Skeleton className="h-52 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={(trendQuery.data ?? [])}
                margin={{ top: 5, right: 5, left: 0, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} tickFormatter={(v) => v >= 1_000_000 ? `${(v/1_000_000).toFixed(0)}M` : v >= 1_000 ? `${(v/1_000).toFixed(0)}K` : String(v)} />
                <Tooltip
                  formatter={(v: number) => [fmtAmt(v), "매출"]}
                  contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid var(--border)", background: "var(--popover)" }}
                />
                <Bar dataKey="totalSales" name="매출" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Channel + Item mid tables */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[
            { title: "채널별 실적", query: channelQuery },
            { title: "중분류별 실적", query: itemQuery },
          ].map(({ title, query }) => (
            <div key={title} className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="p-4 border-b border-border">
                <h3 className="text-sm font-semibold text-foreground">{title}</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full data-table">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left px-4 py-2">구분</th>
                      <th className="text-right px-4 py-2">매출</th>
                      <th className="text-right px-4 py-2">전월비</th>
                      <th className="text-right px-4 py-2">전년동월비</th>
                    </tr>
                  </thead>
                  <tbody>
                    {query.isLoading ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <tr key={i} className="border-b border-border/50">
                          {Array.from({ length: 4 }).map((_, j) => (
                            <td key={j} className="px-4 py-2"><Skeleton className="h-4 w-full" /></td>
                          ))}
                        </tr>
                      ))
                    ) : (query.data ?? []).length === 0 ? (
                      <tr>
                        <td colSpan={4} className="text-center py-8 text-muted-foreground text-sm">데이터 없음</td>
                      </tr>
                    ) : (
                      (query.data ?? []).map((row, i) => (
                        <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                          <td className="px-4 py-2 text-sm font-medium">{row.label}</td>
                          <td className="px-4 py-2 text-right text-sm tabular-nums">{fmtAmt(row.totalSales)}</td>
                          <td className="px-4 py-2 text-right"><DeltaBadge value={row.momPct} /></td>
                          <td className="px-4 py-2 text-right"><DeltaBadge value={row.yoyPct} /></td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
