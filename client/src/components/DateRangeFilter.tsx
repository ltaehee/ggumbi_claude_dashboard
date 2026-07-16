import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarIcon, ChevronLeft, ChevronRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  format,
  startOfWeek, endOfWeek,
  startOfMonth, endOfMonth,
  subWeeks, addWeeks,
  subMonths, addMonths,
  subDays, addDays,
} from "date-fns";
import { ko } from "date-fns/locale";
import type { DateRange } from "react-day-picker";

export type FilterMode = "custom" | "week" | "month" | "day";

export interface DateFilter {
  mode: FilterMode;
  startDate: string;
  endDate: string;
  label: string;
}

interface DateRangeFilterProps {
  value: DateFilter;
  onChange: (filter: DateFilter) => void;
  className?: string;
}

function toStr(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

function buildDayFilter(base: Date): DateFilter {
  return {
    mode: "day",
    startDate: toStr(base),
    endDate: toStr(base),
    label: format(base, "M월 d일 (eee)", { locale: ko }),
  };
}

function buildWeekFilter(base: Date): DateFilter {
  // 일~토 주간
  const start = startOfWeek(base, { weekStartsOn: 0 });
  const end = endOfWeek(base, { weekStartsOn: 0 });
  return {
    mode: "week",
    startDate: toStr(start),
    endDate: toStr(end),
    label: `${format(start, "M/d")} ~ ${format(end, "M/d")}`,
  };
}

function buildMonthFilter(base: Date): DateFilter {
  const start = startOfMonth(base);
  const end = endOfMonth(base);
  return {
    mode: "month",
    startDate: toStr(start),
    endDate: toStr(end),
    label: format(base, "yyyy년 M월"),
  };
}

export function getDefaultFilter(): DateFilter {
  return buildMonthFilter(new Date());
}

export function DateRangeFilter({ value, onChange, className }: DateRangeFilterProps) {
  // pendingRange: 캘린더에서 선택 중인 임시 범위 (아직 확정 전)
  const [pendingRange, setPendingRange] = useState<DateRange | undefined>(() => {
    if (value.mode === "custom") {
      return { from: new Date(value.startDate), to: new Date(value.endDate) };
    }
    return undefined;
  });
  const [calOpen, setCalOpen] = useState(false);
  const [dayCalOpen, setDayCalOpen] = useState(false);

  const handleModeChange = useCallback(
    (mode: FilterMode) => {
      const now = new Date();
      if (mode === "day") onChange(buildDayFilter(now));
      else if (mode === "week") onChange(buildWeekFilter(now));
      else if (mode === "month") onChange(buildMonthFilter(now));
      else {
        // custom: default to last 30 days
        const end = now;
        const start = new Date(now);
        start.setDate(start.getDate() - 29);
        const filter: DateFilter = {
          mode: "custom",
          startDate: toStr(start),
          endDate: toStr(end),
          label: `${format(start, "M/d")} ~ ${format(end, "M/d")}`,
        };
        setPendingRange({ from: start, to: end });
        onChange(filter);
        setCalOpen(true); // 특정기간 클릭 시 캘린더 자동 열기
      }
    },
    [onChange]
  );

  const handlePrev = useCallback(() => {
    const base = new Date(value.startDate);
    if (value.mode === "day") onChange(buildDayFilter(subDays(base, 1)));
    else if (value.mode === "week") onChange(buildWeekFilter(subWeeks(base, 1)));
    else if (value.mode === "month") onChange(buildMonthFilter(subMonths(base, 1)));
  }, [value, onChange]);

  const handleNext = useCallback(() => {
    const base = new Date(value.startDate);
    if (value.mode === "day") onChange(buildDayFilter(addDays(base, 1)));
    else if (value.mode === "week") onChange(buildWeekFilter(addWeeks(base, 1)));
    else if (value.mode === "month") onChange(buildMonthFilter(addMonths(base, 1)));
  }, [value, onChange]);

  // 캘린더 선택 변경 - 팝업 닫지 않고 pendingRange만 업데이트
  const handleCalendarSelect = useCallback((range: DateRange | undefined) => {
    setPendingRange(range);
    // from만 선택된 경우(첫 번째 클릭) - 팝업 유지
    // from + to 모두 선택된 경우(두 번째 클릭) - 팝업 유지, 확인 버튼으로 닫기
  }, []);

  // 확인 버튼 클릭 시 실제 필터 적용 + 팝업 닫기
  const handleConfirm = useCallback(() => {
    if (pendingRange?.from && pendingRange?.to) {
      onChange({
        mode: "custom",
        startDate: toStr(pendingRange.from),
        endDate: toStr(pendingRange.to),
        label: `${format(pendingRange.from, "M/d")} ~ ${format(pendingRange.to, "M/d")}`,
      });
      setCalOpen(false);
    }
  }, [pendingRange, onChange]);

  // 팝업이 외부 클릭으로 닫힐 때 - pendingRange를 현재 value 기준으로 리셋
  const handleOpenChange = useCallback((open: boolean) => {
    if (!open) {
      if (value.mode === "custom") {
        setPendingRange({ from: new Date(value.startDate), to: new Date(value.endDate) });
      }
    }
    setCalOpen(open);
  }, [value]);

  // 최근 52주 목록 생성 (현재 주 포함)
  const weekOptions = Array.from({ length: 52 }, (_, i) => {
    const base = subWeeks(new Date(), i);
    const f = buildWeekFilter(base);
    return { value: f.startDate, label: f.label };
  });

  // 월 목록: 데이터 시작월(2025년 1월)부터 현재월까지 (그 이전은 데이터 없음)
  const monthOptions = (() => {
    const dataStart = startOfMonth(new Date(2025, 0, 1));
    const opts: { value: string; label: string }[] = [];
    let d = startOfMonth(new Date());
    while (d >= dataStart) {
      opts.push({ value: toStr(d), label: format(d, "yyyy년 M월") });
      d = subMonths(d, 1);
    }
    return opts;
  })();

  const hasFullRange = pendingRange?.from && pendingRange?.to;

  return (
    <div className={cn("flex items-center gap-2 flex-wrap", className)}>
      {/* Mode selector */}
      <div className="flex rounded-lg border border-border overflow-hidden">
        {(["day", "week", "month", "custom"] as FilterMode[]).map((mode) => (
          <button
            key={mode}
            onClick={() => handleModeChange(mode)}
            className={cn(
              "px-3 py-1.5 text-xs font-medium transition-colors",
              value.mode === mode
                ? "bg-primary text-primary-foreground"
                : "bg-card text-muted-foreground hover:bg-muted"
            )}
          >
            {mode === "day" ? "일단위" : mode === "week" ? "주간" : mode === "month" ? "월단위" : "특정기간"}
          </button>
        ))}
      </div>

      {/* Navigation - 일단위 (이전/다음 + 날짜 선택) */}
      {value.mode === "day" && (
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={handlePrev}>
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Popover open={dayCalOpen} onOpenChange={setDayCalOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 w-32 justify-center">
                <CalendarIcon className="h-3.5 w-3.5" />
                {value.label}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={new Date(value.startDate)}
                onSelect={(d) => {
                  if (d) {
                    onChange(buildDayFilter(d));
                    setDayCalOpen(false);
                  }
                }}
                locale={ko}
                initialFocus
              />
            </PopoverContent>
          </Popover>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={handleNext}>
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* Navigation - 주간 및 월단위 공통 */}
      {(value.mode === "week" || value.mode === "month") && (
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={handlePrev}>
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>

          {value.mode === "month" ? (
            /* 월단위: Select 드롭다운 */
            <Select
              value={value.startDate}
              onValueChange={(v) => {
                const d = new Date(v);
                onChange(buildMonthFilter(d));
              }}
            >
              <SelectTrigger className="h-8 text-xs w-36">
                <SelectValue>{value.label}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {monthOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value} className="text-xs">
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            /* 주간: Select 드롭다운 (월단위와 동일한 UX) */
            <Select
              value={value.startDate}
              onValueChange={(v) => {
                const d = new Date(v);
                onChange(buildWeekFilter(d));
              }}
            >
              <SelectTrigger className="h-8 text-xs w-40">
                <SelectValue>{value.label}</SelectValue>
              </SelectTrigger>
              <SelectContent className="max-h-64 overflow-y-auto">
                {weekOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value} className="text-xs">
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Button variant="outline" size="icon" className="h-8 w-8" onClick={handleNext}>
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* Custom date range picker */}
      {value.mode === "custom" && (
        <Popover open={calOpen} onOpenChange={handleOpenChange}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
              <CalendarIcon className="h-3.5 w-3.5" />
              {value.label}
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="w-auto p-0"
            align="start"
            onInteractOutside={() => {
              // 팝업 외부 클릭 시 닫기 허용 (기본 동작)
            }}
          >
            <div className="p-3 pb-0">
              <p className="text-xs text-muted-foreground mb-2">
                {!pendingRange?.from
                  ? "시작일을 선택하세요"
                  : !pendingRange?.to
                  ? "종료일을 선택하세요"
                  : `${format(pendingRange.from, "M/d")} ~ ${format(pendingRange.to, "M/d")}`}
              </p>
            </div>
            <Calendar
              mode="range"
              selected={pendingRange}
              onSelect={handleCalendarSelect}
              locale={ko}
              numberOfMonths={2}
              initialFocus
            />
            {/* 확인 버튼 */}
            <div className="p-3 pt-2 border-t border-border flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => {
                  if (value.mode === "custom") {
                    setPendingRange({ from: new Date(value.startDate), to: new Date(value.endDate) });
                  }
                  setCalOpen(false);
                }}
              >
                취소
              </Button>
              <Button
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={handleConfirm}
                disabled={!hasFullRange}
              >
                <Check className="h-3 w-3" />
                확인
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
