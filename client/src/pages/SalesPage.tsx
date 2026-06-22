import React, { useState, useMemo, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/AppLayout";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { HierarchyFilter } from "@/components/HierarchyFilter";
import { KpiSection } from "@/components/KpiCards";
import { DeltaBadge } from "@/components/DeltaBadge";
import { trpc } from "@/lib/trpc";
import { fmtAmt, fmtQty } from "@/lib/format";
import { useFilters } from "@/contexts/FilterContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronRight, ChevronDown, Zap, X, Sparkles, Save, RefreshCw } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  ComposedChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LabelList,
} from "recharts";
import { cn } from "@/lib/utils";

const CHART_COLORS = ["#6366f1","#22d3ee","#4ade80","#fb923c","#f472b6","#a78bfa","#34d399","#fbbf24"];

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  // payload에서 pctChange(전기 대비 증감률) 찾기
  const salesPayload = payload.find((p: any) => p.dataKey === "totalSales");
  const qtyPayload = payload.find((p: any) => p.dataKey === "totalQty");
  const pctChange = salesPayload?.payload?.pctChange;
  const qtyPctChange = salesPayload?.payload?.qtyPctChange;
  // superjson이 서버의 Date를 Date 객체로 복원하므로 string/Date 모두 안전하게 처리
  const minDate: string | Date | undefined = salesPayload?.payload?.minDate;
  const maxDate: string | Date | undefined = salesPayload?.payload?.maxDate;
  const dateRange = minDate && maxDate
    ? (() => {
        const toDate = (v: string | Date) => (v instanceof Date ? v : new Date(v));
        const fmt = (v: string | Date) => { const d = toDate(v); return `${d.getMonth()+1}/${d.getDate()}`; };
        const dayKey = (v: string | Date) => toDate(v).toDateString();
        return dayKey(minDate) === dayKey(maxDate) ? fmt(minDate) : `${fmt(minDate)}~${fmt(maxDate)}`;
      })()
    : null;
  return (
    <div className="rounded-lg border border-border bg-popover p-3 shadow-lg text-xs min-w-[160px]">
      <p className="font-semibold text-foreground">{label}</p>
      {dateRange && <p className="text-[10px] text-muted-foreground mb-2">{dateRange}</p>}
      {!dateRange && <div className="mb-2" />}
      {salesPayload && (
        <div className="mb-1">
          <p style={{ color: salesPayload.color }}>
            매출: {fmtAmt(salesPayload.value)}
          </p>
          {pctChange != null && (
            <p className={cn("text-[10px] pl-2", pctChange >= 0 ? "text-emerald-500" : "text-red-500")}>
              전기 대비: {pctChange >= 0 ? "+" : ""}{pctChange.toFixed(1)}%
            </p>
          )}
        </div>
      )}
      {qtyPayload && (
        <div>
          <p style={{ color: qtyPayload.color }}>
            수량: {fmtQty(qtyPayload.value)}
          </p>
          {qtyPctChange != null && (
            <p className={cn("text-[10px] pl-2", qtyPctChange >= 0 ? "text-emerald-500" : "text-red-500")}>
              전기 대비: {qtyPctChange >= 0 ? "+" : ""}{qtyPctChange.toFixed(1)}%
            </p>
          )}
        </div>
      )}
      {payload.filter((p: any) => p.dataKey !== "totalSales" && p.dataKey !== "totalQty").map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }}>
          {p.name}: {typeof p.value === "number" ? (p.name?.includes("수량") ? fmtQty(p.value) : fmtAmt(p.value)) : p.value}
        </p>
      ))}
    </div>
  );
}

// ─── 파이차트 커스텀 라벨 ─────────────────────────────────────────────────────
function PieCustomLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }: any) {
  const RADIAN = Math.PI / 180;
  // 라벨이 너무 작은 조각은 생략 (3% 미만)
  if (percent < 0.03) return null;

  // 내부 퍼센트 라벨 위치
  const innerRadius2 = innerRadius + (outerRadius - innerRadius) * 0.55;
  const ix = cx + innerRadius2 * Math.cos(-midAngle * RADIAN);
  const iy = cy + innerRadius2 * Math.sin(-midAngle * RADIAN);

  // 외부 명칭 라벨 위치 (callout)
  const outerR = outerRadius + 28;
  const ox = cx + outerR * Math.cos(-midAngle * RADIAN);
  const oy = cy + outerR * Math.sin(-midAngle * RADIAN);
  const textAnchor = ox > cx ? "start" : "end";

  // 연결선 끝점
  const lineStartR = outerRadius + 4;
  const lx = cx + lineStartR * Math.cos(-midAngle * RADIAN);
  const ly = cy + lineStartR * Math.sin(-midAngle * RADIAN);
  const midR = outerRadius + 16;
  const mx = cx + midR * Math.cos(-midAngle * RADIAN);
  const my = cy + midR * Math.sin(-midAngle * RADIAN);

  // 이름이 너무 길면 자르기
  const displayName = name && name.length > 8 ? name.slice(0, 8) + "…" : (name ?? "");

  return (
    <g>
      {/* 퍼센트 - 내부 흰색 */}
      <text x={ix} y={iy} fill="white" textAnchor="middle" dominantBaseline="central"
        style={{ fontSize: percent >= 0.08 ? 12 : 10, fontWeight: 700, textShadow: "0 1px 2px rgba(0,0,0,0.4)" }}>
        {`${(percent * 100).toFixed(1)}%`}
      </text>
      {/* 연결선 */}
      <polyline
        points={`${lx},${ly} ${mx},${my} ${ox},${oy}`}
        fill="none"
        stroke="#94a3b8"
        strokeWidth={0.8}
        opacity={0.7}
      />
      {/* 명칭 - 외부 */}
      <text x={ox + (textAnchor === "start" ? 3 : -3)} y={oy - 5}
        textAnchor={textAnchor}
        dominantBaseline="central"
        style={{ fontSize: 10, fontWeight: 600, fill: "currentColor" }}
        className="fill-foreground">
        {displayName}
      </text>
      <text x={ox + (textAnchor === "start" ? 3 : -3)} y={oy + 7}
        textAnchor={textAnchor}
        dominantBaseline="central"
        style={{ fontSize: 9, fill: "#94a3b8" }}>
        {`${(percent * 100).toFixed(1)}%`}
      </text>
    </g>
  );
}

// ─── 퀵칩 필터 컴포넌트 ──────────────────────────────────────────────────────
type ChipType = "channel" | "itemLarge" | "itemMid" | "itemSmall" | "itemName";

const CHIP_TABS: { type: ChipType; label: string }[] = [
  { type: "channel", label: "채널" },
  { type: "itemLarge", label: "대분류" },
  { type: "itemMid", label: "중분류" },
  { type: "itemSmall", label: "소분류" },
  { type: "itemName", label: "품명" },
];

function QuickChipFilter({
  startDate,
  endDate,
  dept,
  onChipTypeChange,
}: {
  startDate: string;
  endDate: string;
  dept?: string;
  onChipTypeChange?: (type: ChipType | "newProduct") => void;
}) {
  const { filters, setChannels, setItemLarges, setItemMids, setItemSmalls, setItemNames, resetFilters, hasActiveFilters } = useFilters();
  const [chipType, setChipType] = useState<ChipType>("channel");
  const [newProductMode, setNewProductMode] = useState(false);

  // 신상품 품명 목록 조회
  const newProductNamesQuery = trpc.newProducts.getItemNames.useQuery(undefined, { staleTime: 60_000 });

  const topChannels = trpc.filters.getTopItems.useQuery(
    { startDate, endDate, dept, type: "channel", limit: 8 },
    { staleTime: 60_000 }
  );
  const topLarges = trpc.filters.getTopItems.useQuery(
    { startDate, endDate, dept, type: "itemLarge", limit: 8 },
    { staleTime: 60_000 }
  );
  const topMids = trpc.filters.getTopItems.useQuery(
    { startDate, endDate, dept, type: "itemMid", limit: 8 },
    { staleTime: 60_000 }
  );
  const topSmalls = trpc.filters.getTopItems.useQuery(
    { startDate, endDate, dept, type: "itemSmall", limit: 8 },
    { staleTime: 60_000 }
  );
  const topNames = trpc.filters.getTopItems.useQuery(
    { startDate, endDate, dept, type: "itemName", limit: 8 },
    { staleTime: 60_000 }
  );

  const dataMap: Record<ChipType, { data?: { label: string; totalSales: number }[]; isLoading: boolean }> = {
    channel: topChannels,
    itemLarge: topLarges,
    itemMid: topMids,
    itemSmall: topSmalls,
    itemName: topNames,
  };

  const setterMap: Record<ChipType, (v: string[]) => void> = {
    channel: setChannels,
    itemLarge: setItemLarges,
    itemMid: setItemMids,
    itemSmall: setItemSmalls,
    itemName: setItemNames,
  };

  const activeSetMap: Record<ChipType, string[]> = {
    channel: filters.channels,
    itemLarge: filters.itemLarges,
    itemMid: filters.itemMids,
    itemSmall: filters.itemSmalls,
    itemName: filters.itemNames,
  };

  const items = dataMap[chipType].data ?? [];
  const activeSet = activeSetMap[chipType];
  const setActive = setterMap[chipType];
  const isLoading = dataMap[chipType].isLoading;

  const toggleChip = (label: string) => {
    if (activeSet.includes(label)) {
      setActive(activeSet.filter((v) => v !== label));
    } else {
      setActive([...activeSet, label]);
    }
  };

  // 신상품 모드 토글: 신상품 품명으로 itemNames 필터 적용
  const handleNewProductToggle = () => {
    const newMode = !newProductMode;
    setNewProductMode(newMode);
    if (newMode) {
      const names = newProductNamesQuery.data ?? [];
      setItemNames(names);
      onChipTypeChange?.("newProduct");
    } else {
      setItemNames([]);
      onChipTypeChange?.(chipType);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Zap className="h-3 w-3 text-amber-500" />
          <span className="font-medium text-foreground">TOP 8 퀵칩 필터</span>
        </div>
        {/* 5단계 타입 탭 */}
        <div className="flex rounded-md border border-border overflow-hidden">
          {CHIP_TABS.map((tab, idx) => (
            <button
              key={tab.type}
              className={cn(
                "px-2.5 py-1 text-[11px] font-medium transition-colors",
                idx > 0 && "border-l border-border",
                !newProductMode && chipType === tab.type
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:bg-muted/50"
              )}
              onClick={() => {
                setNewProductMode(false);
                setItemNames([]);
                setChipType(tab.type);
                onChipTypeChange?.(tab.type);
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {/* 신상품 탭 - 눈에 띄게 구분 */}
        <button
          onClick={handleNewProductToggle}
          className={cn(
            "inline-flex items-center gap-1.5 px-3 py-1 text-[11px] font-semibold rounded-md border-2 transition-all duration-200",
            newProductMode
              ? "bg-gradient-to-r from-violet-500 to-purple-600 text-white border-violet-500 shadow-md shadow-violet-200 dark:shadow-violet-900/30"
              : "bg-gradient-to-r from-violet-50 to-purple-50 text-violet-700 border-violet-300 hover:border-violet-500 hover:shadow-sm dark:from-violet-950/40 dark:to-purple-950/40 dark:text-violet-300 dark:border-violet-700"
          )}
        >
          <Sparkles className="h-3 w-3" />
          신상품
          {(newProductNamesQuery.data?.length ?? 0) > 0 && (
            <span className={cn(
              "inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold",
              newProductMode ? "bg-white/20 text-white" : "bg-violet-200 text-violet-700 dark:bg-violet-800 dark:text-violet-200"
            )}>
              {newProductNamesQuery.data?.length}
            </span>
          )}
        </button>

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

      {/* 신상품 모드: 등록된 품명 목록 카드 */}
      {newProductMode && (
        <div className="rounded-xl border-2 border-violet-400 bg-violet-50 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-violet-600" />
            <span className="text-xs font-bold text-violet-800">등록된 신상품 목록</span>
            <span className="text-[10px] text-violet-600 font-medium">({newProductNamesQuery.data?.length ?? 0}개)</span>
          </div>
          {newProductNamesQuery.isLoading ? (
            <div className="flex gap-1.5">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-5 w-20 rounded-full" />
              ))}
            </div>
          ) : (newProductNamesQuery.data?.length ?? 0) === 0 ? (
            <p className="text-xs text-violet-700">
              Admin 페이지 → 신상품 관리 탭에서 신상품을 등록하세요.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {(newProductNamesQuery.data ?? []).map((name, i) => {
                const isSelected = filters.itemNames.includes(name);
                return (
                  <button
                    key={name}
                    onClick={() => {
                      if (isSelected) {
                        setItemNames(filters.itemNames.filter((n) => n !== name));
                      } else {
                        setItemNames([...filters.itemNames, name]);
                      }
                    }}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium border transition-all duration-150",
                      "hover:scale-[1.02] active:scale-[0.98]",
                      isSelected
                        ? "bg-violet-600 text-white border-violet-600 shadow-sm shadow-violet-200 dark:shadow-violet-900/30"
                        : "bg-background text-violet-700 border-violet-300 hover:border-violet-500 hover:bg-violet-50 dark:text-violet-300 dark:border-violet-700 dark:hover:bg-violet-950/40"
                    )}
                  >
                    <span
                      className={cn(
                        "inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold",
                        isSelected ? "bg-white/20 text-white" : "bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300"
                      )}
                    >
                      {i + 1}
                    </span>
                    <span className="max-w-[140px] truncate">{name}</span>
                    {isSelected && (
                      <span
                        className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full hover:bg-white/20 transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          setItemNames(filters.itemNames.filter((n) => n !== name));
                        }}
                        title={`${name} 제거`}
                      >
                        <X className="w-2.5 h-2.5" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 칩 목록 (신상품 모드에서는 숨김) */}
      {!newProductMode && (
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
                      isActive ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"
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
      )}
    </div>
  );
}

const MONTH_LABELS = ["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"];

// ─── 메인 페이지 ─────────────────────────────────────────────────────────────
export default function SalesPage() {
  const [perfGroupBy, setPerfGroupBy] = useState<"channel" | "itemName" | "itemLarge" | "itemMid" | "itemSmall">("channel");
  const [activeChipTab, setActiveChipTab] = useState<ChipType | "newProduct">("channel");
  const { filters, setDateFilter } = useFilters();
  const filter = filters.dateFilter;
  const dept = "국내사업팀";

  const kpiQuery = trpc.kpi.getSummary.useQuery({
    startDate: filter.startDate,
    endDate: filter.endDate,
    dept,
    channels: filters.channels.length > 0 ? filters.channels : undefined,
    itemLarges: filters.itemLarges.length > 0 ? filters.itemLarges : undefined,
    itemMids: filters.itemMids.length > 0 ? filters.itemMids : undefined,
    itemSmalls: filters.itemSmalls.length > 0 ? filters.itemSmalls : undefined,
    itemNames: filters.itemNames.length > 0 ? filters.itemNames : undefined,
  });

  const trendGroupBy = useMemo(() => {
    if (filter.mode === "month") return "yearMonth" as const;
    return "weekLabel" as const;
  }, [filter.mode]);

  const trendStartDate = useMemo(() => {
    // 특정기간: 사용자가 직접 고른 범위를 그대로 사용
    if (filter.mode === "custom") {
      return filter.startDate;
    }
    // 주간: 최근 약 6개월(≈26주) 추세를 보여줌 (선택한 주가 마지막 지점)
    // 월단위: 최근 12개월 추세
    const base = new Date(filter.startDate);
    if (filter.mode === "month") base.setMonth(base.getMonth() - 11);
    else base.setMonth(base.getMonth() - 6); // week
    return base.toISOString().split("T")[0];
  }, [filter.startDate, filter.mode]);

  const trendQuery = trpc.sales.getTrend.useQuery({
    startDate: trendStartDate,
    endDate: filter.endDate,
    dept,
    groupBy: trendGroupBy,
    channels: filters.channels.length > 0 ? filters.channels : undefined,
    itemLarges: filters.itemLarges.length > 0 ? filters.itemLarges : undefined,
    itemMids: filters.itemMids.length > 0 ? filters.itemMids : undefined,
    itemSmalls: filters.itemSmalls.length > 0 ? filters.itemSmalls : undefined,
    itemNames: filters.itemNames.length > 0 ? filters.itemNames : undefined,
  });

  const perfQuery = trpc.sales.getItemPerf.useQuery({
    startDate: filter.startDate,
    endDate: filter.endDate,
    dept,
    groupBy: perfGroupBy,
    limit: 20,
    channels: filters.channels.length > 0 ? filters.channels : undefined,
    itemLarges: filters.itemLarges.length > 0 ? filters.itemLarges : undefined,
    itemMids: filters.itemMids.length > 0 ? filters.itemMids : undefined,
    itemSmalls: filters.itemSmalls.length > 0 ? filters.itemSmalls : undefined,
    itemNames: filters.itemNames.length > 0 ? filters.itemNames : undefined,
  });

  const top10 = useMemo(() => {
    if (!perfQuery.data) return [];
    return [...perfQuery.data].sort((a, b) => b.totalSales - a.totalSales).slice(0, 10);
  }, [perfQuery.data]);

  const pieData = useMemo(() => {
    if (!perfQuery.data) return [];
    return perfQuery.data.slice(0, 8).map((r) => ({ name: r.label, value: r.totalSales }));
  }, [perfQuery.data]);

  const trendData = useMemo(() => {
    if (!trendQuery.data) return [];
    return trendQuery.data.map((r) => ({ ...r }));
  }, [trendQuery.data]);

  // ─── 개별 상품 비교 트렌드 ─────────────────────────────────────────────────────
  // groupField는 위 HierarchyFilter 선택 상태에 따라 자동 결정
  const itemTrendGroupField = useMemo<"itemName" | "itemLarge" | "itemMid" | "channel">(() => {
    if (filters.itemNames.length > 0) return "itemName";
    if (filters.itemMids.length > 0) return "itemMid";
    if (filters.itemLarges.length > 0) return "itemLarge";
    if (filters.channels.length > 0) return "channel";
    return "itemName";
  }, [filters.itemNames, filters.itemMids, filters.itemLarges, filters.channels]);

  const itemTrendQuery = trpc.sales.getItemTrend.useQuery({
    startDate: trendStartDate,
    endDate: filter.endDate,
    dept,
    groupBy: trendGroupBy === "yearMonth" ? "yearMonth" : "weekLabel",
    groupField: itemTrendGroupField,
    limit: 6,
    channels: filters.channels.length > 0 ? filters.channels : undefined,
    itemLarges: filters.itemLarges.length > 0 ? filters.itemLarges : undefined,
    itemMids: filters.itemMids.length > 0 ? filters.itemMids : undefined,
    itemSmalls: filters.itemSmalls.length > 0 ? filters.itemSmalls : undefined,
    itemNames: filters.itemNames.length > 0 ? filters.itemNames : undefined,
  });

  // ─── YTD 목표 설정 모달 ──────────────────────────────────────────────────────
  const [goalModalOpen, setGoalModalOpen] = useState(false);
  const [goalInputs, setGoalInputs] = useState<Record<string, string>>({});
  const goalYear = useMemo(() => new Date(filter.endDate).getFullYear(), [filter.endDate]);

  const ytdGoalsQuery = trpc.targets.getYtdGoals.useQuery(
    { dept: dept ?? "all", year: goalYear },
    { staleTime: 60_000 }
  );
  const upsertYtdGoals = trpc.targets.upsertYtdGoals.useMutation({
    onSuccess: () => {
      ytdGoalsQuery.refetch();
      setGoalModalOpen(false);
    },
  });

  // 해당 연도 전체 목표 (1월~12월 합산)
  const yearTotalTarget = useMemo(() => {
    if (!ytdGoalsQuery.data) return undefined;
    let sum = 0;
    for (let m = 1; m <= 12; m++) sum += ytdGoalsQuery.data[m] ?? 0;
    return sum > 0 ? sum : undefined;
  }, [ytdGoalsQuery.data]);

  // YTD 누적 목표 (1월 ~ 현재 선택 기간의 종료월)  → YTD 달성률 계산용
  const ytdTarget = useMemo(() => {
    if (!ytdGoalsQuery.data) return undefined;
    const endMonth = new Date(filter.endDate).getMonth() + 1;
    let sum = 0;
    for (let m = 1; m <= endMonth; m++) {
      sum += ytdGoalsQuery.data[m] ?? 0;
    }
    return sum > 0 ? sum : undefined;
  }, [ytdGoalsQuery.data, filter.endDate]);

  // 현재 선택 기간의 월 목표 (해당 월 1개월치) → 기간별 KPI 카드용
  const currMonthTarget = useMemo(() => {
    if (!ytdGoalsQuery.data) return undefined;
    const endMonth = new Date(filter.endDate).getMonth() + 1;
    const v = ytdGoalsQuery.data[endMonth] ?? 0;
    return v > 0 ? v : undefined;
  }, [ytdGoalsQuery.data, filter.endDate]);

  const openGoalModal = () => {
    const init: Record<string, string> = {};
    for (let m = 1; m <= 12; m++) {
      const v = ytdGoalsQuery.data?.[m] ?? 0;
      init[String(m)] = v > 0 ? String(v) : "";
    }
    setGoalInputs(init);
    setGoalModalOpen(true);
  };

  const saveGoals = () => {
    const goals: Record<string, number> = {};
    for (let m = 1; m <= 12; m++) {
      goals[String(m)] = parseFloat(goalInputs[String(m)]?.replace(/,/g, "") || "0") || 0;
    }
    upsertYtdGoals.mutate({ dept: dept ?? "all", year: goalYear, goals });
  };

  const isNewProductMode = activeChipTab === "newProduct";

  // 실제 매출 데이터의 최신 판매일자 조회
  const salesRangeQuery = trpc.dashboard.getSalesRange.useQuery(undefined, { staleTime: 300_000 });
  const actualEndDate = useMemo(() => {
    if (!salesRangeQuery.data?.max) return filter.endDate;
    // 필터의 종료일과 실제 데이터 최대일 중 작은 값 사용
    const filterEnd = filter.endDate;
    const dataMax = salesRangeQuery.data.max;
    return dataMax < filterEnd ? dataMax : filterEnd;
  }, [salesRangeQuery.data, filter.endDate]);

  return (
    <AppLayout
      title="매출/수익 분석"
      subtitle={`주피미 · 기간별 매출 성과 분석 · ${filter.startDate} ~ ${actualEndDate}`}
      mainClassName={isNewProductMode ? "bg-teal-50 dark:bg-teal-900/20" : undefined}
      actions={
        <div className="flex items-center gap-2 flex-wrap">
          <DateRangeFilter value={filter} onChange={setDateFilter} />
        </div>
      }
    >
      <div className="space-y-5">
        {/* 필터 영역 - 퀵칩 + 계층형 필터 통합 (최상단) */}
        <div className="rounded-xl border border-border bg-card/50 px-4 py-3 space-y-3">
          {/* 퀵칩 필터 */}
          <QuickChipFilter
            startDate={filter.startDate}
            endDate={filter.endDate}
            dept={dept}
            onChipTypeChange={setActiveChipTab}
          />
          {/* 구분선 */}
          <div className="h-px bg-border/40" />
          {/* 계층형 필터 (매출 정렬 포함) */}
          <HierarchyFilter startDate={filter.startDate} endDate={filter.endDate} />
        </div>

        {/* KPI Cards */}
        <KpiSection
          kpi={kpiQuery.data as any}
          loading={kpiQuery.isLoading}
          periodLabel={filter.label}
          ytdTarget={ytdTarget}
          currMonthTarget={currMonthTarget}
          yearTotalTarget={yearTotalTarget}
          onSetGoal={openGoalModal}
        />

        {/* Charts row */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* Trend chart - ComposedChart with dual Y-axis */}
          <div className="lg:col-span-3 rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-foreground">매출 추세</h3>
              <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-indigo-500"></span>매출(선)</span>
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 bg-amber-500/30 border border-amber-500 rounded-sm"></span>목표(막대)</span>
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-emerald-500"></span>수량(우축)</span>
              </div>
            </div>
            {trendQuery.isLoading ? (
              <Skeleton className="h-56 w-full" />
            ) : (
              <div className="overflow-x-auto">
              <div style={{ minWidth: Math.max(600, trendData.length * 80) }}>
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={trendData.map(r => ({
                  ...r,
                  monthTarget: (() => {
                    if (filter.mode === "week") return undefined;
                    const m = new Date(r.minDate).getMonth() + 1;
                    return ytdGoalsQuery.data?.[m] ?? undefined;
                  })(),
                }))} margin={{ top: 5, right: 40, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} interval={0} angle={trendData.length > 8 ? -30 : 0} textAnchor={trendData.length > 8 ? "end" : "middle"} height={trendData.length > 8 ? 40 : 20} />
                  <YAxis
                    yAxisId="sales"
                    orientation="left"
                    tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                    tickLine={false} axisLine={false}
                    tickFormatter={(v) => v >= 1_000_000 ? `${(v/1_000_000).toFixed(0)}M` : v >= 1_000 ? `${(v/1_000).toFixed(0)}K` : String(v)}
                  />
                  <YAxis
                    yAxisId="qty"
                    orientation="right"
                    tick={{ fontSize: 10, fill: "#10b981" }}
                    tickLine={false} axisLine={false}
                    tickFormatter={(v) => v >= 1_000 ? `${(v/1_000).toFixed(0)}K` : String(v)}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  {filter.mode !== "week" && <Bar yAxisId="sales" dataKey="monthTarget" name="목표" fill="#f59e0b" fillOpacity={0.5} radius={[3,3,0,0]} />}
                  <Line yAxisId="sales" type="monotone" dataKey="totalSales" name="매출" stroke="#6366f1" strokeWidth={2} dot={{ r: 3, fill: "#6366f1" }} activeDot={{ r: 5 }} />
                  <Line yAxisId="qty" type="monotone" dataKey="totalQty" name="수량" stroke="#10b981" strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} strokeDasharray="4 2" />
                </ComposedChart>
              </ResponsiveContainer>
              </div>
              </div>
            )}
          </div>

          {/* Pie chart - 확대 + 라벨 표시 */}
          <div className="lg:col-span-2 rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-foreground">분류별 비중</h3>
              <Select value={perfGroupBy} onValueChange={(v) => setPerfGroupBy(v as any)}>
                <SelectTrigger className="h-7 text-xs w-24"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="channel">거래처</SelectItem>
                  <SelectItem value="itemLarge">대분류</SelectItem>
                  <SelectItem value="itemMid">중분류</SelectItem>
                  <SelectItem value="itemSmall">소분류</SelectItem>
                  <SelectItem value="itemName">품명</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {perfQuery.isLoading ? (
              <Skeleton className="h-80 w-full" />
            ) : (
              <div>
                <ResponsiveContainer width="100%" height={320}>
                  <PieChart margin={{ top: 30, right: 60, bottom: 30, left: 60 }}>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={105}
                      paddingAngle={2}
                      dataKey="value"
                      labelLine={false}
                      label={PieCustomLabel}
                    >
                      {pieData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Pie>
                    <Tooltip
                      formatter={(v: number) => [fmtAmt(v), "매출"]}
                      contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid var(--border)", background: "var(--popover)" }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                {/* 범례 - 별도 표시로 가독성 향상 */}
                <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 px-2">
                  {pieData.map((d, i) => {
                    const total = pieData.reduce((s, r) => s + r.value, 0);
                    const pct = total > 0 ? (d.value / total * 100).toFixed(1) : "0.0";
                    return (
                      <div key={d.name} className="flex items-center gap-1 text-[11px]">
                        <span
                          className="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0"
                          style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
                        />
                        <span className="text-foreground/80 max-w-[80px] truncate">{d.name}</span>
                        <span className="text-muted-foreground font-medium">{pct}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* AI 분석 + 수동 메모 섹션 */}
        <AnalysisMemoSection
          filterKey={`${dept ?? "all"}__tab:${activeChipTab}`}
          startDate={filter.startDate}
          endDate={filter.endDate}
          kpiData={kpiQuery.data}
        />

        {/* TOP 10 bar chart */}
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground">
              {perfGroupBy === "channel" ? "거래처" : perfGroupBy === "itemName" ? "품명" : perfGroupBy === "itemLarge" ? "대분류" : perfGroupBy === "itemSmall" ? "소분류" : "중분류"} TOP 10
            </h3>
            <Select value={perfGroupBy} onValueChange={(v) => setPerfGroupBy(v as any)}>
              <SelectTrigger className="h-7 text-xs w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="channel">거래처별</SelectItem>
                <SelectItem value="itemName">품명별</SelectItem>
                <SelectItem value="itemLarge">대분류별</SelectItem>
                <SelectItem value="itemMid">중분류별</SelectItem>
                <SelectItem value="itemSmall">소분류별</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {perfQuery.isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <div className="overflow-x-auto">
            <div style={{ minWidth: Math.max(400, top10.length * 40) }}>
            <ResponsiveContainer width="100%" height={Math.max(180, top10.length * 28)}>
              <BarChart data={top10} layout="vertical" margin={{ top: 0, right: 40, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} tickFormatter={(v) => v >= 1_000_000 ? `${(v/1_000_000).toFixed(0)}M` : v >= 1_000 ? `${(v/1_000).toFixed(0)}K` : String(v)} />
                <YAxis type="category" dataKey="label" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={110} />
                <Tooltip formatter={(v: number) => [fmtAmt(v), "매출"]} contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid var(--border)", background: "var(--popover)" }} />
                <Bar dataKey="totalSales" name="매출" fill="#6366f1" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
            </div>
            </div>
          )}
        </div>

        {/* 개별 상품 비교 트렌드 라인 그래프 */}
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-foreground">개별 상품 추세 비교</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">상위 6개 항목의 매출 추세를 개별 라인으로 비교 (위 필터 연동)</p>
            </div>
          </div>
          {itemTrendQuery.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <>
              <div className="overflow-x-auto">
              <div style={{ minWidth: Math.max(600, (itemTrendQuery.data?.data?.length ?? 0) * 80) }}>
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={itemTrendQuery.data?.data ?? []} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} tickFormatter={(v) => v >= 1_000_000 ? `${(v/1_000_000).toFixed(0)}M` : v >= 1_000 ? `${(v/1_000).toFixed(0)}K` : String(v)} />
                  <Tooltip
                    contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid var(--border)", background: "var(--popover)" }}
                    formatter={(v: number, name: string) => [fmtAmt(v), name]}
                  />
                  {(itemTrendQuery.data?.keys ?? []).map((key, i) => (
                    <Line
                      key={key}
                      type="monotone"
                      dataKey={key}
                      name={key}
                      stroke={CHART_COLORS[i % CHART_COLORS.length]}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  ))}
                </ComposedChart>
              </ResponsiveContainer>
              </div>
              </div>
              {/* 범례 */}
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 px-1">
                {(itemTrendQuery.data?.keys ?? []).map((key, i) => (
                  <div key={key} className="flex items-center gap-1 text-[11px]">
                    <span className="inline-block w-3 h-0.5 rounded" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                    <span className="text-foreground/80 max-w-[120px] truncate">{key}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* 성과 상세 테이블 (기존) */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground">성과 상세 테이블</h3>
            <Select value={perfGroupBy} onValueChange={(v) => setPerfGroupBy(v as any)}>
              <SelectTrigger className="h-7 text-xs w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="channel">거래처별</SelectItem>
                <SelectItem value="itemName">품명별</SelectItem>
                <SelectItem value="itemLarge">대분류별</SelectItem>
                <SelectItem value="itemMid">중분류별</SelectItem>
                <SelectItem value="itemSmall">소분류별</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full data-table">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-2.5">구분</th>
                  <th className="text-right px-4 py-2.5">매출</th>
                  <th className="text-right px-4 py-2.5">수량</th>
                  <th className="text-right px-4 py-2.5">이익</th>
                  <th className="text-right px-4 py-2.5">이익률</th>
                  <th className="text-right px-4 py-2.5">공헌이익</th>
                  <th className="text-right px-4 py-2.5">공헌이익률</th>
                  <th className="text-right px-4 py-2.5">YoY</th>
                  <th className="text-right px-4 py-2.5">MoM</th>
                </tr>
              </thead>
              <tbody>
                {perfQuery.isLoading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="border-b border-border/50">
                        {Array.from({ length: 8 }).map((_, j) => (
                          <td key={j} className="px-4 py-2.5"><Skeleton className="h-4 w-full" /></td>
                        ))}
                      </tr>
                    ))
                  : (perfQuery.data ?? []).map((row, i) => (
                      <tr key={i} className={cn(
                        "border-b border-border/50 hover:bg-muted/30 transition-colors",
                        i % 2 === 0 ? "bg-background" : "bg-muted/10"
                      )}>
                        <td className="px-4 py-2.5 font-medium text-sm">{row.label}</td>
                        <td className="px-4 py-2.5 text-right text-sm tabular-nums">{fmtAmt(row.totalSales)}</td>
                        <td className="px-4 py-2.5 text-right text-sm tabular-nums">{fmtQty(row.totalQty)}</td>
                        <td className="px-4 py-2.5 text-right text-sm tabular-nums">{fmtAmt(row.totalProfit)}</td>
                        <td className="px-4 py-2.5 text-right text-sm tabular-nums">
                          <span className={cn(
                            "font-semibold",
                            row.marginRate > 20 ? "text-emerald-600 dark:text-emerald-400" :
                            row.marginRate > 10 ? "text-blue-600 dark:text-blue-400" :
                            row.marginRate > 0 ? "text-foreground" : "text-destructive"
                          )}>
                            {row.marginRate.toFixed(1)}%
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right text-sm tabular-nums">
                          {row.contribMargin != null ? (
                            <span className={cn(
                              "font-semibold",
                              row.contribMargin > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
                            )}>
                              {fmtAmt(row.contribMargin)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-xs">-</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right text-sm tabular-nums">
                          {row.contribMarginRate != null ? (
                            <span className={cn(
                              "font-semibold",
                              row.contribMarginRate > 20 ? "text-emerald-600 dark:text-emerald-400" :
                              row.contribMarginRate > 10 ? "text-blue-600 dark:text-blue-400" :
                              row.contribMarginRate > 0 ? "text-foreground" : "text-destructive"
                            )}>
                              {row.contribMarginRate.toFixed(1)}%
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-xs">입력 필요</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right"><DeltaBadge value={row.yoyPct} /></td>
                        <td className="px-4 py-2.5 text-right"><DeltaBadge value={row.momPct} /></td>
                      </tr>
                    ))}
              </tbody>
            </table>
            {!perfQuery.isLoading && (perfQuery.data?.length ?? 0) === 0 && (
              <div className="text-center py-12 text-muted-foreground text-sm">
                데이터가 없습니다. 엑셀 파일을 업로드해주세요.
              </div>
            )}
          </div>
        </div>

      </div>

      {/* YTD 목표 설정 모달 */}
      <Dialog open={goalModalOpen} onOpenChange={setGoalModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{goalYear}년 월별 YTD 목표 설정</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-3 py-2">
            {MONTH_LABELS.map((label, idx) => {
              const m = idx + 1;
              return (
                <div key={m} className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{label}</Label>
                  <Input
                    type="number"
                    min={0}
                    placeholder="0"
                    className="h-8 text-xs"
                    value={goalInputs[String(m)] ?? ""}
                    onChange={(e) =>
                      setGoalInputs((prev) => ({ ...prev, [String(m)]: e.target.value }))
                    }
                  />
                </div>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">단위: 원. 각 월의 목표 매출액을 입력하세요.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGoalModalOpen(false)}>취소</Button>
            <Button onClick={saveGoals} disabled={upsertYtdGoals.isPending}>
              {upsertYtdGoals.isPending ? "저장 중..." : "저장"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

// ─── AI 분석 + 인사이트 섹션 ─────────────────────────────────────────────────
function AnalysisMemoSection({
  filterKey,
  startDate,
  endDate,
  kpiData,
}: {
  filterKey: string;
  startDate: string;
  endDate: string;
  kpiData: any;
}) {
  const utils = trpc.useUtils();
  const [manualText, setManualText] = useState("");
  const [isDirty, setIsDirty] = useState(false);

  const memoQuery = trpc.analysisMemo.get.useQuery(
    { filterKey, startDate, endDate },
    { staleTime: 30_000 }
  );

  // 저장된 메모가 로드되면 textarea에 반영 (대필터+기간 변경 시에도 갱신)
  const savedManualMemo = memoQuery.data?.manualMemo ?? "";
  const prevKeyRef = useRef("");
  const currentKey = `${filterKey}|${startDate}|${endDate}`;
  if (prevKeyRef.current !== currentKey) {
    prevKeyRef.current = currentKey;
  }

  useEffect(() => {
    if (!memoQuery.isLoading) {
      setManualText(memoQuery.data?.manualMemo ?? "");
      setIsDirty(false);
    }
  }, [memoQuery.data?.manualMemo, memoQuery.isLoading, currentKey]);

  const saveMemo = trpc.analysisMemo.saveManualMemo.useMutation({
    onSuccess: () => {
      utils.analysisMemo.get.invalidate({ filterKey, startDate, endDate });
      setIsDirty(false);
    },
  });

  const generateAI = trpc.analysisMemo.generateAI.useMutation({
    onSuccess: () => {
      utils.analysisMemo.get.invalidate({ filterKey, startDate, endDate });
    },
  });

  const clearAI = trpc.analysisMemo.clearAI.useMutation({
    onSuccess: () => {
      utils.analysisMemo.get.invalidate({ filterKey, startDate, endDate });
    },
  });

  const handleGenerateAI = () => {
    const kpiSummary = kpiData
      ? `매출: ${fmtAmt(kpiData.totalSales ?? 0)}\n수량: ${fmtQty(kpiData.totalQty ?? 0)}\n이익: ${fmtAmt(kpiData.totalProfit ?? 0)}\nYoY: ${(kpiData.yoyPct ?? 0).toFixed(1)}%\nMoM: ${(kpiData.momPct ?? 0).toFixed(1)}%`
      : "KPI 데이터 없음";
    generateAI.mutate({ filterKey, startDate, endDate, kpiSummary });
  };

  const aiAnalysis = memoQuery.data?.aiAnalysis;
  const aiGeneratedAt = memoQuery.data?.aiGeneratedAt;

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">분석 인사이트</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {(() => {
              const tabMatch = filterKey.match(/__tab:(.+)$/);
              const tabType = tabMatch?.[1] ?? "channel";
              const deptPart = filterKey.replace(/__tab:.+$/, "");
              const tabLabel: Record<string, string> = {
                channel: "채널", itemLarge: "대분류", itemMid: "중분류",
                itemSmall: "소분류", itemName: "품명", newProduct: "신상품"
              };
              const deptLabel = deptPart === "all" ? "전체" : deptPart;
              return `${deptLabel} · ${tabLabel[tabType] ?? tabType}`;
            })()} · {startDate} ~ {endDate}
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 text-xs"
          onClick={handleGenerateAI}
          disabled={generateAI.isPending}
        >
          {generateAI.isPending ? (
            <><RefreshCw className="w-3.5 h-3.5 animate-spin" />AI 분석 중...</>
          ) : (
            <><Sparkles className="w-3.5 h-3.5 text-indigo-500" />AI 분석 생성</>
          )}
        </Button>
      </div>

      {/* AI 분석 결과 */}
      <div className="rounded-lg bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 p-3">
        <div className="flex items-center gap-1.5 mb-2">
          <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
          <span className="text-xs font-medium text-indigo-700 dark:text-indigo-300">AI 분석</span>
          <div className="flex items-center gap-1.5 ml-auto">
            {aiGeneratedAt && (
              <span className="text-[10px] text-muted-foreground">
                {new Date(aiGeneratedAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
            {aiAnalysis && (
              <button
                onClick={() => clearAI.mutate({ filterKey, startDate, endDate })}
                disabled={clearAI.isPending}
                className="p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-muted-foreground hover:text-red-500 transition-colors"
                title="AI 분석 삭제"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
        {memoQuery.isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : aiAnalysis ? (
          <div className="text-xs text-foreground/80 whitespace-pre-wrap leading-relaxed">{aiAnalysis}</div>
        ) : (
          <p className="text-xs text-muted-foreground italic">
            AI 분석 생성 버튼을 클릭하면 현재 KPI 데이터를 기반으로 인사이트를 생성합니다.
          </p>
        )}
      </div>

      {/* 수동 메모 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-foreground">인사이트</label>
          {isDirty && (
            <Button
              size="sm"
              variant="default"
              className="gap-1 text-xs h-7 px-2"
              onClick={() => saveMemo.mutate({ filterKey, startDate, endDate, manualMemo: manualText })}
              disabled={saveMemo.isPending}
            >
              <Save className="w-3 h-3" />
              {saveMemo.isPending ? "저장 중..." : "저장"}
            </Button>
          )}
        </div>
        <Textarea
          value={manualText}
          onChange={(e) => { setManualText(e.target.value); setIsDirty(true); }}
          placeholder="이 기간에 대한 인사이트를 입력하세요. (대필터 + 기간 단위로 저장됩니다)"
          className="text-xs min-h-[80px] resize-none"
          rows={3}
        />
        {!isDirty && savedManualMemo && (
          <p className="text-[10px] text-muted-foreground">마지막 저장: {new Date(memoQuery.data?.updatedAt ?? "").toLocaleString("ko-KR")}</p>
        )}
      </div>
    </div>
  );
}
