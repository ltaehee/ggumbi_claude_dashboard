import { cn } from "@/lib/utils";
import { DeltaBadge } from "./DeltaBadge";
import { fmtAmt, fmtAsp, fmtPct, fmtQty } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, ShoppingCart, DollarSign, BarChart2, Award, Settings2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";

interface KpiCardProps {
  title: string;
  value: string;
  subValue?: string;
  subValueGreen?: boolean;
  delta?: number;
  deltaLabel?: string;
  delta2?: number;
  delta2Label?: string;
  icon?: React.ReactNode;
  highlight?: boolean;
  loading?: boolean;
  className?: string;
}

export function KpiCard({
  title,
  value,
  subValue,
  subValueGreen,
  delta,
  deltaLabel,
  delta2,
  delta2Label,
  icon,
  highlight,
  loading,
  className,
}: KpiCardProps) {
  if (loading) {
    return (
      <div className={cn("rounded-xl border border-border bg-card p-4", className)}>
        <Skeleton className="h-3 w-24 mb-3" />
        <Skeleton className="h-7 w-32 mb-2" />
        <Skeleton className="h-3 w-20" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-4 transition-all hover:shadow-md",
        highlight
          ? "border-primary/30 bg-gradient-to-br from-primary/5 to-primary/10"
          : "border-border",
        className
      )}
    >
      <div className="flex items-start justify-between mb-2">
        <span className="text-xs font-medium text-muted-foreground">{title}</span>
        {icon && (
          <span className="text-muted-foreground/50 p-1 rounded-md bg-muted/50">{icon}</span>
        )}
      </div>

      <div className="mb-1.5">
        <span className="text-2xl font-bold text-foreground tabular-nums">{value}</span>
      </div>
      {subValue && (
        <div className="mb-1 -mt-0.5">
          <span className={cn(
            "text-xs font-semibold",
            subValueGreen ? "text-emerald-500 dark:text-emerald-400" : "text-muted-foreground"
          )}>{subValue}</span>
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        {delta !== undefined && (
          <DeltaBadge value={delta} label={deltaLabel} />
        )}
        {delta2 !== undefined && (
          <DeltaBadge value={delta2} label={delta2Label} />
        )}
      </div>
    </div>
  );
}

interface KpiSectionProps {
  kpi: {
    currSales: number;
    currQty: number;
    currProfit: number;
    contribMargin?: number;
    contribMarginRate?: number;
    asp: number;
    marginRate: number;
    ytdSales: number;
    ytdPrevSales: number;
    ytdGrowthPct: number;
    yoyPct: number;
    yoyQtyPct: number;
    yoyAspPct: number;
    momPct: number;
    momQtyPct: number;
  } | null | undefined;
  loading?: boolean;
  periodLabel?: string;
  ytdTarget?: number;
  currMonthTarget?: number;
  yearTotalTarget?: number;
  onSetGoal?: () => void;
}

export function KpiSection({ kpi, loading, periodLabel, ytdTarget, currMonthTarget, yearTotalTarget, onSetGoal }: KpiSectionProps) {
  const ytdAchievePct =
    ytdTarget && ytdTarget > 0 && kpi?.ytdSales != null
      ? (kpi.ytdSales / ytdTarget) * 100
      : null;

  return (
    <div className="space-y-3">
      {/* Fixed YTD row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          title="연 누적 매출 (YTD)"
          value={fmtAmt(kpi?.ytdSales)}
          delta={kpi?.ytdGrowthPct}
          deltaLabel="YoY"
          icon={<Award className="h-4 w-4" />}
          highlight
          loading={loading}
          className="lg:col-span-1"
        />
        <div className="lg:col-span-3 rounded-xl border border-border bg-muted/30 p-3 flex items-center justify-between gap-3">
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
            <span>
              YTD 목표 달성률:{" "}
              {ytdAchievePct != null ? (
                <strong
                  className={
                    ytdAchievePct >= 100
                      ? "text-emerald-500"
                      : ytdAchievePct >= 80
                      ? "text-amber-500"
                      : "text-red-500"
                  }
                >
                  {ytdAchievePct.toFixed(1)}%
                </strong>
              ) : (
                <strong className="text-foreground">—</strong>
              )}
              {ytdTarget != null && ytdTarget > 0 && (
                <span className="ml-1 text-muted-foreground/70">
                  (목표 {fmtAmt(ytdTarget)})
                </span>
              )}
            </span>
            <span>
              전년 동기 YTD:{" "}
              <strong className="text-foreground">{fmtAmt(kpi?.ytdPrevSales)}</strong>
            </span>
            <span>
              YTD 성장률:{" "}
              <strong
                className={
                  kpi?.ytdGrowthPct != null && kpi.ytdGrowthPct >= 0
                    ? "text-emerald-500"
                    : "text-red-500"
                }
              >
                {fmtPct(kpi?.ytdGrowthPct)}
              </strong>
            </span>
            {yearTotalTarget != null && yearTotalTarget > 0 && (
              <span>
                연간 전체 목표:{" "}
                <strong className="text-foreground">{fmtAmt(yearTotalTarget)}</strong>
              </span>
            )}
            {currMonthTarget != null && currMonthTarget > 0 && (
              <span>
                해당월 목표:{" "}
                <strong className="text-foreground">{fmtAmt(currMonthTarget)}</strong>
              </span>
            )}
          </div>
          {onSetGoal && (
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 h-7 text-xs gap-1"
              onClick={onSetGoal}
            >
              <Settings2 className="h-3 w-3" />
              목표 설정
            </Button>
          )}
        </div>
      </div>

      {/* Variable period row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard
          title={`매출 ${periodLabel ? `(${periodLabel})` : ""}`}
          value={fmtAmt(kpi?.currSales)}
          subValue={currMonthTarget ? `/ 목표 ${fmtAmt(currMonthTarget)}` : undefined}
          delta={kpi?.yoyPct}
          deltaLabel="YoY"
          delta2={kpi?.momPct}
          delta2Label="MoM"
          icon={<TrendingUp className="h-4 w-4" />}
          loading={loading}
        />
        <KpiCard
          title="판매 수량"
          value={fmtQty(kpi?.currQty)}
          subValue="개"
          delta={kpi?.yoyQtyPct}
          deltaLabel="YoY"
          delta2={kpi?.momQtyPct}
          delta2Label="MoM"
          icon={<ShoppingCart className="h-4 w-4" />}
          loading={loading}
        />
        <KpiCard
          title="ASP (평균 판매 단가)"
          value={fmtAsp(kpi?.asp)}
          delta={kpi?.yoyAspPct}
          deltaLabel="YoY"
          icon={<DollarSign className="h-4 w-4" />}
          loading={loading}
        />
        <KpiCard
          title="매출이익"
          value={fmtAmt(kpi?.currProfit)}
          subValue={`이익률 ${kpi?.marginRate?.toFixed(1) ?? "0.0"}%`}
          subValueGreen
          icon={<BarChart2 className="h-4 w-4" />}
          loading={loading}
        />
        {/* 공헌이익 카드 - 변동비 입력 여부와 무관하게 항상 표시 */}
        {kpi?.contribMargin != null && kpi.contribMargin !== kpi.currProfit ? (
          <KpiCard
            title="공헌이익"
            value={fmtAmt(kpi.contribMargin)}
            subValue={`공헌이익률 ${kpi.contribMarginRate?.toFixed(1) ?? '0.0'}%`}
            subValueGreen
            icon={<BarChart2 className="h-4 w-4" />}
            loading={loading}
          />
        ) : (
          <div
            className={cn(
              "rounded-xl border bg-card p-4 opacity-60",
              "border-dashed border-muted-foreground/30"
            )}
          >
            <div className="flex items-start justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground">공헌이익</span>
              <span className="text-muted-foreground/50 p-1 rounded-md bg-muted/50">
                <Clock className="h-4 w-4" />
              </span>
            </div>
            <div className="mb-1.5">
              <span className="text-2xl font-bold text-muted-foreground tabular-nums">{fmtAmt(kpi?.currProfit)}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground border border-dashed border-muted-foreground/30">
                변동비 미입력 (매출이익 동일)
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
