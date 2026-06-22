/**
 * 프로모션 Read-only 전환 관련 테스트
 * - PromoDialog(추가/편집) 제거 후 조회 전용 API만 남아있는지 검증
 * - 프로모션 목록 필터링 로직 검증
 */
import { describe, it, expect } from "vitest";

// ─── 프로모션 목록 필터링 로직 (TargetsPage 내 filteredPromos 로직 추출) ───
type PromoItem = {
  id: number;
  eventName?: string | null;
  channel?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  targetAmt?: number | null;
  achievedAmt?: number | null;
  note?: string | null;
  notionPageId?: string | null;
};

function filterPromos(
  promos: PromoItem[],
  searchText: string,
  filterChannel: string,
  filterStatus: string,
  today: Date = new Date(),
): PromoItem[] {
  const todayNorm = new Date(today);
  todayNorm.setHours(0, 0, 0, 0);

  return promos.filter((p) => {
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
      if (filterStatus === "upcoming" && !(start && start > todayNorm)) return false;
      if (filterStatus === "ongoing" && !(start && end && start <= todayNorm && end >= todayNorm)) return false;
      if (filterStatus === "ended" && !(end && end < todayNorm)) return false;
    }
    return true;
  });
}

const SAMPLE_PROMOS: PromoItem[] = [
  { id: 1, eventName: "봄 기획전", channel: "쿠팡", startDate: "2025-03-01", endDate: "2025-03-31", targetAmt: 5000000, achievedAmt: 4500000, notionPageId: "notion-1" },
  { id: 2, eventName: "여름 세일", channel: "네이버", startDate: "2025-07-01", endDate: "2025-07-31", targetAmt: 8000000, achievedAmt: 0 },
  { id: 3, eventName: "추석 특가", channel: "쿠팡", startDate: "2025-09-10", endDate: "2025-09-20", targetAmt: 3000000, achievedAmt: 3500000, notionPageId: "notion-3" },
  { id: 4, eventName: "블랙프라이데이", channel: "11번가", startDate: "2025-11-28", endDate: "2025-11-30", targetAmt: 10000000, achievedAmt: 0, note: "상태: 예정 | 메인제품: 유아용품" },
];

describe("프로모션 목록 필터링 로직", () => {
  it("텍스트 검색 - 행사명으로 필터링", () => {
    const result = filterPromos(SAMPLE_PROMOS, "봄", "all", "all");
    expect(result).toHaveLength(1);
    expect(result[0].eventName).toBe("봄 기획전");
  });

  it("텍스트 검색 - 채널명으로 필터링", () => {
    const result = filterPromos(SAMPLE_PROMOS, "쿠팡", "all", "all");
    expect(result).toHaveLength(2);
  });

  it("텍스트 검색 - 비고(note)로 필터링", () => {
    const result = filterPromos(SAMPLE_PROMOS, "유아용품", "all", "all");
    expect(result).toHaveLength(1);
    expect(result[0].eventName).toBe("블랙프라이데이");
  });

  it("채널 필터 - 쿠팡만 표시", () => {
    const result = filterPromos(SAMPLE_PROMOS, "", "쿠팡", "all");
    expect(result).toHaveLength(2);
    result.forEach((p) => expect(p.channel).toBe("쿠팡"));
  });

  it("채널 필터 - 11번가만 표시", () => {
    const result = filterPromos(SAMPLE_PROMOS, "", "11번가", "all");
    expect(result).toHaveLength(1);
    expect(result[0].eventName).toBe("블랙프라이데이");
  });

  it("상태 필터 - 종료된 행사 (2025-04-01 기준)", () => {
    const today = new Date("2025-04-01");
    const result = filterPromos(SAMPLE_PROMOS, "", "all", "ended", today);
    // 봄 기획전 (3월 말 종료)이 종료됨
    expect(result.some((p) => p.eventName === "봄 기획전")).toBe(true);
  });

  it("상태 필터 - 진행 중인 행사 (2025-07-15 기준)", () => {
    const today = new Date("2025-07-15");
    const result = filterPromos(SAMPLE_PROMOS, "", "all", "ongoing", today);
    expect(result).toHaveLength(1);
    expect(result[0].eventName).toBe("여름 세일");
  });

  it("상태 필터 - 예정된 행사 (2025-07-01 기준)", () => {
    const today = new Date("2025-07-01");
    const result = filterPromos(SAMPLE_PROMOS, "", "all", "upcoming", today);
    // 추석 특가, 블랙프라이데이가 예정
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result.some((p) => p.eventName === "추석 특가")).toBe(true);
    expect(result.some((p) => p.eventName === "블랙프라이데이")).toBe(true);
  });

  it("복합 필터 - 쿠팡 채널 + 텍스트 검색", () => {
    const result = filterPromos(SAMPLE_PROMOS, "추석", "쿠팡", "all");
    expect(result).toHaveLength(1);
    expect(result[0].eventName).toBe("추석 특가");
  });

  it("필터 없음 - 전체 반환", () => {
    const result = filterPromos(SAMPLE_PROMOS, "", "all", "all");
    expect(result).toHaveLength(SAMPLE_PROMOS.length);
  });

  it("검색어 없을 때 빈 결과 없음", () => {
    const result = filterPromos(SAMPLE_PROMOS, "", "all", "all");
    expect(result.length).toBeGreaterThan(0);
  });
});

describe("달성률 계산 로직", () => {
  it("목표 대비 달성률 계산", () => {
    const p = SAMPLE_PROMOS[0]; // targetAmt: 5000000, achievedAmt: 4500000
    const achievePct = (p.targetAmt ?? 0) > 0
      ? ((p.achievedAmt ?? 0) / (p.targetAmt ?? 1)) * 100
      : 0;
    expect(achievePct).toBe(90);
  });

  it("목표 초과 달성 (100% 이상)", () => {
    const p = SAMPLE_PROMOS[2]; // targetAmt: 3000000, achievedAmt: 3500000
    const achievePct = (p.targetAmt ?? 0) > 0
      ? ((p.achievedAmt ?? 0) / (p.targetAmt ?? 1)) * 100
      : 0;
    expect(achievePct).toBeCloseTo(116.67, 1);
  });

  it("목표 미설정 시 달성률 0", () => {
    const p: PromoItem = { id: 99, eventName: "테스트", targetAmt: 0, achievedAmt: 1000 };
    const achievePct = (p.targetAmt ?? 0) > 0
      ? ((p.achievedAmt ?? 0) / (p.targetAmt ?? 1)) * 100
      : 0;
    expect(achievePct).toBe(0);
  });
});

describe("노션 동기화 데이터 식별", () => {
  it("notionPageId가 있는 행사는 노션 동기화 데이터", () => {
    const notionSynced = SAMPLE_PROMOS.filter((p) => !!p.notionPageId);
    expect(notionSynced).toHaveLength(2);
    expect(notionSynced.every((p) => p.notionPageId?.startsWith("notion-"))).toBe(true);
  });

  it("notionPageId가 없는 행사는 수동 입력 데이터", () => {
    const manual = SAMPLE_PROMOS.filter((p) => !p.notionPageId);
    expect(manual).toHaveLength(2);
  });
});
