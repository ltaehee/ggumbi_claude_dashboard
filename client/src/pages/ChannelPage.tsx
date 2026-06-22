import { useState } from "react";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/AppLayout";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { HierarchyFilter } from "@/components/HierarchyFilter";
import { trpc } from "@/lib/trpc";
import { fmtAmt, fmtQty } from "@/lib/format";
import { useFilters } from "@/contexts/FilterContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { LayoutDashboard, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── 유틸 ─────────────────────────────────────────────────────────────────────
function DeltaBadgeLocal({ value, size }: { value: number | null | undefined; size?: "xs" }) {
  if (value == null || isNaN(value as number)) return <span className="text-muted-foreground/60 text-xs">비교군없음</span>;
  const pos = value >= 0;
  return (
    <span className={cn(
      "inline-flex items-center gap-0.5 font-semibold tabular-nums",
      size === "xs" ? "text-[10px]" : "text-xs",
      pos ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"
    )}>
      {pos ? "▲" : "▼"} {Math.abs(value).toFixed(1)}%
    </span>
  );
}

// ─── 메인 페이지 ─────────────────────────────────────────────────────────────
export default function ChannelPage() {
  const [, navigate] = useLocation();
  const { filters, setDateFilter } = useFilters();
  const filter = filters.dateFilter;
  const dept = "국내사업팀";

  const channelQuery = trpc.channel.getDrilldown.useQuery({
    startDate: filter.startDate,
    endDate: filter.endDate,
    dept,
    channels: filters.channels.length > 0 ? filters.channels : undefined,
    itemLarges: filters.itemLarges.length > 0 ? filters.itemLarges : undefined,
    itemMids: filters.itemMids.length > 0 ? filters.itemMids : undefined,
    itemSmalls: filters.itemSmalls.length > 0 ? filters.itemSmalls : undefined,
    itemNames: filters.itemNames.length > 0 ? filters.itemNames : undefined,
    level: "channel",
  }, { staleTime: 30_000 });

  const channels = channelQuery.data ?? [];
  const totalSales = channels.reduce((s, r) => s + r.totalSales, 0);

  return (
    <AppLayout
      title="채널별 분석"
      subtitle="채널 행을 클릭하면 채널 상세 분석 페이지로 이동합니다"
      actions={
        <div className="flex items-center gap-2 flex-wrap">
          <HierarchyFilter />
          <DateRangeFilter value={filter} onChange={setDateFilter} />
        </div>
      }
    >
      <div className="space-y-4">
        {/* 요약 카드 */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              <LayoutDashboard className="h-3 w-3" /> 채널 수
            </div>
            {channelQuery.isLoading ? <Skeleton className="h-7 w-16" /> : (
              <div className="text-xl font-bold tabular-nums">{channels.length}개</div>
            )}
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-xs text-muted-foreground mb-1">전체 매출</div>
            {channelQuery.isLoading ? <Skeleton className="h-7 w-24" /> : (
              <div className="text-xl font-bold tabular-nums">{fmtAmt(totalSales)}</div>
            )}
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-xs text-muted-foreground mb-1">전체 수량</div>
            {channelQuery.isLoading ? <Skeleton className="h-7 w-24" /> : (
              <div className="text-xl font-bold tabular-nums">
                {fmtQty(channels.reduce((s, r) => s + r.totalQty, 0))}
              </div>
            )}
          </div>

        </div>

        {/* 채널 목록 테이블 */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-border">
            <div>
              <h3 className="text-sm font-semibold text-foreground">채널별 성과</h3>
              <p className="text-xs text-muted-foreground mt-0.5">행을 클릭하면 채널 상세 분석으로 이동합니다</p>
            </div>
            <Badge variant="outline" className="text-xs">
              {channels.length}개 채널
            </Badge>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b-2 border-border bg-muted/50">
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground uppercase tracking-wide text-[11px]">채널</th>
                  <th className="text-right px-4 py-3 font-semibold text-muted-foreground uppercase tracking-wide text-[11px]">매출</th>
                  <th className="text-right px-4 py-3 font-semibold text-muted-foreground uppercase tracking-wide text-[11px]">비중</th>
                  <th className="text-right px-4 py-3 font-semibold text-muted-foreground uppercase tracking-wide text-[11px]">수량</th>
                  <th className="text-right px-4 py-3 font-semibold text-muted-foreground uppercase tracking-wide text-[11px]">이익률</th>
                  <th className="text-right px-4 py-3 font-semibold text-muted-foreground uppercase tracking-wide text-[11px]">공헌이익</th>
                  <th className="text-right px-4 py-3 font-semibold text-muted-foreground uppercase tracking-wide text-[11px]">공헌이익률</th>
                  <th className="text-right px-4 py-3 font-semibold text-muted-foreground uppercase tracking-wide text-[11px]">YoY</th>
                  <th className="text-right px-4 py-3 font-semibold text-muted-foreground uppercase tracking-wide text-[11px]">MoM</th>
                  <th className="text-right px-4 py-3 font-semibold text-muted-foreground uppercase tracking-wide text-[11px]"></th>
                </tr>
              </thead>
              <tbody>
                {channelQuery.isLoading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="border-b border-border/50">
                        {Array.from({ length: 9 }).map((_, j) => (
                          <td key={j} className="px-4 py-2.5"><Skeleton className="h-4 w-full" /></td>
                        ))}
                      </tr>
                    ))
                  : channels.map((ch, idx) => {
                      const share = totalSales > 0 ? (ch.totalSales / totalSales) * 100 : 0;
                      const rowBg = idx % 2 === 0 ? "bg-background" : "bg-muted/10";
                      return (
                        <tr
                          key={ch.label}
                          className={cn(
                            "border-b border-border/60 hover:bg-primary/5 cursor-pointer transition-colors group",
                            rowBg
                          )}
                          onClick={() => navigate(`/channel/${encodeURIComponent(ch.label)}`)}
                        >
                          <td className="px-4 py-3 font-bold text-sm">
                            <div className="flex items-center gap-2">
                              <span className="text-foreground">{ch.label || "미지정"}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right font-bold tabular-nums text-sm">{fmtAmt(ch.totalSales)}</td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            <div className="flex items-center justify-end gap-1.5">
                              <div className="w-14 h-2 rounded-full bg-muted overflow-hidden">
                                <div className="h-full rounded-full bg-primary/70" style={{ width: `${Math.min(share, 100)}%` }} />
                              </div>
                              <span className="text-muted-foreground text-xs w-10 text-right">{share.toFixed(1)}%</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-sm">{fmtQty(ch.totalQty)}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-sm">
                            <span className={cn(
                              "font-semibold",
                              ch.marginRate > 20 ? "text-emerald-600 dark:text-emerald-400" :
                              ch.marginRate > 10 ? "text-blue-600 dark:text-blue-400" :
                              ch.marginRate > 0 ? "text-foreground" : "text-destructive"
                            )}>
                              {ch.marginRate.toFixed(1)}%
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-sm">
                            {ch.contribMargin != null ? (
                              <span className={cn(
                                "font-semibold",
                                ch.contribMargin > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
                              )}>
                                {fmtAmt(ch.contribMargin)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground text-xs">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-sm">
                            {ch.contribMarginRate != null ? (
                              <span className={cn(
                                "font-semibold",
                                ch.contribMarginRate > 20 ? "text-emerald-600 dark:text-emerald-400" :
                                ch.contribMarginRate > 10 ? "text-blue-600 dark:text-blue-400" :
                                ch.contribMarginRate > 0 ? "text-foreground" : "text-destructive"
                              )}>
                                {ch.contribMarginRate.toFixed(1)}%
                              </span>
                            ) : (
                              <span className="text-muted-foreground text-xs">입력 필요</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right"><DeltaBadgeLocal value={ch.yoyPct} /></td>
                          <td className="px-4 py-3 text-right"><DeltaBadgeLocal value={ch.momPct} /></td>
                          <td className="px-4 py-3 text-right">
                            <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors ml-auto" />
                          </td>
                        </tr>
                      );
                    })}
              </tbody>
            </table>
            {!channelQuery.isLoading && channels.length === 0 && (
              <div className="text-center py-12 text-muted-foreground text-sm">
                데이터가 없습니다. 엑셀 파일을 업로드해주세요.
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
