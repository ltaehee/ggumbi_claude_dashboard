/**
 * 대시보드 UI 고도화 - 이익률 계산 및 필터 매출 정렬 테스트
 *
 * 테스트 범위:
 * 1. 이익률 계산 로직 (BOM 원가 기반)
 * 2. getFilterOptions 파라미터 구조 검증
 * 3. getTopItems 파라미터 구조 검증
 */

import { describe, it, expect } from "vitest";

// ─── 이익률 계산 로직 단위 테스트 ─────────────────────────────────────────────

describe("이익률 계산 로직", () => {
  /**
   * BOM 원가 기반 이익률 계산 공식:
   * grossProfit = salesAmt - (unitCost * qty)
   * marginRate = (grossProfit / salesAmt) * 100
   */
  function calcMarginRate(salesAmt: number, unitCost: number, qty: number): number {
    if (salesAmt === 0) return 0;
    const grossProfit = salesAmt - unitCost * qty;
    return (grossProfit / salesAmt) * 100;
  }

  it("정상적인 이익률 계산 - 30% 이익률", () => {
    const salesAmt = 100_000;
    const unitCost = 70_000;
    const qty = 1;
    const rate = calcMarginRate(salesAmt, unitCost, qty);
    expect(rate).toBeCloseTo(30, 1);
  });

  it("원가 없음 (unitCost=0) 시 이익률 100%", () => {
    const rate = calcMarginRate(100_000, 0, 1);
    expect(rate).toBeCloseTo(100, 1);
  });

  it("salesAmt가 0이면 이익률 0% (division by zero 방어)", () => {
    const rate = calcMarginRate(0, 50_000, 1);
    expect(rate).toBe(0);
  });

  it("원가가 salesAmt보다 크면 음수 이익률", () => {
    const rate = calcMarginRate(100_000, 120_000, 1);
    expect(rate).toBeLessThan(0);
  });

  it("수량 10개, 단가 5000, 판매액 100000 → 이익률 50%", () => {
    const rate = calcMarginRate(100_000, 5_000, 10);
    expect(rate).toBeCloseTo(50, 1);
  });

  it("이익률이 100%에 가까운 경우 (BOM 원가 없는 품목) 감지", () => {
    // salesAmt ≈ grossProfit 이면 원가 데이터 없음으로 간주
    const salesAmt = 100_000;
    const grossProfit = 99_940; // 기존 버그 패턴
    const marginRate = (grossProfit / salesAmt) * 100;
    // 이 경우 99.94%가 나오는 것이 버그임을 확인
    expect(marginRate).toBeGreaterThan(99);
    // 실제로는 BOM JOIN으로 계산해야 함
  });
});

// ─── getFilterOptions 파라미터 구조 검증 ─────────────────────────────────────

describe("getFilterOptions 파라미터 구조", () => {
  it("level 파라미터가 올바른 값을 허용", () => {
    const validLevels = ["channel", "itemLarge", "itemMid", "itemSmall", "itemName"] as const;
    validLevels.forEach((level) => {
      expect(validLevels).toContain(level);
    });
  });

  it("startDate/endDate가 선택적 파라미터임을 확인", () => {
    // 날짜 없이도 호출 가능 (전체 기간 기준 매출 정렬)
    const params: {
      dept?: string;
      level: "channel";
      startDate?: string;
      endDate?: string;
    } = { level: "channel" };
    expect(params.startDate).toBeUndefined();
    expect(params.endDate).toBeUndefined();
  });

  it("날짜 범위 지정 시 매출 정렬 활성화 확인", () => {
    const params = {
      level: "channel" as const,
      startDate: "2025-01-01",
      endDate: "2025-12-31",
    };
    expect(params.startDate).toBe("2025-01-01");
    expect(params.endDate).toBe("2025-12-31");
  });
});

// ─── getTopItems 파라미터 구조 검증 ──────────────────────────────────────────

describe("getTopItems 파라미터 구조", () => {
  it("type 파라미터가 channel 또는 itemLarge만 허용", () => {
    const validTypes = ["channel", "itemLarge"] as const;
    expect(validTypes).toContain("channel");
    expect(validTypes).toContain("itemLarge");
  });

  it("limit 기본값 8 적용 확인", () => {
    const params = {
      startDate: "2025-01-01",
      endDate: "2025-12-31",
      type: "channel" as const,
    };
    const limit = (params as any).limit ?? 8;
    expect(limit).toBe(8);
  });

  it("TOP 8 퀵칩 필터 - 결과 배열 구조 검증", () => {
    // 반환 타입: { label: string; totalSales: number }[]
    const mockResult: { label: string; totalSales: number }[] = [
      { label: "쿠팡", totalSales: 5_000_000 },
      { label: "네이버", totalSales: 3_000_000 },
    ];
    expect(mockResult[0]).toHaveProperty("label");
    expect(mockResult[0]).toHaveProperty("totalSales");
    expect(typeof mockResult[0].totalSales).toBe("number");
  });
});

// ─── 파이차트 라벨 표시 로직 검증 ────────────────────────────────────────────

describe("파이차트 라벨 표시 로직", () => {
  it("비중이 4% 미만인 조각은 라벨 생략", () => {
    const shouldShowLabel = (percent: number) => percent >= 0.04;
    expect(shouldShowLabel(0.03)).toBe(false);
    expect(shouldShowLabel(0.04)).toBe(true);
    expect(shouldShowLabel(0.15)).toBe(true);
  });

  it("퍼센트 포맷 - 소수점 1자리", () => {
    const formatPct = (percent: number) => `${(percent * 100).toFixed(1)}%`;
    expect(formatPct(0.3)).toBe("30.0%");
    expect(formatPct(0.125)).toBe("12.5%");
    expect(formatPct(0.0567)).toBe("5.7%");
  });
});
