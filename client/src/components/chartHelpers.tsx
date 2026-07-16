import { fmtAmt, fmtQty } from "@/lib/format";
import { cn } from "@/lib/utils";

export const CHART_COLORS = ["#6366f1", "#22d3ee", "#4ade80", "#fb923c", "#f472b6", "#a78bfa", "#34d399", "#fbbf24"];

/** 매출 추세 ComposedChart용 커스텀 툴팁 (매출/수량 + 전기 대비 + 기간) */
export function CustomTooltip({ active, payload, label, groupBy }: any) {
  if (!active || !payload?.length) return null;
  const salesPayload = payload.find((p: any) => p.dataKey === "totalSales");
  const qtyPayload = payload.find((p: any) => p.dataKey === "totalQty");
  const pctChange = salesPayload?.payload?.pctChange;
  const qtyPctChange = salesPayload?.payload?.qtyPctChange;
  const minDate: string | Date | undefined = salesPayload?.payload?.minDate;
  const maxDate: string | Date | undefined = salesPayload?.payload?.maxDate;
  const dateRange =
    minDate && maxDate
      ? (() => {
          const toDate = (v: string | Date) => (v instanceof Date ? v : new Date(v));
          const fmt = (v: string | Date) => {
            const d = toDate(v);
            return `${d.getMonth() + 1}/${d.getDate()}`;
          };
          // 일단위: 해당 날짜(연도 포함) 표시
          if (groupBy === "day") {
            const d = toDate(minDate);
            return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
          }
          // 월단위: 해당 월 전체(1일~말일)로 표시
          if (groupBy === "yearMonth") {
            const d = toDate(minDate);
            const first = new Date(d.getFullYear(), d.getMonth(), 1);
            const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
            return `${fmt(first)} ~ ${fmt(last)}`;
          }
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
          <p style={{ color: salesPayload.color }}>매출: {fmtAmt(salesPayload.value)}</p>
          {pctChange != null && (
            <p className={cn("text-[10px] pl-2", pctChange >= 0 ? "text-emerald-500" : "text-red-500")}>
              전기 대비: {pctChange >= 0 ? "+" : ""}
              {pctChange.toFixed(1)}%
            </p>
          )}
        </div>
      )}
      {qtyPayload && (
        <div>
          <p style={{ color: qtyPayload.color }}>수량: {fmtQty(qtyPayload.value)}</p>
          {qtyPctChange != null && (
            <p className={cn("text-[10px] pl-2", qtyPctChange >= 0 ? "text-emerald-500" : "text-red-500")}>
              전기 대비: {qtyPctChange >= 0 ? "+" : ""}
              {qtyPctChange.toFixed(1)}%
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** 분류별 비중 파이차트 커스텀 라벨 (퍼센트 + 명칭 콜아웃) */
export function PieCustomLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }: any) {
  const RADIAN = Math.PI / 180;
  if (percent < 0.03) return null;

  const innerRadius2 = innerRadius + (outerRadius - innerRadius) * 0.55;
  const ix = cx + innerRadius2 * Math.cos(-midAngle * RADIAN);
  const iy = cy + innerRadius2 * Math.sin(-midAngle * RADIAN);

  const outerR = outerRadius + 28;
  const ox = cx + outerR * Math.cos(-midAngle * RADIAN);
  const oy = cy + outerR * Math.sin(-midAngle * RADIAN);
  const textAnchor = ox > cx ? "start" : "end";

  const lineStartR = outerRadius + 4;
  const lx = cx + lineStartR * Math.cos(-midAngle * RADIAN);
  const ly = cy + lineStartR * Math.sin(-midAngle * RADIAN);
  const midR = outerRadius + 16;
  const mx = cx + midR * Math.cos(-midAngle * RADIAN);
  const my = cy + midR * Math.sin(-midAngle * RADIAN);

  const displayName = name && name.length > 8 ? name.slice(0, 8) + "…" : name ?? "";

  return (
    <g style={{ pointerEvents: "none" }}>
      <text
        x={ix}
        y={iy}
        fill="white"
        textAnchor="middle"
        dominantBaseline="central"
        style={{ fontSize: percent >= 0.08 ? 12 : 10, fontWeight: 700, textShadow: "0 1px 2px rgba(0,0,0,0.4)" }}
      >
        {`${(percent * 100).toFixed(1)}%`}
      </text>
      <polyline points={`${lx},${ly} ${mx},${my} ${ox},${oy}`} fill="none" stroke="#94a3b8" strokeWidth={0.8} opacity={0.7} />
      <text
        x={ox + (textAnchor === "start" ? 3 : -3)}
        y={oy - 5}
        textAnchor={textAnchor}
        dominantBaseline="central"
        style={{ fontSize: 10, fontWeight: 600 }}
        className="fill-foreground"
      >
        {displayName}
      </text>
      <text x={ox + (textAnchor === "start" ? 3 : -3)} y={oy + 7} textAnchor={textAnchor} dominantBaseline="central" style={{ fontSize: 9, fill: "#94a3b8" }}>
        {`${(percent * 100).toFixed(1)}%`}
      </text>
    </g>
  );
}
