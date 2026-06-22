import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { fmtAmt, fmtQty } from "@/lib/format";
import { DeltaBadge } from "@/components/DeltaBadge";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { useFilters } from "@/contexts/FilterContext";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, TrendingUp, Package, Search } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line,
} from "recharts";
import { cn } from "@/lib/utils";

export default function ChannelDetailPage() {
  const [location, navigate] = useLocation();
  const channelName = decodeURIComponent(location.split("/channel/")[1] ?? "");

  const { filters, setDateFilter } = useFilters();
  const filter = filters.dateFilter;
  const [activeTab, setActiveTab] = useState<"itemLarge" | "itemMid" | "itemSmall" | "itemName">("itemLarge");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"totalSales" | "totalQty">("totalSales");

  const kpiQuery = trpc.kpi.getSummary.useQuery({
    startDate: filter.startDate,
    endDate: filter.endDate,
    channels: channelName ? [channelName] : undefined,
  }, { staleTime: 60_000 });

  const perfQuery = trpc.sales.getItemPerf.useQuery({
    startDate: filter.startDate,
    endDate: filter.endDate,
    groupBy: activeTab as "itemLarge" | "itemMid" | "itemSmall" | "itemName",
    channels: channelName ? [channelName] : undefined,
    limit: 50,
  }, { staleTime: 60_000 });

  const trendQuery = trpc.sales.getTrend.useQuery({
    startDate: (() => {
      const d = new Date(filter.startDate);
      d.setFullYear(d.getFullYear() - 1);
      return d.toISOString().slice(0, 10);
    })(),
    endDate: filter.endDate,
    channels: channelName ? [channelName] : undefined,
    groupBy: "yearMonth",
  }, { staleTime: 60_000 });

  const kpi = kpiQuery.data as any;
  const rawItems = (perfQuery.data ?? []) as any[];
  const items = useMemo(() => {
    let filtered = rawItems;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      filtered = filtered.filter((r: any) => r.label?.toLowerCase().includes(q));
    }
    return [...filtered].sort((a: any, b: any) => (b[sortBy] ?? 0) - (a[sortBy] ?? 0));
  }, [rawItems, searchQuery, sortBy]);
  const trend = (trendQuery.data ?? []) as any[];

  const kpiCards = useMemo(() => [
    { label: "채널 매출", value: fmtAmt(kpi?.currSales), yoy: kpi?.yoyPct, mom: kpi?.momPct },
    { label: "판매 수량", value: fmtQty(kpi?.currQty), yoy: kpi?.yoyQtyPct, mom: kpi?.momQtyPct },
    { label: "매출이익", value: fmtAmt(kpi?.currProfit), yoy: null, mom: null },
    { label: "이익률", value: `${kpi?.marginRate?.toFixed(1) ?? "0.0"}%`, yoy: null, mom: null },
  ], [kpi]);

  const TABS = [
    { key: "itemLarge" as const, label: "대분류" },
    { key: "itemMid" as const, label: "중분류" },
    { key: "itemSmall" as const, label: "소분류" },
    { key: "itemName" as const, label: "품명" },
  ];

  return (
    <AppLayout
      title={channelName || "채널 상세"}
      subtitle={`채널 상세 분석 · ${filter.label}`}
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5 cursor-pointer"
            onClick={() => navigate("/channel")}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            채널별 분석으로
          </Button>
          <DateRangeFilter value={filter} onChange={setDateFilter} />
        </div>
      }
    >
      <div className="space-y-5">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {kpiCards.map((card, i) => (
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

        {/* 추세 차트 */}
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">채널 매출 추세 (12개월)</h3>
          </div>
          {trendQuery.isLoading ? (
            <Skeleton className="h-52 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trend} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
                <YAxis
                  tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(0)}M` : v >= 1_000 ? `${(v / 1_000).toFixed(0)}K` : String(v)}
                />
                <Tooltip
                  formatter={(v: number) => [fmtAmt(v), "매출"]}
                  contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid var(--border)", background: "var(--popover)" }}
                />
                <Line type="monotone" dataKey="totalSales" name="매출" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* 품목 성과 테이블 */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {/* 헤더 */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 border-b border-border">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">품목별 성과</h3>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/* 검색 */}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="품목 검색..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8 pl-8 text-xs w-36"
                />
              </div>
              {/* 정렬 토글 */}
              <div className="flex rounded-md overflow-hidden border border-border">
                <button
                  onClick={() => setSortBy("totalSales")}
                  className={cn(
                    "px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer",
                    sortBy === "totalSales" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"
                  )}
                >
                  매출순
                </button>
                <button
                  onClick={() => setSortBy("totalQty")}
                  className={cn(
                    "px-2.5 py-1 text-xs font-medium border-l border-border transition-colors cursor-pointer",
                    sortBy === "totalQty" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"
                  )}
                >
                  수량순
                </button>
              </div>
              {/* 분류 탭 */}
              <div className="flex gap-1">
                {TABS.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={cn(
                      "px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer",
                      activeTab === tab.key
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 바차트 */}
          {perfQuery.isLoading ? (
            <div className="p-4"><Skeleton className="h-48 w-full" /></div>
          ) : items.length > 0 ? (
            <div className="p-4">
              <ResponsiveContainer width="100%" height={Math.max(160, Math.min(items.length, 10) * 28)}>
                <BarChart data={items.slice(0, 10)} layout="vertical" margin={{ top: 0, right: 50, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(0)}M` : v >= 1_000 ? `${(v / 1_000).toFixed(0)}K` : String(v)}
                  />
                  <YAxis type="category" dataKey="label" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={120} />
                  <Tooltip
                    formatter={(v: number) => [sortBy === "totalSales" ? fmtAmt(v) : fmtQty(v), sortBy === "totalSales" ? "매출" : "수량"]}
                    contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid var(--border)", background: "var(--popover)" }}
                  />
                  <Bar dataKey={sortBy} name={sortBy === "totalSales" ? "매출" : "수량"} fill="#6366f1" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : null}

          {/* 상세 테이블 */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b-2 border-border bg-muted/50">
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground uppercase tracking-wide text-[11px]">품목</th>
                  <th className="text-right px-4 py-3 font-semibold text-muted-foreground uppercase tracking-wide text-[11px]">매출</th>
                  <th className="text-right px-4 py-3 font-semibold text-muted-foreground uppercase tracking-wide text-[11px]">비중</th>
                  <th className="text-right px-4 py-3 font-semibold text-muted-foreground uppercase tracking-wide text-[11px]">수량</th>
                  <th className="text-right px-4 py-3 font-semibold text-muted-foreground uppercase tracking-wide text-[11px]">이익률</th>
                  <th className="text-right px-4 py-3 font-semibold text-muted-foreground uppercase tracking-wide text-[11px]">YoY</th>
                  <th className="text-right px-4 py-3 font-semibold text-muted-foreground uppercase tracking-wide text-[11px]">MoM</th>
                </tr>
              </thead>
              <tbody>
                {perfQuery.isLoading
                  ? Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i} className="border-b border-border/50">
                        {Array.from({ length: 7 }).map((_, j) => (
                          <td key={j} className="px-4 py-2.5"><Skeleton className="h-4 w-full" /></td>
                        ))}
                      </tr>
                    ))
                  : items.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="text-center py-12 text-muted-foreground text-sm">
                          {searchQuery ? `"${searchQuery}" 검색 결과가 없습니다.` : "데이터가 없습니다."}
                        </td>
                      </tr>
                    ) : (() => {
                      const total = rawItems.reduce((s: number, r: any) => s + r.totalSales, 0);
                      return items.map((row: any, idx: number) => {
                        const share = total > 0 ? (row.totalSales / total) * 100 : 0;
                        const marginRate = row.totalSales > 0 ? (row.totalProfit / row.totalSales) * 100 : 0;
                        const rowBg = idx % 2 === 0 ? "bg-background" : "bg-muted/10";
                        return (
                          <tr key={idx} className={cn("border-b border-border/50 hover:bg-primary/5 transition-colors", rowBg)}>
                            <td className="px-4 py-2.5 font-medium text-foreground">{row.label || "미지정"}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{fmtAmt(row.totalSales)}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums">
                              <div className="flex items-center justify-end gap-1.5">
                                <div className="w-12 h-1.5 rounded-full bg-muted overflow-hidden">
                                  <div className="h-full rounded-full bg-primary/70" style={{ width: `${Math.min(share, 100)}%` }} />
                                </div>
                                <span className="text-muted-foreground text-xs w-10 text-right">{share.toFixed(1)}%</span>
                              </div>
                            </td>
                            <td className="px-4 py-2.5 text-right tabular-nums">{fmtQty(row.totalQty)}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums">
                              <span className={cn(
                                "font-semibold",
                                marginRate > 20 ? "text-emerald-600 dark:text-emerald-400" :
                                marginRate > 10 ? "text-blue-600 dark:text-blue-400" :
                                marginRate > 0 ? "text-foreground" : "text-destructive"
                              )}>
                                {marginRate.toFixed(1)}%
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-right"><DeltaBadge value={row.yoyPct ?? 0} /></td>
                            <td className="px-4 py-2.5 text-right"><DeltaBadge value={row.momPct ?? 0} /></td>
                          </tr>
                        );
                      });
                    })()}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
