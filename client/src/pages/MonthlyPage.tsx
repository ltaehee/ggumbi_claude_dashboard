import { useState, useMemo, useEffect, useRef } from "react";
import { AppLayout } from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { fmtAmt } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ReportKpiCard } from "@/components/ReportKpiCard";
import { TeamToggle } from "@/components/TeamToggle";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Plus, Trash2, Save, ClipboardList, TrendingUp, DollarSign, BarChart2, Clock, Award, CheckCircle2, AlertTriangle, Lightbulb, Store, Boxes, Sparkles } from "lucide-react";
import {
  ComposedChart,
  Bar,
  Line,
  LineChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

const MONTHS = ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"];
const DEPT = "국내사업팀";

const PALETTE = [
  "#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#14b8a6",
  "#f97316", "#6366f1", "#84cc16", "#a855f7", "#0ea5e9", "#eab308", "#10b981", "#f43f5e",
  "#64748b", "#d946ef", "#0891b2", "#65a30d", "#e11d48", "#7c3aed", "#0d9488", "#ca8a04",
];

// 차트 축: 매출/수익 분석 페이지와 동일한 M/K 축약
const axisEok = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${(v / 1_000_000).toFixed(0)}M`;
  if (a >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return String(v);
};

const pad2 = (n: number) => String(n).padStart(2, "0");

// ─── 통일 KPI 카드 (값 + [목표달성/전월대비/전년대비] 비교행) ─────────────────────
// ─── 막대(전년/올해) + 목표선 차트 ─────────────────────────────────────────────
function BarTip({ active, payload, label, prevYear, year }: any) {
  if (!active || !payload?.length) return null;
  const get = (k: string) => payload.find((p: any) => p.dataKey === k)?.value;
  return (
    <div className="rounded-lg border border-border bg-popover p-2.5 text-xs shadow-lg">
      <p className="font-semibold mb-1 text-foreground">{label}월</p>
      <p className="text-blue-400">{prevYear}년: {fmtAmt(get("prev"))}</p>
      <p className="text-emerald-500">{year}년: {fmtAmt(get("curr"))}</p>
      <p className="text-orange-400">목표: {fmtAmt(get("target"))}</p>
    </div>
  );
}

// 올해 막대 색: 완료월=초록, 진행 중=노랑, 데이터 없는 이후 월=숨김(투명)
const currBarColor = (month: number, lastDataMonth: number) => {
  if (month < lastDataMonth) return "#4ade80"; // 완료
  if (month === lastDataMonth) return "#fbbf24"; // 진행 중
  return "transparent"; // 이후(데이터 없음) → 표시 안 함
};

// 커스텀 범례 (recharts 기본 범례 대신 — 진행 중까지 명시)
function ChartLegend({ prevYear, year, hasPartial }: { prevYear: number; year: number; hasPartial: boolean }) {
  const Sw = ({ c }: { c: string }) => <span className="inline-block w-3 h-3 rounded-sm shrink-0" style={{ background: c }} />;
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 mt-3 text-[11px] text-muted-foreground">
      <span className="flex items-center gap-1"><Sw c="#60a5fa" />{prevYear}년</span>
      <span className="flex items-center gap-1"><Sw c="#4ade80" />{year}년{hasPartial ? " (완료월)" : ""}</span>
      {hasPartial && <span className="flex items-center gap-1"><Sw c="#fbbf24" />{year}년 현재월(진행 중)</span>}
      <span className="flex items-center gap-1">
        <span className="inline-block w-4 shrink-0" style={{ borderTop: "2px dashed #fb923c" }} />목표
      </span>
    </div>
  );
}

function BarTargetChart({ data, prevYear, year, lastDataMonth }: { data: any[]; prevYear: number; year: number; lastDataMonth: number }) {
  const hasPartial = lastDataMonth >= 1 && lastDataMonth <= 12;
  return (
    <div>
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={data} barGap={0} barCategoryGap="28%" margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="month" tickFormatter={(m) => `${m}월`} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
          <YAxis tickFormatter={axisEok} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={44} />
          <Tooltip content={(p: any) => <BarTip {...p} prevYear={prevYear} year={year} />} cursor={{ fill: "var(--muted)", opacity: 0.3 }} />
          <Bar dataKey="prev" name={`${prevYear}년`} fill="#60a5fa" radius={[3, 3, 0, 0]} maxBarSize={28} />
          <Bar dataKey="curr" name={`${year}년`} fill="#4ade80" radius={[3, 3, 0, 0]} maxBarSize={28}>
            {data.map((d: any, i: number) => (
              <Cell key={i} fill={currBarColor(d.month, lastDataMonth)} />
            ))}
          </Bar>
          <Line dataKey="target" name="목표" stroke="#fb923c" strokeWidth={2} strokeDasharray="6 4" dot={{ r: 2 }} />
        </ComposedChart>
      </ResponsiveContainer>
      <ChartLegend prevYear={prevYear} year={year} hasPartial={hasPartial} />
    </div>
  );
}

// ─── 그래프 하단: 월별 목표달성률 + 전년대비 (왼쪽 라벨 + 월별 박스) ─────────────
function MonthlyStatsRow({ bars, lastDataMonth, cumulative }: { bars: any[]; lastDataMonth: number; cumulative?: boolean }) {
  const yoyPct = (a: number, b: number) => (b > 0 ? ((a - b) / b) * 100 : null);
  const cols = { gridTemplateColumns: "66px repeat(12, minmax(0, 1fr))" };
  return (
    <div className="mt-3 grid gap-1 items-center" style={cols}>
      {/* 월 헤더 */}
      <div />
      {bars.map((b) => (
        <div key={`m${b.month}`} className="text-[10px] text-muted-foreground text-center">{b.month}월</div>
      ))}

      {/* 목표달성률 */}
      <div className="text-[10px] font-semibold text-foreground text-right pr-1">{cumulative ? "누계 " : ""}목표달성률</div>
      {bars.map((b) => {
        const done = b.month < lastDataMonth;
        const inProgress = b.month === lastDataMonth;
        const achieve = b.target > 0 ? (b.curr / b.target) * 100 : null;
        return (
          <div
            key={`a${b.month}`}
            className={cn(
              "rounded-md border border-border/60 bg-muted/20 py-1 text-center tabular-nums",
              !done
                ? "text-[10px] text-muted-foreground/40"
                : achieve == null
                ? "text-[11px] text-muted-foreground"
                : achieve >= 100
                ? "text-[11px] font-bold text-emerald-600 dark:text-emerald-400"
                : "text-[11px] font-bold text-amber-600 dark:text-amber-400"
            )}
          >
            {!done ? (inProgress ? "진행" : "-") : achieve == null ? "-" : `${achieve.toFixed(1)}%`}
          </div>
        );
      })}

      {/* 전년대비 */}
      <div className="text-[10px] font-semibold text-foreground text-right pr-1">전년대비</div>
      {bars.map((b) => {
        const done = b.month < lastDataMonth;
        const inProgress = b.month === lastDataMonth;
        const yoy = yoyPct(b.curr, b.prev);
        return (
          <div
            key={`y${b.month}`}
            className={cn(
              "rounded-md border border-border/60 bg-muted/20 py-1 text-center tabular-nums",
              !done
                ? "text-[10px] text-muted-foreground/40"
                : yoy == null
                ? "text-[11px] text-muted-foreground/50"
                : yoy >= 0
                ? "text-[11px] text-emerald-500"
                : "text-[11px] text-red-500"
            )}
          >
            {!done ? (inProgress ? "진행" : "-") : yoy == null ? "-" : `${yoy >= 0 ? "▲" : "▼"}${Math.abs(yoy).toFixed(1)}%`}
          </div>
        );
      })}
    </div>
  );
}

// ─── 연누계 비교 박스 (올해 vs 작년, 1월~해당월) ─────────────────────────────────
function YtdMetric({ label, value, rate, rateLabel, accent, dim }: { label: string; value: number; rate?: number; rateLabel?: string; accent: string; dim?: boolean }) {
  const neg = value < 0;
  const color = neg ? "#ef4444" : accent;
  return (
    <div
      className={cn("rounded-lg border border-t-[3px] px-2.5 py-2", dim ? "bg-muted/40 border-border/40" : "bg-background/70 border-border/50")}
      style={{ borderTopColor: dim ? "var(--border)" : color }}
    >
      <div className="text-[11px] text-muted-foreground mb-0.5">{label}</div>
      <div className={cn("text-base font-bold tabular-nums", dim && "text-muted-foreground")} style={dim ? undefined : { color }}>
        {fmtAmt(value)}
      </div>
      {rate != null && (
        <div className="text-[11px] tabular-nums">
          {rateLabel && <span className="text-muted-foreground/60">{rateLabel} </span>}
          <span className={rate < 0 ? "text-red-500" : "text-muted-foreground"}>{rate.toFixed(1)}%</span>
        </div>
      )}
    </div>
  );
}

function YtdBox({ title, sales, profit, profitRate, contrib, contribRate, highlight }: {
  title: string; sales: number; profit: number; profitRate: number; contrib: number; contribRate: number; highlight?: boolean;
}) {
  return (
    <div className={cn("rounded-xl border p-4", highlight ? "border-primary/40 bg-gradient-to-br from-primary/[0.08] to-transparent shadow-sm" : "border-border bg-muted/20")}>
      <div className="flex items-center gap-1.5 mb-3">
        <span className={cn("w-1.5 h-1.5 rounded-full", highlight ? "bg-primary" : "bg-muted-foreground/40")} />
        <div className={cn("text-sm font-semibold", highlight ? "text-foreground" : "text-muted-foreground")}>{title}</div>
        {highlight && <span className="ml-1 rounded-full bg-primary/15 text-primary text-[10px] font-semibold px-1.5 py-0.5">올해</span>}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <YtdMetric label="매출액" value={sales} accent="#10b981" dim={!highlight} />
        <YtdMetric label="매출이익" value={profit} rate={profitRate} rateLabel="이익률" accent="#0ea5e9" dim={!highlight} />
        <YtdMetric label="공헌이익" value={contrib} rate={contribRate} rateLabel="공헌이익률" accent="#8b5cf6" dim={!highlight} />
      </div>
    </div>
  );
}

// ─── 비중 파이 + 클릭 시 12개월 추세 ────────────────────────────────────────────
const mmLabel = (l: any) => (typeof l === "string" ? l.replace("월", "").slice(2) : l);

type PieLevel = {
  key: string;
  label: string;
  groupBy: "channel" | "itemLarge" | "itemMid";
  trendField: "channels" | "itemLarges" | "itemMids";
};

function PieTrendCard({ title, subtitle, levels, year, initialMonth, trendMonth, team, targetYear }: {
  title: string;
  subtitle: string;
  levels: PieLevel[];
  year: number;
  initialMonth: number; // 비중(파이) 기준 월 — 박스별 드롭다운
  trendMonth: number; // 추세 그래프 종료 월 — 상단(전역) 월 기준
  team?: string;
  targetYear?: number;
}) {
  // 카드별 독립 월 필터 (기본값 = 상단 월, 상단 월 바뀌면 따라감) — 파이(비중)에만 적용
  const [pMonth, setPMonth] = useState(initialMonth);
  useEffect(() => setPMonth(initialMonth), [initialMonth]);
  const pieLast = new Date(Date.UTC(year, pMonth, 0)).getUTCDate();
  const mStart = `${year}-${pad2(pMonth)}-01`;
  const mEnd = `${year}-${pad2(pMonth)}-${pad2(pieLast)}`;
  // 추세는 상단 월(trendMonth) 기준 12개월 — 파이 월과 무관하게 전체 표시
  const trendLast = new Date(Date.UTC(year, trendMonth, 0)).getUTCDate();
  const trendEnd = `${year}-${pad2(trendMonth)}-${pad2(trendLast)}`;
  const tsD = new Date(Date.UTC(year, trendMonth - 1 - 11, 1));
  const trendStart = `${tsD.getUTCFullYear()}-${pad2(tsD.getUTCMonth() + 1)}-01`;

  const [levelKey, setLevelKey] = useState(levels[0].key);
  const level = levels.find((l) => l.key === levelKey) ?? levels[0];
  const [selected, setSelected] = useState<string | null>(null);
  // 레벨/팀/월 변경 시 선택 해제
  useEffect(() => setSelected(null), [levelKey, team, pMonth]);

  const teamScope = team ? { team, targetYear } : {};
  const perfQ = trpc.sales.getItemPerf.useQuery({ startDate: mStart, endDate: mEnd, dept: DEPT, groupBy: level.groupBy, limit: 60, ...teamScope } as any);
  const loading = perfQ.isLoading;
  const sorted = useMemo(
    () =>
      (perfQ.data ?? [])
        .map((d) => ({ label: d.label, totalSales: d.totalSales }))
        .filter((d) => d.totalSales > 0)
        .sort((a, b) => b.totalSales - a.totalSales),
    [perfQ.data]
  );
  const total = sorted.reduce((s, d) => s + d.totalSales, 0);

  const trendQ = trpc.sales.getTrend.useQuery(
    {
      startDate: trendStart,
      endDate: trendEnd,
      dept: DEPT,
      groupBy: "yearMonth",
      ...teamScope,
      ...(level.trendField === "channels"
        ? { channels: selected ? [selected] : [] }
        : level.trendField === "itemLarges"
        ? { itemLarges: selected ? [selected] : [] }
        : { itemMids: selected ? [selected] : [] }),
    } as any,
    { enabled: !!selected }
  );

  const toggle = (label: string | undefined) => {
    if (!label) return;
    setSelected((s) => (s === label ? null : label));
  };

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="text-[11px] text-muted-foreground truncate">{subtitle}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {levels.length > 1 && (
            <div className="inline-flex rounded-md border border-border overflow-hidden">
              {levels.map((l) => (
                <button
                  key={l.key}
                  onClick={() => setLevelKey(l.key)}
                  className={cn(
                    "px-2.5 py-1 text-[11px] font-medium transition-colors",
                    levelKey === l.key ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted"
                  )}
                >
                  {l.label}
                </button>
              ))}
            </div>
          )}
          <Select value={String(pMonth)} onValueChange={(v) => setPMonth(Number(v))}>
            <SelectTrigger className="h-7 text-[11px] w-[68px] px-2"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MONTHS.map((m, i) => <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="p-4">
        {loading ? (
          <Skeleton className="h-[200px] w-full" />
        ) : sorted.length === 0 ? (
          <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">데이터 없음</div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="w-[190px] h-[200px] shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={sorted}
                    dataKey="totalSales"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    innerRadius={46}
                    outerRadius={78}
                    paddingAngle={1}
                    onClick={(d: any) => toggle(d?.label)}
                  >
                    {sorted.map((d, i) => (
                      <Cell
                        key={i}
                        fill={PALETTE[i % PALETTE.length]}
                        cursor="pointer"
                        opacity={selected && selected !== d.label ? 0.35 : 1}
                        stroke="#fff"
                        strokeWidth={1}
                      />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: any, n: any) => [fmtAmt(v), n]} contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid var(--border)", background: "var(--popover)" }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 min-w-0 max-h-[210px] overflow-y-auto pr-1">
              {sorted.map((d, i) => (
                <button
                  key={d.label}
                  onClick={() => toggle(d.label)}
                  className={cn(
                    "w-full flex items-center gap-2 px-2 py-1 rounded text-left transition-colors",
                    selected === d.label ? "bg-muted" : "hover:bg-muted/50"
                  )}
                >
                  <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: PALETTE[i % PALETTE.length] }} />
                  <span className="flex-1 truncate text-xs text-foreground">{d.label}</span>
                  <span className="text-[11px] tabular-nums text-muted-foreground">{fmtAmt(d.totalSales)}</span>
                  <span className="text-[11px] tabular-nums w-12 text-right text-emerald-600">
                    {total > 0 ? ((d.totalSales / total) * 100).toFixed(1) : "0.0"}%
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {selected && (
          <div className="mt-3 border-t border-border pt-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-foreground">
                {selected} · 최근 12개월 매출 추세
              </span>
              <button onClick={() => setSelected(null)} className="text-[11px] text-muted-foreground hover:text-foreground">
                닫기 ✕
              </button>
            </div>
            {trendQ.isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={trendQ.data ?? []} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="label" tickFormatter={mmLabel} tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
                  <YAxis tickFormatter={axisEok} tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={40} />
                  <Tooltip formatter={(v: any) => [fmtAmt(v), "매출"]} labelFormatter={(l) => mmLabel(l)} contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid var(--border)", background: "var(--popover)" }} />
                  <Line dataKey="totalSales" name="매출" stroke="#6366f1" strokeWidth={2} dot={{ r: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 수동 인사이트 편집기 ──────────────────────────────────────────────────────
type Row = { label: string; seonggwa: string; buojin: string; haegyeol: string };
type InsightData = { channel: Row[]; category: Row[] };
const emptyRow = (label = ""): Row => ({ label, seonggwa: "", buojin: "", haegyeol: "" });
const defaultInsight = (): InsightData => ({
  channel: [emptyRow("네이버"), emptyRow("자사몰"), emptyRow("쿠팡"), emptyRow("기타")],
  category: [emptyRow("네이버"), emptyRow("자사몰"), emptyRow("쿠팡"), emptyRow("기타")],
});

// 성과 / 부진요인 / 해결방안 필드 메타 (색·아이콘·안내문)
const INSIGHT_FIELDS: {
  key: keyof Row;
  label: string;
  Icon: React.ElementType;
  labelCls: string;
  focusCls: string;
  ph: string;
}[] = [
  { key: "seonggwa", label: "성과", Icon: CheckCircle2, labelCls: "text-emerald-600 dark:text-emerald-400", focusCls: "focus:ring-emerald-400/40 focus:border-emerald-400", ph: "잘된 점 · 주요 성과를 입력하세요" },
  { key: "buojin", label: "부진요인", Icon: AlertTriangle, labelCls: "text-amber-600 dark:text-amber-400", focusCls: "focus:ring-amber-400/40 focus:border-amber-400", ph: "부진했던 원인을 입력하세요" },
  { key: "haegyeol", label: "해결방안", Icon: Lightbulb, labelCls: "text-sky-600 dark:text-sky-400", focusCls: "focus:ring-sky-400/40 focus:border-sky-400", ph: "개선 · 해결 방안을 입력하세요" },
];

// ─── AI 분석 (요약/채널/카테고리) — 생성 + 수동 수정 + 저장 ──────────────────────
type AiKind = "summary" | "channel" | "category";
function AiAnalysisCard({ kind, title, year, month, team, compact }: { kind: AiKind; title: string; year: number; month: number; team?: string; compact?: boolean }) {
  const utils = trpc.useUtils();
  const args = { year, month, kind, ...(team ? { team } : {}) };
  const q = trpc.report.getAiAnalysis.useQuery(args);
  const [draft, setDraft] = useState("");
  const seeded = useRef("");
  useEffect(() => {
    const k = `${kind}-${year}-${month}-${team ?? ""}`;
    if (!q.isLoading && seeded.current !== k) {
      setDraft(q.data?.text ?? "");
      seeded.current = k;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data, q.isLoading, kind, year, month, team]);

  const gen = trpc.report.generateAiAnalysis.useMutation({
    onSuccess: (res) => { setDraft(res.text); utils.report.getAiAnalysis.setData(args, res as any); },
    onError: () => toast.error("AI 분석에 실패했습니다"),
  });
  const save = trpc.report.saveAiAnalysis.useMutation({
    onSuccess: () => { toast.success("저장되었습니다"); utils.report.getAiAnalysis.invalidate(args); },
    onError: () => toast.error("저장에 실패했습니다"),
  });
  const loading = gen.isPending;
  const hasContent = draft.trim().length > 0;
  const stamp = q.data?.editedAt ?? q.data?.generatedAt;

  return (
    <div className={cn("rounded-xl border border-violet-500/25 bg-gradient-to-br from-violet-500/[0.05] to-transparent", compact ? "p-3" : "p-4")}>
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <div className="flex items-center gap-1.5 min-w-0 text-sm font-semibold text-foreground">
          <Sparkles className="h-4 w-4 text-violet-500 shrink-0" />
          <span className="truncate">{title}{team && <span className="text-violet-500"> · {team}</span>}</span>
          {stamp && <span className="text-[10px] font-normal text-muted-foreground shrink-0">· {new Date(stamp).toLocaleDateString("ko-KR")}{q.data?.editedAt ? " 수정" : ""}</span>}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {hasContent && (
            <button onClick={() => save.mutate({ ...args, text: draft })} disabled={save.isPending}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-[11px] font-medium hover:bg-muted disabled:opacity-60">
              <Save className="h-3 w-3" />저장
            </button>
          )}
          <button onClick={() => gen.mutate({ dept: DEPT, ...args })} disabled={loading}
            className="inline-flex items-center gap-1 rounded-md bg-violet-600 px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-violet-700 disabled:opacity-60">
            <Sparkles className="h-3 w-3" />{loading ? "분석 중..." : hasContent ? "다시 분석" : "AI 분석"}
          </button>
        </div>
      </div>
      {loading ? (
        <div className="text-xs text-muted-foreground py-5 text-center animate-pulse">AI 분석 중입니다...</div>
      ) : (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={`"AI 분석" 버튼으로 생성하거나 직접 입력하세요`}
          rows={hasContent ? Math.min(14, draft.split("\n").length + 1) : 3}
          className="w-full rounded-lg border border-border/60 bg-card/70 px-3 py-2 text-[13px] leading-relaxed resize-y focus:outline-none focus:ring-1 focus:ring-violet-400/40 placeholder:text-muted-foreground/40"
        />
      )}
    </div>
  );
}

function InsightEditor({ year, month, team, targetYear }: { year: number; month: number; team?: string; targetYear?: number }) {
  const utils = trpc.useUtils();
  const insightArgs = { year, month, ...(team ? { team } : {}) };
  const q = trpc.report.getInsight.useQuery(insightArgs);

  // 기본 항목 = 해당 월 매출 TOP 채널(3) / 카테고리 중분류(5), '기타' 제외
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mStart = `${year}-${pad2(month)}-01`;
  const mEnd = `${year}-${pad2(month)}-${pad2(lastDay)}`;
  const teamScope = team ? { team, targetYear } : {};
  const chPerf = trpc.sales.getItemPerf.useQuery({ startDate: mStart, endDate: mEnd, dept: DEPT, groupBy: "channel", limit: 40, ...teamScope } as any);
  const catPerf = trpc.sales.getItemPerf.useQuery({ startDate: mStart, endDate: mEnd, dept: DEPT, groupBy: "itemMid", limit: 40, ...teamScope } as any);

  const isEtc = (s: string) => /기타/.test(s);
  const topN = (data: any[] | undefined, n: number, transform: (s: string) => string) =>
    [...(data ?? [])]
      .filter((r) => r.totalSales > 0 && !isEtc(r.label))
      .sort((a, b) => b.totalSales - a.totalSales)
      .slice(0, n)
      .map((r) => transform(r.label));
  const topChannels = useMemo(() => topN(chPerf.data, 3, (s) => s), [chPerf.data]);
  const topCategories = useMemo(() => topN(catPerf.data, 5, (s) => s.replace(/_[A-Z]{2}$/, "")), [catPerf.data]);
  const dynDefault = useMemo<InsightData>(() => ({
    channel: (topChannels.length ? topChannels : defaultInsight().channel.map((r) => r.label)).map((l) => emptyRow(l)),
    category: (topCategories.length ? topCategories : defaultInsight().category.map((r) => r.label)).map((l) => emptyRow(l)),
  }), [topChannels, topCategories]);

  const [draft, setDraft] = useState<InsightData>(dynDefault);
  const seededKey = useRef(""); // 월+팀별 1회만 시드 (편집 덮어쓰기 방지)

  useEffect(() => {
    if (q.isLoading) return;
    const key = `${year}-${month}-${team ?? ""}`;
    if (seededKey.current === key) return;
    if (q.data) {
      const d = q.data as InsightData;
      setDraft({
        channel: d.channel?.length ? d.channel : dynDefault.channel,
        category: d.category?.length ? d.category : dynDefault.category,
      });
      seededKey.current = key;
    } else {
      // 저장값 없음 → 매출 데이터 로딩 완료 후 TOP-N으로 시드
      if (topChannels.length || topCategories.length || (!chPerf.isLoading && !catPerf.isLoading)) {
        setDraft(dynDefault);
        seededKey.current = key;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data, q.isLoading, dynDefault, topChannels, topCategories, chPerf.isLoading, catPerf.isLoading, year, month, team]);

  const saveMut = trpc.report.saveInsight.useMutation({
    onSuccess: () => {
      toast.success("인사이트가 저장되었습니다");
      utils.report.getInsight.invalidate(insightArgs);
    },
    onError: () => toast.error("저장에 실패했습니다"),
  });

  const update = (sec: keyof InsightData, idx: number, key: keyof Row, val: string) =>
    setDraft((d) => ({ ...d, [sec]: d[sec].map((r, i) => (i === idx ? { ...r, [key]: val } : r)) }));
  const addRow = (sec: keyof InsightData) => setDraft((d) => ({ ...d, [sec]: [...d[sec], emptyRow()] }));
  const delRow = (sec: keyof InsightData, idx: number) => setDraft((d) => ({ ...d, [sec]: d[sec].filter((_, i) => i !== idx) }));

  const renderSection = (sec: keyof InsightData, title: string, subtitle: string, color: string, Icon: React.ElementType) => {
    const rows = draft[sec];
    return (
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {/* 섹션 헤더 */}
        <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0" style={{ background: `${color}1a` }}>
              <Icon className="h-4 w-4" style={{ color }} />
            </span>
            <div className="min-w-0">
              <h4 className="text-sm font-semibold text-foreground leading-tight">{title}</h4>
              <p className="text-[11px] text-muted-foreground leading-tight truncate">{rows.length}개 항목 · {subtitle}</p>
            </div>
          </div>
        </div>

        {/* 항목들 */}
        <div className="p-3 space-y-3">
          {/* AI 분석 (채널/카테고리별) */}
          <AiAnalysisCard
            kind={sec === "channel" ? "channel" : "category"}
            title={sec === "channel" ? "AI 채널 분석" : "AI 카테고리 분석"}
            year={year}
            month={month}
            team={team}
            compact
          />
          {rows.length === 0 && (
            <div className="text-center py-6 text-xs text-muted-foreground/60">
              항목이 없습니다. 아래 버튼으로 추가하세요.
            </div>
          )}
          {rows.map((row, idx) => (
            <div key={idx} className="group rounded-lg border border-border bg-background/40 p-3 transition-colors hover:border-border/70">
              {/* 구분명 + 삭제 */}
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                <input
                  value={row.label}
                  onChange={(e) => update(sec, idx, "label", e.target.value)}
                  placeholder="구분명 (예: 네이버)"
                  className="flex-1 min-w-0 h-8 rounded-md border border-border bg-card px-2.5 text-sm font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <span className="text-[10px] text-muted-foreground/50 tabular-nums shrink-0">#{idx + 1}</span>
                <button
                  onClick={() => delRow(sec, idx)}
                  className="shrink-0 p-1.5 rounded-md text-muted-foreground/40 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                  title="이 항목 삭제"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              {/* 성과 / 부진요인 / 해결방안 */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {INSIGHT_FIELDS.map((f) => (
                  <div key={f.key}>
                    <div className={cn("flex items-center gap-1 mb-1.5 text-[11px] font-semibold", f.labelCls)}>
                      <f.Icon className="h-3.5 w-3.5" /> {f.label}
                    </div>
                    <textarea
                      value={row[f.key]}
                      onChange={(e) => update(sec, idx, f.key, e.target.value)}
                      rows={4}
                      placeholder={f.ph}
                      className={cn(
                        "w-full rounded-md border border-border bg-card px-2.5 py-2 text-xs leading-relaxed resize-y min-h-[6rem] transition-shadow placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2",
                        f.focusCls
                      )}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* 항목 추가 */}
          <button
            onClick={() => addRow(sec)}
            className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground hover:border-primary/40 hover:bg-muted/40"
          >
            <Plus className="h-3.5 w-3.5" /> 항목 추가
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* 헤더 + 저장 */}
      <div className="rounded-xl border border-border bg-gradient-to-br from-primary/[0.06] to-transparent p-4 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 shrink-0">
            <ClipboardList className="h-5 w-5 text-primary" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              {year}년 {month}월 인사이트
              {team && <span className="ml-1.5 text-primary">· {team}</span>}
            </h2>
            <p className="text-[11px] text-muted-foreground">
              채널·카테고리별 <span className="font-medium text-emerald-600 dark:text-emerald-400">성과</span> ·{" "}
              <span className="font-medium text-amber-600 dark:text-amber-400">부진요인</span> ·{" "}
              <span className="font-medium text-sky-600 dark:text-sky-400">해결방안</span> (팀장 보고용)
            </p>
          </div>
        </div>
        <button
          onClick={() => saveMut.mutate({ ...insightArgs, data: draft })}
          disabled={saveMut.isPending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-60"
        >
          <Save className="h-4 w-4" />
          {saveMut.isPending ? "저장 중..." : "저장"}
        </button>
      </div>

      {renderSection("channel", "채널별 인사이트", "매출 상위 채널 자동 (수정 가능)", "#6366f1", Store)}
      {renderSection("category", "카테고리별 인사이트", "매출 상위 중분류 자동 (기타 제외)", "#8b5cf6", Boxes)}
    </div>
  );
}

// ─── 페이지 ────────────────────────────────────────────────────────────────────
export default function MonthlyPage() {
  const now = new Date();
  // 기본값: 직전(완료된) 월
  let defY = now.getFullYear();
  let defM = now.getMonth(); // 0-index → 전월(1-index면 month-1)
  if (defM === 0) {
    defM = 12;
    defY -= 1;
  }
  const [year, setYear] = useState(defY);
  const [month, setMonth] = useState(defM);
  const [team, setTeam] = useState(""); // "" = 전체

  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mStart = `${year}-${pad2(month)}-01`;
  const mEnd = `${year}-${pad2(month)}-${pad2(lastDay)}`;
  // 12개월 추세용 (해당 월 포함 직전 12개월)
  const trendStartD = new Date(Date.UTC(year, month - 1 - 11, 1));
  const trendStart = `${trendStartD.getUTCFullYear()}-${pad2(trendStartD.getUTCMonth() + 1)}-01`;

  const reportQ = trpc.report.getMonthly.useQuery({ dept: DEPT, year, month, ...(team ? { team } : {}) });

  const r = reportQ.data;
  const loading = reportQ.isLoading;
  const prevYear = year - 1;

  // 연누계(월별 누계) 막대 데이터
  const cumBars = useMemo(() => {
    if (!r?.bars) return [];
    let cc = 0, cp = 0, ct = 0;
    return r.bars.map((b: any) => {
      cc += b.curr; cp += b.prev; ct += b.target;
      return { month: b.month, curr: cc, prev: cp, target: ct };
    });
  }, [r]);

  const years = [now.getFullYear() - 2, now.getFullYear() - 1, now.getFullYear()];

  const mk = r?.monthKpi;
  const yk = r?.ytdKpi;

  // 데이터 최종일 기반: 선택 연도에서 완료월/진행월/이후월 구분
  const maxD = r?.maxDataDate ? new Date(r.maxDataDate + "T00:00:00Z") : null;
  const lastDataMonth = (() => {
    if (!maxD) return 13; // 데이터 정보 없음 → 전부 완료로 취급
    const my = maxD.getUTCFullYear();
    const mm = maxD.getUTCMonth() + 1;
    if (year < my) return 13; // 과거 완료 연도
    if (year > my) return 0; // 미래 연도(데이터 없음)
    return mm; // 현재 연도 → mm월이 진행 중
  })();
  const hasPartial = lastDataMonth >= 1 && lastDataMonth <= 12; // 선택 연도에 진행 중 월 존재
  const dataThroughLabel =
    r?.inProgress && maxD ? `${maxD.getUTCMonth() + 1}월 ${maxD.getUTCDate()}일까지 데이터` : null;

  return (
    <AppLayout
      title="월간 종합 리포트"
      subtitle="해당 월 · 연누계 실적 + 채널/카테고리 비중 + 팀장 인사이트"
      actions={
        <div className="flex items-center gap-2">
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
      <div className="space-y-6">
        {/* ── 팀 선택 (원클릭) ── */}
        <TeamToggle value={team} onChange={setTeam} />

        {/* ── 1. 해당 월 KPI ── */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 flex-wrap">
            <span className="w-1 h-4 rounded bg-primary" /> {year}년 {month}월 실적
            {dataThroughLabel && (
              <span className="inline-flex items-center rounded-full bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 px-2 py-0.5 text-[11px] font-medium">
                ⚠ {dataThroughLabel}
              </span>
            )}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <ReportKpiCard
              title="매출액"
              accent="#10b981"
              icon={<TrendingUp className="h-4 w-4" />}
              value={fmtAmt(mk?.sales.curr ?? 0)}
              rows={[
                { label: "목표달성", rate: mk?.sales.achievePct ?? null, amount: mk?.sales.target ?? 0, mode: "achieve" },
                { label: "전월대비", rate: mk?.sales.momPct ?? null, amount: mk?.sales.prevMonth ?? 0, mode: "growth" },
                { label: "전년대비", rate: mk?.sales.yoyPct ?? null, amount: mk?.sales.prevYear ?? 0, mode: "growth" },
              ]}
              loading={loading}
            />
            <ReportKpiCard
              title="매출이익"
              accent="#0ea5e9"
              icon={<DollarSign className="h-4 w-4" />}
              value={fmtAmt(mk?.profit.curr ?? 0)}
              subLabel={`이익률 ${(mk?.profit.rate ?? 0).toFixed(1)}%`}
              rows={[
                { label: "전월대비", rate: mk?.profit.momPct ?? null, amount: mk?.profit.prevMonth ?? 0, mode: "growth" },
                { label: "전년대비", rate: mk?.profit.yoyPct ?? null, amount: mk?.profit.prevYear ?? 0, mode: "growth" },
              ]}
              loading={loading}
            />
            <ReportKpiCard
              title="공헌이익"
              accent="#8b5cf6"
              icon={<BarChart2 className="h-4 w-4" />}
              value={fmtAmt(mk?.contrib.curr ?? 0)}
              subLabel={`공헌이익률 ${(mk?.contrib.rate ?? 0).toFixed(1)}%`}
              note={mk && Math.abs(mk.contrib.curr - mk.profit.curr) < 1 ? "변동비 미입력 (매출이익 동일)" : undefined}
              rows={[
                { label: "전월대비", rate: mk?.contrib.momPct ?? null, amount: mk?.contrib.prevMonth ?? 0, mode: "growth" },
                { label: "전년대비", rate: mk?.contrib.yoyPct ?? null, amount: mk?.contrib.prevYear ?? 0, mode: "growth" },
              ]}
              loading={loading}
            />
          </div>
        </section>

        {/* ── 2. 월별 매출 + 목표 (전년 vs 올해) ── */}
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-foreground mb-1">📊 {prevYear} vs {year} 월별 매출 + 목표</h3>
          <p className="text-[11px] text-muted-foreground mb-3">월별 매출(전년/올해) 막대 · 목표(점선)</p>
          {loading ? <Skeleton className="h-[300px] w-full" /> : (
            <>
              <BarTargetChart data={r?.bars ?? []} prevYear={prevYear} year={year} lastDataMonth={lastDataMonth} />
              <MonthlyStatsRow bars={r?.bars ?? []} lastDataMonth={lastDataMonth} />
            </>
          )}
        </div>

        {/* ── 3. 연누계 KPI ── */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 flex-wrap">
            <span className="w-1 h-4 rounded bg-primary" /> {year}년 연누계 (1월 ~ {month}월)
            {dataThroughLabel && (
              <span className="inline-flex items-center rounded-full bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 px-2 py-0.5 text-[11px] font-medium">
                ⚠ {month}월은 {dataThroughLabel}
              </span>
            )}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <ReportKpiCard
              title="연누계 매출액"
              accent="#f59e0b"
              icon={<Award className="h-4 w-4" />}
              value={fmtAmt(yk?.sales.curr ?? 0)}
              rows={[
                { label: "목표달성", rate: yk?.sales.achievePct ?? null, amount: yk?.sales.target ?? 0, mode: "achieve" },
                { label: "전년대비", rate: yk?.sales.yoyPct ?? null, amount: yk?.sales.prevYear ?? 0, mode: "growth" },
              ]}
              loading={loading}
            />
            <ReportKpiCard
              title="연누계 매출이익"
              accent="#0ea5e9"
              icon={<DollarSign className="h-4 w-4" />}
              value={fmtAmt(yk?.profit.curr ?? 0)}
              subLabel={`이익률 ${(yk?.profit.rate ?? 0).toFixed(1)}%`}
              rows={[
                { label: "전년대비", rate: yk?.profit.yoyPct ?? null, amount: yk?.profit.prevYear ?? 0, mode: "growth" },
              ]}
              loading={loading}
            />
            <ReportKpiCard
              title="연누계 공헌이익"
              accent="#8b5cf6"
              icon={<BarChart2 className="h-4 w-4" />}
              value={fmtAmt(yk?.contrib.curr ?? 0)}
              subLabel={`공헌이익률 ${(yk?.contrib.rate ?? 0).toFixed(1)}%`}
              note={yk && Math.abs(yk.contrib.curr - yk.profit.curr) < 1 ? "변동비 미입력 (매출이익 동일)" : undefined}
              rows={[
                { label: "전년대비", rate: yk?.contrib.yoyPct ?? null, amount: yk?.contrib.prevYear ?? 0, mode: "growth" },
              ]}
              loading={loading}
            />
          </div>
        </section>

        {/* ── 4. 연누계(월별 누계) 매출 + 목표 ── */}
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-foreground mb-1">📈 {year} 연누계(월별 누계) 매출 + 목표</h3>
          <p className="text-[11px] text-muted-foreground mb-3">1월부터 누적된 매출(전년/올해)과 누적 목표</p>
          {loading ? <Skeleton className="h-[300px] w-full" /> : <BarTargetChart data={cumBars} prevYear={prevYear} year={year} lastDataMonth={lastDataMonth} />}
        </div>

        {/* ── 4-2. 연누계 비교 (올해 vs 작년) ── */}
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-foreground text-center mb-3">{year}년 1월~{month}월 누계 비교</h3>
          {loading ? (
            <Skeleton className="h-28 w-full" />
          ) : yk ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <YtdBox
                title={`${year}년 1월~${month}월 누계`}
                highlight
                sales={yk.sales.curr}
                profit={yk.profit.curr}
                profitRate={yk.profit.rate}
                contrib={yk.contrib.curr}
                contribRate={yk.contrib.rate}
              />
              <YtdBox
                title={`${prevYear}년 1월~${month}월 누계`}
                sales={yk.sales.prevYear}
                profit={yk.profit.prevYear}
                profitRate={yk.profit.prevYearRate}
                contrib={yk.contrib.prevYear}
                contribRate={yk.contrib.prevYearRate}
              />
            </div>
          ) : null}
        </div>

        {/* ── 5. 채널/카테고리 비중 (박스별 월 필터 · 클릭 시 12개월 추세) ── */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <span className="w-1 h-4 rounded bg-primary" /> 매출 비중
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <PieTrendCard
              title="채널별 매출 비중"
              subtitle="채널 클릭 시 12개월 추세"
              levels={[{ key: "channel", label: "채널", groupBy: "channel", trendField: "channels" }]}
              year={year}
              initialMonth={month}
              trendMonth={month}
              team={team}
              targetYear={year}
            />
            <PieTrendCard
              title="카테고리별 매출 비중"
              subtitle="클릭 시 12개월 추세"
              levels={[
                { key: "large", label: "대분류", groupBy: "itemLarge", trendField: "itemLarges" },
                { key: "mid", label: "중분류", groupBy: "itemMid", trendField: "itemMids" },
              ]}
              year={year}
              initialMonth={month}
              trendMonth={month}
              team={team}
              targetYear={year}
            />
          </div>
        </section>

        {/* ── 6. 수동 인사이트 ── */}
        <AiAnalysisCard kind="summary" title="AI 분석 · 월 전체 요약" year={year} month={month} team={team} />

        <InsightEditor year={year} month={month} team={team} targetYear={year} />
      </div>
    </AppLayout>
  );
}
