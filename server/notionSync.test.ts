/**
 * notionSync.test.ts
 * 노션 동기화 모듈 단위 테스트 (실제 notionSync.ts import 기반)
 * - fetch는 vi.stubGlobal로 mock
 * - DB helper는 vi.mock으로 mock
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── DB 헬퍼 mock ─────────────────────────────────────────────────────────────
vi.mock("./db", () => ({
  upsertPromotionsFromNotion: vi.fn().mockResolvedValue(3),
  setAppSetting: vi.fn().mockResolvedValue(undefined),
  getAppSetting: vi.fn().mockResolvedValue(null),
}));

// ─── ENV mock ─────────────────────────────────────────────────────────────────
vi.mock("./_core/env", () => ({
  ENV: {
    notionApiKey: "test-api-key",
    notionDatabaseId: "test-db-id",
  },
}));

import { syncNotionToDb, getNotionLastSyncedAt, fetchAllNotionPromotions } from "./notionSync";
import { upsertPromotionsFromNotion, setAppSetting, getAppSetting } from "./db";

// ─── 샘플 노션 응답 ────────────────────────────────────────────────────────────

const mockNotionPage = (id: string, title: string, channel: string | null = "쇼핑라이브") => ({
  id,
  properties: {
    "행사(프로모션)": { type: "title", title: [{ plain_text: title }] },
    "행사기간": { type: "date", date: { start: "2026-05-29", end: null } },
    "채널명": { type: "select", select: channel ? { name: channel } : null },
    "브랜드": { type: "select", select: { name: "꿈비" } },
    "매출목표": { type: "number", number: 7000000 },
    "달성 매출": { type: "number", number: null },
    "상태": { type: "select", select: { name: "시작 전" } },
    "메인제품": { type: "select", select: { name: "듀얼팬아이스쿨시트" } },
    "예상 마진율": { type: "number", number: 25 },
    "제품군": { type: "multi_select", multi_select: [{ name: "시즌용품" }] },
  },
});

const makeNotionResponse = (pages: any[], hasMore = false, nextCursor: string | null = null) => ({
  results: pages,
  has_more: hasMore,
  next_cursor: nextCursor,
});

// ─── 테스트 ───────────────────────────────────────────────────────────────────

describe("fetchAllNotionPromotions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("단일 페이지 응답을 올바르게 파싱한다", async () => {
    const pages = [
      mockNotionPage("id-1", "[쇼핑라이브] 5/29 시즌용품"),
      mockNotionPage("id-2", "[공동구매] LED분유쉐이커"),
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeNotionResponse(pages),
    }));

    const result = await fetchAllNotionPromotions();
    expect(result).toHaveLength(2);
    expect(result[0].notionPageId).toBe("id-1");
    expect(result[0].eventName).toBe("[쇼핑라이브] 5/29 시즌용품");
    expect(result[0].channel).toBe("쇼핑라이브");
    expect(result[0].dept).toBe("꿈비");
    expect(result[0].targetAmt).toBe(7000000);
    expect(result[0].startDate).toBe("2026-05-29");
  });

  it("페이지네이션이 있을 때 모든 페이지를 수집한다", async () => {
    const page1 = [mockNotionPage("id-1", "행사1")];
    const page2 = [mockNotionPage("id-2", "행사2")];

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => makeNotionResponse(page1, true, "cursor-abc") })
      .mockResolvedValueOnce({ ok: true, json: async () => makeNotionResponse(page2, false, null) });

    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchAllNotionPromotions();
    expect(result).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // 두 번째 요청에 start_cursor가 포함됐는지 확인
    const secondCallBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(secondCallBody.start_cursor).toBe("cursor-abc");
  });

  it("채널이 null인 페이지를 처리한다", async () => {
    const pages = [mockNotionPage("id-3", "채널없는행사", null)];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeNotionResponse(pages),
    }));

    const result = await fetchAllNotionPromotions();
    expect(result[0].channel).toBeNull();
  });

  it("API 오류 시 에러를 throw한다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ message: "Unauthorized" }),
    }));

    await expect(fetchAllNotionPromotions()).rejects.toThrow("Notion API error 401");
  });
});

describe("syncNotionToDb", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("성공 시 total/upserted/errors를 반환한다", async () => {
    const pages = [
      mockNotionPage("id-1", "행사1"),
      mockNotionPage("id-2", "행사2"),
      mockNotionPage("id-3", "행사3"),
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeNotionResponse(pages),
    }));

    const result = await syncNotionToDb();
    expect(result.total).toBe(3);
    expect(result.upserted).toBe(3); // mock returns 3
    expect(result.errors).toHaveLength(0);
    expect(result.syncedAt).toBeTruthy();
  });

  it("syncNotionToDb 성공 시 setAppSetting이 호출된다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeNotionResponse([mockNotionPage("id-1", "행사1")]),
    }));

    await syncNotionToDb();
    expect(setAppSetting).toHaveBeenCalledWith("notion_last_synced_at", expect.any(String));
  });

  it("노션 API 실패 시 errors 배열에 메시지를 담아 반환한다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ message: "Forbidden" }),
    }));

    const result = await syncNotionToDb();
    expect(result.total).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("노션 API 조회 실패");
  });

  it("upsertPromotionsFromNotion이 올바른 데이터로 호출된다", async () => {
    const pages = [mockNotionPage("id-1", "[쇼핑라이브] 행사")];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeNotionResponse(pages),
    }));

    await syncNotionToDb();
    expect(upsertPromotionsFromNotion).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          notionPageId: "id-1",
          eventName: "[쇼핑라이브] 행사",
          channel: "쇼핑라이브",
        }),
      ])
    );
  });
});

describe("getNotionLastSyncedAt", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("getAppSetting 반환값을 그대로 반환한다", async () => {
    vi.mocked(getAppSetting).mockResolvedValueOnce("2026-05-21T09:00:00.000Z");
    const result = await getNotionLastSyncedAt();
    expect(result).toBe("2026-05-21T09:00:00.000Z");
  });

  it("설정이 없으면 null을 반환한다", async () => {
    vi.mocked(getAppSetting).mockResolvedValueOnce(null);
    const result = await getNotionLastSyncedAt();
    expect(result).toBeNull();
  });
});
