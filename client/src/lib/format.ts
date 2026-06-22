/**
 * 클라이언트 사이드 포맷 유틸리티
 */

/** 금액 → 천 단위 콤마 전체 숫자 + 원 (예: 6,100,000,000 원) */
export function fmtAmt(val: number | null | undefined): string {
  if (val == null || isNaN(val)) return "0 원";
  return `${Math.round(val).toLocaleString("ko-KR")} 원`;
}

/** 수량 → 천 단위 콤마 전체 숫자 (예: 9,000) */
export function fmtQty(val: number | null | undefined): string {
  if (val == null || isNaN(val)) return "0";
  return Math.round(val).toLocaleString("ko-KR");
}

/** 증감률 포맷 */
export function fmtPct(val: number | null | undefined): string {
  if (val == null || isNaN(val)) return "비교군없음";
  return `${val >= 0 ? "+" : ""}${val.toFixed(1)}%`;
}

/** 원화 풀 표기 */
export function fmtWon(val: number | null | undefined): string {
  if (val == null || isNaN(val)) return "₩0";
  return `₩${Math.round(val).toLocaleString("ko-KR")}`;
}

/** ASP 포맷 → 천 단위 콤마 전체 숫자 + 원 */
export function fmtAsp(val: number | null | undefined): string {
  if (val == null || isNaN(val)) return "0 원";
  return `${Math.round(val).toLocaleString("ko-KR")} 원`;
}

/** 달성률 포맷 */
export function fmtAchieve(val: number | null | undefined): string {
  if (val == null || isNaN(val)) return "0.0%";
  return `${val.toFixed(1)}%`;
}

/** 날짜 포맷 */
export function fmtDate(val: Date | string | null | undefined): string {
  if (!val) return "-";
  const d = typeof val === "string" ? new Date(val) : val;
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" });
}

/** 증감률 → 색상 클래스 */
export function deltaClass(val: number | null | undefined): string {
  if (val == null) return "delta-neutral";
  if (val > 0) return "delta-up";
  if (val < 0) return "delta-down";
  return "delta-neutral";
}

/** 증감률 → 아이콘 */
export function deltaIcon(val: number | null | undefined): string {
  if (val == null) return "–";
  if (val > 0) return "▲";
  if (val < 0) return "▼";
  return "–";
}
