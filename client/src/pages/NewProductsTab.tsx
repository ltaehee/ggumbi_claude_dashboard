import { useState, useMemo, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Pencil, Trash2, Plus, Sparkles, Search, ChevronDown, X } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type NewProductRow = {
  id: number;
  itemName: string;
  itemCode: string | null;
  itemLarge: string | null;
  itemMid: string | null;
  itemSmall: string | null;
  launchDate: Date | string | null;
  note: string | null;
  addedBy: string | null;
  createdAt: string | Date;
  updatedAt?: string | Date;
};

const emptyForm = {
  itemName: "",
  itemCode: "",
  itemLarge: "",
  itemMid: "",
  itemSmall: "",
  launchDate: "",
  note: "",
  addedBy: "",
};

// ─── 품명 검색 선택 컴포넌트 ──────────────────────────────────────────────────
function ItemNameSelector({
  value,
  onChange,
  onMetaFetched,
}: {
  value: string;
  onChange: (v: string) => void;
  onMetaFetched?: (meta: { itemCode: string | null; itemLarge: string | null; itemMid: string | null; itemSmall: string | null } | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedName, setSelectedName] = useState(value);

  const { data: allNames = [], isLoading } = trpc.newProducts.getDistinctSalesItemNames.useQuery(
    undefined,
    { staleTime: 5 * 60_000 }
  );

  // 선택된 품명의 메타 정보 조회
  const metaQuery = trpc.newProducts.getItemMetaByName.useQuery(
    { itemName: selectedName },
    { enabled: !!selectedName && !!onMetaFetched, staleTime: 5 * 60_000 }
  );

  useEffect(() => {
    if (metaQuery.data !== undefined && onMetaFetched) {
      onMetaFetched(metaQuery.data);
    }
  }, [metaQuery.data]);

  const filtered = useMemo(() => {
    if (!search) return allNames as string[];
    const q = search.toLowerCase();
    return (allNames as string[]).filter((n) => n.toLowerCase().includes(q));
  }, [allNames, search]);

  const handleSelect = (name: string) => {
    onChange(name);
    setSelectedName(name);
    setOpen(false);
    setSearch("");
  };

  return (
    <div className="relative">
      <div
        className={cn(
          "flex items-center justify-between h-9 px-3 rounded-md border text-sm cursor-pointer transition-colors",
          "bg-white border-gray-300 text-gray-900 hover:border-violet-400",
          open && "border-violet-500 ring-2 ring-violet-200"
        )}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={value ? "text-gray-900 font-medium" : "text-gray-400"}>
          {value || "품명을 검색하여 선택하세요..."}
        </span>
        <ChevronDown className={cn("w-4 h-4 text-gray-400 transition-transform", open && "rotate-180")} />
      </div>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-xl overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-gray-50 border border-gray-200">
              <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="품명 검색..."
                className="flex-1 bg-transparent text-sm text-gray-800 placeholder:text-gray-400 outline-none"
              />
              {search && (
                <button onClick={() => setSearch("")}>
                  <X className="w-3.5 h-3.5 text-gray-400 hover:text-gray-700" />
                </button>
              )}
            </div>
          </div>

          <div className="max-h-52 overflow-y-auto">
            {/* 직접 입력 옵션 */}
            {search && !filtered.includes(search) && (
              <button
                className="w-full text-left px-3 py-2 text-sm text-violet-700 font-medium hover:bg-violet-50 transition-colors border-b border-gray-100"
                onClick={() => handleSelect(search)}
              >
                <span className="text-gray-500 font-normal">직접 입력: </span>"{search}"
              </button>
            )}

            {isLoading ? (
              <div className="px-3 py-4 text-sm text-gray-400 text-center">불러오는 중...</div>
            ) : filtered.length === 0 ? (
              <div className="px-3 py-4 text-sm text-gray-400 text-center">검색 결과가 없습니다.</div>
            ) : (
              filtered.slice(0, 100).map((name) => (
                <button
                  key={name}
                  className={cn(
                    "w-full text-left px-3 py-2 text-sm transition-colors",
                    name === value
                      ? "bg-violet-50 text-violet-700 font-semibold"
                      : "text-gray-800 hover:bg-gray-50"
                  )}
                  onClick={() => handleSelect(name)}
                >
                  {name}
                </button>
              ))
            )}
            {filtered.length > 100 && (
              <div className="px-3 py-2 text-xs text-gray-400 text-center border-t border-gray-100">
                검색어를 입력하면 더 많은 결과를 볼 수 있습니다.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 폼 필드 ─────────────────────────────────────────────────────────────────
function FormFields({
  data,
  onChange,
  isEditing = false,
}: {
  data: typeof emptyForm;
  onChange: (k: string, v: string) => void;
  isEditing?: boolean;
}) {
  const handleMetaFetched = (meta: { itemCode: string | null; itemLarge: string | null; itemMid: string | null; itemSmall: string | null } | null) => {
    if (meta) {
      if (meta.itemCode) onChange("itemCode", meta.itemCode);
      if (meta.itemLarge) onChange("itemLarge", meta.itemLarge);
      if (meta.itemMid) onChange("itemMid", meta.itemMid);
      if (meta.itemSmall) onChange("itemSmall", meta.itemSmall);
    }
  };

  const inputCls = "h-9 text-sm bg-white border-gray-300 text-gray-900 placeholder:text-gray-400 focus:border-violet-400 focus:ring-violet-200";

  return (
    <div className="grid grid-cols-2 gap-3">
      {/* 품명: 선택 컴포넌트 (편집 시에는 일반 input) */}
      <div className="col-span-2 space-y-1">
        <Label className="text-sm text-gray-700 font-medium">품명 *</Label>
        {isEditing ? (
          <Input
            value={data.itemName}
            onChange={(e) => onChange("itemName", e.target.value)}
            className={inputCls}
          />
        ) : (
          <ItemNameSelector
            value={data.itemName}
            onChange={(v) => onChange("itemName", v)}
            onMetaFetched={handleMetaFetched}
          />
        )}
      </div>

      {[
        { key: "itemCode", label: "품목코드", type: "text" },
        { key: "itemLarge", label: "대분류", type: "text" },
        { key: "itemMid", label: "중분류", type: "text" },
        { key: "itemSmall", label: "소분류", type: "text" },
        { key: "launchDate", label: "출시일", type: "date" },
        { key: "addedBy", label: "등록자", type: "text" },
      ].map(({ key, label, type }) => (
        <div key={key} className="space-y-1">
          <Label className="text-sm text-gray-700">{label}</Label>
          <Input
            type={type}
            value={(data as any)[key]}
            onChange={(e) => onChange(key, e.target.value)}
            className={inputCls}
          />
        </div>
      ))}
      <div className="col-span-2 space-y-1">
        <Label className="text-sm text-gray-700">메모</Label>
        <Input
          value={data.note}
          onChange={(e) => onChange("note", e.target.value)}
          className={inputCls}
        />
      </div>
    </div>
  );
}

export function NewProductsTab() {
  const utils = trpc.useUtils();
  const [addOpen, setAddOpen] = useState(false);
  const [editRow, setEditRow] = useState<NewProductRow | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(emptyForm);

  const { data: rows = [], isLoading } = trpc.admin.getAllNewProducts.useQuery();

  const insertMut = trpc.admin.insertNewProduct.useMutation({
    onSuccess: () => {
      toast.success("신상품이 등록되었습니다.");
      utils.admin.getAllNewProducts.invalidate();
      utils.newProducts.getItemNames.invalidate();
      setAddOpen(false);
      setForm(emptyForm);
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMut = trpc.admin.updateNewProduct.useMutation({
    onSuccess: () => {
      toast.success("수정되었습니다.");
      utils.admin.getAllNewProducts.invalidate();
      utils.newProducts.getItemNames.invalidate();
      setEditRow(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMut = trpc.admin.deleteNewProduct.useMutation({
    onSuccess: () => {
      toast.success("삭제되었습니다.");
      utils.admin.getAllNewProducts.invalidate();
      utils.newProducts.getItemNames.invalidate();
      setDeleteId(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const filtered = (rows as NewProductRow[]).filter(
    (r) =>
      !search ||
      r.itemName.toLowerCase().includes(search.toLowerCase()) ||
      (r.itemCode ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      {/* 안내 */}
      <div className="p-3 rounded-lg bg-violet-50 border border-violet-200">
        <p className="text-sm text-violet-800 leading-relaxed">
          신상품으로 등록한 품명은 매출/수익 분석 페이지의{" "}
          <span className="font-semibold text-violet-900">"신상품"</span> 버튼을 클릭하면
          해당 품명들만 필터링되어 조회됩니다. 품명은 매출 데이터에 등록된 품명 목록에서 선택하거나 직접 입력할 수 있습니다.
        </p>
      </div>

      {/* 상단 도구막대 */}
      <div className="flex items-center gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="품명/코드 검색..."
          className="w-48 h-9 text-sm bg-white border-gray-300 text-gray-900 placeholder:text-gray-400"
        />
        <div className="ml-auto">
          <Button
            size="sm"
            onClick={() => {
              setForm(emptyForm);
              setAddOpen(true);
            }}
            className="h-9 text-sm bg-violet-600 hover:bg-violet-500"
          >
            <Plus className="w-4 h-4 mr-1" />
            신상품 등록
          </Button>
        </div>
      </div>

      <div className="text-sm text-gray-600">
        전체{" "}
        <span className="text-gray-900 font-semibold">{filtered.length}</span>건
      </div>

      {/* 테이블 */}
      <div className="rounded-xl border border-gray-200 overflow-hidden bg-white">
        <Table>
          <TableHeader>
            <TableRow className="border-gray-200 bg-gray-50 hover:bg-gray-50">
              {["품명", "코드", "대분류", "중분류", "소분류", "출시일", "메모", "등록자", "액션"].map((h) => (
                <TableHead key={h} className="text-gray-700 text-sm font-semibold">{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-gray-400 text-sm py-8">로딩 중...</TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-gray-400 text-sm py-8">
                  등록된 신상품이 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((row) => (
                <TableRow key={row.id} className="border-gray-100 hover:bg-gray-50 transition-colors">
                  <TableCell className="text-gray-900 text-sm font-semibold">{row.itemName}</TableCell>
                  <TableCell className="text-gray-700 text-sm">{row.itemCode ?? "-"}</TableCell>
                  <TableCell className="text-gray-700 text-sm">{row.itemLarge ?? "-"}</TableCell>
                  <TableCell className="text-gray-700 text-sm">{row.itemMid ?? "-"}</TableCell>
                  <TableCell className="text-gray-700 text-sm">{row.itemSmall ?? "-"}</TableCell>
                  <TableCell className="text-gray-700 text-sm">
                    {row.launchDate ? String(row.launchDate).slice(0, 10) : "-"}
                  </TableCell>
                  <TableCell className="text-gray-700 text-sm max-w-[120px] truncate">{row.note ?? "-"}</TableCell>
                  <TableCell className="text-gray-700 text-sm">{row.addedBy ?? "-"}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          setEditRow(row as NewProductRow);
                          setForm({
                            itemName: row.itemName,
                            itemCode: row.itemCode ?? "",
                            itemLarge: row.itemLarge ?? "",
                            itemMid: row.itemMid ?? "",
                            itemSmall: row.itemSmall ?? "",
                            launchDate: row.launchDate ? String(row.launchDate).slice(0, 10) : "",
                            note: row.note ?? "",
                            addedBy: row.addedBy ?? "",
                          });
                        }}
                        className="text-gray-400 hover:text-violet-600 transition-colors"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeleteId(row.id)}
                        className="text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* 등록 다이얼로그 */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="bg-white border-gray-200 text-gray-900 max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2 text-gray-900">
              <Sparkles className="w-4 h-4 text-violet-500" />
              신상품 등록
            </DialogTitle>
          </DialogHeader>
          <FormFields
            data={form}
            onChange={(k, v) => setForm((f) => ({ ...f, [k]: v }))}
            isEditing={false}
          />
          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button variant="outline" size="sm" className="text-sm border-gray-300 text-gray-700 bg-white hover:bg-gray-50">
                닫기
              </Button>
            </DialogClose>
            <Button
              size="sm"
              onClick={() => {
                if (!form.itemName.trim()) {
                  toast.error("품명을 선택하거나 입력하세요.");
                  return;
                }
                insertMut.mutate({ ...form, launchDate: form.launchDate || undefined });
              }}
              disabled={insertMut.isPending}
              className="text-sm bg-violet-600 hover:bg-violet-500"
            >
              {insertMut.isPending ? "등록 중..." : "등록"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 수정 다이얼로그 */}
      <Dialog open={!!editRow} onOpenChange={(o) => !o && setEditRow(null)}>
        <DialogContent className="bg-white border-gray-200 text-gray-900 max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base text-gray-900">신상품 수정</DialogTitle>
          </DialogHeader>
          <FormFields
            data={form}
            onChange={(k, v) => setForm((f) => ({ ...f, [k]: v }))}
            isEditing={true}
          />
          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button variant="outline" size="sm" className="text-sm border-gray-300 text-gray-700 bg-white hover:bg-gray-50">
                취소
              </Button>
            </DialogClose>
            <Button
              size="sm"
              onClick={() => {
                if (!editRow || !form.itemName.trim()) return;
                updateMut.mutate({ id: editRow.id, ...form, launchDate: form.launchDate || undefined });
              }}
              disabled={updateMut.isPending}
              className="text-sm bg-violet-600 hover:bg-violet-500"
            >
              {updateMut.isPending ? "저장 중..." : "저장"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 삭제 확인 */}
      <AlertDialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent className="bg-white border-gray-200 text-gray-900">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base text-gray-900">신상품을 삭제하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-gray-600">이 작업은 되돌릴 수 없습니다.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-sm border-gray-300 text-gray-700 bg-white hover:bg-gray-50">취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId !== null && deleteMut.mutate({ id: deleteId })}
              className="text-sm bg-red-600 hover:bg-red-500 text-white"
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
