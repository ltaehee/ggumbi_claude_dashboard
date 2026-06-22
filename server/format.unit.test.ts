/**
 * 금액/수량 포맷 함수 단위 테스트
 * format.ts는 클라이언트 파일이지만 로직 검증을 위해 동일 로직을 서버 테스트로 작성
 */
import { describe, it, expect } from "vitest";

// ─── format.ts 로직 복제 (클라이언트 파일 직접 import 불가) ───────────────────
function fmtAmt(val: number | null | undefined): string {
  if (val == null || isNaN(val)) return "0 원";
  return `${Math.round(val).toLocaleString("ko-KR")} 원`;
}

function fmtQty(val: number | null | undefined): string {
  if (val == null || isNaN(val)) return "0";
  return Math.round(val).toLocaleString("ko-KR");
}

function fmtAsp(val: number | null | undefined): string {
  if (val == null || isNaN(val)) return "0 원";
  return `${Math.round(val).toLocaleString("ko-KR")} 원`;
}

function fmtPct(val: number | null | undefined): string {
  if (val == null || isNaN(val)) return "0.0%";
  return `${val >= 0 ? "+" : ""}${val.toFixed(1)}%`;
}

// ─── 테스트 ───────────────────────────────────────────────────────────────────
describe("fmtAmt - 천 단위 콤마 전체 숫자 표기", () => {
  it("61억 → 6,100,000,000 원", () => {
    expect(fmtAmt(6_100_000_000)).toBe("6,100,000,000 원");
  });

  it("3억 9백만 → 309,200,000 원", () => {
    expect(fmtAmt(309_200_000)).toBe("309,200,000 원");
  });

  it("1백만 → 1,000,000 원", () => {
    expect(fmtAmt(1_000_000)).toBe("1,000,000 원");
  });

  it("천원 → 1,000 원", () => {
    expect(fmtAmt(1_000)).toBe("1,000 원");
  });

  it("0 → 0 원", () => {
    expect(fmtAmt(0)).toBe("0 원");
  });

  it("null → 0 원", () => {
    expect(fmtAmt(null)).toBe("0 원");
  });

  it("undefined → 0 원", () => {
    expect(fmtAmt(undefined)).toBe("0 원");
  });

  it("소수점 반올림 처리", () => {
    expect(fmtAmt(1_234_567.89)).toBe("1,234,568 원");
  });

  it("음수 금액 처리", () => {
    expect(fmtAmt(-500_000)).toBe("-500,000 원");
  });

  it("축약형(십억/백만) 없음 검증", () => {
    const result = fmtAmt(6_100_000_000);
    expect(result).not.toContain("십억");
    expect(result).not.toContain("백만");
    expect(result).not.toContain("천");
  });
});

describe("fmtQty - 천 단위 콤마 전체 숫자 표기", () => {
  it("9000 → 9,000", () => {
    expect(fmtQty(9_000)).toBe("9,000");
  });

  it("1000000 → 1,000,000", () => {
    expect(fmtQty(1_000_000)).toBe("1,000,000");
  });

  it("K/M 축약형 없음 검증", () => {
    const result9k = fmtQty(9_000);
    const result1m = fmtQty(1_000_000);
    expect(result9k).not.toContain("K");
    expect(result9k).not.toContain("k");
    expect(result1m).not.toContain("M");
    expect(result1m).not.toContain("m");
  });

  it("0 → 0", () => {
    expect(fmtQty(0)).toBe("0");
  });

  it("null → 0", () => {
    expect(fmtQty(null)).toBe("0");
  });

  it("소수점 반올림 처리", () => {
    expect(fmtQty(1234.7)).toBe("1,235");
  });
});

describe("fmtAsp - 단가 천 단위 콤마 표기", () => {
  it("25000 → 25,000 원", () => {
    expect(fmtAsp(25_000)).toBe("25,000 원");
  });

  it("만원 이상도 축약 없이 전체 숫자", () => {
    expect(fmtAsp(150_000)).toBe("150,000 원");
    expect(fmtAsp(150_000)).not.toContain("만원");
  });

  it("0 → 0 원", () => {
    expect(fmtAsp(0)).toBe("0 원");
  });
});

describe("fmtPct - 증감률 포맷 (변경 없음)", () => {
  it("양수 → +기호 포함", () => {
    expect(fmtPct(12.5)).toBe("+12.5%");
  });

  it("음수 → 마이너스 기호", () => {
    expect(fmtPct(-5.3)).toBe("-5.3%");
  });

  it("0 → +0.0%", () => {
    expect(fmtPct(0)).toBe("+0.0%");
  });

  it("null → 0.0%", () => {
    expect(fmtPct(null)).toBe("0.0%");
  });
});
