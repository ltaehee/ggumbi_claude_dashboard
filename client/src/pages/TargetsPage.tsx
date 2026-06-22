import { useState, useMemo, useRef } from "react";
import { AppLayout } from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { fmtAmt, fmtAchieve, fmtDate } from "@/lib/format";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { TrendingUp, Target, Calendar, Zap, RefreshCw, Search, X, Info, ChevronDown } from "lucide-react";
import { DeltaBadge } from "@/components/DeltaBadge";
import { useFilters } from "@/contexts/FilterContext";

const MONTHS = ["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"];

function AchieveBadge({ pct }: { pct: number }) {
  if (pct >= 100) return <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-200 text-xs">{fmtAchieve(pct)} 달성</Badge>;
  if (pct >= 80) return <Badge className="bg-amber-500/15 text-amber-600 border-amber-200 text-xs">{fmtAchieve(pct)}</Badge>;
  return <Badge className="bg-red-500/15 text-red-600 border-red-200 text-xs">{fmtAchieve(pct)}</Badge>;
}

// ─── 행사 타입 ────────────────────────────────────────────────────────────────
type PromoItem = {
  id: number;
  eventName?: string | null;
  channel?: string | null;
  dept?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  targetAmt?: number | null;
  achievedAmt?: number | null;
  note?: string | null;
  notionPageId?: string | null;
};

// ─── 상세 조회 전용 모달 (Read-only) ─────────────────────────────────────────
function PromoDetailModal({
  promos,
  open,
  onClose,
  title,
}: {
  promos: PromoItem[];
  open: boolean;
  onClose: () => void;
  title?: string;
}) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const prevPromosRef = useRef<PromoItem[]>([]);

  // promos가 바뀔 때마다 selectedIdx를 0으로 리셋
  if (prevPromosRef.current !== promos) {
    prevPromosRef.current = promos;
    if (selectedIdx !== 0) setSelectedIdx(0);
  }

  // useMemo는 early return 이전에 항상 호출 (Hooks 규칙 준수)
  const promo = promos[selectedIdx] ?? promos[0] ?? null;

  const noteFields = useMemo(() => {
    if (!promo?.note) return [];
    return promo.note.split(" | ").map((part) => {
      const idx = part.indexOf(": ");
      if (idx === -1) return { label: "비고", value: part };
      return { label: part.slice(0, idx), value: part.slice(idx + 2) };
    });
  }, [promo?.note]);

  const achievePct = (promo?.targetAmt ?? 0) > 0
    ? ((promo?.achievedAmt ?? 0) / (promo?.targetAmt ?? 1)) * 100
    : 0;

  if (!promo) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Info className="h-4 w-4 text-primary shrink-0" />
            {title ?? "행사 상세 조회"}
            <Badge variant="outline" className="ml-auto text-[10px] text-muted-foreground border-muted-foreground/30">
              Read-only
            </Badge>
          </DialogTitle>
        </DialogHeader>

        {/* 여러 행사가 있을 때 탭 선택 */}
        {promos.length > 1 && (
          <div className="flex flex-wrap gap-1.5 pb-2 border-b border-border">
            {promos.map((p, i) => (
              <button
                key={i}
                onClick={() => setSelectedIdx(i)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                  i === selectedIdx
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {p.eventName ?? `행사 ${i + 1}`}
              </button>
            ))}
          </div>
        )}

        {/* 행사 상세 정보 */}
        <div className="space-y-3 py-1">
          {/* 행사명 */}
          <div>
            <p className="text-[11px] text-muted-foreground mb-0.5">행사명</p>
            <p className="text-sm font-semibold text-foreground leading-snug">{promo.eventName ?? "—"}</p>
          </div>

          <Separator />

          {/* 채널 + 브랜드 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[11px] text-muted-foreground mb-0.5">채널</p>
              <p className="text-sm font-medium">{promo.channel ?? "—"}</p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground mb-0.5">브랜드</p>
              <p className="text-sm font-medium">{promo.dept ?? "—"}</p>
            </div>
          </div>

          {/* 기간 */}
          <div>
            <p className="text-[11px] text-muted-foreground mb-0.5">행사 기간</p>
            <p className="text-sm font-medium">
              {promo.startDate ? fmtDate(promo.startDate) : "—"}
              {promo.endDate && promo.endDate !== promo.startDate ? ` ~ ${fmtDate(promo.endDate)}` : ""}
            </p>
          </div>

          <Separator />

          {/* 목표/달성 금액 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[11px] text-muted-foreground mb-0.5">매출 목표</p>
              <p className="text-base font-bold tabular-nums text-foreground">{fmtAmt(promo.targetAmt ?? 0)}</p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground mb-0.5">달성 매출</p>
              <p className="text-base font-bold tabular-nums text-emerald-600">{fmtAmt(promo.achievedAmt ?? 0)}</p>
            </div>
          </div>

          {/* 달성률 프로그레스 */}
          {(promo.targetAmt ?? 0) > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-[11px] text-muted-foreground">달성률</p>
                <AchieveBadge pct={achievePct} />
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    achievePct >= 100 ? "bg-emerald-500" : achievePct >= 80 ? "bg-amber-500" : "bg-red-500"
                  }`}
                  style={{ width: `${Math.min(achievePct, 100)}%` }}
                />
              </div>
            </div>
          )}

          {/* 노션 note 필드 파싱 */}
          {noteFields.length > 0 && (
            <>
              <Separator />
              <div className="grid grid-cols-2 gap-2">
                {noteFields.map((f, i) => (
                  <div key={i}>
                    <p className="text-[11px] text-muted-foreground mb-0.5">{f.label}</p>
                    <p className="text-xs font-medium">{f.value}</p>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* 노션 연동 표시 */}
          {promo.notionPageId && (
            <div className="flex items-center gap-1.5 pt-1">
              <div className="h-1.5 w-1.5 rounded-full bg-violet-500" />
              <p className="text-[10px] text-muted-foreground">노션 행사관리 DB에서 동기화된 데이터입니다.</p>
            </div>
          )}
        </div>

        {/* 닫기 버튼 */}
        <div className="flex justify-end pt-1">
          <Button variant="outline" size="sm" onClick={onClose}>닫기</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── 날짜별 행사 목록 모달 (+N 클릭 시) ──────────────────────────────────────
function DayPromosModal({
  day, year, month, promos, open, onClose, onSelectPromo,
}: {
  day: number;
  year: number;
  month: number;
  promos: PromoItem[];
  open: boolean;
  onClose: () => void;
  onSelectPromo: (p: PromoItem) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm">
            {year}년 {month}월 {day}일 행사 목록
            <Badge variant="outline" className="ml-2 text-[10px]">{promos.length}건</Badge>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5 max-h-72 overflow-y-auto py-1">
          {promos.map((p, i) => (
            <button
              key={i}
              onClick={() => { onClose(); onSelectPromo(p); }}
              className="w-full text-left rounded-lg border border-border bg-card hover:bg-muted/50 px-3 py-2.5 transition-colors"
            >
              <p className="text-sm font-medium text-foreground leading-snug">{p.eventName ?? "—"}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {p.channel ?? "채널 미지정"} · {p.startDate ? String(p.startDate).slice(5) : "—"} ~ {p.endDate ? String(p.endDate).slice(5) : "—"}
              </p>
            </button>
          ))}
        </div>
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>닫기</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── 메인 페이지 ─────────────────────────────────────────────────────────────
export default function TargetsPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const { filters } = useFilters();
  const dept = "국내사업팀";
  // 프로모션 목록 기간 필터
  const [filterStartFrom, setFilterStartFrom] = useState("");
  const [filterStartTo, setFilterStartTo] = useState("");

  // 상세 조회 모달 상태
  const [detailPromos, setDetailPromos] = useState<PromoItem[]>([]);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTitle, setDetailTitle] = useState<string | undefined>();

  // 날짜별 행사 목록 모달 상태
  const [dayModalOpen, setDayModalOpen] = useState(false);
  const [dayModalDay, setDayModalDay] = useState(0);
  const [dayModalPromos, setDayModalPromos] = useState<PromoItem[]>([]);

  // 프로모션 목록 검색/필터 상태
  const [searchText, setSearchText] = useState("");
  const [filterChannel, setFilterChannel] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all"); // all | upcoming | ongoing | ended

  const utils = trpc.useUtils();

  const deptParam = dept;

  const summaryQuery = trpc.targets.getMonthSummary.useQuery({ dept: deptParam, year, month });
  const promoQuery = trpc.promotions.getByMonth.useQuery({ year, month });

  const summary = summaryQuery.data;

  // 달력 데이터
  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    const startDow = firstDay.getDay();
    const days: (number | null)[] = Array(startDow).fill(null);
    for (let d = 1; d <= lastDay.getDate(); d++) days.push(d);
    return days;
  }, [year, month]);

  const promoMap = useMemo(() => {
    const map = new Map<number, PromoItem[]>();
    if (!promoQuery.data) return map;
    const lastDayOfMonth = new Date(year, month, 0).getDate();
    for (const p of promoQuery.data) {
      if (!p.startDate) continue;
      // 교차월 행사 처리: 이 달 내에서의 시작/종료 일자 계산
      const startDate = new Date(p.startDate);
      const endDate = p.endDate ? new Date(p.endDate) : startDate;
      // 이 달 범위로 클리핑
      const monthStart = new Date(year, month - 1, 1);
      const monthEnd = new Date(year, month - 1, lastDayOfMonth);
      const clippedStart = startDate < monthStart ? monthStart : startDate;
      const clippedEnd = endDate > monthEnd ? monthEnd : endDate;
      // 이 달과 겹치는 날짜에만 표시
      if (clippedStart > monthEnd || clippedEnd < monthStart) continue;
      const startDay = clippedStart.getDate();
      const endDay = clippedEnd.getDate();
      for (let d = startDay; d <= endDay; d++) {
        if (!map.has(d)) map.set(d, []);
        map.get(d)!.push(p as PromoItem);
      }
    }
    return map;
  }, [promoQuery.data, year, month]);

  const lastSyncQuery = trpc.promotions.getLastSyncedAt.useQuery();
  const syncMut = trpc.promotions.syncFromNotion.useMutation({
    onSuccess: (result) => {
      if ((result as any).pending) {
        // 백그라운드 실행 시작 알림
        toast.info("노션 동기화를 백그라운드에서 실행 중입니다. 1시간 주기로 자동 반영됩니다.");
        // 30초 후 데이터 새로고침 (동기화 완료 시점 예상)
        setTimeout(() => {
          utils.promotions.getByMonth.invalidate();
          utils.promotions.getAll.invalidate();
          lastSyncQuery.refetch();
        }, 30_000);
        return;
      }
      utils.promotions.getByMonth.invalidate();
      utils.promotions.getAll.invalidate();
      lastSyncQuery.refetch();
      if (result.errors.length > 0) {
        toast.warning(`노션 동기화 완료 (${result.upserted}개) — 오류: ${result.errors.join(" | ")}`);
      } else {
        toast.success(`노션 동기화 완료: ${result.total}개 행사 중 ${result.upserted}개 반영`);
      }
    },
    onError: (e) => toast.error(`노션 동기화 실패: ${e.message}`),
  });

  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];

  // 상세 조회 모달 열기 (단일 행사)
  const openDetail = (p: PromoItem, title?: string) => {
    setDetailPromos([p]);
    setDetailTitle(title ?? p.eventName ?? "행사 상세");
    setDetailOpen(true);
  };

  // 날짜별 행사 목록 모달 열기
  const openDayModal = (day: number, promos: PromoItem[]) => {
    setDayModalDay(day);
    setDayModalPromos(promos);
    setDayModalOpen(true);
  };

  // 프로모션 목록 필터링
  const allChannels = useMemo(() => {
    const set = new Set<string>();
    (promoQuery.data ?? []).forEach((p) => { if (p.channel) set.add(p.channel); });
    return Array.from(set).sort();
  }, [promoQuery.data]);

  const filteredPromos = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return (promoQuery.data ?? []).filter((p) => {
      // 텍스트 검색
      if (searchText) {
        const q = searchText.toLowerCase();
        const inName = (p.eventName ?? "").toLowerCase().includes(q);
        const inChannel = (p.channel ?? "").toLowerCase().includes(q);
        const inNote = (p.note ?? "").toLowerCase().includes(q);
        if (!inName && !inChannel && !inNote) return false;
      }
      // 채널 필터
      if (filterChannel !== "all" && p.channel !== filterChannel) return false;
      // 상태 필터
      if (filterStatus !== "all") {
        const start = p.startDate ? new Date(p.startDate) : null;
        const end = p.endDate ? new Date(p.endDate) : null;
        if (start) start.setHours(0, 0, 0, 0);
        if (end) end.setHours(23, 59, 59, 999);
        if (filterStatus === "upcoming" && !(start && start > today)) return false;
        if (filterStatus === "ongoing" && !(start && end && start <= today && end >= today)) return false;
        if (filterStatus === "ended" && !(end && end < today)) return false;
      }
      // 기간 필터 (시작일 기준)
      if (filterStartFrom && p.startDate && p.startDate < filterStartFrom) return false;
      if (filterStartTo && p.startDate && p.startDate > filterStartTo) return false;
      return true;
    });
  }, [promoQuery.data, searchText, filterChannel, filterStatus, filterStartFrom, filterStartTo]);

  const hasFilter = searchText || filterChannel !== "all" || filterStatus !== "all" || filterStartFrom || filterStartTo;

  return (
    <AppLayout
      title="프로모션/목표 관리"
      subtitle="월별 행사 목표 달성률 및 프로모션 현황 (Read-only)"
      actions={
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="h-8 text-xs w-24"><SelectValue /></SelectTrigger>
            <SelectContent>
              {years.map((y) => <SelectItem key={y} value={String(y)}>{y}년</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
            <SelectTrigger className="h-8 text-xs w-20"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MONTHS.map((m, i) => <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      }
    >
      <div className="space-y-5">

        {/* ── 달성률 요약 카드 ─────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {summaryQuery.isLoading
            ? Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-xl border border-border bg-card p-4">
                  <Skeleton className="h-3 w-24 mb-3" /><Skeleton className="h-8 w-32 mb-2" /><Skeleton className="h-3 w-20" />
                </div>
              ))
            : (
              <>
                <div className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Target className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">{month}월 행사 목표 달성률</span>
                  </div>
                  <div className="text-2xl font-bold tabular-nums">{fmtAmt(summary?.monthActual)}</div>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(summary?.monthAchievePct ?? 0, 100)}%` }} />
                    </div>
                    <AchieveBadge pct={summary?.monthAchievePct ?? 0} />
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">목표: {fmtAmt(summary?.monthTarget)}</div>
                </div>

                <div className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">YTD 누적 달성률</span>
                  </div>
                  <div className="text-2xl font-bold tabular-nums">{fmtAmt(summary?.ytdActual)}</div>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${Math.min(summary?.ytdAchievePct ?? 0, 100)}%` }} />
                    </div>
                    <AchieveBadge pct={summary?.ytdAchievePct ?? 0} />
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">YTD 목표: {fmtAmt(summary?.ytdTarget)}</div>
                </div>

                <div className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Zap className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">연간 행사 목표 달성률</span>
                  </div>
                  <div className="text-2xl font-bold tabular-nums">{fmtAmt(summary?.annualActual)}</div>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${Math.min(summary?.annualAchievePct ?? 0, 100)}%` }} />
                    </div>
                    <AchieveBadge pct={summary?.annualAchievePct ?? 0} />
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">연간 목표: {fmtAmt(summary?.annualTarget)}</div>
                </div>
              </>
            )}
        </div>

        {/* ── 프로모션 달력 ─────────────────────────────────────────── */}
        <div>
          <div className="rounded-xl border border-border bg-card p-4">

            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">
                  프로모션 달력 — {year}년 {month}월
                </h3>
              </div>
              {/* 노션 동기화 버튼만 유지 (추가 버튼 제거) */}
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1 border-violet-300 text-violet-600 hover:bg-violet-50 dark:border-violet-700 dark:text-violet-400 dark:hover:bg-violet-950"
                onClick={() => syncMut.mutate()}
                disabled={syncMut.isPending}
                title="노션 행사관리 DB에서 최신 데이터를 가져옵니다"
              >
                <RefreshCw className={`h-3 w-3 ${syncMut.isPending ? "animate-spin" : ""}`} />
                {syncMut.isPending ? "동기화 중..." : "노션 동기화"}
              </Button>
            </div>

            {/* 요일 헤더 */}
            <div className="grid grid-cols-7 gap-0.5 text-center mb-1">
              {["일","월","화","수","목","금","토"].map((d) => (
                <div key={d} className="text-xs font-semibold text-muted-foreground py-1">{d}</div>
              ))}
            </div>

            {/* 달력 그리드 */}
            <div className="grid grid-cols-7 gap-0.5">
              {calendarDays.map((day, i) => {
                const promos = day ? (promoMap.get(day) ?? []) : [];
                const isToday = day && year === now.getFullYear() && month === now.getMonth() + 1 && day === now.getDate();
                const hasPromos = promos.length > 0;
                return (
                  <div
                    key={i}
                    className={`rounded p-1.5 min-h-[90px] transition-colors ${
                      day ? "cursor-default" : ""
                    } ${hasPromos ? "bg-primary/10 border border-primary/20" : "hover:bg-muted/30"} ${
                      isToday ? "ring-1 ring-primary" : ""
                    }`}
                  >
                    {day && (
                      <>
                        {/* 날짜 숫자 */}
                        <div className={`font-semibold text-xs mb-0.5 ${isToday ? "text-primary" : "text-foreground"}`}>{day}</div>

                        {/* 행사 타이틀 (최대 2개 표시) */}
                        {promos.slice(0, 2).map((p, j) => (
                          <div
                            key={j}
                            className="text-[10px] text-primary truncate leading-tight bg-primary/20 rounded px-0.5 mt-0.5 cursor-pointer hover:bg-primary/40 transition-colors"
                            title={`${p.eventName} (${p.channel ?? ""})`}
                            onClick={() => openDetail(p, `${year}년 ${month}월 ${day}일 행사`)}
                          >
                            {p.eventName}
                          </div>
                        ))}

                        {/* +N 클릭 가능 버튼 */}
                        {promos.length > 2 && (
                          <button
                            className="text-[10px] text-primary font-semibold mt-0.5 hover:underline cursor-pointer leading-tight"
                            onClick={() => openDayModal(day, promos)}
                          >
                            +{promos.length - 2}건 더보기
                          </button>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            {promoQuery.data && promoQuery.data.length === 0 && (
              <p className="text-xs text-muted-foreground text-center mt-3">
                이 달의 프로모션이 없습니다. 노션 동기화 버튼으로 데이터를 가져오세요.
              </p>
            )}

            {/* 마지막 노션 동기화 시각 */}
            {lastSyncQuery.data?.lastSyncedAt && (
              <p className="text-[10px] text-muted-foreground text-right mt-2">
                마지막 노션 동기화: {new Date(lastSyncQuery.data.lastSyncedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}
              </p>
            )}
          </div>
        </div>

        {/* ── 프로모션 목록 테이블 ─────────────────────────────────────── */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="p-4 border-b border-border">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">프로모션 목록</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {year}년 {month}월 등록된 행사 — 행 클릭 시 상세 조회
                </p>
              </div>
              {hasFilter && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs gap-1 text-muted-foreground"
                  onClick={() => { setSearchText(""); setFilterChannel("all"); setFilterStatus("all"); }}
                >
                  <X className="h-3 w-3" />필터 초기화
                </Button>
              )}
            </div>

            {/* 검색 + 필터 바 */}
            <div className="flex flex-wrap gap-2">
              {/* 텍스트 검색 */}
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  placeholder="행사명, 채널명, 비고 검색..."
                  className="h-8 text-xs pl-8 pr-3"
                />
                {searchText && (
                  <button
                    onClick={() => setSearchText("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>

              {/* 채널 필터 */}
              <Select value={filterChannel} onValueChange={setFilterChannel}>
                <SelectTrigger className="h-8 text-xs w-32">
                  <SelectValue placeholder="채널 전체" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">채널 전체</SelectItem>
                  {allChannels.map((ch) => (
                    <SelectItem key={ch} value={ch}>{ch}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* 상태 필터 */}
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="h-8 text-xs w-28">
                  <SelectValue placeholder="상태 전체" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">상태 전체</SelectItem>
                  <SelectItem value="upcoming">예정</SelectItem>
                  <SelectItem value="ongoing">진행 중</SelectItem>
                  <SelectItem value="ended">종료</SelectItem>
                </SelectContent>
              </Select>

              {/* 기간 필터 */}
              <div className="flex items-center gap-1">
                <span className="text-[11px] text-muted-foreground whitespace-nowrap">시작일</span>
                <Input
                  type="date"
                  value={filterStartFrom}
                  onChange={(e) => setFilterStartFrom(e.target.value)}
                  className="h-8 text-xs w-36"
                />
                <span className="text-[11px] text-muted-foreground">~</span>
                <Input
                  type="date"
                  value={filterStartTo}
                  onChange={(e) => setFilterStartTo(e.target.value)}
                  className="h-8 text-xs w-36"
                />
              </div>
            </div>

            {/* 검색 결과 수 */}
            {hasFilter && (
              <p className="text-[11px] text-muted-foreground mt-2">
                {filteredPromos.length}건 검색됨 (전체 {(promoQuery.data ?? []).length}건)
              </p>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">행사명</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">채널</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">기간</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">목표</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">달성</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">달성률</th>
                  <th className="px-4 py-2.5 font-medium text-muted-foreground">상태</th>
                </tr>
              </thead>
              <tbody>
                {promoQuery.isLoading
                  ? Array.from({ length: 3 }).map((_, i) => (
                      <tr key={i} className="border-b border-border/50">
                        {Array.from({ length: 7 }).map((_, j) => (
                          <td key={j} className="px-4 py-2.5"><Skeleton className="h-4 w-full" /></td>
                        ))}
                      </tr>
                    ))
                  : filteredPromos.length === 0
                    ? (
                      <tr>
                        <td colSpan={7} className="text-center py-10 text-muted-foreground">
                          {hasFilter ? "검색 조건에 맞는 행사가 없습니다." : "이 달의 프로모션 데이터가 없습니다. 노션 동기화 버튼으로 데이터를 가져오세요."}
                        </td>
                      </tr>
                    )
                    : filteredPromos.map((p, i) => {
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        const start = p.startDate ? new Date(p.startDate) : null;
                        const end = p.endDate ? new Date(p.endDate) : null;
                        if (start) start.setHours(0, 0, 0, 0);
                        if (end) end.setHours(23, 59, 59, 999);
                        const isOngoing = start && end && start <= today && end >= today;
                        const isUpcoming = start && start > today;
                        const isEnded = end && end < today;
                        const statusLabel = isOngoing ? "진행 중" : isUpcoming ? "예정" : isEnded ? "종료" : "—";
                        const statusColor = isOngoing
                          ? "text-emerald-600 bg-emerald-500/10"
                          : isUpcoming
                            ? "text-blue-600 bg-blue-500/10"
                            : "text-muted-foreground bg-muted/50";
                        const achievePct = (p.targetAmt ?? 0) > 0 ? ((p.achievedAmt ?? 0) / (p.targetAmt ?? 1)) * 100 : 0;
                        return (
                          <tr
                            key={i}
                            className="border-b border-border/50 hover:bg-muted/40 cursor-pointer transition-colors"
                            onClick={() => openDetail(p as PromoItem)}
                          >
                            <td className="px-4 py-3 font-medium">
                              <div className="flex items-center gap-1.5">
                                {p.notionPageId && (
                                  <div className="h-1.5 w-1.5 rounded-full bg-violet-500 shrink-0" title="노션 동기화 데이터" />
                                )}
                                {p.eventName ?? "—"}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">{p.channel ?? "—"}</td>
                            <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                              {p.startDate ? String(p.startDate).slice(5) : "—"} ~ {p.endDate ? String(p.endDate).slice(5) : "—"}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums">{fmtAmt(p.targetAmt ?? 0)}</td>
                            <td className="px-4 py-3 text-right tabular-nums">{fmtAmt(p.achievedAmt ?? 0)}</td>
                            <td className="px-4 py-3 text-right">
                              {(p.targetAmt ?? 0) > 0 ? <AchieveBadge pct={achievePct} /> : <span className="text-muted-foreground">—</span>}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${statusColor}`}>
                                {statusLabel}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── 상세 조회 모달 ─────────────────────────────────────────────── */}
      <PromoDetailModal
        promos={detailPromos}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        title={detailTitle}
      />

      {/* ── 날짜별 행사 목록 모달 (+N 클릭) ──────────────────────────── */}
      <DayPromosModal
        day={dayModalDay}
        year={year}
        month={month}
        promos={dayModalPromos}
        open={dayModalOpen}
        onClose={() => setDayModalOpen(false)}
        onSelectPromo={(p) => openDetail(p)}
      />
    </AppLayout>
  );
}
