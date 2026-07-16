import { cn } from "@/lib/utils";
import { DeltaBadge } from "./DeltaBadge";
import { ReportKpiCard } from "./ReportKpiCard";
import { fmtAmt, fmtAsp, fmtKor, fmtPct, fmtQty } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, ShoppingCart, DollarSign, BarChart2, Award, Clock } from "lucide-react";

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
  /** 왼쪽 색깔 띠 색상 (지표별 구분). 미지정 시 기본 primary 색 */
  accent?: string;
  /** 증감 표기 단위 (기본 "%") */
  unit?: string;
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
  accent,
  unit,
}: KpiCardProps) {
  const bandColor = accent ?? "var(--primary)";
  if (loading) {
    return (
      <div className={cn("rounded-xl border border-border border-l-4 bg-card p-4", className)} style={{ borderLeftColor: bandColor }}>
        <Skeleton className="h-3 w-24 mb-3" />
        <Skeleton className="h-7 w-32 mb-2" />
        <Skeleton className="h-3 w-20" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-xl border border-l-4 bg-card p-4 transition-all hover:shadow-md",
        highlight
          ? "border-primary/30 bg-gradient-to-br from-primary/5 to-primary/10"
          : "border-border",
        className
      )}
      style={{ borderLeftColor: bandColor }}
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

      {(delta !== undefined || delta2 !== undefined) && (
        <div className="space-y-1 mt-1.5">
          {delta !== undefined && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{deltaLabel}</span>
              <DeltaBadge value={delta} unit={unit} />
            </div>
          )}
          {delta2 !== undefined && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{delta2Label}</span>
              <DeltaBadge value={delta2} unit={unit} />
            </div>
          )}
        </div>
      )}
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
    ytdProfit?: number;
    ytdPrevProfit?: number;
    ytdContrib?: number;
    ytdPrevContrib?: number;
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
}

export function KpiSection({ kpi, loading, periodLabel, ytdTarget, currMonthTarget, yearTotalTarget }: KpiSectionProps) {
  const ytdAchievePct =
    ytdTarget && ytdTarget > 0 && kpi?.ytdSales != null ? (kpi.ytdSales / ytdTarget) * 100 : null;
  const pctSafe = (a?: number, b?: number) => (a != null && b != null && b > 0 ? ((a - b) / b) * 100 : null);
  const ytdMarginRate = kpi?.ytdSales ? ((kpi.ytdProfit ?? 0) / kpi.ytdSales) * 100 : 0;
  const ytdContribRate = kpi?.ytdSales ? ((kpi.ytdContrib ?? 0) / kpi.ytdSales) * 100 : 0;

  return (
    <div className="space-y-3">
      {/* 연누계(YTD) — 매출액 / 매출이익 / 공헌이익 */}
      <div>
        <div className="flex items-center gap-2 mb-2 flex-wrap text-[11px] text-muted-foreground">
          <span className="font-semibold text-foreground/80">연누계 (YTD)</span>
          {yearTotalTarget != null && yearTotalTarget > 0 && (
            <span>· 연간 전체 목표 <strong className="text-foreground">{fmtKor(yearTotalTarget)}</strong></span>
          )}
          {currMonthTarget != null && currMonthTarget > 0 && (
            <span>· 해당월 목표 <strong className="text-foreground">{fmtKor(currMonthTarget)}</strong></span>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <ReportKpiCard
            title="연누계 매출액"
            accent="#f59e0b"
            icon={<Award className="h-4 w-4" />}
            value={fmtAmt(kpi?.ytdSales)}
            fmt={fmtAmt}
            highlight
            loading={loading}
            rows={[
              ...(ytdTarget && ytdTarget > 0
                ? [{ label: "목표달성", rate: ytdAchievePct, amount: ytdTarget, mode: "achieve" as const }]
                : []),
              { label: "전년대비", rate: kpi?.ytdGrowthPct ?? null, amount: kpi?.ytdPrevSales ?? 0, mode: "growth" as const },
            ]}
          />
          <ReportKpiCard
            title="연누계 매출이익"
            accent="#0ea5e9"
            icon={<DollarSign className="h-4 w-4" />}
            value={fmtAmt(kpi?.ytdProfit)}
            subLabel={`이익률 ${ytdMarginRate.toFixed(1)}%`}
            fmt={fmtAmt}
            loading={loading}
            rows={[{ label: "전년대비", rate: pctSafe(kpi?.ytdProfit, kpi?.ytdPrevProfit), amount: kpi?.ytdPrevProfit ?? 0, mode: "growth" }]}
          />
          <ReportKpiCard
            title="연누계 공헌이익"
            accent="#8b5cf6"
            icon={<BarChart2 className="h-4 w-4" />}
            value={fmtAmt(kpi?.ytdContrib)}
            subLabel={`공헌이익률 ${ytdContribRate.toFixed(1)}%`}
            fmt={fmtAmt}
            loading={loading}
            rows={[{ label: "전년대비", rate: pctSafe(kpi?.ytdContrib, kpi?.ytdPrevContrib), amount: kpi?.ytdPrevContrib ?? 0, mode: "growth" }]}
          />
        </div>
      </div>

      {/* Variable period row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard
          title={`매출 ${periodLabel ? `(${periodLabel})` : ""}`}
          value={fmtAmt(kpi?.currSales)}
          subValue={currMonthTarget ? `/ 목표 ${fmtAmt(currMonthTarget)}` : undefined}
          delta={kpi?.yoyPct}
          deltaLabel="전년대비"
          unit="%"
          delta2={kpi?.momPct}
          delta2Label="전월대비"
          icon={<TrendingUp className="h-4 w-4" />}
          accent="#10b981"
          loading={loading}
        />
        <KpiCard
          title="판매 수량"
          value={fmtQty(kpi?.currQty)}
          subValue="개"
          delta={kpi?.yoyQtyPct}
          deltaLabel="전년대비"
          unit="%"
          delta2={kpi?.momQtyPct}
          delta2Label="전월대비"
          icon={<ShoppingCart className="h-4 w-4" />}
          accent="#06b6d4"
          loading={loading}
        />
        <KpiCard
          title="ASP (평균 판매 단가)"
          value={fmtAsp(kpi?.asp)}
          delta={kpi?.yoyAspPct}
          deltaLabel="전년대비"
          unit="%"
          icon={<DollarSign className="h-4 w-4" />}
          accent="#6366f1"
          loading={loading}
        />
        <KpiCard
          title="매출이익"
          value={fmtAmt(kpi?.currProfit)}
          subValue={`이익률 ${kpi?.marginRate?.toFixed(1) ?? "0.0"}%`}
          subValueGreen
          icon={<BarChart2 className="h-4 w-4" />}
          accent="#0ea5e9"
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
            accent="#8b5cf6"
            loading={loading}
          />
        ) : (
          <div
            className={cn(
              "rounded-xl border border-l-4 bg-card p-4 opacity-60",
              "border-dashed border-muted-foreground/30"
            )}
            style={{ borderLeftColor: "#8b5cf6" }}
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
