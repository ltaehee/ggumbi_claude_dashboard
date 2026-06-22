/**
 * NaverRankingPage.tsx
 * 네이버 쇼핑 랭킹 분석 페이지 (전면 업그레이드)
 * - 구글 시트 연동 데이터 조회
 * - 브랜드 강조 하이라이트 + 태그 관리 (I열 동기화)
 * - 행 클릭 메모 모달 (H열 업데이트)
 * - 급상승 TOP5 요약 카드
 * - 멀티 선택 트렌드 그래프 (40위 기준선)
 * - 즐겨찾기 상단 고정
 * - 메모리 기반 필터링 (0초 전환)
 */
import { useState, useMemo, useCallback, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Check, ChevronsUpDown, CalendarIcon, Star, StarOff, X } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { toast } from "sonner";

// ─── 색상 팔레트 (멀티 라인 그래프) ─────────────────────────────────────────
const LINE_COLORS = [
  "#6366f1", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6",
  "#06b6d4", "#f97316", "#84cc16", "#ec4899", "#14b8a6",
];

// ─── 타입 ──────────────────────────────────────────────────────────────────────
interface RankingRow {
  rowKey: string;  // 서버에서 생성한 고유 key (superjson 숫자 파싱 우회)
  productCode: string;
  rank: number;
  productName: string | null;
  price: number | null;
  seller: string | null;
  recordedAt: Date;
  prevRank: number | null;
  rankChange: number | null;
  isFavorite: boolean;
  memo: string | null;
  keyword?: string; // 전체 모드에서 키워드 표시용
}

interface BrandKeyword {
  id: string;  // CAST(id AS CHAR) - bigint NaN 방지
  keyword: string;
}

// ─── 순위 변동 배지 ──────────────────────────────────────────────────────────
function RankChangeBadge({ change }: { change: number | null }) {
  // 고정 너비 컨테이너로 감싸서 변동 없는 행과 있는 행의 순위 텍스트 정렬 유지
  return (
    <span className="inline-block w-10 text-center text-xs">
      {change === null || change === 0 ? (
        <span className="text-muted-foreground/40">-</span>
      ) : change > 0 ? (
        <span className="text-emerald-500 font-bold">▲{change}</span>
      ) : (
        <span className="text-red-500 font-bold">▼{Math.abs(change)}</span>
      )}
    </span>
  );
}

// ─── 가격 포맷 ──────────────────────────────────────────────────────────────
function fmtPrice(v: number | null): string {
  if (v === null || v === undefined) return "-";
  return v.toLocaleString("ko-KR") + "원";
}

// ─── 브랜드 매칭 여부 ────────────────────────────────────────────────────────
function isBrandHighlighted(row: RankingRow, brandKeywords: BrandKeyword[]): boolean {
  if (brandKeywords.length === 0) return false;
  const name = (row.productName ?? "").toLowerCase();
  const seller = (row.seller ?? "").toLowerCase();
  return brandKeywords.some((bk) => {
    const kw = bk.keyword.toLowerCase();
    return name.includes(kw) || seller.includes(kw);
  });
}

// ─── 급상승 TOP5 카드 ────────────────────────────────────────────────────────
function TopRisersCard({ keyword, date }: { keyword: string; date?: string }) {
  const { data: risers = [], isLoading } = trpc.naverRanking.getTopRisers.useQuery(
    { keyword, date },
    { enabled: true } // keyword="" 전체도 지원
  );

  if (isLoading) return null;
  if (risers.length === 0) return null;

  return (
    <div className="bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">🚀</span>
        <h3 className="font-bold text-emerald-800 dark:text-emerald-300 text-sm">
          오늘의 급상승 TOP {risers.length}
        </h3>
        <span className="text-xs text-muted-foreground">(전날 대비 순위 상승)</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
        {risers.map((r, i) => (
          <div
            key={r.productCode}
            className="bg-white dark:bg-emerald-950/50 rounded-lg p-3 border border-emerald-100 dark:border-emerald-800"
          >
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                #{i + 1}
              </span>
              <span className="text-emerald-600 dark:text-emerald-400 font-bold text-sm">
                ▲{r.rankChange}
              </span>
            </div>
            <p className="text-xs font-medium line-clamp-2 leading-snug">
              {r.productName ?? r.productCode}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {r.prevRank}위 → {r.todayRank}위
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── 멀티 트렌드 그래프 모달 ─────────────────────────────────────────────────
function MultiTrendModal({
  keyword,
  selectedCodes,
  rows,
  onClose,
}: {
  keyword: string;
  selectedCodes: string[];
  rows: RankingRow[];
  onClose: () => void;
}) {
  const { data: historyMap = {}, isLoading } = trpc.naverRanking.getRankingHistoryMulti.useQuery(
    { keyword, productCodes: selectedCodes, days: 60 },
    { enabled: !!keyword && selectedCodes.length > 0 }
  );

  // 날짜 유니온 + 차트 데이터 구성
  const chartData = useMemo(() => {
    const dateSet = new Set<string>();
    Object.values(historyMap).forEach((arr) => arr.forEach((d) => dateSet.add(d.date)));
    const dates = Array.from(dateSet).sort();

    return dates.map((date) => {
      const point: Record<string, any> = { date };
      for (const code of selectedCodes) {
        const entry = (historyMap[code] ?? []).find((d) => d.date === date);
        point[code] = entry ? (entry.rank > 80 ? 85 : entry.rank) : null;
      }
      return point;
    });
  }, [historyMap, selectedCodes]);

  // 상품명 맵
  const nameMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const row of rows) {
      m[row.productCode] = row.productName ?? row.productCode;
    }
    return m;
  }, [rows]);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="text-base">
            📊 순위 추이 비교
            <span className="text-muted-foreground text-sm ml-2">
              ({selectedCodes.length}개 상품 선택)
            </span>
          </DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="h-72 flex items-center justify-center text-muted-foreground">
            로딩 중...
          </div>
        ) : chartData.length === 0 ? (
          <div className="h-72 flex items-center justify-center text-muted-foreground">
            데이터 없음
          </div>
        ) : (
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 20, right: 40, bottom: 10, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v) => v.slice(5)}
                />
                <YAxis
                  reversed
                  domain={[1, 90]}
                  ticks={[1, 10, 20, 30, 40, 50, 60, 70, 80, 85]}
                  tickFormatter={(v) => (v === 85 ? "권외" : `${v}위`)}
                  tick={{ fontSize: 10 }}
                  width={48}
                />
                <Tooltip
                  formatter={(value: any, name: string) => [
                    value === 85 ? "권외" : `${value}위`,
                    nameMap[name] ?? name,
                  ]}
                  labelFormatter={(label) => `날짜: ${label}`}
                />
                <Legend
                  formatter={(value) =>
                    (nameMap[value] ?? value).slice(0, 20)
                  }
                />
                {/* 1페이지 마지노선 */}
                <ReferenceLine
                  y={40}
                  stroke="#ef4444"
                  strokeDasharray="6 3"
                  label={{
                    value: "1페이지 마지노선 (40위)",
                    position: "insideTopRight",
                    fontSize: 10,
                    fill: "#ef4444",
                  }}
                />
                {selectedCodes.map((code, i) => (
                  <Line
                    key={code}
                    type="monotone"
                    dataKey={code}
                    stroke={LINE_COLORS[i % LINE_COLORS.length]}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 5 }}
                    connectNulls={true}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          * Y축은 1위가 위쪽. 빨간 점선은 1페이지 마지노선(40위). "권외"는 80위 초과.
        </p>
      </DialogContent>
    </Dialog>
  );
}

// ─── 단일 상품 트렌드 그래프 모달 ────────────────────────────────────────────
function SingleTrendModal({
  keyword,
  productCode,
  productName,
  onClose,
}: {
  keyword: string;
  productCode: string;
  productName: string | null;
  onClose: () => void;
}) {
  const { data, isLoading } = trpc.naverRanking.getRankingHistory.useQuery(
    { keyword, productCode, days: 60 },
    { enabled: !!keyword && !!productCode }
  );

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.map((d) => ({
      date: d.date,
      rank: d.rank > 80 ? 85 : d.rank,
      rawRank: d.rank,
      price: d.price,
    }));
  }, [data]);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-base">
            📈 순위 추이 — {productName ?? productCode}
            <span className="text-muted-foreground text-sm ml-2">({productCode})</span>
          </DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="h-64 flex items-center justify-center text-muted-foreground">
            로딩 중...
          </div>
        ) : chartData.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-muted-foreground">
            데이터 없음
          </div>
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 20, right: 40, bottom: 10, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => v.slice(5)}
                />
                <YAxis
                  reversed
                  domain={[1, 90]}
                  ticks={[1, 10, 20, 30, 40, 50, 60, 70, 80, 85]}
                  tickFormatter={(v) => (v === 85 ? "권외" : `${v}위`)}
                  tick={{ fontSize: 11 }}
                  width={48}
                />
                <Tooltip
                  formatter={(value: any) => [value === 85 ? "권외" : `${value}위`, "순위"]}
                  labelFormatter={(label) => `날짜: ${label}`}
                />
                <ReferenceLine
                  y={40}
                  stroke="#ef4444"
                  strokeDasharray="6 3"
                  label={{
                    value: "1페이지 마지노선 (40위)",
                    position: "insideTopRight",
                    fontSize: 11,
                    fill: "#ef4444",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="rank"
                  stroke="#6366f1"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "#6366f1" }}
                  activeDot={{ r: 6 }}
                  connectNulls={true}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        <p className="text-xs text-muted-foreground mt-1">
          * Y축은 1위가 위쪽. 빨간 점선은 1페이지 마지노선(40위).
        </p>
      </DialogContent>
    </Dialog>
  );
}

// ─── 단일 상품 트렌드 그래프 (인라인 섹션용) ────────────────────────────────
function SingleTrendInline({
  keyword,
  productCode,
  productName,
}: {
  keyword: string;
  productCode: string;
  productName: string | null;
}) {
  const { data, isLoading } = trpc.naverRanking.getRankingHistory.useQuery(
    { keyword, productCode, days: 60 },
    { enabled: !!keyword && !!productCode }
  );

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.map((d) => ({
      date: d.date,
      rank: d.rank > 80 ? 85 : d.rank,
      rawRank: d.rank,
    }));
  }, [data]);

  if (isLoading) return <div className="h-72 flex items-center justify-center text-muted-foreground">로딩 중...</div>;
  if (chartData.length === 0) return <div className="h-72 flex items-center justify-center text-muted-foreground">데이터 없음</div>;

  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 20, right: 40, bottom: 10, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
          <YAxis
            reversed
            domain={[1, 90]}
            ticks={[1, 10, 20, 30, 40, 50, 60, 70, 80, 85]}
            tickFormatter={(v) => (v === 85 ? "권외" : `${v}위`)}
            tick={{ fontSize: 11 }}
            width={48}
          />
          <Tooltip
            formatter={(value: any) => [value === 85 ? "권외" : `${value}위`, "순위"]}
            labelFormatter={(label) => `날짜: ${label}`}
          />
          <ReferenceLine
            y={40}
            stroke="#ef4444"
            strokeDasharray="6 3"
            label={{ value: "1페이지 마지노선 (40위)", position: "insideTopRight", fontSize: 11, fill: "#ef4444" }}
          />
          <Line
            type="monotone"
            dataKey="rank"
            stroke="#6366f1"
            strokeWidth={2}
            dot={{ r: 3, fill: "#6366f1" }}
            activeDot={{ r: 6 }}
            connectNulls={true}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── 멀티 트렌드 그래프 (인라인 섹션용) ──────────────────────────────────────
function MultiTrendInline({
  keyword,
  selectedCodes,
  rows,
}: {
  keyword: string;
  selectedCodes: string[];
  rows: RankingRow[];
}) {
  const { data: historyMap = {}, isLoading } = trpc.naverRanking.getRankingHistoryMulti.useQuery(
    { keyword, productCodes: selectedCodes, days: 60 },
    { enabled: !!keyword && selectedCodes.length > 0 }
  );

  const chartData = useMemo(() => {
    const dateSet = new Set<string>();
    Object.values(historyMap).forEach((arr) => arr.forEach((d) => dateSet.add(d.date)));
    const dates = Array.from(dateSet).sort();
    return dates.map((date) => {
      const point: Record<string, any> = { date };
      for (const code of selectedCodes) {
        const entry = (historyMap[code] ?? []).find((d) => d.date === date);
        point[code] = entry ? (entry.rank > 80 ? 85 : entry.rank) : null;
      }
      return point;
    });
  }, [historyMap, selectedCodes]);

  const nameMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const row of rows) m[row.productCode] = row.productName ?? row.productCode;
    return m;
  }, [rows]);

  if (isLoading) return <div className="h-80 flex items-center justify-center text-muted-foreground">로딩 중...</div>;
  if (chartData.length === 0) return <div className="h-80 flex items-center justify-center text-muted-foreground">데이터 없음</div>;

  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 20, right: 40, bottom: 10, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => v.slice(5)} />
          <YAxis
            reversed
            domain={[1, 90]}
            ticks={[1, 10, 20, 30, 40, 50, 60, 70, 80, 85]}
            tickFormatter={(v) => (v === 85 ? "권외" : `${v}위`)}
            tick={{ fontSize: 10 }}
            width={48}
          />
          <Tooltip
            formatter={(value: any, name: string) => [value === 85 ? "권외" : `${value}위`, nameMap[name] ?? name]}
            labelFormatter={(label) => `날짜: ${label}`}
          />
          <Legend formatter={(value) => (nameMap[value] ?? value).slice(0, 20)} />
          <ReferenceLine
            y={40}
            stroke="#ef4444"
            strokeDasharray="6 3"
            label={{ value: "1페이지 마지노선 (40위)", position: "insideTopRight", fontSize: 10, fill: "#ef4444" }}
          />
          {selectedCodes.map((code, i) => (
            <Line
              key={code}
              type="monotone"
              dataKey={code}
              stroke={LINE_COLORS[i % LINE_COLORS.length]}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 5 }}
              connectNulls={true}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── 메모 모달 ──────────────────────────────────────────────────────────────
function MemoModal({
  keyword,
  row,
  targetDate,
  onClose,
}: {
  keyword: string;
  row: RankingRow;
  targetDate: string;
  onClose: () => void;
}) {
  const [memo, setMemo] = useState(row.memo ?? "");
  const utils = trpc.useUtils();

  const upsertMemo = trpc.naverRanking.upsertMemo.useMutation({
    onSuccess: (res: any) => {
      utils.naverRanking.getRankings.invalidate();
      const sheetMsg = res.sheetUpdated ? " (시트 H열도 업데이트됨)" : "";
      toast.success(`메모가 저장되었습니다.${sheetMsg}`);
      onClose();
    },
    onError: () => toast.error("메모 저장 실패"),
  });

  const deleteMemo = trpc.naverRanking.deleteMemo.useMutation({
    onSuccess: () => {
      utils.naverRanking.getRankings.invalidate();
      toast.success("메모가 삭제되었습니다.");
      onClose();
    },
  });

  const recordedAtStr = row.recordedAt
    ? new Date(row.recordedAt).toLocaleString("ko-KR")
    : targetDate;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>📝 메모 기록하기</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="bg-muted/40 rounded-lg p-3 text-sm space-y-1">
            <p className="text-muted-foreground text-xs">일시</p>
            <p className="font-medium">{recordedAtStr}</p>
            <p className="text-muted-foreground text-xs mt-2">상품명</p>
            <p className="font-medium line-clamp-2">
              {row.productName ?? row.productCode}
            </p>
            <p className="text-muted-foreground text-xs mt-1">
              {row.productCode} · {row.rank}위
            </p>
          </div>
          <Textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="메모를 입력하세요... (저장 시 구글 시트 H열에도 반영됩니다)"
            rows={4}
          />
        </div>
        <DialogFooter className="gap-2">
          {row.memo && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => deleteMemo.mutate({ keyword, productCode: row.productCode })}
              disabled={deleteMemo.isPending}
            >
              삭제
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onClose}>
            취소
          </Button>
          <Button
            size="sm"
            onClick={() =>
              upsertMemo.mutate({
                keyword,
                productCode: row.productCode,
                memo,
                recordedDate: targetDate,
              })
            }
            disabled={upsertMemo.isPending || !memo.trim()}
          >
            💾 메모 저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── 브랜드 태그 관리 패널 ────────────────────────────────────────────────────
function BrandKeywordsPanel({
  brandKeywords,
  onAdd,
  onRemove,
  isAdding,
}: {
  brandKeywords: BrandKeyword[];
  onAdd: (kw: string) => void;
  onRemove: (id: string) => void;
  isAdding: boolean;
}) {
  const [input, setInput] = useState("");

  const handleAdd = () => {
    const kw = input.trim();
    if (!kw) return;
    onAdd(kw);
    setInput("");
  };

  return (
    <div className="bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-base">🎨</span>
        <h3 className="font-bold text-amber-800 dark:text-amber-300 text-sm">
          브랜드 강조 키워드 관리
        </h3>
        <span className="text-xs text-muted-foreground">(상품명/판매처 매칭 시 노란 하이라이트)</span>
      </div>
      <div className="flex flex-wrap gap-2 mb-3">
        {brandKeywords.map((bk, index) => (
          <span
            key={`bk-${bk.keyword || index}-${index}`}
            className="inline-flex items-center gap-1 bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700 rounded-full px-3 py-1 text-xs font-medium"
          >
            {bk.keyword}
            <button
              onClick={() => onRemove(bk.id)}
              className="ml-0.5 text-amber-600 hover:text-red-500 transition-colors cursor-pointer"
              title="삭제"
            >
              ✕
            </button>
          </span>
        ))}
        {brandKeywords.length === 0 && (
          <span className="text-xs text-muted-foreground">등록된 브랜드 키워드가 없습니다.</span>
        )}
      </div>
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          placeholder="브랜드 키워드 입력 (예: 꿈비)"
          className="h-8 text-sm max-w-xs"
        />
        <Button
          size="sm"
          className="h-8 bg-amber-600 hover:bg-amber-700 text-white cursor-pointer"
          onClick={handleAdd}
          disabled={isAdding || !input.trim()}
        >
          + 추가
        </Button>
      </div>
    </div>
  );
}

// ─── 즐겨찾기 관리 모달 ─────────────────────────────────────────────────────────
function FavoriteManagerModal({ onClose }: { onClose: () => void }) {
  const utils = trpc.useUtils();
  const { data: favorites = [], isLoading } = trpc.naverRanking.getFavoriteList.useQuery();
  const [searchQ, setSearchQ] = useState("");
  const [selectedKeyword, setSelectedKeyword] = useState("");
  const [kwComboOpen, setKwComboOpen] = useState(false);
  const { data: keywords = [] } = trpc.naverRanking.getKeywords.useQuery();

  const { data: searchResults = [] } = trpc.naverRanking.searchProducts.useQuery(
    { keyword: selectedKeyword, query: searchQ, limit: 20 },
    { enabled: searchQ.trim().length >= 1 }
  );

  const toggleFav = trpc.naverRanking.toggleFavorite.useMutation({
    onSuccess: () => {
      utils.naverRanking.getFavoriteList.invalidate();
      utils.naverRanking.getRankings.invalidate();
      utils.naverRanking.getAllFavorites.invalidate();
    },
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>⭐ 즐겨찾기 관리</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 overflow-hidden flex-1">
          {/* 상품 검색 추가 */}
          <div className="bg-muted/30 rounded-lg p-3 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">상품 검색하여 즐겨찾기 추가</p>
            <div className="flex gap-2">
              <Popover open={kwComboOpen} onOpenChange={setKwComboOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" className="w-36 h-8 justify-between text-xs cursor-pointer">
                    <span className="truncate">{selectedKeyword || "키워드(전체)"}</span>
                    <ChevronsUpDown className="ml-1 h-3 w-3 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-40 p-0" align="start">
                  <Command>
                    <CommandInput placeholder="키워드 검색..." className="h-7 text-xs" />
                    <CommandList>
                      <CommandEmpty>없음</CommandEmpty>
                      <CommandGroup>
                        <CommandItem value="" onSelect={() => { setSelectedKeyword(""); setKwComboOpen(false); }} className="text-xs cursor-pointer">
                          <Check className={`mr-1.5 h-3 w-3 ${selectedKeyword === "" ? "opacity-100" : "opacity-0"}`} />
                          전체
                        </CommandItem>
                        {keywords.map((kw) => (
                          <CommandItem key={kw} value={kw} onSelect={() => { setSelectedKeyword(kw); setKwComboOpen(false); }} className="text-xs cursor-pointer">
                            <Check className={`mr-1.5 h-3 w-3 ${selectedKeyword === kw ? "opacity-100" : "opacity-0"}`} />
                            {kw}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              <Input
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                placeholder="상품명 또는 상품코드 검색..."
                className="h-8 text-xs flex-1"
              />
            </div>
            {searchQ.trim().length >= 1 && (
              <div className="max-h-40 overflow-y-auto space-y-1">
                {searchResults.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2 text-center">검색 결과 없음</p>
                ) : (
                  searchResults.map((item) => (
                    <div key={item.productCode} className="flex items-center justify-between py-1 px-2 rounded hover:bg-muted/50">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {item.isFavorite && <Star className="h-3 w-3 text-amber-400 shrink-0" />}
                        <span className="text-xs truncate">{item.productName ?? item.productCode}</span>
                        <span className="text-xs text-muted-foreground shrink-0">[{item.seller ?? "-"}]</span>
                      </div>
                      <Button
                        size="sm"
                        variant={item.isFavorite ? "outline" : "default"}
                        className="h-6 text-xs px-2 ml-2 shrink-0 cursor-pointer"
                        onClick={() => toggleFav.mutate({ productCode: item.productCode, productName: item.productName ?? undefined })}
                      >
                        {item.isFavorite ? "해제" : "+ 추가"}
                      </Button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* 현재 즐겨찾기 목록 */}
          <div className="flex-1 overflow-hidden flex flex-col">
            <p className="text-xs font-semibold text-muted-foreground mb-2">현재 즐겨찾기 ({favorites.length}개)</p>
            {isLoading ? (
              <p className="text-xs text-muted-foreground">로딩 중...</p>
            ) : favorites.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">즐겨찾기한 상품이 없습니다.</p>
            ) : (
              <div className="overflow-y-auto flex-1 space-y-1">
                {favorites.map((fav) => (
                  <div key={fav.productCode} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/30">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <Star className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                      <span className="text-sm truncate">{fav.productName ?? fav.productCode}</span>
                      <span className="text-xs text-muted-foreground font-mono shrink-0">{fav.productCode}</span>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-red-500 cursor-pointer"
                      onClick={() => toggleFav.mutate({ productCode: fav.productCode })}
                      title="즐겨찾기 해제"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>닫기</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── 전체 리스트 탭 컴포넌트 ─────────────────────────────────────────────────────
interface RankingListTabProps {
  keyword: string;
  keywords: string[];
  selectedKeyword: string;
  setSelectedKeyword: (v: string) => void;
  selectedDate: string | undefined;
  setSelectedDate: (v: string | undefined) => void;
  dates: string[];
  rows: RankingRow[];
  isLoading: boolean;
  rankingData: any;
  searchText: string;
  setSearchText: (v: string) => void;
  showFavOnly: boolean;
  setShowFavOnly: (v: (prev: boolean) => boolean) => void;
  showBrandOnly: boolean;
  setShowBrandOnly: (v: (prev: boolean) => boolean) => void;
  brandKeywords: any[];
  selectedCodes: string[];
  setSelectedCodes: (v: string[]) => void;
  toggleCode: (code: string) => void;
  toggleFav: any;
  setMemoTarget: (row: RankingRow | null) => void;
  targetDate: string;
}

function RankingListTab({
  keyword, keywords, selectedKeyword, setSelectedKeyword,
  selectedDate, setSelectedDate, dates,
  rows, isLoading, rankingData,
  searchText, setSearchText,
  showFavOnly, setShowFavOnly,
  showBrandOnly, setShowBrandOnly,
  brandKeywords, selectedCodes, setSelectedCodes,
  toggleCode, toggleFav, setMemoTarget, targetDate,
}: RankingListTabProps) {
  const [kwComboOpen, setKwComboOpen] = useState(false);
  const [dateCalOpen, setDateCalOpen] = useState(false);

  // 날짜 목록을 Date 객체로 변환 (캘린더 비활성화용)
  const availableDates = useMemo(() => new Set(dates), [dates]);

  // 선택된 날짜를 Date 객체로
  const calDate = useMemo(() => {
    if (!selectedDate) return undefined;
    const d = new Date(selectedDate + "T00:00:00");
    return isNaN(d.getTime()) ? undefined : d;
  }, [selectedDate]);

  // 표시할 행 (최대 200개)
  const displayRows = useMemo(() => rows.slice(0, 200), [rows]);

  return (
    <div className="space-y-4">
      {/* 필터 바 */}
      <div className="flex flex-wrap gap-3 items-center bg-card border border-border rounded-xl p-4">
        {/* 키워드 선택 */}
        <div className="flex flex-col gap-1 min-w-[200px]">
          <label className="text-xs text-muted-foreground font-medium">키워드</label>
          <Popover open={kwComboOpen} onOpenChange={setKwComboOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={kwComboOpen}
                className="h-9 w-full justify-between font-normal"
              >
                <span className="truncate">{keyword === "" ? "전체" : keyword}</span>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[240px] p-0" align="start">
              <Command>
                <CommandInput placeholder="키워드 검색..." />
                <CommandList>
                  <CommandEmpty>키워드를 찾을 수 없습니다.</CommandEmpty>
                  <CommandGroup>
                    <CommandItem
                      value=""
                      onSelect={() => {
                        setSelectedKeyword("");
                        setSelectedDate(undefined);
                        setSelectedCodes([]);
                        setKwComboOpen(false);
                      }}
                    >
                      <Check className={`mr-2 h-4 w-4 ${keyword === "" ? "opacity-100" : "opacity-0"}`} />
                      전체
                    </CommandItem>
                    {keywords.map((k, i) => (
                      <CommandItem
                        key={k || `kw-${i}`}
                        value={k}
                        onSelect={(v) => {
                          setSelectedKeyword(v);
                          setSelectedDate(undefined);
                          setSelectedCodes([]);
                          setKwComboOpen(false);
                        }}
                      >
                        <Check className={`mr-2 h-4 w-4 ${keyword === k ? "opacity-100" : "opacity-0"}`} />
                        {k}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        {/* 날짜 선택 (캘린더 Popover + 전체 옵션) */}
        <div className="flex flex-col gap-1 min-w-[180px]">
          <label className="text-xs text-muted-foreground font-medium">조회 날짜</label>
          <Popover open={dateCalOpen} onOpenChange={setDateCalOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="h-9 w-full justify-start gap-2 font-normal"
              >
                <CalendarIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="truncate">
                  {selectedDate ? selectedDate : "전체 (최신)"}
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <div className="p-2 border-b border-border">
                <Button
                  variant={!selectedDate ? "default" : "ghost"}
                  size="sm"
                  className="w-full h-8 text-xs cursor-pointer"
                  onClick={() => {
                    setSelectedDate(undefined);
                    setDateCalOpen(false);
                  }}
                >
                  전체 (최신 날짜 자동 선택)
                </Button>
              </div>
              <Calendar
                mode="single"
                selected={calDate}
                onSelect={(d) => {
                  if (!d) return;
                  const str = d.toISOString().slice(0, 10);
                  if (availableDates.has(str)) {
                    setSelectedDate(str);
                    setDateCalOpen(false);
                  }
                }}
                modifiers={{
                  available: dates.map((d) => new Date(d + "T00:00:00")),
                }}
                modifiersClassNames={{
                  available: "font-bold text-foreground",
                }}
                disabled={(d) => {
                  const str = d.toISOString().slice(0, 10);
                  return !availableDates.has(str);
                }}
                initialFocus
              />
              <div className="p-2 border-t border-border text-xs text-muted-foreground text-center">
                굵은 날짜만 선택 가능합니다
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* 검색 */}
        <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
          <label className="text-xs text-muted-foreground font-medium">검색</label>
          <Input
            placeholder="상품명, 상품코드, 판매처 검색..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="h-9"
          />
        </div>

        {/* 필터 버튼들 */}
        <div className="flex flex-col gap-1 justify-end">
          <label className="text-xs text-muted-foreground font-medium invisible">필터</label>
          <div className="flex gap-2">
            <Button
              variant={showFavOnly ? "default" : "outline"}
              size="sm"
              onClick={() => setShowFavOnly((v) => !v)}
              className="h-9 cursor-pointer"
            >
              ⭐ 즐겨찾기만
            </Button>
            <Button
              variant={showBrandOnly ? "default" : "outline"}
              size="sm"
              onClick={() => setShowBrandOnly((v) => !v)}
              className={[
                "h-9 cursor-pointer",
                showBrandOnly ? "bg-amber-500 hover:bg-amber-600 border-amber-500 text-white" : "",
              ].join(" ")}
            >
              ☑️ 강조 브랜드만
            </Button>
          </div>
        </div>
      </div>

      {/* 날짜 정보 */}
      {rankingData && (
        <div className="text-sm text-muted-foreground flex items-center gap-3">
          <span>조회 날짜: <strong>{rankingData.date}</strong></span>
          {rankingData.prevDate && (
            <span>(전날 비교: {rankingData.prevDate})</span>
          )}
          <span className="text-foreground font-medium">총 {displayRows.length}개 항목{rows.length > 200 ? ` (전체 ${rows.length}개 중 200개 표시)` : ""}</span>
        </div>
      )}

      {/* 랭킹 테이블 */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto max-h-[calc(100vh-280px)] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="bg-muted/90 border-b border-border backdrop-blur-sm">
                <th className="text-left px-2 py-3 font-semibold text-muted-foreground w-8">⭐</th>
                <th className="text-center px-3 py-3 font-semibold text-muted-foreground w-28">순위</th>
                {!keyword && (
                  <th className="text-left px-3 py-3 font-semibold text-muted-foreground w-24">키워드</th>
                )}
                <th className="text-left px-3 py-3 font-semibold text-muted-foreground">상품명</th>
                <th className="text-left px-3 py-3 font-semibold text-muted-foreground w-28">상품코드</th>
                <th className="text-right px-3 py-3 font-semibold text-muted-foreground w-28">가격</th>
                <th className="text-left px-3 py-3 font-semibold text-muted-foreground w-32">판매처</th>
                <th className="text-left px-3 py-3 font-semibold text-muted-foreground w-32">비고/메모</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={!keyword ? 8 : 7} className="text-center py-12 text-muted-foreground">
                    데이터 로딩 중...
                  </td>
                </tr>
              ) : displayRows.length === 0 ? (
                <tr>
                  <td colSpan={!keyword ? 8 : 7} className="text-center py-12 text-muted-foreground">
                    {!keyword
                      ? "구글 시트 동기화 버튼을 눌러 데이터를 불러오세요."
                      : "해당 조건의 데이터가 없습니다."}
                  </td>
                </tr>
              ) : (
                displayRows.map((row, idx) => {
                  const rowKey = row.rowKey || `ranking-fallback-${idx}`;
                  const isFav = row.isFavorite;
                  const isOutOfRange = row.rank > 80;
                  const isBrand = isBrandHighlighted(row, brandKeywords);

                  return (
                    <tr
                      key={rowKey}
                      className={[
                        "border-b border-border transition-colors cursor-pointer",
                        isBrand
                          ? "bg-amber-50/70 dark:bg-amber-900/15 hover:bg-amber-100/60 dark:hover:bg-amber-900/25"
                          : isFav
                          ? "bg-amber-50/30 dark:bg-amber-900/8 hover:bg-amber-50/50"
                          : idx % 2 === 0
                          ? "bg-background hover:bg-accent/20"
                          : "bg-muted/20 hover:bg-accent/20",
                      ].join(" ")}
                      onClick={() => setMemoTarget(row)}
                    >
                      {/* 즐겨찾기 */}
                      <td className="px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => toggleFav.mutate({ productCode: row.productCode, productName: row.productName })}
                          className="text-lg cursor-pointer hover:scale-110 transition-transform"
                          title={isFav ? "즐겨찾기 해제" : "즐겨찾기 추가"}
                        >
                          {isFav ? "⭐" : "☆"}
                        </button>
                      </td>

                      {/* 순위 */}
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-center gap-0">
                          <span className={["font-bold text-base w-12 text-right", isOutOfRange ? "text-red-500" : "text-foreground"].join(" ")}>
                            {isOutOfRange ? "80위+" : `${row.rank}위`}
                          </span>
                          <RankChangeBadge change={row.rankChange} />
                        </div>
                      </td>

                      {/* 키워드 (전체 모드에서만) */}
                      {!keyword && (
                        <td className="px-3 py-2.5 text-xs font-medium text-indigo-600 dark:text-indigo-400">
                          {row.keyword ?? "-"}
                        </td>
                      )}

                      {/* 상품명 */}
                      <td className="px-3 py-2.5 max-w-xs">
                        <div className="flex items-center gap-1.5">
                          {isBrand && <span className="text-amber-500 text-xs shrink-0" title="브랜드 강조">🏷️</span>}
                          <span className="line-clamp-2 text-sm leading-snug">{row.productName ?? "-"}</span>
                        </div>
                      </td>

                      {/* 상품코드 */}
                      <td className="px-3 py-2.5 text-muted-foreground font-mono text-xs">{row.productCode}</td>

                      {/* 가격 */}
                      <td className="px-3 py-2.5 text-right font-medium tabular-nums">{fmtPrice(row.price)}</td>

                      {/* 판매처 */}
                      <td className="px-3 py-2.5 text-muted-foreground text-xs max-w-[128px]">
                        <span className="line-clamp-2">{row.seller ?? "-"}</span>
                      </td>

                      {/* 메모 */}
                      <td className="px-3 py-2.5">
                        {row.memo ? (
                          <span className="line-clamp-1 text-foreground text-xs">{row.memo}</span>
                        ) : (
                          <span className="text-muted-foreground/40 text-xs">+ 메모</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 안내 텍스트 */}
      <div className="text-xs text-muted-foreground space-y-1 pb-2">
        <p>• 행을 클릭하면 메모(비고) 기록 모달이 열립니다. 저장 시 구글 시트 H열에도 반영됩니다.</p>
        <p>• 순위 변동(▲▼)은 전날 동일 상품코드와 비교한 수치입니다.</p>
        <p>• 🏷️ 표시는 브랜드 강조 키워드에 매칭된 상품입니다.</p>
        <p>• 최대 200개 항목이 표시됩니다. 검색/필터로 범위를 좁혀보세요.</p>
      </div>
    </div>
  );
}

// ─── 상품별 순위 히스토리 그래프 섹션 (순위 현황 탭 내) ─────────────────────────
function RankingHistoryTab({ keywords: _keywords }: { keywords: string[] }) {
  const [searchComboOpen, setSearchComboOpen] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [selectedItems, setSelectedItems] = useState<{ productCode: string; productName: string | null }[]>([]);
  const [days, setDays] = useState<30 | 60 | 90>(60);
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());

  const { data: allFavorites = [] } = trpc.naverRanking.getAllFavorites.useQuery();

  const { data: searchResults = [] } = trpc.naverRanking.searchProducts.useQuery(
    { keyword: "", query: searchQ, limit: 30 },
    { enabled: searchQ.trim().length >= 1 }
  );

  const productCodes = useMemo(() => selectedItems.map((i) => i.productCode), [selectedItems]);
  const { data: historyByProduct = {}, isLoading: histLoading } = trpc.naverRanking.getRankingHistoryByProduct.useQuery(
    { productCodes, days },
    { enabled: productCodes.length > 0 }
  );

  const { chartData, seriesList } = useMemo(() => {
    const dateSet = new Set<string>();
    const series: { key: string; productCode: string; keyword: string; productName: string | null; color: string }[] = [];
    let colorIdx = 0;

    for (const code of productCodes) {
      const byKeyword = (historyByProduct as Record<string, Record<string, { date: string; rank: number }[]>>)[code] ?? {};
      for (const kw of Object.keys(byKeyword)) {
        const seriesKey = `${code}___${kw}`;
        const productName = selectedItems.find((i) => i.productCode === code)?.productName ?? code;
        series.push({ key: seriesKey, productCode: code, keyword: kw, productName, color: LINE_COLORS[colorIdx % LINE_COLORS.length] });
        colorIdx++;
        for (const d of byKeyword[kw]) dateSet.add(d.date);
      }
    }

    const dates = Array.from(dateSet).sort();
    const data = dates.map((date) => {
      const point: Record<string, unknown> = { date };
      for (const s of series) {
        const byKeyword = (historyByProduct as Record<string, Record<string, { date: string; rank: number }[]>>)[s.productCode] ?? {};
        const entry = (byKeyword[s.keyword] ?? []).find((d) => d.date === date);
        point[s.key] = entry ? (entry.rank > 80 ? 85 : entry.rank) : null;
      }
      return point;
    });

    return { chartData: data, seriesList: series };
  }, [historyByProduct, productCodes, selectedItems]);

  const toggleItem = (item: { productCode: string; productName: string | null }) => {
    setSelectedItems((prev) => {
      const exists = prev.some((i) => i.productCode === item.productCode);
      if (exists) return prev.filter((i) => i.productCode !== item.productCode);
      return [...prev, item];
    });
  };

  const isSelected = (code: string) => selectedItems.some((i) => i.productCode === code);

  const toggleSeries = (key: string) => {
    setHiddenSeries((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const sortedResults = useMemo(() => {
    const favCodes = new Set(allFavorites.map((f) => f.productCode));
    const favs = searchResults.filter((r) => favCodes.has(r.productCode));
    const rest = searchResults.filter((r) => !favCodes.has(r.productCode));
    return [...favs, ...rest];
  }, [searchResults, allFavorites]);

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">상품 추가</span>
            <Popover open={searchComboOpen} onOpenChange={setSearchComboOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-xs cursor-pointer gap-1">
                  + 상품 검색하여 추가
                  <ChevronsUpDown className="h-3 w-3 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[520px] p-0" align="start">
                <Command>
                  <CommandInput
                    placeholder="상품명 또는 상품코드 검색... (즐겨찾기 ⭐ 상단 표시)"
                    value={searchQ}
                    onValueChange={setSearchQ}
                    className="h-9"
                  />
                  <CommandList className="max-h-72">
                    <CommandEmpty>
                      {searchQ.trim().length < 1 && allFavorites.length === 0
                        ? "즐겨찾기한 상품이 없습니다. 상품명을 검색하세요."
                        : "검색 결과 없음"}
                    </CommandEmpty>
                    {searchQ.trim().length < 1 && allFavorites.length > 0 && (
                      <CommandGroup heading="⭐ 즐겨찾기 상품">
                        {allFavorites.map((fav) => {
                          const sel = isSelected(fav.productCode);
                          return (
                            <CommandItem
                              key={fav.productCode}
                              value={`${fav.productCode} ${fav.productName ?? ""}`}
                              onSelect={() => toggleItem({ productCode: fav.productCode, productName: fav.productName ?? null })}
                              className="cursor-pointer"
                            >
                              <Check className={`mr-2 h-3.5 w-3.5 ${sel ? "opacity-100" : "opacity-0"}`} />
                              <Star className="mr-1.5 h-3 w-3 text-amber-400 shrink-0" />
                              <span className="flex-1 truncate text-sm">{fav.productName ?? fav.productCode}</span>
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    )}
                    {searchQ.trim().length >= 1 && sortedResults.length > 0 && (
                      <CommandGroup>
                        {sortedResults.map((item) => {
                          const isFav = allFavorites.some((f) => f.productCode === item.productCode);
                          const sel = isSelected(item.productCode);
                          return (
                            <CommandItem
                              key={item.productCode}
                              value={`${item.productCode} ${item.productName ?? ""}`}
                              onSelect={() => toggleItem({ productCode: item.productCode, productName: item.productName })}
                              className="cursor-pointer"
                            >
                              <Check className={`mr-2 h-3.5 w-3.5 ${sel ? "opacity-100" : "opacity-0"}`} />
                              {isFav && <Star className="mr-1.5 h-3 w-3 text-amber-400 shrink-0" />}
                              <span className="flex-1 truncate text-sm">{item.productName ?? item.productCode}</span>
                              <span className="text-xs text-muted-foreground ml-2 shrink-0">[{item.seller ?? "-"}]</span>
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    )}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">기간</span>
            <div className="flex gap-1">
              {([30, 60, 90] as const).map((d) => (
                <Button key={d} size="sm" variant={days === d ? "default" : "outline"} className="h-8 px-3 text-xs cursor-pointer" onClick={() => setDays(d)}>
                  {d}일
                </Button>
              ))}
            </div>
          </div>

          {selectedItems.length > 0 && (
            <Button size="sm" variant="ghost" className="h-8 text-xs text-muted-foreground cursor-pointer"
              onClick={() => { setSelectedItems([]); setHiddenSeries(new Set()); }}>
              선택 초기화
            </Button>
          )}
        </div>

        {selectedItems.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {selectedItems.map((item, i) => (
              <span
                key={item.productCode}
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium border"
                style={{ borderColor: LINE_COLORS[i % LINE_COLORS.length], color: LINE_COLORS[i % LINE_COLORS.length], backgroundColor: LINE_COLORS[i % LINE_COLORS.length] + "20" }}
              >
                <span className="max-w-[180px] truncate">{item.productName ?? item.productCode}</span>
                <button onClick={() => toggleItem(item)} className="ml-0.5 hover:opacity-70 cursor-pointer">✕</button>
              </span>
            ))}
          </div>
        )}
      </div>

      {productCodes.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 flex flex-col items-center justify-center gap-3 text-center">
          <span className="text-4xl">📈</span>
          <p className="text-muted-foreground text-sm">상품 검색 버튼을 눌러 그래프에 표시할 상품을 추가하세요.</p>
          <p className="text-xs text-muted-foreground">즐겨찾기(⭐) 상품은 검색창을 열면 최상단에 표시됩니다.</p>
          <p className="text-xs text-muted-foreground">동일 상품이 여러 키워드에 있으면 키워드별로 각각 라인이 표시됩니다.</p>
        </div>
      ) : histLoading ? (
        <div className="bg-card border border-border rounded-xl p-12 flex items-center justify-center">
          <div className="text-muted-foreground text-sm">데이터 로딩 중...</div>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-border">
            <h3 className="font-semibold text-sm">📊 상품별 순위 히스토리 — {selectedItems.length}개 상품</h3>
            <p className="text-xs text-muted-foreground">Y축 1위가 위쪽 · 빨간 점선 = 1페이지 마지노선(40위) · 권외 = 80위 초과</p>
          </div>

          {seriesList.length > 0 && (
            <div className="px-5 py-2 border-b border-border flex flex-wrap gap-2 items-center">
              <span className="text-xs text-muted-foreground font-medium">라인 on/off:</span>
              {seriesList.map((s) => {
                const hidden = hiddenSeries.has(s.key);
                const shortName = s.productName && s.productName.length > 20 ? s.productName.slice(0, 20) + "..." : (s.productName ?? s.productCode);
                return (
                  <button
                    key={s.key}
                    onClick={() => toggleSeries(s.key)}
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border transition-all cursor-pointer ${hidden ? "opacity-40" : "opacity-100"}`}
                    style={{ borderColor: s.color, color: hidden ? "var(--muted-foreground)" : s.color, backgroundColor: hidden ? "transparent" : s.color + "20" }}
                  >
                    <span className="inline-block w-3 h-0.5 rounded-full" style={{ backgroundColor: s.color }} />
                    <span className="max-w-[200px] truncate">[{s.keyword}] {shortName}</span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="p-4">
            <div className="overflow-x-auto">
              <div style={{ minWidth: Math.max(600, chartData.length * 40) }}>
                <ResponsiveContainer width="100%" height={400}>
                  <LineChart data={chartData} margin={{ top: 20, right: 30, bottom: 10, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v: string) => v.slice(5)} interval="preserveStartEnd" />
                    <YAxis reversed domain={[1, 90]} ticks={[1, 10, 20, 30, 40, 50, 60, 70, 80, 85]} tickFormatter={(v: number) => (v === 85 ? "권외" : `${v}위`)} tick={{ fontSize: 11 }} width={48} />
                    <Tooltip
                      formatter={(value: unknown, name: string) => {
                        const s = seriesList.find((s) => s.key === name);
                        const label = s ? `[${s.keyword}] ${s.productName && s.productName.length > 25 ? s.productName.slice(0, 25) + "..." : s.productName}` : name;
                        return [value === 85 ? "권외" : `${value}위`, label];
                      }}
                      labelFormatter={(label: string) => `날짜: ${label}`}
                      contentStyle={{ fontSize: 12 }}
                    />
                    <ReferenceLine y={40} stroke="#ef4444" strokeDasharray="6 3" label={{ value: "1페이지 마지노선 (40위)", position: "insideTopRight", fontSize: 11, fill: "#ef4444" }} />
                    {seriesList.map((s) => (
                      <Line
                        key={s.key}
                        type="monotone"
                        dataKey={s.key}
                        stroke={s.color}
                        strokeWidth={hiddenSeries.has(s.key) ? 0 : 2}
                        dot={hiddenSeries.has(s.key) ? false : { r: 3, fill: s.color }}
                        activeDot={hiddenSeries.has(s.key) ? false : { r: 6 }}
                        connectNulls={true}
                        hide={hiddenSeries.has(s.key)}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 메인 페이지 ──────────────────────────────────────────────────────────────
export default function NaverRankingPage() {
  const [selectedKeyword, setSelectedKeyword] = useState<string>(""); // "" = 전체
  const [selectedDate, setSelectedDate] = useState<string | undefined>(undefined);
  const [searchText, setSearchText] = useState("");
  const [showFavOnly, setShowFavOnly] = useState(false);
  const [showBrandOnly, setShowBrandOnly] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [memoTarget, setMemoTarget] = useState<RankingRow | null>(null);
  const [singleChartTarget, setSingleChartTarget] = useState<RankingRow | null>(null);
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
  const [showMultiChart, setShowMultiChart] = useState(false);
  const [keywordComboOpen, setKeywordComboOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"ranking" | "list">("ranking");
  const [showFavManager, setShowFavManager] = useState(false);
  const [dateCalendarOpen, setDateCalendarOpen] = useState(false);

  const utils = trpc.useUtils();

  // 키워드 목록
  const { data: keywords = [] } = trpc.naverRanking.getKeywords.useQuery();
  // selectedKeyword="" 이면 전체 조회
  const keyword = selectedKeyword; // "" = 전체

  // 날짜 목록 (keyword="" 전체도 지원)
  const { data: dates = [] } = trpc.naverRanking.getDates.useQuery(
    { keyword },
    { enabled: true }
  );

  // 첫 진입 시 가장 최신 날짜 자동 선택
  useEffect(() => {
    if (dates.length > 0 && !selectedDate) {
      setSelectedDate(dates[0]);
    }
  }, [dates, selectedDate]);

  // 랭킹 데이터 (keyword="" 전체도 지원)
  const { data: rankingData, isLoading } = trpc.naverRanking.getRankings.useQuery(
    { keyword, date: selectedDate },
    { enabled: true }
  );

  // 마지막 동기화 시각
  const { data: syncInfo } = trpc.naverRanking.getLastSyncedAt.useQuery();

  // 브랜드 키워드
  const { data: rawBrandKeywords = [] } = trpc.naverRanking.getBrandKeywords.useQuery();
  const brandKeywords = rawBrandKeywords.filter((bk) => !!bk.keyword);

  // 즐겨찾기 토글
  const toggleFav = trpc.naverRanking.toggleFavorite.useMutation({
    onSuccess: () => utils.naverRanking.getRankings.invalidate(),
  });

  // 구글 시트 동기화
  const syncMut = trpc.naverRanking.syncFromSheet.useMutation({
    onSuccess: (res: any) => {
      utils.naverRanking.getRankings.invalidate();
      utils.naverRanking.getKeywords.invalidate();
      utils.naverRanking.getDates.invalidate();
      utils.naverRanking.getLastSyncedAt.invalidate();
      utils.naverRanking.getTopRisers.invalidate();
      toast.success(`동기화 완료: ${res.inserted ?? 0}개 처리`);
      setIsSyncing(false);
    },
    onError: () => {
      toast.error("동기화 실패. 다시 시도해 주세요.");
      setIsSyncing(false);
    },
  });

  const handleSync = useCallback(() => {
    setIsSyncing(true);
    syncMut.mutate();
  }, [syncMut]);

  // 브랜드 키워드 추가
  const addBrandKw = trpc.naverRanking.addBrandKeyword.useMutation({
    onSuccess: (res: any) => {
      utils.naverRanking.getBrandKeywords.invalidate();
      if (res.duplicate) toast.info("이미 등록된 키워드입니다.");
      else toast.success("브랜드 키워드가 추가되었습니다.");
    },
    onError: () => toast.error("추가 실패"),
  });

  // 브랜드 키워드 삭제
  const removeBrandKw = trpc.naverRanking.removeBrandKeyword.useMutation({
    onSuccess: () => {
      utils.naverRanking.getBrandKeywords.invalidate();
      toast.success("브랜드 키워드가 삭제되었습니다.");
    },
  });

  const handleRemoveBrandKw = (id: string) => {
    removeBrandKw.mutate({ id }); // string 그대로 전달 - 백엔드에서 CAST 비교
  };

  // 필터링 (순위 순서 유지)
  const rows: RankingRow[] = useMemo(() => {
    if (!rankingData?.rows) return [];
    let filtered = rankingData.rows as RankingRow[];

    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      filtered = filtered.filter(
        (r) =>
          r.productCode.toLowerCase().includes(q) ||
          (r.productName ?? "").toLowerCase().includes(q) ||
          (r.seller ?? "").toLowerCase().includes(q)
      );
    }
    if (showFavOnly) {
      filtered = filtered.filter((r) => r.isFavorite);
    }
    if (showBrandOnly) {
      filtered = filtered.filter((r) => isBrandHighlighted(r, brandKeywords));
    }

    return filtered;
  }, [rankingData, searchText, showFavOnly, showBrandOnly, brandKeywords]);

  // 체크박스 토글
  const toggleCode = useCallback((code: string) => {
    setSelectedCodes((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  }, []);

  const lastSync = syncInfo?.lastSyncedAt
    ? new Date(syncInfo.lastSyncedAt).toLocaleString("ko-KR")
    : "없음";

  const targetDate = rankingData?.date ?? "";

  return (
    <AppLayout title="네이버 랭킹 분석" subtitle="구글 시트 연동 상품 순위 모니터링">
      <div className="space-y-4">
        {/* ─── 헤더 ─────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">네이버 랭킹 분석</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              구글 시트 연동 · 마지막 동기화: {lastSync}
            </p>
          </div>
          <Button
            onClick={handleSync}
            disabled={isSyncing}
            className="bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
            size="sm"
          >
            {isSyncing ? "동기화 중..." : "🔄 구글 시트 동기화"}
          </Button>
        </div>

        {/* ─── 탭 전환 + 즐겨찾기 관리 버튼 ──────────────────────────────── */}
        <div className="flex items-center justify-between gap-3">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "ranking" | "list")}>
            <TabsList className="grid w-full max-w-xs grid-cols-2 h-9">
              <TabsTrigger value="ranking" className="text-sm cursor-pointer">📊 순위 현황</TabsTrigger>
              <TabsTrigger value="list" className="text-sm cursor-pointer">📋 전체 리스트</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFavManager(true)}
            className="h-8 text-xs cursor-pointer gap-1.5"
          >
            <Star className="h-3.5 w-3.5 text-amber-400" />
            즐겨찾기 관리
          </Button>
        </div>

        {/* ─── 전체 리스트 탭 콘텐츠 ───────────────────────────────────────── */}
        {activeTab === "list" && (
          <RankingListTab
            keyword={keyword}
            keywords={keywords}
            selectedKeyword={selectedKeyword}
            setSelectedKeyword={setSelectedKeyword}
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            dates={dates}
            rows={rows}
            isLoading={isLoading}
            rankingData={rankingData}
            searchText={searchText}
            setSearchText={setSearchText}
            showFavOnly={showFavOnly}
            setShowFavOnly={setShowFavOnly}
            showBrandOnly={showBrandOnly}
            setShowBrandOnly={setShowBrandOnly}
            brandKeywords={brandKeywords}
            selectedCodes={selectedCodes}
            setSelectedCodes={setSelectedCodes}
            toggleCode={toggleCode}
            toggleFav={toggleFav}
            setMemoTarget={setMemoTarget}
            targetDate={targetDate}
          />
        )}

        {/* ─── 순위 현황 탭 콘텐츠 (Top5 + 브랜드 + 그래프) ──────────────── */}
        {activeTab === "ranking" && (
          <>

        {/* ─── 급상승 TOP5 카드 ─────────────────────────────────────────── */}
        <TopRisersCard keyword={keyword} date={selectedDate} />

        {/* ─── 브랜드 태그 관리 ─────────────────────────────────────────── */}
        <BrandKeywordsPanel
          brandKeywords={brandKeywords}
          onAdd={(kw) => addBrandKw.mutate({ keyword: kw })}
          onRemove={handleRemoveBrandKw}
          isAdding={addBrandKw.isPending}
        />

        {/* ─── 상품별 순위 히스토리 그래프 ──────────────────────────────── */}
        <RankingHistoryTab keywords={keywords} />

        {/* ─── 메모 모달 ──────────────────────────────────────────────────── */}
        {memoTarget && (
          <MemoModal
            keyword={keyword}
            row={memoTarget}
            targetDate={targetDate}
            onClose={() => setMemoTarget(null)}
          />
        )}
          </>
        )}
        {/* ─── 즐겨찾기 관리 모달 ──────────────────────────────────────── */}
        {showFavManager && (
          <FavoriteManagerModal onClose={() => setShowFavManager(false)} />
        )}
      </div>
    </AppLayout>
  );
}
