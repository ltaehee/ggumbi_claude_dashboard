import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── Mock DB helpers ───────────────────────────────────────────────────────────
vi.mock("./db", () => ({
  getAppSetting: vi.fn(),
  setAppSetting: vi.fn(),
  getAllSalesTargets: vi.fn().mockResolvedValue([
    { id: 1, dept: "주피미", itemMid: "유모차", year: 2026, month: 1, targetAmt: 100_000_000, updatedAt: null },
  ]),
  updateSalesTarget: vi.fn().mockResolvedValue(undefined),
  deleteSalesTarget: vi.fn().mockResolvedValue(undefined),
  insertSalesTarget: vi.fn().mockResolvedValue(undefined),
  getAllBomCostsList: vi.fn().mockResolvedValue([
    { id: 1, itemCode: "A001", costPerUnit: 50000, updatedAt: null },
  ]),
  updateBomCost: vi.fn().mockResolvedValue(undefined),
  deleteBomCost: vi.fn().mockResolvedValue(undefined),
  getSalesRecordsPaged: vi.fn().mockResolvedValue({ rows: [], total: 0 }),
  deleteSalesRecord: vi.fn().mockResolvedValue(undefined),
  deleteSalesByDateRange: vi.fn().mockResolvedValue(0),
  // Stubs for other db functions used in routers
  getDepts: vi.fn().mockResolvedValue([]),
  getUploadHistory: vi.fn().mockResolvedValue([]),
  getKpiSummary: vi.fn().mockResolvedValue({}),
  getYtdGmv: vi.fn().mockResolvedValue({}),
  getTrendData: vi.fn().mockResolvedValue([]),
  getTopItems: vi.fn().mockResolvedValue([]),
  getCategoryBreakdown: vi.fn().mockResolvedValue([]),
  getPerformanceTable: vi.fn().mockResolvedValue([]),
  getMonthSummary: vi.fn().mockResolvedValue({}),
  getDocAnalysis: vi.fn().mockResolvedValue([]),
  upsertUser: vi.fn().mockResolvedValue(undefined),
  getUserByOpenId: vi.fn().mockResolvedValue(undefined),
  getDb: vi.fn().mockResolvedValue(null),
  insertUploadRecord: vi.fn().mockResolvedValue(undefined),
  bulkInsertSales: vi.fn().mockResolvedValue(undefined),
  bulkInsertBomCosts: vi.fn().mockResolvedValue(undefined),
  bulkInsertTargets: vi.fn().mockResolvedValue(undefined),
  bulkInsertPromotions: vi.fn().mockResolvedValue(undefined),
  bulkInsertInventory: vi.fn().mockResolvedValue(undefined),
}));

// ─── Mock bcryptjs ─────────────────────────────────────────────────────────────
vi.mock("bcryptjs", () => ({
  default: {
    compareSync: vi.fn((plain: string, hash: string) => plain === "0000" && hash === "MOCK_HASH"),
    hashSync: vi.fn((plain: string) => `HASHED_${plain}`),
  },
  compareSync: vi.fn((plain: string, hash: string) => plain === "0000" && hash === "MOCK_HASH"),
  hashSync: vi.fn((plain: string) => `HASHED_${plain}`),
}));

function createCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

// ─── gate.verify tests ─────────────────────────────────────────────────────────
describe("gate.verify", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const db = await import("./db");
    vi.mocked(db.getAppSetting).mockResolvedValue("MOCK_HASH");
  });

  it("returns success when password matches", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.gate.verify({ password: "0000" });
    expect(result).toEqual({ success: true });
  });

  it("throws when password is wrong", async () => {
    const caller = appRouter.createCaller(createCtx());
    await expect(caller.gate.verify({ password: "wrong" })).rejects.toThrow(
      "비밀번호가 올바르지 않습니다."
    );
  });

  it("throws when no password setting exists", async () => {
    const db = await import("./db");
    vi.mocked(db.getAppSetting).mockResolvedValue(null);
    const caller = appRouter.createCaller(createCtx());
    await expect(caller.gate.verify({ password: "0000" })).rejects.toThrow(
      "비밀번호 설정이 없습니다."
    );
  });
});

// ─── admin.changePassword tests ────────────────────────────────────────────────
describe("admin.changePassword", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const db = await import("./db");
    vi.mocked(db.getAppSetting).mockResolvedValue("MOCK_HASH");
    vi.mocked(db.setAppSetting).mockResolvedValue(undefined);
  });

  it("changes password when current password is correct", async () => {
    const db = await import("./db");
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.admin.changePassword({
      currentPassword: "0000",
      newPassword: "1234",
    });
    expect(result).toEqual({ success: true });
    expect(vi.mocked(db.setAppSetting)).toHaveBeenCalledWith("dashboard_password", "HASHED_1234");
  });

  it("throws when current password is wrong", async () => {
    const caller = appRouter.createCaller(createCtx());
    await expect(
      caller.admin.changePassword({ currentPassword: "wrong", newPassword: "1234" })
    ).rejects.toThrow("현재 비밀번호가 올바르지 않습니다.");
  });
});

// ─── admin.getAllTargets tests ─────────────────────────────────────────────────
describe("admin.getAllTargets", () => {
  it("returns list of targets", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.admin.getAllTargets();
    expect(Array.isArray(result)).toBe(true);
    expect(result[0]).toMatchObject({ id: 1, dept: "주피미", targetAmt: 100_000_000 });
  });
});

// ─── admin.updateTarget tests ──────────────────────────────────────────────────
describe("admin.updateTarget", () => {
  it("calls updateSalesTarget with correct args", async () => {
    const db = await import("./db");
    vi.clearAllMocks();
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.admin.updateTarget({ id: 1, targetAmt: 200_000_000 });
    expect(result).toEqual({ success: true });
    expect(vi.mocked(db.updateSalesTarget)).toHaveBeenCalledWith(1, 200_000_000);
  });
});

// ─── admin.deleteTarget tests ──────────────────────────────────────────────────
describe("admin.deleteTarget", () => {
  it("calls deleteSalesTarget with correct id", async () => {
    const db = await import("./db");
    vi.clearAllMocks();
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.admin.deleteTarget({ id: 1 });
    expect(result).toEqual({ success: true });
    expect(vi.mocked(db.deleteSalesTarget)).toHaveBeenCalledWith(1);
  });
});

// ─── admin.getAllBomCosts tests ────────────────────────────────────────────────
describe("admin.getAllBomCosts", () => {
  it("returns list of BOM costs", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.admin.getAllBomCosts();
    expect(Array.isArray(result)).toBe(true);
    expect(result[0]).toMatchObject({ itemCode: "A001", costPerUnit: 50000 });
  });
});

// ─── admin.deleteSalesByRange tests ───────────────────────────────────────────
describe("admin.deleteSalesByRange", () => {
  it("returns success with deletedCount", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.admin.deleteSalesByRange({
      startDate: "2026-01-01",
      endDate: "2026-01-31",
    });
    expect(result.success).toBe(true);
    expect(typeof result.deletedCount).toBe("number");
  });
});
