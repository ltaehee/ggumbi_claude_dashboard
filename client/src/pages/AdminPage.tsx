import { useState, useMemo } from "react";
import { AppLayout } from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Eye,
  EyeOff,
  Pencil,
  Trash2,
  Plus,
  Save,
  X,
  ShieldCheck,
  Target,
  Package,
  Database,
  KeyRound,
  AlertTriangle,
  RefreshCw,
  Sparkles,
  TrendingDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { NewProductsTab } from "./NewProductsTab";

// ─── Types ─────────────────────────────────────────────────────────────────────
type TargetRow = {
  id: number;
  dept: string;
  itemMid: string;
  year: number;
  month: number;
  targetAmt: number;
  updatedAt: string | null;
};

type BomRow = {
  id: number;
  itemCode: string;
  costPerUnit: number;
  updatedAt: string | null;
};

// ─── Shared style tokens ───────────────────────────────────────────────────────
const inputCls = "h-8 text-xs bg-white border-gray-300 text-gray-900 placeholder:text-gray-400 focus:border-indigo-400";
const thCls = "text-gray-700 text-xs font-semibold bg-gray-50";
const tdCls = "text-gray-900 text-xs";
const tdMutedCls = "text-gray-600 text-xs";
const rowCls = "border-gray-200 hover:bg-gray-50 transition-colors";
const tableWrapCls = "rounded-xl border border-gray-200 overflow-hidden";
const dialogCls = "bg-white border-gray-200 text-gray-900 max-w-sm";
const alertDialogCls = "bg-white border-gray-200 text-gray-900";
const labelCls = "text-xs text-gray-700 font-medium";
const dialogInputCls = "h-8 text-xs bg-white border-gray-300 text-gray-900";
const cancelBtnCls = "text-xs border-gray-300 text-gray-700 bg-white hover:bg-gray-50";
const deleteBtnCls = "text-gray-400 hover:text-red-500 transition-colors";
const editBtnCls = "text-gray-400 hover:text-indigo-500 transition-colors";

// ─── Inline edit cell ──────────────────────────────────────────────────────────
function EditableAmtCell({
  value,
  onSave,
}: {
  value: number;
  onSave: (v: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));

  const commit = () => {
    const n = parseFloat(draft);
    if (!isNaN(n) && n >= 0) {
      onSave(n);
    }
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <Input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setEditing(false);
          }}
          className="h-7 w-32 text-xs bg-white border-indigo-400 text-gray-900"
        />
        <button onClick={commit} className="text-green-600 hover:text-green-700">
          <Save className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => setEditing(false)} className="text-gray-400 hover:text-gray-600">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => {
        setDraft(String(value));
        setEditing(true);
      }}
      className="flex items-center gap-1.5 group text-left"
    >
      <span className="text-gray-900 text-xs">{value.toLocaleString()}</span>
      <Pencil className="w-3 h-3 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  );
}

// ─── Targets Tab ───────────────────────────────────────────────────────────────
function TargetsTab() {
  const utils = trpc.useUtils();
  const { data: targets = [], isLoading } = trpc.admin.getAllTargets.useQuery();
  const updateMut = trpc.admin.updateTarget.useMutation({
    onSuccess: () => {
      toast.success("목표값이 수정되었습니다.");
      utils.admin.getAllTargets.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteMut = trpc.admin.deleteTarget.useMutation({
    onSuccess: () => {
      toast.success("목표값이 삭제되었습니다.");
      utils.admin.getAllTargets.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const insertMut = trpc.admin.insertTarget.useMutation({
    onSuccess: () => {
      toast.success("목표값이 추가되었습니다.");
      utils.admin.getAllTargets.invalidate();
      setAddOpen(false);
      setForm({ dept: "", itemMid: "", year: new Date().getFullYear(), month: 1, targetAmt: 0 });
    },
    onError: (e) => toast.error(e.message),
  });

  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({
    dept: "",
    itemMid: "",
    year: new Date().getFullYear(),
    month: 1,
    targetAmt: 0,
  });
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search) return targets as TargetRow[];
    const q = search.toLowerCase();
    return (targets as TargetRow[]).filter(
      (r) =>
        r.dept.toLowerCase().includes(q) ||
        r.itemMid.toLowerCase().includes(q) ||
        String(r.year).includes(q)
    );
  }, [targets, search]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Input
          placeholder="부서·품목·연도 검색..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={`max-w-xs ${inputCls}`}
        />
        <Button
          size="sm"
          onClick={() => setAddOpen(true)}
          className="h-8 text-xs bg-indigo-600 hover:bg-indigo-500 text-white"
        >
          <Plus className="w-3.5 h-3.5 mr-1" /> 목표 추가
        </Button>
      </div>

      <div className={tableWrapCls}>
        <Table>
          <TableHeader>
            <TableRow className="border-gray-200 bg-gray-50 hover:bg-gray-50">
              <TableHead className={thCls}>부서</TableHead>
              <TableHead className={thCls}>품목중분류</TableHead>
              <TableHead className={thCls}>연도</TableHead>
              <TableHead className={thCls}>월</TableHead>
              <TableHead className={thCls}>목표금액 (원)</TableHead>
              <TableHead className={thCls}>수정일</TableHead>
              <TableHead className={`${thCls} w-12`}>삭제</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-gray-400 text-xs py-8">불러오는 중...</TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-gray-400 text-xs py-8">등록된 목표값이 없습니다.</TableCell>
              </TableRow>
            ) : (
              filtered.map((row) => (
                <TableRow key={row.id} className={rowCls}>
                  <TableCell className={tdCls}>{row.dept}</TableCell>
                  <TableCell className={tdCls}>{row.itemMid}</TableCell>
                  <TableCell className={tdCls}>{row.year}</TableCell>
                  <TableCell className={tdCls}>{row.month}월</TableCell>
                  <TableCell>
                    <EditableAmtCell
                      value={row.targetAmt}
                      onSave={(v) => updateMut.mutate({ id: row.id, targetAmt: v })}
                    />
                  </TableCell>
                  <TableCell className={tdMutedCls}>
                    {row.updatedAt ? new Date(row.updatedAt).toLocaleDateString("ko-KR") : "-"}
                  </TableCell>
                  <TableCell>
                    <button onClick={() => setDeleteId(row.id)} className={deleteBtnCls}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className={dialogCls}>
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold text-gray-900">목표값 추가</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {(
              [
                { key: "dept", label: "부서", type: "text" },
                { key: "itemMid", label: "품목중분류", type: "text" },
                { key: "year", label: "연도", type: "number" },
                { key: "month", label: "월 (1~12)", type: "number" },
                { key: "targetAmt", label: "목표금액 (원)", type: "number" },
              ] as const
            ).map(({ key, label, type }) => (
              <div key={key} className="space-y-1">
                <Label className={labelCls}>{label}</Label>
                <Input
                  type={type}
                  value={String(form[key])}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      [key]: type === "number" ? Number(e.target.value) : e.target.value,
                    }))
                  }
                  className={dialogInputCls}
                />
              </div>
            ))}
          </div>
          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button variant="outline" size="sm" className={cancelBtnCls}>취소</Button>
            </DialogClose>
            <Button
              size="sm"
              onClick={() => insertMut.mutate(form)}
              disabled={insertMut.isPending}
              className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white"
            >
              {insertMut.isPending ? "저장 중..." : "저장"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent className={alertDialogCls}>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm text-gray-900">목표값을 삭제하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-gray-600">이 작업은 되돌릴 수 없습니다.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={cancelBtnCls}>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (deleteId !== null) deleteMut.mutate({ id: deleteId }); setDeleteId(null); }}
              className="text-xs bg-red-600 hover:bg-red-500 text-white"
            >삭제</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── BOM Costs Tab ─────────────────────────────────────────────────────────────
function BomCostsTab() {
  const utils = trpc.useUtils();
  const { data: boms = [], isLoading } = trpc.admin.getAllBomCosts.useQuery();
  const updateMut = trpc.admin.updateBomCost.useMutation({
    onSuccess: () => {
      toast.success("원가가 수정되었습니다.");
      utils.admin.getAllBomCosts.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteMut = trpc.admin.deleteBomCost.useMutation({
    onSuccess: () => {
      toast.success("원가 항목이 삭제되었습니다.");
      utils.admin.getAllBomCosts.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search) return boms as BomRow[];
    const q = search.toLowerCase();
    return (boms as BomRow[]).filter((r) => r.itemCode.toLowerCase().includes(q));
  }, [boms, search]);

  return (
    <div className="space-y-4">
      <Input
        placeholder="품번 검색..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className={`max-w-xs ${inputCls}`}
      />

      <div className={tableWrapCls}>
        <Table>
          <TableHeader>
            <TableRow className="border-gray-200 bg-gray-50 hover:bg-gray-50">
              <TableHead className={thCls}>품번 (Item Code)</TableHead>
              <TableHead className={thCls}>단가 (원)</TableHead>
              <TableHead className={thCls}>수정일</TableHead>
              <TableHead className={`${thCls} w-12`}>삭제</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-gray-400 text-xs py-8">불러오는 중...</TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-gray-400 text-xs py-8">등록된 BOM 원가가 없습니다.</TableCell>
              </TableRow>
            ) : (
              filtered.map((row) => (
                <TableRow key={row.id} className={rowCls}>
                  <TableCell className={`${tdCls} font-mono`}>{row.itemCode}</TableCell>
                  <TableCell>
                    <EditableAmtCell
                      value={row.costPerUnit}
                      onSave={(v) => updateMut.mutate({ id: row.id, costPerUnit: v })}
                    />
                  </TableCell>
                  <TableCell className={tdMutedCls}>
                    {row.updatedAt ? new Date(row.updatedAt).toLocaleDateString("ko-KR") : "-"}
                  </TableCell>
                  <TableCell>
                    <button onClick={() => setDeleteId(row.id)} className={deleteBtnCls}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent className={alertDialogCls}>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm text-gray-900">BOM 원가 항목을 삭제하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-gray-600">이 작업은 되돌릴 수 없습니다.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={cancelBtnCls}>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (deleteId !== null) deleteMut.mutate({ id: deleteId }); setDeleteId(null); }}
              className="text-xs bg-red-600 hover:bg-red-500 text-white"
            >삭제</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Variable Costs Tab ────────────────────────────────────────────────────────
type VarCostRow = {
  id: number;
  year: number;
  month: number;
  amount: number;
  forecastPct: number | null;
  note: string | null;
  updatedAt: string | Date | null;
};

function VariableCostsTab() {
  const utils = trpc.useUtils();
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState<{ year: number; month: number; amount: number; forecastPct: number | null; note: string }>({ year: currentYear, month: 1, amount: 0, forecastPct: null, note: "" });

  const { data: rows = [], isLoading } = trpc.variableCosts.getAll.useQuery();

  const upsertMut = trpc.variableCosts.upsert.useMutation({
    onSuccess: () => {
      toast.success("변동비가 저장되었습니다.");
      utils.variableCosts.getAll.invalidate();
      setEditOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMut = trpc.variableCosts.delete.useMutation({
    onSuccess: () => {
      toast.success("변동비 항목이 삭제되었습니다.");
      utils.variableCosts.getAll.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const yearOptions = useMemo(() => {
    const years = new Set((rows as VarCostRow[]).map((r) => r.year));
    years.add(currentYear);
    return Array.from(years).sort((a, b) => b - a);
  }, [rows, currentYear]);

  const filtered = useMemo(() => {
    return (rows as VarCostRow[]).filter((r) => r.year === selectedYear);
  }, [rows, selectedYear]);

  const openAdd = () => {
    setForm({ year: selectedYear, month: 1, amount: 0, forecastPct: null, note: "" });
    setEditOpen(true);
  };

  const openEdit = (row: VarCostRow) => {
    setForm({ year: row.year, month: row.month, amount: row.amount, forecastPct: row.forecastPct ?? null, note: row.note ?? "" });
    setEditOpen(true);
  };

  const totalAmount = filtered.reduce((s, r) => s + r.amount, 0);

  return (
    <div className="space-y-4">
      {/* 안내 배너 */}
      <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
        <TrendingDown className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
        <div>
          <p className="text-xs font-semibold text-blue-700 mb-0.5">월별 변동비 입력 안내</p>
          <p className="text-xs text-blue-600 leading-relaxed">
            월별 변동비 총액을 입력하면 해당 월의 공헌이익이 자동 계산됩니다.
            공헌이익 = 매출이익 - 변동비이며, 변동비는 SKU별 매출 비율로 안분됩니다.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Label className={labelCls}>연도</Label>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="h-8 text-xs border border-gray-300 rounded-md px-2 bg-white text-gray-900 focus:outline-none focus:border-indigo-400"
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>{y}년</option>
            ))}
          </select>
        </div>
        <Button
          size="sm"
          onClick={openAdd}
          className="h-8 text-xs bg-indigo-600 hover:bg-indigo-500 text-white"
        >
          <Plus className="w-3.5 h-3.5 mr-1" /> 변동비 추가
        </Button>
      </div>

      {/* 연간 합계 */}
      {filtered.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-50 border border-gray-200">
          <span className="text-xs text-gray-600">{selectedYear}년 변동비 합계:</span>
          <span className="text-sm font-bold text-gray-900">{totalAmount.toLocaleString()}원</span>
        </div>
      )}

      <div className={tableWrapCls}>
        <Table>
          <TableHeader>
            <TableRow className="border-gray-200 bg-gray-50 hover:bg-gray-50">
              <TableHead className={thCls}>연도</TableHead>
              <TableHead className={thCls}>월</TableHead>
              <TableHead className={thCls}>변동비 총액 (원)</TableHead>
              <TableHead className={thCls}>예측 변동비율 (%)</TableHead>
              <TableHead className={thCls}>비고</TableHead>
              <TableHead className={thCls}>수정일</TableHead>
              <TableHead className={`${thCls} w-20`}>편집/삭제</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-gray-400 text-xs py-8">불러오는 중...</TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-gray-400 text-xs py-8">
                  {selectedYear}년 변동비 데이터가 없습니다. "변동비 추가" 버튼으로 입력하세요.
                </TableCell>
              </TableRow>
            ) : (
              filtered
                .sort((a, b) => a.month - b.month)
                .map((row) => (
                  <TableRow key={row.id} className={rowCls}>
                    <TableCell className={tdCls}>{row.year}년</TableCell>
                    <TableCell className={tdCls}>{row.month}월</TableCell>
                    <TableCell className="text-gray-900 text-xs font-semibold">
                      {row.amount.toLocaleString()}원
                    </TableCell>
                    <TableCell className={tdCls}>
                      {(row as VarCostRow).forecastPct !== null && (row as VarCostRow).forecastPct !== undefined
                        ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">{Number((row as VarCostRow).forecastPct).toFixed(1)}% 예측</span>
                        : <span className="text-gray-400 text-xs">-</span>
                      }
                    </TableCell>
                    <TableCell className={tdMutedCls}>{row.note ?? "-"}</TableCell>
                    <TableCell className={tdMutedCls}>
                      {row.updatedAt ? new Date(row.updatedAt as string).toLocaleDateString("ko-KR") : "-"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <button onClick={() => openEdit(row)} className={editBtnCls}>
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setDeleteId(row.id)} className={deleteBtnCls}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className={dialogCls}>
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold text-gray-900">월별 변동비 입력</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className={labelCls}>연도</Label>
              <Input
                type="number"
                value={form.year}
                onChange={(e) => setForm((f) => ({ ...f, year: Number(e.target.value) }))}
                className={dialogInputCls}
              />
            </div>
            <div className="space-y-1">
              <Label className={labelCls}>월 (1~12)</Label>
              <Input
                type="number"
                min={1}
                max={12}
                value={form.month}
                onChange={(e) => setForm((f) => ({ ...f, month: Number(e.target.value) }))}
                className={dialogInputCls}
              />
            </div>
            <div className="space-y-1">
              <Label className={labelCls}>변동비 총액 (원)</Label>
              <Input
                type="number"
                min={0}
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: Number(e.target.value) }))}
                className={dialogInputCls}
              />
            </div>
            <div className="space-y-1">
              <Label className={labelCls}>
                예측 변동비율 (%)
                <span className="text-gray-400 font-normal ml-1">— 확정 데이터 없을 때 입력</span>
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  placeholder="예: 12.5"
                  value={form.forecastPct !== null ? String(form.forecastPct) : ""}
                  onChange={(e) => setForm((f) => ({ ...f, forecastPct: e.target.value === "" ? null : Number(e.target.value) }))}
                  className={dialogInputCls}
                />
                <span className="text-xs text-gray-500 whitespace-nowrap">%</span>
              </div>
              {form.forecastPct !== null && form.forecastPct > 0 && (
                <p className="text-xs text-amber-600 mt-1">
                  예측 변동비율 {form.forecastPct}% 저장 (확정 금액 입력 시도 % 값은 참고용으로 유지됩니다)
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label className={labelCls}>비고 (선택)</Label>
              <Input
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                placeholder="예: 광고비, 물류비 등"
                className={dialogInputCls}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button variant="outline" size="sm" className={cancelBtnCls}>취소</Button>
            </DialogClose>
            <Button
              size="sm"
              onClick={() => upsertMut.mutate({ ...form, forecastPct: form.forecastPct })}
              disabled={upsertMut.isPending || form.amount < 0}
              className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white"
            >
              {upsertMut.isPending ? "저장 중..." : "저장"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent className={alertDialogCls}>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm text-gray-900">변동비 항목을 삭제하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-gray-600">삭제하면 해당 월의 공헌이익이 매출이익과 동일하게 표시됩니다.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={cancelBtnCls}>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (deleteId !== null) deleteMut.mutate({ id: deleteId }); setDeleteId(null); }}
              className="text-xs bg-red-600 hover:bg-red-500 text-white"
            >삭제</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Item Mappings Tab ─────────────────────────────────────────────────────────
type MappingRow = {
  id: number;
  itemCode: string;
  itemName: string | null;
  itemLarge: string | null;
  itemMid: string | null;
  itemSmall: string | null;
  dept: string | null;
  note: string | null;
  updatedAt: Date | string | null;
};

function ItemMappingsTab() {
  const utils = trpc.useUtils();
  const { data: mappings = [], isLoading } = trpc.admin.getAllItemMappings.useQuery();
  const upsertMut = trpc.admin.upsertItemMapping.useMutation({
    onSuccess: () => {
      toast.success("품목 매핑이 저장되었습니다.");
      utils.admin.getAllItemMappings.invalidate();
      setAddOpen(false);
      setForm({ itemCode: "", itemName: "", itemLarge: "", itemMid: "", itemSmall: "", dept: "", note: "" });
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteMut = trpc.admin.deleteItemMapping.useMutation({
    onSuccess: () => {
      toast.success("품목 매핑이 삭제되었습니다.");
      utils.admin.getAllItemMappings.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState({
    itemCode: "", itemName: "", itemLarge: "", itemMid: "", itemSmall: "", dept: "", note: "",
  });
  const [search, setSearch] = useState("");

  const openEdit = (row: MappingRow) => {
    setForm({
      itemCode: row.itemCode,
      itemName: row.itemName ?? "",
      itemLarge: row.itemLarge ?? "",
      itemMid: row.itemMid ?? "",
      itemSmall: row.itemSmall ?? "",
      dept: row.dept ?? "",
      note: row.note ?? "",
    });
    setIsEditing(true);
    setAddOpen(true);
  };

  const openAdd = () => {
    setForm({ itemCode: "", itemName: "", itemLarge: "", itemMid: "", itemSmall: "", dept: "", note: "" });
    setIsEditing(false);
    setAddOpen(true);
  };

  const filtered = useMemo(() => {
    if (!search) return mappings as MappingRow[];
    const q = search.toLowerCase();
    return (mappings as MappingRow[]).filter(
      (r) =>
        r.itemCode.toLowerCase().includes(q) ||
        (r.itemName ?? "").toLowerCase().includes(q) ||
        (r.itemMid ?? "").toLowerCase().includes(q)
    );
  }, [mappings, search]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Input
          placeholder="품번/품명/중분류 검색..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={`max-w-xs ${inputCls}`}
        />
        <Button
          size="sm"
          onClick={openAdd}
          className="h-8 text-xs bg-indigo-600 hover:bg-indigo-500 text-white"
        >
          <Plus className="w-3.5 h-3.5 mr-1" /> 품목 추가
        </Button>
      </div>

      <div className={tableWrapCls}>
        <Table>
          <TableHeader>
            <TableRow className="border-gray-200 bg-gray-50 hover:bg-gray-50">
              {["품번", "품명", "대분류", "중분류", "소분류", "담당부서", "수정일", "편집", "삭제"].map((h) => (
                <TableHead key={h} className={thCls}>{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-gray-400 text-xs py-8">로딩 중...</TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-gray-400 text-xs py-8">등록된 품목 매핑이 없습니다.</TableCell>
              </TableRow>
            ) : (
              filtered.map((row) => (
                <TableRow key={row.id} className={rowCls}>
                  <TableCell className={`${tdCls} font-mono`}>{row.itemCode}</TableCell>
                  <TableCell className={`${tdCls} max-w-[100px] truncate`}>{row.itemName ?? "-"}</TableCell>
                  <TableCell className={tdCls}>{row.itemLarge ?? "-"}</TableCell>
                  <TableCell className={tdCls}>{row.itemMid ?? "-"}</TableCell>
                  <TableCell className={tdCls}>{row.itemSmall ?? "-"}</TableCell>
                  <TableCell className={tdCls}>{row.dept ?? "-"}</TableCell>
                  <TableCell className={tdMutedCls}>
                    {row.updatedAt ? new Date(row.updatedAt as string).toLocaleDateString("ko-KR") : "-"}
                  </TableCell>
                  <TableCell>
                    <button onClick={() => openEdit(row)} className={editBtnCls}>
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </TableCell>
                  <TableCell>
                    <button onClick={() => setDeleteId(row.id)} className={deleteBtnCls}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className={dialogCls}>
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold text-gray-900">{isEditing ? "품목 매핑 수정" : "품목 매핑 추가"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            {([
              { key: "itemCode" as const, label: isEditing ? "품번 (Item Code)" : "품번 (Item Code)*" },
              { key: "itemName" as const, label: "품명" },
              { key: "itemLarge" as const, label: "대분류" },
              { key: "itemMid" as const, label: "중분류" },
              { key: "itemSmall" as const, label: "소분류" },
              { key: "dept" as const, label: "담당부서" },
              { key: "note" as const, label: "비고" },
            ]).map(({ key, label }) => (
              <div key={key} className="space-y-1">
                <label className={labelCls}>{label}</label>
                <Input
                  value={form[key]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  readOnly={isEditing && key === "itemCode"}
                  className={`${dialogInputCls} ${isEditing && key === "itemCode" ? "opacity-60 cursor-not-allowed bg-gray-50" : ""}`}
                />
              </div>
            ))}
          </div>
          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button variant="outline" size="sm" className={cancelBtnCls}>취소</Button>
            </DialogClose>
            <Button
              size="sm"
              onClick={() => upsertMut.mutate(form)}
              disabled={upsertMut.isPending || !form.itemCode.trim()}
              className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white"
            >
              {upsertMut.isPending ? "저장 중..." : "저장"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent className={alertDialogCls}>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm text-gray-900">품목 매핑을 삭제하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-gray-600">이 작업은 되돌릴 수 없습니다.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={cancelBtnCls}>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (deleteId !== null) deleteMut.mutate({ id: deleteId }); setDeleteId(null); }}
              className="text-xs bg-red-600 hover:bg-red-500 text-white"
            >삭제</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Sales Records Tab ─────────────────────────────────────────────────────────
function SalesRecordsTab() {
  const utils = trpc.useUtils();
  const [page, setPage] = useState(1);
  const [filterStart, setFilterStart] = useState("");
  const [filterEnd, setFilterEnd] = useState("");
  const [filterDept, setFilterDept] = useState("");
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [rangeDeleteOpen, setRangeDeleteOpen] = useState(false);
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const PAGE_SIZE = 20;

  const { data, isLoading, refetch } = trpc.admin.getSalesRecords.useQuery({
    startDate: filterStart || undefined,
    endDate: filterEnd || undefined,
    dept: filterDept || undefined,
    page,
    pageSize: PAGE_SIZE,
  });

  const deleteMut = trpc.admin.deleteSalesRecord.useMutation({
    onSuccess: () => {
      toast.success("레코드가 삭제되었습니다.");
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const rangeDeleteMut = trpc.admin.deleteSalesByRange.useMutation({
    onSuccess: (res) => {
      toast.success(`${res.deletedCount ?? ""}건 삭제 완료. 이제 엑셀을 재업로드하세요.`);
      setRangeDeleteOpen(false);
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const rebuildMartMut = trpc.upload.rebuildMart.useMutation({
    onSuccess: (res) => {
      toast.success(`집계 마트 재빌드 완료: ${res.built.toLocaleString()}행 집계`);
    },
    onError: (e) => toast.error(`재빌드 실패: ${e.message}`),
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-4">
      {/* Upsert 재업로드 안내 배너 */}
      <div className="flex items-start gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3">
        <RefreshCw className="w-4 h-4 text-indigo-500 mt-0.5 shrink-0" />
        <div className="flex-1">
          <p className="text-xs font-semibold text-indigo-700 mb-0.5">동일 기간 데이터 덮어쓰기(Upsert) 방법</p>
          <p className="text-xs text-indigo-600">
            수정이 필요한 기간을 아래 필터로 조회한 후, <span className="text-red-600 font-medium">"기간 일괄 삭제"</span> 버튼으로 해당 기간 데이터를 삭제하고,
            좌측 사이드바의 <span className="text-indigo-700 font-medium">"데이터 업로드"</span> 메뉴에서 수정된 엑셀 파일을 다시 업로드하세요.
          </p>
        </div>
        <button
          onClick={() => {
            if (confirm('집계 마트를 전체 재빌드합니다. \n데이터 양에 따라 1~5분 소요될 수 있습니다. \n진행하시겠습니까?'))
              rebuildMartMut.mutate();
          }}
          disabled={rebuildMartMut.isPending}
          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-medium transition-colors"
        >
          <RefreshCw className={`w-3 h-3 ${rebuildMartMut.isPending ? 'animate-spin' : ''}`} />
          {rebuildMartMut.isPending ? '재빌드 중...' : '집계 마트 재빌드'}
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="date"
          value={filterStart}
          onChange={(e) => { setFilterStart(e.target.value); setPage(1); }}
          className={`w-36 ${inputCls}`}
        />
        <span className="text-gray-500 text-xs">~</span>
        <Input
          type="date"
          value={filterEnd}
          onChange={(e) => { setFilterEnd(e.target.value); setPage(1); }}
          className={`w-36 ${inputCls}`}
        />
        <Input
          value={filterDept}
          onChange={(e) => { setFilterDept(e.target.value); setPage(1); }}
          placeholder="부서 필터"
          className={`w-28 ${inputCls}`}
        />
        <button
          onClick={() => { setFilterStart(""); setFilterEnd(""); setFilterDept(""); setPage(1); }}
          className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
        >
          초기화
        </button>
        <div className="ml-auto flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setRangeDeleteOpen(true)}
            className="h-8 text-xs border-red-300 text-red-600 hover:bg-red-50"
          >
            <AlertTriangle className="w-3.5 h-3.5 mr-1" />
            기간 일괄 삭제 (재업로드용)
          </Button>
        </div>
      </div>

      <div className="text-xs text-gray-600">
        총 <span className="text-gray-900 font-semibold">{total.toLocaleString()}</span>건
      </div>

      <div className={tableWrapCls}>
        <Table>
          <TableHeader>
            <TableRow className="border-gray-200 bg-gray-50 hover:bg-gray-50">
              {["날짜", "부서", "거래처", "품목", "수량", "매출(원)", "이익(원)", "삭제"].map((h) => (
                <TableHead key={h} className={thCls}>{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-gray-400 text-xs py-8">불러오는 중...</TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-gray-400 text-xs py-8">데이터가 없습니다.</TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id} className={rowCls}>
                  <TableCell className={tdCls}>{row.salesDate}</TableCell>
                  <TableCell className={tdMutedCls}>{row.dept}</TableCell>
                  <TableCell className={`${tdMutedCls} max-w-[120px] truncate`}>{row.channel}</TableCell>
                  <TableCell className={`${tdMutedCls} max-w-[120px] truncate`}>{row.itemName}</TableCell>
                  <TableCell className={`${tdCls} text-right`}>{row.qty.toLocaleString()}</TableCell>
                  <TableCell className={`${tdCls} text-right`}>{row.salesAmt.toLocaleString()}</TableCell>
                  <TableCell className={`text-xs text-right ${row.grossProfit >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {row.grossProfit.toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <button onClick={() => setDeleteId(row.id)} className={deleteBtnCls}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="h-7 text-xs border-gray-300 text-gray-700"
          >
            이전
          </Button>
          <span className="text-xs text-gray-600">
            {page} / {totalPages}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="h-7 text-xs border-gray-300 text-gray-700"
          >
            다음
          </Button>
        </div>
      )}

      {/* Single delete confirm */}
      <AlertDialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent className={alertDialogCls}>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm text-gray-900">레코드를 삭제하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-gray-600">이 작업은 되돌릴 수 없습니다.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={cancelBtnCls}>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (deleteId !== null) deleteMut.mutate({ id: deleteId }); setDeleteId(null); }}
              className="text-xs bg-red-600 hover:bg-red-500 text-white"
            >삭제</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Range delete dialog */}
      <Dialog open={rangeDeleteOpen} onOpenChange={setRangeDeleteOpen}>
        <DialogContent className={dialogCls}>
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              기간별 매출 데이터 일괄 삭제
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-gray-600 leading-relaxed">
            동일 기간 엑셀을 재업로드하기 전, 해당 기간 데이터를 먼저 삭제합니다.
          </p>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className={labelCls}>시작일</Label>
              <Input
                type="date"
                value={rangeStart}
                onChange={(e) => setRangeStart(e.target.value)}
                className={dialogInputCls}
              />
            </div>
            <div className="space-y-1">
              <Label className={labelCls}>종료일</Label>
              <Input
                type="date"
                value={rangeEnd}
                onChange={(e) => setRangeEnd(e.target.value)}
                className={dialogInputCls}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button variant="outline" size="sm" className={cancelBtnCls}>취소</Button>
            </DialogClose>
            <Button
              size="sm"
              onClick={() => {
                if (!rangeStart || !rangeEnd) {
                  toast.error("시작일과 종료일을 모두 입력하세요.");
                  return;
                }
                rangeDeleteMut.mutate({ startDate: rangeStart, endDate: rangeEnd });
              }}
              disabled={rangeDeleteMut.isPending}
              className="text-xs bg-red-600 hover:bg-red-500 text-white"
            >
              {rangeDeleteMut.isPending ? "삭제 중..." : "일괄 삭제"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Password Tab ──────────────────────────────────────────────────────────────
function PasswordTab() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);

  const changeMut = trpc.admin.changePassword.useMutation({
    onSuccess: () => {
      toast.success("비밀번호가 변경되었습니다. 다음 접속 시 새 비밀번호를 사용하세요.");
      setCurrent("");
      setNext("");
      setConfirm("");
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (next.length < 4) {
      toast.error("새 비밀번호는 4자 이상이어야 합니다.");
      return;
    }
    if (next !== confirm) {
      toast.error("새 비밀번호와 확인이 일치하지 않습니다.");
      return;
    }
    changeMut.mutate({ currentPassword: current, newPassword: next });
  };

  return (
    <div className="max-w-sm space-y-4">
      <p className="text-xs text-gray-600 leading-relaxed">
        현재 비밀번호를 입력한 후 새 비밀번호로 변경할 수 있습니다.
      </p>
      <form onSubmit={handleSubmit} className="space-y-3">
        {[
          { label: "현재 비밀번호", value: current, setter: setCurrent, show: showCurrent, toggleShow: () => setShowCurrent((v) => !v) },
          { label: "새 비밀번호 (4자 이상)", value: next, setter: setNext, show: showNext, toggleShow: () => setShowNext((v) => !v) },
          { label: "새 비밀번호 확인", value: confirm, setter: setConfirm, show: showNext, toggleShow: () => setShowNext((v) => !v) },
        ].map(({ label, value, setter, show, toggleShow }) => (
          <div key={label} className="space-y-1">
            <Label className={labelCls}>{label}</Label>
            <div className="relative">
              <Input
                type={show ? "text" : "password"}
                value={value}
                onChange={(e) => setter(e.target.value)}
                className="h-9 text-sm bg-white border-gray-300 text-gray-900 pr-9"
              />
              <button
                type="button"
                onClick={toggleShow}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                tabIndex={-1}
              >
                {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        ))}
        <Button
          type="submit"
          disabled={changeMut.isPending}
          className="w-full h-9 text-sm bg-indigo-600 hover:bg-indigo-500 text-white"
        >
          {changeMut.isPending ? "변경 중..." : "비밀번호 변경"}
        </Button>
      </form>
    </div>
  );
}

// ─── Main AdminPage ────────────────────────────────────────────────────────────
export default function AdminPage() {
  return (
    <AppLayout title="데이터 관리자" subtitle="마스터 데이터 편집 및 매출 데이터 관리">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200">
          <ShieldCheck className="w-5 h-5 text-amber-500 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-700">관리자 전용 페이지</p>
            <p className="text-xs text-amber-600 mt-0.5">
              데이터를 수정하거나 삭제하면 대시보드 전체에 즉시 반영됩니다. 신중하게 작업하세요.
            </p>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="targets" className="space-y-4">
          <TabsList className="bg-gray-100 border border-gray-200 h-9 p-1 flex-wrap gap-0.5">
            <TabsTrigger
              value="targets"
              className="text-xs data-[state=active]:bg-indigo-600 data-[state=active]:text-white text-gray-600 h-7 px-3"
            >
              <Target className="w-3.5 h-3.5 mr-1.5" />
              월별 목표값
            </TabsTrigger>
            <TabsTrigger
              value="bom"
              className="text-xs data-[state=active]:bg-indigo-600 data-[state=active]:text-white text-gray-600 h-7 px-3"
            >
              <Package className="w-3.5 h-3.5 mr-1.5" />
              BOM 원가
            </TabsTrigger>
            <TabsTrigger
              value="sales"
              className="text-xs data-[state=active]:bg-indigo-600 data-[state=active]:text-white text-gray-600 h-7 px-3"
            >
              <Database className="w-3.5 h-3.5 mr-1.5" />
              매출 데이터
            </TabsTrigger>
            <TabsTrigger
              value="newproducts"
              className="text-xs data-[state=active]:bg-violet-600 data-[state=active]:text-white text-gray-600 h-7 px-3"
            >
              <Sparkles className="w-3.5 h-3.5 mr-1.5" />
              신상품 관리
            </TabsTrigger>
            <TabsTrigger
              value="variable"
              className="text-xs data-[state=active]:bg-indigo-600 data-[state=active]:text-white text-gray-600 h-7 px-3"
            >
              <TrendingDown className="w-3.5 h-3.5 mr-1.5" />
              월별 변동비
            </TabsTrigger>
            <TabsTrigger
              value="password"
              className="text-xs data-[state=active]:bg-indigo-600 data-[state=active]:text-white text-gray-600 h-7 px-3"
            >
              <KeyRound className="w-3.5 h-3.5 mr-1.5" />
              비밀번호 변경
            </TabsTrigger>
          </TabsList>

          <TabsContent value="targets" className="mt-0">
            <TargetsTab />
          </TabsContent>
          <TabsContent value="bom" className="mt-0">
            <BomCostsTab />
          </TabsContent>
          <TabsContent value="sales" className="mt-0">
            <SalesRecordsTab />
          </TabsContent>
          <TabsContent value="newproducts" className="mt-0">
            <NewProductsTab />
          </TabsContent>
          <TabsContent value="variable" className="mt-0">
            <VariableCostsTab />
          </TabsContent>
          <TabsContent value="password" className="mt-0">
            <PasswordTab />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
