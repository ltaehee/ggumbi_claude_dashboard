/**
 * notionSync.ts
 * 노션 행사관리 DB → promotions 테이블 자동 동기화 모듈
 *
 * 노션 DB 컬럼 매핑:
 *   행사(프로모션) → eventName (title)
 *   행사기간       → startDate, endDate (date)
 *   채널명         → channel (select)
 *   브랜드         → dept (select)
 *   매출목표       → targetAmt (number)
 *   달성 매출      → achievedAmt (number)
 *   상태           → note에 포함 (select)
 *   메인제품       → note에 포함 (select)
 *   예상 마진율    → note에 포함 (number)
 */

import { ENV } from "./_core/env";
import { upsertPromotionsFromNotion, setAppSetting, getAppSetting } from "./db";

const NOTION_API_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

// ─── 노션 API 헬퍼 ────────────────────────────────────────────────────────────

async function notionFetch(path: string, options: RequestInit = {}): Promise<any> {
  const res = await fetch(`${NOTION_API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${ENV.notionApiKey}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Notion API error ${res.status}: ${err.message ?? res.statusText}`);
  }
  return res.json();
}

// ─── 프로퍼티 추출 헬퍼 ──────────────────────────────────────────────────────

function extractTitle(prop: any): string {
  return (prop?.title ?? []).map((r: any) => r.plain_text ?? "").join("").trim();
}

function extractRichText(prop: any): string {
  return (prop?.rich_text ?? []).map((r: any) => r.plain_text ?? "").join("").trim();
}

function extractSelect(prop: any): string | null {
  return prop?.select?.name ?? null;
}

function extractNumber(prop: any): number | null {
  return typeof prop?.number === "number" ? prop.number : null;
}

function extractDate(prop: any): { start: string | null; end: string | null } {
  return {
    start: prop?.date?.start ?? null,
    end: prop?.date?.end ?? null,
  };
}

function extractMultiSelect(prop: any): string[] {
  return (prop?.multi_select ?? []).map((s: any) => s.name ?? "");
}

// ─── 노션 페이지 → promotions 행 변환 ────────────────────────────────────────

export interface NotionPromoRow {
  notionPageId: string;
  eventName: string;
  startDate: string | null;
  endDate: string | null;
  channel: string | null;
  dept: string | null;
  targetAmt: number | null;
  achievedAmt: number | null;
  note: string | null;
}

function parseNotionPage(page: any): NotionPromoRow {
  const props = page.properties ?? {};

  const eventName = extractTitle(props["행사(프로모션)"]);
  const dateRange = extractDate(props["행사기간"]);
  const channel = extractSelect(props["채널명"]);
  const dept = extractSelect(props["브랜드"]);
  const targetAmt = extractNumber(props["매출목표"]);
  const achievedAmt = extractNumber(props["달성 매출"]);
  const status = extractSelect(props["상태"]);
  const mainProduct = extractSelect(props["메인제품"]);
  const marginRate = extractNumber(props["예상 마진율"]);
  const productGroups = extractMultiSelect(props["제품군"]);

  // note 필드에 상태/메인제품/마진율/제품군 통합
  const noteParts: string[] = [];
  if (status) noteParts.push(`상태: ${status}`);
  if (mainProduct) noteParts.push(`메인제품: ${mainProduct}`);
  if (productGroups.length > 0) noteParts.push(`제품군: ${productGroups.join(", ")}`);
  if (marginRate !== null) noteParts.push(`예상마진율: ${marginRate}%`);

  return {
    notionPageId: page.id,
    eventName: eventName || "(제목 없음)",
    startDate: dateRange.start,
    endDate: dateRange.end,
    channel,
    dept,
    targetAmt,
    achievedAmt,
    note: noteParts.length > 0 ? noteParts.join(" | ") : null,
  };
}

// ─── 노션 DB 전체 페이지 조회 (페이지네이션 처리) ────────────────────────────

export async function fetchAllNotionPromotions(): Promise<NotionPromoRow[]> {
  if (!ENV.notionApiKey || !ENV.notionDatabaseId) {
    throw new Error("NOTION_API_KEY 또는 NOTION_DATABASE_ID 환경변수가 설정되지 않았습니다.");
  }

  const results: any[] = [];
  let cursor: string | undefined = undefined;
  let hasMore = true;

  while (hasMore) {
    const body: any = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;

    const data = await notionFetch(`/databases/${ENV.notionDatabaseId}/query`, {
      method: "POST",
      body: JSON.stringify(body),
    });

    results.push(...(data.results ?? []));
    hasMore = data.has_more ?? false;
    cursor = data.next_cursor ?? undefined;
  }

  return results.map(parseNotionPage);
}

// ─── 메인 동기화 함수 ─────────────────────────────────────────────────────────

export interface SyncResult {
  total: number;
  upserted: number;
  syncedAt: string;
  errors: string[];
}

export async function syncNotionToDb(): Promise<SyncResult> {
  const syncedAt = new Date().toISOString();
  const errors: string[] = [];

  let rows: NotionPromoRow[] = [];
  try {
    rows = await fetchAllNotionPromotions();
  } catch (err: any) {
    errors.push(`노션 API 조회 실패: ${err.message}`);
    return { total: 0, upserted: 0, syncedAt, errors };
  }

  let upserted = 0;
  try {
    upserted = await upsertPromotionsFromNotion(rows);
  } catch (err: any) {
    errors.push(`DB Upsert 실패: ${err.message}`);
  }

  // 마지막 동기화 시각 저장
  try {
    await setAppSetting("notion_last_synced_at", syncedAt);
  } catch (_) {
    // 설정 저장 실패는 무시
  }

  return { total: rows.length, upserted, syncedAt, errors };
}

// ─── 마지막 동기화 시각 조회 ──────────────────────────────────────────────────

export async function getNotionLastSyncedAt(): Promise<string | null> {
  try {
    return await getAppSetting("notion_last_synced_at");
  } catch {
    return null;
  }
}
