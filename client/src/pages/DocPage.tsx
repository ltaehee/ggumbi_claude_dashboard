import { useState, useMemo } from "react";
import { AppLayout } from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { fmtQty } from "@/lib/format";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { format, subYears, startOfMonth, endOfMonth } from "date-fns";
import { Search, X } from "lucide-react";

function StatusBadge({ status }: { status: string }) {
  if (status === "부족") return <Badge className="bg-red-500/15 text-red-600 border-red-200 text-xs">부족</Badge>;
  if (status === "주의") return <Badge className="bg-amber-500/15 text-amber-600 border-amber-200 text-xs">주의</Badge>;
  return <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-200 text-xs">양호</Badge>;
}

type DocRow = {
  itemCode: string;
  itemName: string;
  itemLarge?: string | null;
  itemMid?: string | null;
  itemSmall?: string | null;
  currentStock: number;
  recent30qty: number;
  recentDailyAvg: number;
  lySeasonal: number;
  seasonDailyAvg: number;
  docRecent: number;
  docSeason: number;
  status: string;
};

export default function DocPage() {
  const now = new Date();
  const lyStart = format(startOfMonth(subYears(now, 1)), "yyyy-MM-dd");
  const lyEnd = format(endOfMonth(subYears(now, 1)), "yyyy-MM-dd");

  const dept = "국내사업팀";
  const [lyStartDate, setLyStartDate] = useState(lyStart);
  const [lyEndDate, setLyEndDate] = useState(lyEnd);
  const [forecastDays, setForecastDays] = useState(90);
  const [growthRate, setGrowthRate] = useState([100]);
  const [statusFilter, setStatusFilter] = useState<"all" | "부족" | "주의" | "양호">("all");

  // 필터 상태
  const [searchText, setSearchText] = useState("");
  const [selectedLarge, setSelectedLarge] = useState<string>("all");
  const [selectedMid, setSelectedMid] = useState<string>("all");
  const [selectedSmall, setSelectedSmall] = useState<string>("all");

  const deptParam = dept;

  const docQuery = trpc.doc.analyze.useQuery({
    lyStartDate,
    lyEndDate,
    forecastDays,
    growthRate: growthRate[0] / 100,
    dept: deptParam,
  });

  const data = (docQuery.data ?? []) as DocRow[];

  // 대분류 목록 (중복 제거, 로딩 완료 후 계산)
  const largeOptions = useMemo(() => {
    const set = new Set<string>();
    data.forEach((r) => { if (r.itemLarge) set.add(r.itemLarge); });
    return Array.from(set).sort();
  }, [data]);

  // 중분류 목록 (대분류 선택 기준)
  const midOptions = useMemo(() => {
    const set = new Set<string>();
    data.forEach((r) => {
      if (r.itemMid && (selectedLarge === "all" || r.itemLarge === selectedLarge)) {
        set.add(r.itemMid);
      }
    });
    return Array.from(set).sort();
  }, [data, selectedLarge]);

  // 소분류 목록 (대분류+중분류 선택 기준)
  const smallOptions = useMemo(() => {
    const set = new Set<string>();
    data.forEach((r) => {
      if (
        r.itemSmall &&
        (selectedLarge === "all" || r.itemLarge === selectedLarge) &&
        (selectedMid === "all" || r.itemMid === selectedMid)
      ) {
        set.add(r.itemSmall);
      }
    });
    return Array.from(set).sort();
  }, [data, selectedLarge, selectedMid]);

  // 대분류 변경 시 중분류/소분류 초기화
  const handleLargeChange = (v: string) => {
    setSelectedLarge(v);
    setSelectedMid("all");
    setSelectedSmall("all");
  };

  // 중분류 변경 시 소분류 초기화
  const handleMidChange = (v: string) => {
    setSelectedMid(v);
    setSelectedSmall("all");
  };

  // 필터 적용
  const filtered = useMemo(() => {
    return data.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (selectedLarge !== "all" && r.itemLarge !== selectedLarge) return false;
      if (selectedMid !== "all" && r.itemMid !== selectedMid) return false;
      if (selectedSmall !== "all" && r.itemSmall !== selectedSmall) return false;
      if (searchText) {
        const q = searchText.toLowerCase();
        const match =
          r.itemName.toLowerCase().includes(q) ||
          (r.itemCode ?? "").toLowerCase().includes(q) ||
          (r.itemLarge ?? "").toLowerCase().includes(q) ||
          (r.itemMid ?? "").toLowerCase().includes(q) ||
          (r.itemSmall ?? "").toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [data, statusFilter, selectedLarge, selectedMid, selectedSmall, searchText]);

  const counts = {
    부족: data.filter((r) => r.status === "부족").length,
    주의: data.filter((r) => r.status === "주의").length,
    양호: data.filter((r) => r.status === "양호").length,
  };

  const hasActiveFilter = searchText || selectedLarge !== "all" || selectedMid !== "all" || selectedSmall !== "all";

  return (
    <AppLayout
      title="품목별 재고 가용 일수 분석"
      subtitle="Days of Coverage — 재고 소진 예측"
      actions={null}
    >
      <div className="space-y-5">
        {/* Settings panel */}
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-foreground mb-1">분석 설정</h3>
          <p className="text-xs text-muted-foreground mb-4">
            <span className="font-medium text-foreground">기준 기간</span>은 일평균 판매량 계산에 사용할 과거 매출 데이터 범위입니다.
            <span className="font-medium text-foreground ml-2">예측 기간</span>은 앞으로 몇 일간의 재고 충분 여부를 판단할지 설정합니다.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">기준 시작일</Label>
              <Input
                type="date"
                value={lyStartDate}
                onChange={(e) => setLyStartDate(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">기준 종료일</Label>
              <Input
                type="date"
                value={lyEndDate}
                onChange={(e) => setLyEndDate(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">예측 기간 (일)</Label>
              <Input
                type="number"
                value={forecastDays}
                onChange={(e) => setForecastDays(Number(e.target.value))}
                className="h-8 text-xs"
                min={1}
                max={365}
              />
              <p className="text-[10px] text-muted-foreground">
                {forecastDays}일간 재고 충분 여부 판단
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">성장률 가정: {growthRate[0]}%</Label>
              <Slider
                value={growthRate}
                onValueChange={setGrowthRate}
                min={50}
                max={200}
                step={5}
                className="mt-2"
              />
            </div>
          </div>
        </div>

        {/* Status summary */}
        <div className="grid grid-cols-3 gap-3">
          {(["부족", "주의", "양호"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(statusFilter === s ? "all" : s)}
              className={cn(
                "rounded-xl border p-3 text-center transition-all",
                statusFilter === s ? "ring-2 ring-primary" : "border-border bg-card hover:bg-muted/30"
              )}
            >
              <div className="text-2xl font-bold tabular-nums">{counts[s]}</div>
              <StatusBadge status={s} />
            </button>
          ))}
        </div>

        {/* DOC table */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="p-4 border-b border-border space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">
                재고 소진 예측{" "}
                <span className="text-muted-foreground font-normal">
                  ({filtered.length}개 품목{hasActiveFilter ? " · 필터 적용 중" : ""})
                </span>
              </h3>
              <div className="flex gap-1">
                {(["all", "부족", "주의", "양호"] as const).map((s) => (
                  <Button
                    key={s}
                    variant={statusFilter === s ? "default" : "outline"}
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setStatusFilter(s)}
                  >
                    {s === "all" ? "전체" : s}
                  </Button>
                ))}
              </div>
            </div>

            {/* 검색 + 분류 필터 */}
            <div className="flex flex-wrap items-center gap-2">
              {/* 검색 */}
              <div className="relative flex-1 min-w-[160px] max-w-xs">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  placeholder="품명 / 품번 검색..."
                  className="h-8 text-xs pl-8 pr-7"
                />
                {searchText && (
                  <button
                    onClick={() => setSearchText("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* 대분류 */}
              <Select value={selectedLarge} onValueChange={handleLargeChange}>
                <SelectTrigger className="h-8 text-xs w-36">
                  <SelectValue placeholder="대분류 전체" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">대분류 전체</SelectItem>
                  {largeOptions.map((v) => (
                    <SelectItem key={v} value={v}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* 중분류 */}
              <Select value={selectedMid} onValueChange={handleMidChange}>
                <SelectTrigger className="h-8 text-xs w-36">
                  <SelectValue placeholder="중분류 전체" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">중분류 전체</SelectItem>
                  {midOptions.map((v) => (
                    <SelectItem key={v} value={v}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* 소분류 */}
              <Select value={selectedSmall} onValueChange={setSelectedSmall}>
                <SelectTrigger className="h-8 text-xs w-36">
                  <SelectValue placeholder="소분류 전체" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">소분류 전체</SelectItem>
                  {smallOptions.map((v) => (
                    <SelectItem key={v} value={v}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* 필터 초기화 */}
              {hasActiveFilter && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setSearchText("");
                    setSelectedLarge("all");
                    setSelectedMid("all");
                    setSelectedSmall("all");
                  }}
                >
                  <X className="w-3 h-3 mr-1" />
                  필터 초기화
                </Button>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full data-table">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold">품번</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold">품명</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold">대분류</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold">중분류</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold">소분류</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold">현재고</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold">최근30일 판매</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold">일평균 판매</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold">기준기간 판매</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold">DOC (최근)</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold">DOC (기준)</th>
                  <th className="text-center px-4 py-2.5 text-xs font-semibold">상태</th>
                </tr>
              </thead>
              <tbody>
                {docQuery.isLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/50">
                      {Array.from({ length: 12 }).map((_, j) => (
                        <td key={j} className="px-4 py-2.5"><Skeleton className="h-4 w-full" /></td>
                      ))}
                    </tr>
                  ))
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="text-center py-12 text-muted-foreground text-sm">
                      {data.length === 0
                        ? "데이터가 없습니다. 재고 및 매출 파일을 업로드해주세요."
                        : "검색 조건에 맞는 품목이 없습니다."}
                    </td>
                  </tr>
                ) : (
                  filtered.map((row, i) => (
                    <tr
                      key={i}
                      className={cn(
                        "border-b border-border/50 hover:bg-muted/30 transition-colors",
                        row.status === "부족" && "bg-red-50/50 dark:bg-red-950/10",
                        row.status === "주의" && "bg-amber-50/50 dark:bg-amber-950/10"
                      )}
                    >
                      <td className="px-4 py-2.5 text-xs text-muted-foreground font-mono">{row.itemCode}</td>
                      <td className="px-4 py-2.5 text-sm font-medium">{row.itemName}</td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">{row.itemLarge ?? "-"}</td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">{row.itemMid ?? "-"}</td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">{row.itemSmall ?? "-"}</td>
                      <td className="px-4 py-2.5 text-right text-sm tabular-nums">{fmtQty(row.currentStock)}</td>
                      <td className="px-4 py-2.5 text-right text-sm tabular-nums">{fmtQty(row.recent30qty)}</td>
                      <td className="px-4 py-2.5 text-right text-sm tabular-nums">{row.recentDailyAvg.toFixed(1)}</td>
                      <td className="px-4 py-2.5 text-right text-sm tabular-nums">{fmtQty(row.lySeasonal)}</td>
                      <td className="px-4 py-2.5 text-right text-sm tabular-nums">
                        {row.docRecent >= 999 ? "∞" : `${row.docRecent}일`}
                      </td>
                      <td className="px-4 py-2.5 text-right text-sm tabular-nums font-semibold">
                        {row.docSeason >= 999 ? "∞" : `${row.docSeason}일`}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <StatusBadge status={row.status} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
