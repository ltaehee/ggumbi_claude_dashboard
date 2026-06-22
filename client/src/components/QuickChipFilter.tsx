import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useFilters } from "@/contexts/FilterContext";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtAmt } from "@/lib/format";
import { Zap, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface QuickChipFilterProps {
  startDate: string;
  endDate: string;
  dept?: string;
}

/**
 * 매출 TOP 8 퀵칩 필터 컴포넌트
 * - 채널 / 대분류 탭 전환
 * - 실시간 매출 기준 TOP 8 표시
 * - 클릭 시 전역 필터 즉시 적용
 */
export function QuickChipFilter({ startDate, endDate, dept }: QuickChipFilterProps) {
  const { filters, setChannels, setItemLarges, resetFilters, hasActiveFilters } = useFilters();
  const [chipType, setChipType] = useState<"channel" | "itemLarge">("channel");

  const topChannels = trpc.filters.getTopItems.useQuery(
    { startDate, endDate, dept, type: "channel", limit: 8 },
    { staleTime: 60_000 }
  );
  const topLarges = trpc.filters.getTopItems.useQuery(
    { startDate, endDate, dept, type: "itemLarge", limit: 8 },
    { staleTime: 60_000 }
  );

  const items = chipType === "channel"
    ? (topChannels.data ?? [])
    : (topLarges.data ?? []);

  const activeSet = chipType === "channel" ? filters.channels : filters.itemLarges;
  const setActive = chipType === "channel" ? setChannels : setItemLarges;

  const toggleChip = (label: string) => {
    if (activeSet.includes(label)) {
      setActive(activeSet.filter((v) => v !== label));
    } else {
      setActive([...activeSet, label]);
    }
  };

  const isLoading = chipType === "channel" ? topChannels.isLoading : topLarges.isLoading;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Zap className="h-3 w-3 text-amber-500" />
          <span className="font-medium text-foreground">TOP 8 퀵 필터</span>
        </div>
        {/* 타입 토글 버튼 */}
        <div className="flex rounded-md border border-border overflow-hidden">
          <button
            className={cn(
              "px-2.5 py-1 text-[11px] font-medium transition-colors",
              chipType === "channel"
                ? "bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:bg-muted/50"
            )}
            onClick={() => setChipType("channel")}
          >
            채널
          </button>
          <button
            className={cn(
              "px-2.5 py-1 text-[11px] font-medium transition-colors border-l border-border",
              chipType === "itemLarge"
                ? "bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:bg-muted/50"
            )}
            onClick={() => setChipType("itemLarge")}
          >
            대분류
          </button>
        </div>

        {hasActiveFilters && (
          <button
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-destructive transition-colors"
            onClick={resetFilters}
          >
            <X className="h-3 w-3" />
            필터 초기화
          </button>
        )}
      </div>

      {/* 칩 목록 */}
      <div className="flex flex-wrap gap-1.5">
        {isLoading
          ? Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-7 w-20 rounded-full" />
            ))
          : items.map((item, i) => {
              const isActive = activeSet.includes(item.label);
              return (
                <button
                  key={item.label}
                  onClick={() => toggleChip(item.label)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium border transition-all duration-150",
                    "hover:scale-[1.02] active:scale-[0.98]",
                    isActive
                      ? "bg-primary text-primary-foreground border-primary shadow-sm"
                      : "bg-background text-foreground border-border/60 hover:border-primary/40 hover:bg-primary/5"
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold",
                      isActive
                        ? "bg-primary-foreground/20 text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {i + 1}
                  </span>
                  <span className="max-w-[100px] truncate">{item.label}</span>
                  <span className={cn(
                    "text-[10px] tabular-nums",
                    isActive ? "text-primary-foreground/70" : "text-muted-foreground"
                  )}>
                    {fmtAmt(item.totalSales)}
                  </span>
                </button>
              );
            })}
      </div>
    </div>
  );
}
