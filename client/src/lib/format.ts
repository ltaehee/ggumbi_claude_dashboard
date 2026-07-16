/**
 * 클라이언트 사이드 포맷 유틸리티
 */

/** 금액 → 천 단위 콤마 전체 숫자 + 원 (예: 6,100,000,000 원) */
export function fmtAmt(val: number | null | undefined): string {
  if (val == null || isNaN(val)) return "0 원";
  return `${Math.round(val).toLocaleString("ko-KR")} 원`;
}

/** 금액 → 억/만 한글 축약 (예: 3,113,120,000 → "31억 1,312만") */
export function fmtKor(val: number | null | undefined): string {
  if (val == null || isNaN(val)) return "0";
  const neg = val < 0;
  let n = Math.round(Math.abs(val));
  const eok = Math.floor(n / 100_000_000);
  const man = Math.floor((n % 100_000_000) / 10_000);
  const parts: string[] = [];
  if (eok > 0) parts.push(`${eok.toLocaleString("ko-KR")}억`);
  if (man > 0) parts.push(`${man.toLocaleString("ko-KR")}만`);
  if (parts.length === 0) parts.push(`${n.toLocaleString("ko-KR")}`);
  return (neg ? "-" : "") + parts.join(" ");
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
