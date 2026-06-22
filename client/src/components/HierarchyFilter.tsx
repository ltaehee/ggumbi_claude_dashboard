import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useFilters } from "@/contexts/FilterContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronDown, X, Filter, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── 단일 다중선택 드롭다운 ───────────────────────────────────────────────────
interface MultiSelectProps {
  label: string;
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
  disabled?: boolean;
  loading?: boolean;
  placeholder?: string;
}

function MultiSelectDropdown({
  label,
  options,
  selected,
  onChange,
  disabled = false,
  loading = false,
  placeholder = "검색...",
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);

  const toggle = (val: string) => {
    if (selected.includes(val)) {
      onChange(selected.filter((s) => s !== val));
    } else {
      onChange([...selected, val]);
    }
  };

  const displayLabel =
    selected.length === 0
      ? label
      : selected.length === 1
        ? selected[0]
        : `${label} (${selected.length})`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled || loading}
          className={cn(
            "h-8 gap-1 text-xs font-medium border-border/60 bg-background/50 hover:bg-accent transition-colors",
            selected.length > 0 && "border-primary/60 bg-primary/5 text-primary"
          )}
        >
          {loading ? (
            <span className="animate-pulse">로딩...</span>
          ) : (
            <>
              <span className="max-w-[120px] truncate">{displayLabel}</span>
              {selected.length > 0 && (
                <span
                  className="ml-0.5 rounded-full bg-primary/20 px-1 text-[10px] font-bold text-primary"
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange([]);
                  }}
                >
                  ✕
                </span>
              )}
              <ChevronDown className="h-3 w-3 opacity-50" />
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-0" align="start" sideOffset={4}>
        <Command>
          <CommandInput placeholder={placeholder} className="h-8 text-xs" />
          <CommandList className="max-h-52">
            <CommandEmpty className="py-4 text-center text-xs text-muted-foreground">
              항목 없음
            </CommandEmpty>
            <CommandGroup>
              {options.map((opt) => (
                <CommandItem
                  key={opt}
                  value={opt}
                  onSelect={() => toggle(opt)}
                  className="text-xs cursor-pointer"
                >
                  <Check
                    className={cn(
                      "mr-2 h-3 w-3 transition-opacity",
                      selected.includes(opt) ? "opacity-100 text-primary" : "opacity-0"
                    )}
                  />
                  <span className="truncate">{opt}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
          {selected.length > 0 && (
            <div className="border-t p-1">
              <Button
                variant="ghost"
                size="sm"
                className="w-full h-7 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => onChange([])}
              >
                선택 초기화
              </Button>
            </div>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ─── 메인 계층형 필터 컴포넌트 ───────────────────────────────────────────────
export function HierarchyFilter({
  startDate,
  endDate,
}: {
  startDate?: string;
  endDate?: string;
}) {
  const { filters, setChannels, setItemLarges, setItemMids, setItemSmalls, setItemNames, resetFilters, hasActiveFilters } = useFilters();
  const dept = filters.dept || undefined;

  // 채널 옵션 (매출 정렬)
  const { data: channelOpts = [], isLoading: loadingChannel } = trpc.filters.getOptions.useQuery(
    { dept, level: "channel", startDate, endDate },
    { staleTime: 60_000 }
  );

  // 대분류 옵션 (매출 정렬)
  const { data: largeOpts = [], isLoading: loadingLarge } = trpc.filters.getOptions.useQuery(
    { dept, level: "itemLarge", startDate, endDate },
    { staleTime: 60_000 }
  );

  // 중분류 옵션 (매출 정렬)
  const { data: midOpts = [], isLoading: loadingMid } = trpc.filters.getOptions.useQuery(
    {
      dept,
      level: "itemMid",
      parentLarge: filters.itemLarges.length === 1 ? filters.itemLarges[0] : undefined,
      startDate,
      endDate,
    },
    { staleTime: 60_000, enabled: true }
  );

  // 소분류 옵션 (매출 정렬)
  const { data: smallOpts = [], isLoading: loadingSmall } = trpc.filters.getOptions.useQuery(
    {
      dept,
      level: "itemSmall",
      parentLarge: filters.itemLarges.length === 1 ? filters.itemLarges[0] : undefined,
      parentMid: filters.itemMids.length === 1 ? filters.itemMids[0] : undefined,
      startDate,
      endDate,
    },
    { staleTime: 60_000, enabled: true }
  );

  // 품명 옵션 (매출 정렬)
  const { data: nameOpts = [], isLoading: loadingName } = trpc.filters.getOptions.useQuery(
    {
      dept,
      level: "itemName",
      parentLarge: filters.itemLarges.length === 1 ? filters.itemLarges[0] : undefined,
      parentMid: filters.itemMids.length === 1 ? filters.itemMids[0] : undefined,
      parentSmall: filters.itemSmalls.length === 1 ? filters.itemSmalls[0] : undefined,
      startDate,
      endDate,
    },
    { staleTime: 60_000, enabled: true }
  );

  const totalSelected =
    filters.channels.length +
    filters.itemLarges.length +
    filters.itemMids.length +
    filters.itemSmalls.length +
    filters.itemNames.length;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <Filter className="h-3 w-3" />
        <span className="font-medium">필터</span>
      </div>

      <MultiSelectDropdown
        label="채널"
        options={channelOpts}
        selected={filters.channels}
        onChange={setChannels}
        loading={loadingChannel}
        placeholder="채널 검색..."
      />

      <MultiSelectDropdown
        label="대분류"
        options={largeOpts}
        selected={filters.itemLarges}
        onChange={setItemLarges}
        loading={loadingLarge}
        placeholder="대분류 검색..."
      />

      <MultiSelectDropdown
        label="중분류"
        options={midOpts}
        selected={filters.itemMids}
        onChange={setItemMids}
        loading={loadingMid}
        placeholder="중분류 검색..."
      />

      <MultiSelectDropdown
        label="소분류"
        options={smallOpts}
        selected={filters.itemSmalls}
        onChange={setItemSmalls}
        loading={loadingSmall}
        placeholder="소분류 검색..."
      />

      <MultiSelectDropdown
        label="품명"
        options={nameOpts}
        selected={filters.itemNames}
        onChange={setItemNames}
        loading={loadingName}
        placeholder="품명 검색..."
      />

      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1 text-xs text-muted-foreground hover:text-destructive"
          onClick={resetFilters}
        >
          <RotateCcw className="h-3 w-3" />
          초기화
          {totalSelected > 0 && (
            <Badge variant="secondary" className="ml-0.5 h-4 px-1 text-[10px]">
              {totalSelected}
            </Badge>
          )}
        </Button>
      )}
    </div>
  );
}
