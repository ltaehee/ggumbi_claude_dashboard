/**
 * 꿈비 대시보드 비즈니스 로직 유틸리티
 * 기존 Streamlit main.py의 핵심 연산 로직을 TypeScript로 이식
 */

/**
 * 연/월(1-based)/일 → 일~토 기준 주차 레이블.
 * 타임존 영향 없이 결정적으로 계산한다 (모든 날짜 연산을 UTC로 수행).
 * 해당 날짜가 속한 주의 토요일(주 끝)을 기준으로 연/월 판단.
 * e.g. weekLabelFromYMD(2026,6,1) → "2026년 6월 1주차" (5/31일~6/6토)
 */
export function weekLabelFromYMD(year: number, month: number, day: number): string {
  const DAY_MS = 86400000;
  const t = Date.UTC(year, month - 1, day);
  const dayOfWeek = new Date(t).getUTCDay(); // 0=Sun, 6=Sat
  const sundayT = t - dayOfWeek * DAY_MS;        // 이번 주 일요일(주 시작)
  const saturdayT = sundayT + 6 * DAY_MS;        // 이번 주 토요일(주 끝) — 연/월 기준
  const sat = new Date(saturdayT);
  const y = sat.getUTCFullYear();
  const m = sat.getUTCMonth() + 1; // 1-based

  // 해당 월의 첫 번째 토요일 찾기
  const firstT = Date.UTC(y, m - 1, 1);
  const firstDayOfWeek = new Date(firstT).getUTCDay();
  const offsetToFirstSat = (6 - firstDayOfWeek + 7) % 7;
  const firstSatT = firstT + offsetToFirstSat * DAY_MS;

  const weekNum = Math.floor((saturdayT - firstSatT) / (7 * DAY_MS)) + 1;
  return `${y}년 ${m}월 ${weekNum}주차`;
}

/**
 * 일~토 기준 주차 레이블 계산 (Date 입력).
 * Date의 UTC 캘린더 값을 사용 — 저장 시 salesDate(=toISOString 기준)와 일관되게 맞춤.
 */
export function getWeekLabel(d: Date): string {
  return weekLabelFromYMD(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/**
 * 안전한 증감률 계산
 * prev가 0(비교군 없음)이면 null 반환 → UI에서 "비교군없음" 표시
 */
export function calcPctSafe(curr: number, prev: number): number | null {
  if (prev === 0 || isNaN(prev)) {
    return null; // 비교군 없음
  }
  return ((curr - prev) / Math.abs(prev)) * 100;
}

/**
 * 날짜 문자열 → Date 객체 (YYYY-MM-DD)
 */
export function parseDate(val: unknown): Date | null {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  const s = String(val).trim();
  // Excel 시리얼 넘버 처리
  const num = Number(s);
  if (!isNaN(num) && num > 40000 && num < 60000) {
    // Excel epoch: 1899-12-30
    const excelEpoch = new Date(1899, 11, 30);
    return new Date(excelEpoch.getTime() + num * 86400000);
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * 숫자 파싱 (쉼표 제거 후 변환)
 */
export function parseNum(val: unknown): number {
  if (val === null || val === undefined || val === "") return 0;
  if (typeof val === "number") return isNaN(val) ? 0 : val;
  const cleaned = String(val).replace(/,/g, "").trim();
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

/**
 * 매출 데이터 행에서 주피미 레이블 계산
 */
export function buildLabels(salesDate: Date): {
  weekLabel: string;
  yearMonth: string;
  yearStr: string;
} {
  // salesDate는 toISOString(UTC) 기준으로 저장되므로 라벨도 UTC 캘린더 값으로 계산해 일관성 유지
  const y = salesDate.getUTCFullYear();
  const m = salesDate.getUTCMonth() + 1;
  return {
    weekLabel: getWeekLabel(salesDate),
    yearMonth: `${y}-${String(m).padStart(2, "0")}월`,
    yearStr: `${y}년`,
  };
}

/**
 * 전월 동기간 날짜 범위 계산
 * refDate 기준으로 전월 1일 ~ 전월 동일일
 */
export function prevMonthSamePeriod(refDate: Date): { start: Date; end: Date } {
  const refDay = refDate.getDate();
  const firstOfCurr = new Date(refDate.getFullYear(), refDate.getMonth(), 1);
  const lastOfPrev = new Date(firstOfCurr.getTime() - 86400000);
  const firstOfPrev = new Date(lastOfPrev.getFullYear(), lastOfPrev.getMonth(), 1);
  const prevDay = Math.min(refDay, lastOfPrev.getDate());
  const endOfPrev = new Date(firstOfPrev.getFullYear(), firstOfPrev.getMonth(), prevDay);
  return { start: firstOfPrev, end: endOfPrev };
}

/**
 * 전년 동기간 날짜 계산
 */
export function prevYearSameDate(refDate: Date): Date {
  return new Date(refDate.getFullYear() - 1, refDate.getMonth(), refDate.getDate());
}

/**
 * 금액 포맷 (백만원 단위)
 * 120,000,000 → "120백만"
 */
export function formatAmountMillion(val: number): string {
  const million = val / 1_000_000;
  if (Math.abs(million) >= 1000) {
    return `${(million / 1000).toFixed(1)}십억`;
  }
  return `${million.toFixed(1)}백만`;
}

/**
 * 수량 포맷 (K/M 축약)
 */
export function formatQty(val: number): string {
  if (Math.abs(val) >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (Math.abs(val) >= 1_000) return `${(val / 1_000).toFixed(1)}K`;
  return val.toLocaleString("ko-KR");
}
