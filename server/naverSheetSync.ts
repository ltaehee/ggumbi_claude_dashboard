/**
 * naverSheetSync.ts
 * 구글 시트에서 네이버 쇼핑 랭킹 데이터를 읽어 DB에 Upsert하는 모듈
 * - H열(비고) 업데이트
 * - I열(브랜드 강조 키워드) 읽기/쓰기
 */
import https from "https";
import crypto from "crypto";
import { getDb } from "./db";
import { naverRankings } from "../drizzle/schema";
import { sql } from "drizzle-orm";
import { ENV as env } from "./_core/env";

// ─── Google Sheets JWT Auth ──────────────────────────────────────────────────

async function getGoogleAccessToken(scopes?: string): Promise<string> {
  const email = env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (!email || !rawKey) throw new Error("Google service account credentials not configured");

  const key = rawKey.replace(/\\n/g, "\n");
  const scope = scopes ?? "https://www.googleapis.com/auth/spreadsheets.readonly";

  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      iss: email,
      scope,
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
    })
  ).toString("base64url");

  const sign = crypto.createSign("RSA-SHA256");
  sign.update(header + "." + payload);
  const sig = sign.sign(key, "base64url");
  const jwt = header + "." + payload + "." + sig;

  const body = `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`;

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "oauth2.googleapis.com",
        path: "/token",
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => {
          const r = JSON.parse(d);
          if (r.access_token) resolve(r.access_token);
          else reject(new Error(`Google auth failed: ${d.substring(0, 200)}`));
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// ─── Fetch sheet values ──────────────────────────────────────────────────────

async function fetchSheetValues(
  token: string,
  sheetId: string,
  range: string
): Promise<string[][]> {
  const encodedRange = encodeURIComponent(range);
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "sheets.googleapis.com",
        path: `/v4/spreadsheets/${sheetId}/values/${encodedRange}?majorDimension=ROWS`,
        method: "GET",
        headers: { Authorization: "Bearer " + token },
      },
      (res) => {
        // Buffer로 수집 후 utf8 변환 - 멀티바이트 한글 청크 경계 깨짐 방지
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
        res.on("end", () => {
          const d = Buffer.concat(chunks).toString("utf8");
          const r = JSON.parse(d);
          if (r.error) reject(new Error(`Sheets API error: ${JSON.stringify(r.error)}`));
          else resolve(r.values || []);
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}

// ─── Update sheet cell (PUT) ─────────────────────────────────────────────────

async function updateSheetCell(
  token: string,
  sheetId: string,
  range: string,
  value: string
): Promise<void> {
  const encodedRange = encodeURIComponent(range);
  const body = JSON.stringify({
    range,
    majorDimension: "ROWS",
    values: [[value]],
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "sheets.googleapis.com",
        path: `/v4/spreadsheets/${sheetId}/values/${encodedRange}?valueInputOption=RAW`,
        method: "PUT",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => {
          const r = JSON.parse(d);
          if (r.error) reject(new Error(`Sheets update error: ${JSON.stringify(r.error)}`));
          else resolve();
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// ─── Parse helpers ──────────────────────────────────────────────────────────

function parsePrice(raw: string | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^0-9]/g, "");
  const n = parseInt(cleaned, 10);
  return isNaN(n) ? null : n;
}

function parseDate(raw: string | undefined): { recordedAt: Date; recordedDate: string } | null {
  if (!raw) return null;
  const d = new Date(raw.replace(" ", "T") + (raw.includes(":") ? "" : "T00:00:00"));
  if (isNaN(d.getTime())) return null;
  const recordedDate = d.toISOString().split("T")[0];
  return { recordedAt: d, recordedDate };
}

// ─── Main sync function ──────────────────────────────────────────────────────

export interface SyncResult {
  inserted: number;
  skipped: number;
  errors: string[];
}

export async function syncNaverRankingsFromSheet(): Promise<SyncResult> {
  const sheetId = env.GOOGLE_SHEET_ID;
  if (!sheetId) throw new Error("GOOGLE_SHEET_ID not configured");

  const token = await getGoogleAccessToken();

  // A~H열 조회 (57,695행 + 여유분)
  const rows = await fetchSheetValues(token, sheetId, "시트1!A1:H100001");
  if (!rows || rows.length < 2) return { inserted: 0, skipped: 0, errors: [] };

  const dataRows = rows.slice(1);

  const result: SyncResult = { inserted: 0, skipped: 0, errors: [] };
  const batchSize = 500;
  const batch: typeof naverRankings.$inferInsert[] = [];

  for (const row of dataRows) {
    const [rawDate, keyword, productCode, rawRank, productName, rawPrice, seller] = row;
    if (!rawDate || !keyword || !productCode || !rawRank) {
      result.skipped++;
      continue;
    }

    const dateInfo = parseDate(rawDate);
    if (!dateInfo) {
      result.errors.push(`Invalid date: ${rawDate}`);
      result.skipped++;
      continue;
    }

    const rank = parseInt(rawRank, 10);
    if (isNaN(rank)) {
      result.skipped++;
      continue;
    }

    batch.push({
      recordedAt: dateInfo.recordedAt,
      recordedDate: new Date(dateInfo.recordedDate + "T00:00:00"),
      keyword: keyword.trim(),
      productCode: productCode.trim(),
      rank,
      productName: productName?.trim() || null,
      price: parsePrice(rawPrice),
      seller: seller?.trim().replace(/\n/g, " / ") || null,
    });

    if (batch.length >= batchSize) {
      await insertBatch(batch, result);
      batch.length = 0;
    }
  }

  if (batch.length > 0) {
    await insertBatch(batch, result);
  }

  return result;
}

async function insertBatch(
  batch: typeof naverRankings.$inferInsert[],
  result: SyncResult
) {
  const db = await getDb();
  if (!db) { result.errors.push('DB not available'); return; }
  try {
    await db.insert(naverRankings).values(batch).onDuplicateKeyUpdate({
      set: {
        productName: sql`VALUES(productName)`,
        price: sql`VALUES(price)`,
        seller: sql`VALUES(seller)`,
      },
    });
    result.inserted += batch.length;
  } catch (err) {
    for (const row of batch) {
      try {
        await db.insert(naverRankings).values(row).onDuplicateKeyUpdate({
          set: {
            productName: sql`VALUES(productName)`,
            price: sql`VALUES(price)`,
            seller: sql`VALUES(seller)`,
          },
        });
        result.inserted++;
      } catch (e) {
        result.errors.push(`Row error: ${e instanceof Error ? e.message : String(e)}`);
        result.skipped++;
      }
    }
  }
}

// ─── Update H열 (비고/메모) for a specific row ──────────────────────────────
// 시트에서 해당 productCode + recordedDate 행을 찾아 H열 업데이트

export async function updateSheetNote(
  productCode: string,
  recordedDate: string,
  keyword: string,
  note: string
): Promise<{ success: boolean; rowIndex?: number; error?: string }> {
  const sheetId = env.GOOGLE_SHEET_ID;
  if (!sheetId) return { success: false, error: "GOOGLE_SHEET_ID not configured" };

  try {
    // 쓰기 권한 토큰
    const token = await getGoogleAccessToken(
      "https://www.googleapis.com/auth/spreadsheets"
    );

    // 전체 데이터 조회
    const rows = await fetchSheetValues(token, sheetId, "시트1!A1:H100001");
    if (!rows || rows.length < 2) return { success: false, error: "Sheet empty" };

    // 헤더 제외, 1-indexed (시트 행 번호 = index + 2)
    const dataRows = rows.slice(1);
    let targetRowIndex = -1;

    for (let i = 0; i < dataRows.length; i++) {
      const [rawDate, kw, code] = dataRows[i];
      if (!rawDate || !code) continue;
      const dateInfo = parseDate(rawDate);
      if (!dateInfo) continue;
      if (
        code.trim() === productCode &&
        dateInfo.recordedDate === recordedDate &&
        kw?.trim() === keyword
      ) {
        targetRowIndex = i + 2; // 1-indexed + 헤더 행
        break;
      }
    }

    if (targetRowIndex === -1) {
      return { success: false, error: "Row not found in sheet" };
    }

    await updateSheetCell(token, sheetId, `시트1!H${targetRowIndex}`, note);
    return { success: true, rowIndex: targetRowIndex };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── Brand keywords: DB only (시트 I/J열 연동 없음) ──────────────────────────
// 브랜드 키워드와 즐겨찾기는 DB에만 저장합니다.
// readBrandKeywordsFromSheet / writeBrandKeywordsToSheet 는 사용하지 않습니다.
export async function readBrandKeywordsFromSheet(): Promise<string[]> { return []; }
export async function writeBrandKeywordsToSheet(_keywords: string[]): Promise<void> { return; }

// ─── Get available keywords ──────────────────────────────────────────────────

export async function getNaverKeywords(): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.execute(
    sql`SELECT DISTINCT keyword FROM naver_rankings ORDER BY keyword`
  );
  return (rows as any[]).map((r: any) => r.keyword as string);
}

// ─── Get latest date for a keyword ──────────────────────────────────────────

export async function getLatestRankingDate(keyword: string): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.execute(
    sql`SELECT MAX(recordedDate) as maxDate FROM naver_rankings WHERE keyword = ${keyword}`
  );
  const r = (rows as any[])[0];
  return r?.maxDate ? String(r.maxDate) : null;
}
