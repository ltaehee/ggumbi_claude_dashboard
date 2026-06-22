/**
 * naverRanking.test.ts
 * 네이버 랭킹 분석 모듈 단위 테스트
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── 구글 시트 파싱 로직 테스트 ──────────────────────────────────────────────
describe("naverSheetSync - 날짜 파싱", () => {
  it("YYYY-MM-DD 형식 날짜를 올바르게 파싱한다", () => {
    const raw = "2025-05-20";
    const date = new Date(raw + "T00:00:00");
    expect(date.getFullYear()).toBe(2025);
    expect(date.getMonth()).toBe(4); // 0-indexed
    expect(date.getDate()).toBe(20);
  });

  it("YYYY/MM/DD 형식 날짜를 정규화한다", () => {
    const raw = "2025/05/20";
    const normalized = raw.replace(/\//g, "-");
    const date = new Date(normalized + "T00:00:00");
    expect(date.getFullYear()).toBe(2025);
    expect(date.getMonth()).toBe(4);
  });

  it("빈 날짜 문자열은 NaN을 반환한다", () => {
    const date = new Date("" + "T00:00:00");
    expect(isNaN(date.getTime())).toBe(true);
  });
});

// ─── 순위 변동 계산 테스트 ──────────────────────────────────────────────────
describe("순위 변동 계산 로직", () => {
  function calcRankChange(today: number, prev: number | null): number | null {
    if (prev === null) return null;
    return prev - today; // 양수 = 상승, 음수 = 하락
  }

  it("전날 5위 → 오늘 3위: 변동 +2 (상승)", () => {
    expect(calcRankChange(3, 5)).toBe(2);
  });

  it("전날 3위 → 오늘 8위: 변동 -5 (하락)", () => {
    expect(calcRankChange(8, 3)).toBe(-5);
  });

  it("전날 없음: 변동 null", () => {
    expect(calcRankChange(5, null)).toBeNull();
  });

  it("순위 동일: 변동 0", () => {
    expect(calcRankChange(7, 7)).toBe(0);
  });
});

// ─── 가격 포맷 테스트 ────────────────────────────────────────────────────────
describe("가격 포맷 함수", () => {
  function fmtPrice(v: number | null): string {
    if (v === null || v === undefined) return "-";
    return v.toLocaleString("ko-KR") + "원";
  }

  it("34000 → '34,000원'", () => {
    expect(fmtPrice(34000)).toBe("34,000원");
  });

  it("1234567 → '1,234,567원'", () => {
    expect(fmtPrice(1234567)).toBe("1,234,567원");
  });

  it("null → '-'", () => {
    expect(fmtPrice(null)).toBe("-");
  });

  it("0 → '0원'", () => {
    expect(fmtPrice(0)).toBe("0원");
  });
});

// ─── 80위 권외 처리 테스트 ───────────────────────────────────────────────────
describe("80위 권외 처리 로직", () => {
  function normalizeRankForChart(rank: number): number {
    return rank > 80 ? 85 : rank;
  }

  it("80위 이하는 그대로 반환", () => {
    expect(normalizeRankForChart(1)).toBe(1);
    expect(normalizeRankForChart(40)).toBe(40);
    expect(normalizeRankForChart(80)).toBe(80);
  });

  it("81위 이상은 85로 고정 (권외 표시)", () => {
    expect(normalizeRankForChart(81)).toBe(85);
    expect(normalizeRankForChart(100)).toBe(85);
    expect(normalizeRankForChart(999)).toBe(85);
  });
});

// ─── 즐겨찾기 정렬 테스트 ───────────────────────────────────────────────────
describe("즐겨찾기 상단 고정 정렬", () => {
  interface Row { productCode: string; rank: number; isFavorite: boolean; }

  function sortWithFavorites(rows: Row[]): Row[] {
    const favs = rows.filter((r) => r.isFavorite);
    const rest = rows.filter((r) => !r.isFavorite);
    return [...favs, ...rest];
  }

  it("즐겨찾기 항목이 상단에 위치한다", () => {
    const rows: Row[] = [
      { productCode: "A", rank: 1, isFavorite: false },
      { productCode: "B", rank: 2, isFavorite: true },
      { productCode: "C", rank: 3, isFavorite: false },
      { productCode: "D", rank: 4, isFavorite: true },
    ];
    const sorted = sortWithFavorites(rows);
    expect(sorted[0].isFavorite).toBe(true);
    expect(sorted[1].isFavorite).toBe(true);
    expect(sorted[2].isFavorite).toBe(false);
    expect(sorted[3].isFavorite).toBe(false);
  });

  it("즐겨찾기 없으면 원래 순서 유지", () => {
    const rows: Row[] = [
      { productCode: "A", rank: 1, isFavorite: false },
      { productCode: "B", rank: 2, isFavorite: false },
    ];
    const sorted = sortWithFavorites(rows);
    expect(sorted[0].productCode).toBe("A");
    expect(sorted[1].productCode).toBe("B");
  });
});

// ─── 검색 필터 테스트 ───────────────────────────────────────────────────────
describe("검색 필터 로직", () => {
  interface Row {
    productCode: string;
    productName: string | null;
    seller: string | null;
  }

  function filterRows(rows: Row[], query: string): Row[] {
    if (!query.trim()) return rows;
    const q = query.toLowerCase();
    return rows.filter(
      (r) =>
        r.productCode.toLowerCase().includes(q) ||
        (r.productName ?? "").toLowerCase().includes(q) ||
        (r.seller ?? "").toLowerCase().includes(q)
    );
  }

  const rows: Row[] = [
    { productCode: "P001", productName: "꿈비 아기 침대", seller: "꿈비공식몰" },
    { productCode: "P002", productName: "꿈비 유모차", seller: "네이버쇼핑" },
    { productCode: "P003", productName: "타사 제품", seller: "타사몰" },
  ];

  it("상품명으로 검색", () => {
    const result = filterRows(rows, "침대");
    expect(result).toHaveLength(1);
    expect(result[0].productCode).toBe("P001");
  });

  it("상품코드로 검색", () => {
    const result = filterRows(rows, "P002");
    expect(result).toHaveLength(1);
    expect(result[0].productName).toBe("꿈비 유모차");
  });

  it("빈 검색어는 전체 반환", () => {
    const result = filterRows(rows, "");
    expect(result).toHaveLength(3);
  });

  it("판매처로 검색", () => {
    const result = filterRows(rows, "꿈비공식");
    expect(result).toHaveLength(1);
    expect(result[0].productCode).toBe("P001");
  });
});
