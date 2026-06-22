import { describe, expect, it } from "vitest";
import {
  getWeekLabel,
  calcPctSafe,
  buildLabels,
  prevMonthSamePeriod,
  parseDate,
  parseNum,
} from "./bizUtils";

describe("getWeekLabel", () => {
  it("수요일 기준으로 주차를 계산한다", () => {
    // 2026-01-07 (수요일) → 2026년 1월 2주차
    const label = getWeekLabel(new Date("2026-01-07"));
    expect(label).toContain("2026년");
    expect(label).toContain("1월");
    expect(label).toMatch(/\d+주차/);
  });

  it("1월 1일 (목요일)은 1주차에 속한다", () => {
    const label = getWeekLabel(new Date("2026-01-01"));
    expect(label).toBe("2026년 1월 1주차");
  });

  it("같은 주 내 날짜는 동일한 주차 레이블을 반환한다", () => {
    // 2026-01-08 (목) ~ 2026-01-10 (토) 는 같은 주 (2주차)
    const labels = [
      getWeekLabel(new Date("2026-01-08")),
      getWeekLabel(new Date("2026-01-09")),
      getWeekLabel(new Date("2026-01-10")),
    ];
    expect(labels[0]).toBe(labels[1]);
    expect(labels[1]).toBe(labels[2]);
  });
});

describe("calcPctSafe", () => {
  it("정상 증가율 계산", () => {
    expect(calcPctSafe(110, 100)).toBeCloseTo(10.0);
  });

  it("감소율 계산", () => {
    expect(calcPctSafe(90, 100)).toBeCloseTo(-10.0);
  });

  it("prev가 0이면 100 반환 (curr > 0)", () => {
    expect(calcPctSafe(100, 0)).toBe(100.0);
  });

  it("curr와 prev가 모두 0이면 0 반환", () => {
    expect(calcPctSafe(0, 0)).toBe(0.0);
  });
});

describe("buildLabels", () => {
  it("날짜에서 weekLabel, yearMonth, yearStr를 올바르게 생성한다", () => {
    const result = buildLabels(new Date("2026-03-15"));
    expect(result.yearMonth).toContain("2026");
    expect(result.yearMonth).toContain("3");
    expect(result.yearStr).toContain("2026");
    expect(result.weekLabel).toContain("2026년");
    expect(result.weekLabel).toContain("3월");
  });
});

describe("prevMonthSamePeriod", () => {
  it("3월 15일 기준 → 전월 동기간은 2월 1일 ~ 2월 15일", () => {
    const { start, end } = prevMonthSamePeriod(new Date("2026-03-15"));
    expect(start.getMonth()).toBe(1); // 2월 (0-indexed)
    expect(start.getDate()).toBe(1);
    expect(end.getMonth()).toBe(1);
    expect(end.getDate()).toBe(15);
  });

  it("1월 기준 → 전월은 12월 (작년)", () => {
    const { start, end } = prevMonthSamePeriod(new Date("2026-01-20"));
    expect(start.getFullYear()).toBe(2025);
    expect(start.getMonth()).toBe(11); // 12월
    expect(end.getDate()).toBe(20);
  });
});

describe("parseDate", () => {
  it("문자열 날짜 파싱", () => {
    const d = parseDate("2026-05-21");
    expect(d).not.toBeNull();
    expect(d?.getFullYear()).toBe(2026);
    expect(d?.getMonth()).toBe(4); // 5월 (0-indexed)
    expect(d?.getDate()).toBe(21);
  });

  it("Excel 시리얼 숫자 파싱", () => {
    // Excel serial 45000 ≈ 2023-03-15
    const d = parseDate(45000);
    expect(d).not.toBeNull();
    expect(d?.getFullYear()).toBe(2023);
  });

  it("Date 객체 그대로 반환", () => {
    const input = new Date("2026-01-01");
    const d = parseDate(input);
    expect(d?.getTime()).toBe(input.getTime());
  });

  it("null/undefined → null 반환", () => {
    expect(parseDate(null)).toBeNull();
    expect(parseDate(undefined)).toBeNull();
  });
});

describe("parseNum", () => {
  it("숫자 문자열 파싱", () => {
    expect(parseNum("1,234,567")).toBe(1234567);
  });

  it("숫자 그대로 반환", () => {
    expect(parseNum(42)).toBe(42);
  });

  it("null/undefined → 0 반환", () => {
    expect(parseNum(null)).toBe(0);
    expect(parseNum(undefined)).toBe(0);
  });

  it("빈 문자열 → 0 반환", () => {
    expect(parseNum("")).toBe(0);
  });
});
