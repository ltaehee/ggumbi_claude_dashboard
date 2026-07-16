import { cn } from "@/lib/utils";
import { fmtAmt } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";

// 카드 본문 비교 행: 라벨 · 신장률(달성률) · 금액
export type CmpRowData = { label: string; rate: number | null; amount: number; mode: "growth" | "achieve" };

export function CmpRow({ label, rate, amount, mode, fmt = fmtAmt }: CmpRowData & { fmt?: (v: number) => string }) {
  let rateEl: React.ReactNode;
  if (rate == null) {
    rateEl = <span className="text-muted-foreground/50">비교군없음</span>;
  } else if (mode === "achieve") {
    const ok = rate >= 100;
    rateEl = <span className={cn("font-semibold", ok ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400")}>{rate.toFixed(1)}%</span>;
  } else {
    const up = rate >= 0;
    rateEl = (
      <span className={cn("font-semibold", up ? "text-emerald-600 dark:text-emerald-400" : "text-red-500")}>
        {up ? "▲" : "▼"} {up ? "+" : ""}{rate.toFixed(1)}%
      </span>
    );
  }
  return (
    <div className="flex items-center text-[13px] tabular-nums">
      <span className="text-muted-foreground w-[56px] shrink-0">{label}</span>
      <span className="w-[88px] shrink-0">{rateEl}</span>
      <span className="text-muted-foreground/80 ml-auto text-right">{fmt(amount)}</span>
    </div>
  );
}

/** 값 + [목표달성/전월대비/전년대비] 비교행 카드 (월간 리포트 · 매출/수익 YTD 공통) */
export function ReportKpiCard({ title, icon, accent, value, subLabel, rows, note, loading, fmt = fmtAmt, highlight }: {
  title: string;
  icon: React.ReactNode;
  accent: string;
  value: string;
  subLabel?: string;
  rows: CmpRowData[];
  note?: string;
  loading?: boolean;
  fmt?: (v: number) => string;
  highlight?: boolean;
}) {
  if (loading) {
    return (
      <div className="rounded-xl border border-border border-l-4 bg-card p-4" style={{ borderLeftColor: accent }}>
        <Skeleton className="h-3 w-20 mb-3" />
        <Skeleton className="h-8 w-28 mb-3" />
        <Skeleton className="h-3 w-full mb-1.5" />
        <Skeleton className="h-3 w-full mb-1.5" />
        <Skeleton className="h-3 w-full" />
      </div>
    );
  }
  return (
    <div
      className={cn(
        "rounded-xl border border-border border-l-4 bg-card p-4 transition-all hover:shadow-md",
        highlight && "bg-gradient-to-br from-primary/5 to-primary/10"
      )}
      style={{ borderLeftColor: accent }}
    >
      <div className="flex items-start justify-between mb-2">
        <span className="text-xs font-medium text-muted-foreground">{title}</span>
        <span className="text-muted-foreground/50 p-1 rounded-md bg-muted/50">{icon}</span>
      </div>
      <div className="text-2xl font-bold text-foreground tabular-nums leading-tight">{value}</div>
      {subLabel && <div className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 mt-0.5">{subLabel}</div>}
      {note && (
        <div className="mt-1.5">
          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground border border-dashed border-muted-foreground/30">
            {note}
          </span>
        </div>
      )}
      <div className="mt-2.5 pt-2.5 border-t border-border/60 space-y-1.5">
        {rows.map((r, i) => (
          <CmpRow key={i} {...r} fmt={fmt} />
        ))}
      </div>
    </div>
  );
}
