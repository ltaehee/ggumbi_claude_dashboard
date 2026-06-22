import re

with open('client/src/pages/AdminPage.tsx', 'r') as f:
    content = f.read()

item_mappings_tab = r"""
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
  const [form, setForm] = useState({
    itemCode: "", itemName: "", itemLarge: "", itemMid: "", itemSmall: "", dept: "", note: "",
  });
  const [search, setSearch] = useState("");

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
          className="max-w-xs h-8 text-xs bg-slate-800/60 border-slate-600/50 text-white placeholder:text-slate-500"
        />
        <Button
          size="sm"
          onClick={() => setAddOpen(true)}
          className="h-8 text-xs bg-indigo-600 hover:bg-indigo-500"
        >
          <Plus className="w-3.5 h-3.5 mr-1" /> 품목 추가
        </Button>
      </div>

      <div className="rounded-xl border border-slate-700/50 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-slate-700/50 bg-slate-800/40 hover:bg-slate-800/40">
              {["품번", "품명", "대분류", "중분류", "소분류", "담당부서", "수정일", "삭제"].map((h) => (
                <TableHead key={h} className="text-slate-400 text-xs">{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-slate-500 text-xs py-8">로딩 중...</TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-slate-500 text-xs py-8">등록된 품목 매핑이 없습니다.</TableCell>
              </TableRow>
            ) : (
              filtered.map((row) => (
                <TableRow key={row.id} className="border-slate-700/30 hover:bg-slate-800/30 transition-colors">
                  <TableCell className="text-slate-300 text-xs font-mono">{row.itemCode}</TableCell>
                  <TableCell className="text-slate-300 text-xs max-w-[100px] truncate">{row.itemName ?? "-"}</TableCell>
                  <TableCell className="text-slate-400 text-xs">{row.itemLarge ?? "-"}</TableCell>
                  <TableCell className="text-slate-400 text-xs">{row.itemMid ?? "-"}</TableCell>
                  <TableCell className="text-slate-400 text-xs">{row.itemSmall ?? "-"}</TableCell>
                  <TableCell className="text-slate-400 text-xs">{row.dept ?? "-"}</TableCell>
                  <TableCell className="text-slate-500 text-xs">
                    {row.updatedAt ? new Date(row.updatedAt as string).toLocaleDateString("ko-KR") : "-"}
                  </TableCell>
                  <TableCell>
                    <button onClick={() => setDeleteId(row.id)} className="text-slate-500 hover:text-red-400 transition-colors">
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
        <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">품목 매핑 추가/수정</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            {([
              { key: "itemCode" as const, label: "품번 (Item Code)*" },
              { key: "itemName" as const, label: "품명" },
              { key: "itemLarge" as const, label: "대분류" },
              { key: "itemMid" as const, label: "중분류" },
              { key: "itemSmall" as const, label: "소분류" },
              { key: "dept" as const, label: "담당부서" },
              { key: "note" as const, label: "비고" },
            ]).map(({ key, label }) => (
              <div key={key} className="space-y-1">
                <label className="text-xs text-slate-400">{label}</label>
                <Input
                  value={form[key]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  className="h-7 text-xs bg-slate-800 border-slate-600 text-white"
                />
              </div>
            ))}
          </div>
          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button variant="outline" size="sm" className="text-xs border-slate-600 text-slate-300">취소</Button>
            </DialogClose>
            <Button
              size="sm"
              onClick={() => upsertMut.mutate(form)}
              disabled={upsertMut.isPending || !form.itemCode.trim()}
              className="text-xs bg-indigo-600 hover:bg-indigo-500"
            >
              {upsertMut.isPending ? "저장 중..." : "저장"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent className="bg-slate-900 border-slate-700 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm">품목 매핑을 삭제하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-slate-400">이 작업은 되돌릴 수 없습니다.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-xs border-slate-600 text-slate-300 bg-transparent">취소</AlertDialogCancel>
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

"""

# Find the exact marker
marker = '// ─── Sales Records Tab ─────────────────────────────────────────────────────────\nfunction SalesRecordsTab() {'

if marker in content:
    new_content = content.replace(marker, item_mappings_tab + marker, 1)
    with open('client/src/pages/AdminPage.tsx', 'w') as f:
        f.write(new_content)
    print('OK - inserted ItemMappingsTab before SalesRecordsTab')
else:
    # Try to find what's actually there
    idx = content.find('function SalesRecordsTab')
    print(f'MARKER NOT FOUND. SalesRecordsTab at char {idx}')
    print(repr(content[max(0,idx-80):idx+30]))
