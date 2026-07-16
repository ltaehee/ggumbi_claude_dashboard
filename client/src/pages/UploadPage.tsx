import { useState, useRef, useCallback } from "react";
import { AppLayout } from "@/components/AppLayout";
import { getStoredUser } from "@/components/AccessGate";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Upload, FileSpreadsheet, CheckCircle2, XCircle, Clock, Database, RefreshCw, UserPlus, AlertTriangle } from "lucide-react";
import { fmtDate, fmtAmt, fmtQty } from "@/lib/format";

type FileType = "sales" | "bom" | "target" | "promotion" | "inventory" | "productTarget" | "managerMap";

const FILE_TYPES: { value: FileType; label: string; desc: string; color: string }[] = [
  { value: "sales", label: "매출 데이터", desc: "일자별 거래처/품목 매출 데이터", color: "bg-blue-500/15 text-blue-600 border-blue-200" },
  { value: "productTarget", label: "상품별 목표(SKU)", desc: "SKU별 월목표 + 담당자·팀 (2026 상품별 목표 워크북)", color: "bg-teal-500/15 text-teal-600 border-teal-200" },
  { value: "managerMap", label: "담당자 지정", desc: "품목소분류별 담당자 (신상품·AS 자동 담당 지정)", color: "bg-cyan-500/15 text-cyan-600 border-cyan-200" },
  { value: "bom", label: "BOM 원가", desc: "품목별 BOM 원가 정보", color: "bg-purple-500/15 text-purple-600 border-purple-200" },
  { value: "target", label: "목표(월/부서)", desc: "월별/부서별 매출 목표 (단순 표)", color: "bg-emerald-500/15 text-emerald-600 border-emerald-200" },
  { value: "promotion", label: "프로모션", desc: "행사/프로모션 일정 및 목표", color: "bg-amber-500/15 text-amber-600 border-amber-200" },
  { value: "inventory", label: "재고", desc: "현재 품목별 재고 현황", color: "bg-red-500/15 text-red-600 border-red-200" },
];

interface UploadProgress {
  step: "uploading" | "parsing" | "rebuilding" | "done" | "error";
  progress: number;
  message: string;
}

function UploadZone({
  fileType,
  onUpload,
  disabled,
}: {
  fileType: FileType;
  onUpload: (file: File) => void;
  disabled?: boolean;
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      if (disabled) return;
      const file = e.dataTransfer.files[0];
      if (file) onUpload(file);
    },
    [onUpload, disabled]
  );

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => !disabled && inputRef.current?.click()}
      className={cn(
        "border-2 border-dashed rounded-xl p-8 text-center transition-all",
        disabled
          ? "opacity-50 cursor-not-allowed border-border"
          : dragging
          ? "border-primary bg-primary/5 scale-[1.01] cursor-pointer"
          : "border-border hover:border-primary/50 hover:bg-muted/30 cursor-pointer"
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        disabled={disabled}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUpload(file);
          e.target.value = "";
        }}
      />
      <Upload className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
      <p className="text-sm font-medium text-foreground">파일을 드래그하거나 클릭하여 업로드</p>
      <p className="text-xs text-muted-foreground mt-1">.xlsx, .xls, .csv 지원 · 최대 50MB</p>
    </div>
  );
}

function UploadProgressPanel({ progress }: { progress: UploadProgress }) {
  const stepConfig: Record<UploadProgress["step"], { icon: React.ReactNode; color: string }> = {
    uploading: { icon: <Upload className="h-4 w-4 animate-pulse" />, color: "text-blue-600" },
    parsing: { icon: <FileSpreadsheet className="h-4 w-4 animate-pulse" />, color: "text-indigo-600" },
    rebuilding: { icon: <RefreshCw className="h-4 w-4 animate-spin" />, color: "text-amber-600" },
    done: { icon: <CheckCircle2 className="h-4 w-4" />, color: "text-emerald-600" },
    error: { icon: <XCircle className="h-4 w-4" />, color: "text-red-600" },
  };

  const cfg = stepConfig[progress.step];

  return (
    <div className="mt-4 rounded-xl border border-border bg-card p-4 space-y-3">
      <div className={cn("flex items-center gap-2 text-sm font-medium", cfg.color)}>
        {cfg.icon}
        <span>{progress.message}</span>
      </div>
      <Progress value={progress.progress} className="h-2" />
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>
          {progress.step === "uploading" && "서버로 파일 전송 중..."}
          {progress.step === "parsing" && "파일 분석 및 DB 저장 중..."}
          {progress.step === "rebuilding" && "집계 데이터 재빌드 중... (시간이 걸릴 수 있습니다)"}
          {progress.step === "done" && "처리 완료"}
          {progress.step === "error" && "처리 실패"}
        </span>
        <span className="tabular-nums font-medium">{progress.progress}%</span>
      </div>
    </div>
  );
}

// ─── 담당자 미지정 SKU 관리 ─────────────────────────────────────────────────────
// 매출 데이터에 나왔지만 담당자가 안 잡힌 SKU(품번 오버라이드 X + 충돌/새 소분류) 목록.
// 여기서 지정하면 즉시 마트에 반영되고, 같은 품번은 이후 계속 그 담당자로 집계됨.
function UnassignedManager() {
  const utils = trpc.useUtils();
  const unassignedQ = trpc.managerAssign.getUnassigned.useQuery(undefined, { refetchOnWindowFocus: false });
  const managersQ = trpc.managerAssign.getManagers.useQuery(undefined, { refetchOnWindowFocus: false });
  const assignSku = trpc.managerAssign.assignSku.useMutation();
  const assignSmall = trpc.managerAssign.assignSmall.useMutation();
  const [scope, setScope] = useState<Record<string, "sku" | "small">>({});
  const [busyCode, setBusyCode] = useState<string | null>(null);

  const rows = unassignedQ.data ?? [];
  const managers = managersQ.data ?? [];
  const totalSales = rows.reduce((s, r) => s + r.totalSales, 0);

  const onPick = async (row: (typeof rows)[number], managerKey: string) => {
    const m = managers.find((x) => x.manager === managerKey);
    if (!m) return;
    const sc = scope[row.itemCode] ?? "sku";
    setBusyCode(row.itemCode);
    try {
      if (sc === "small") {
        await assignSmall.mutateAsync({ itemSmall: row.itemSmall, manager: m.manager, team: m.team });
        toast.success(`소분류 "${row.itemSmall}" 전체 → ${m.manager} 지정`);
      } else {
        await assignSku.mutateAsync({
          itemCode: row.itemCode, manager: m.manager, team: m.team,
          itemName: row.itemName, itemSmall: row.itemSmall,
        });
        toast.success(`${row.itemName || row.itemCode} → ${m.manager} 지정`);
      }
      await Promise.all([
        utils.managerAssign.getUnassigned.invalidate(),
        utils.managerAssign.getUnassignedSummary.invalidate(),
        utils.kpi.getSummary.invalidate(),
        utils.sales.getItemPerf.invalidate(),
      ]);
    } catch {
      toast.error("담당자 지정에 실패했습니다.");
    } finally {
      setBusyCode(null);
    }
  };

  return (
    <div id="unassigned-manager" className="rounded-xl border border-border bg-card p-4 scroll-mt-4">
      <div className="flex items-center gap-2 mb-1">
        <UserPlus className="h-4 w-4 text-cyan-600" />
        <h3 className="text-sm font-semibold text-foreground">담당자 미지정 SKU</h3>
        {rows.length > 0 ? (
          <Badge className="bg-amber-500/15 text-amber-600 border-amber-200">{rows.length}건 · {fmtAmt(totalSales)}</Badge>
        ) : (
          <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-200">모두 지정됨</Badge>
        )}
        <button
          onClick={() => { utils.managerAssign.getUnassigned.invalidate(); }}
          className="ml-auto text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
        >
          <RefreshCw className="h-3 w-3" /> 새로고침
        </button>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        매출에 나왔지만 담당자가 안 잡힌 품번입니다. 담당자를 고르면 즉시 반영되고, 같은 품번은 이후 계속 그 담당자로 집계됩니다.
        <span className="text-muted-foreground/70"> (범위 "소분류 전체"를 고르면 그 소분류의 미지정 품목이 한 번에 지정됩니다.)</span>
      </p>

      {unassignedQ.isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : rows.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-emerald-600 py-4 justify-center">
          <CheckCircle2 className="h-4 w-4" /> 담당자 미지정 SKU가 없습니다.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted-foreground border-b border-border">
                <th className="text-left font-medium py-2 pr-2">품명</th>
                <th className="text-left font-medium py-2 px-2">소분류</th>
                <th className="text-right font-medium py-2 px-2">매출</th>
                <th className="text-right font-medium py-2 px-2">수량</th>
                <th className="text-left font-medium py-2 px-2 w-[120px]">범위</th>
                <th className="text-left font-medium py-2 pl-2 w-[150px]">담당자 지정</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const sc = scope[row.itemCode] ?? "sku";
                const busy = busyCode === row.itemCode;
                return (
                  <tr key={row.itemCode} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="py-2 pr-2">
                      <div className="text-foreground font-medium truncate max-w-[280px]" title={row.itemName}>{row.itemName || "(품명 없음)"}</div>
                      <div className="text-[10px] text-muted-foreground tabular-nums">{row.itemCode}</div>
                    </td>
                    <td className="py-2 px-2 text-muted-foreground">{row.itemSmall || "-"}</td>
                    <td className="py-2 px-2 text-right tabular-nums text-foreground">{fmtAmt(row.totalSales)}</td>
                    <td className="py-2 px-2 text-right tabular-nums text-muted-foreground">{fmtQty(row.totalQty)}</td>
                    <td className="py-2 px-2">
                      <select
                        value={sc}
                        disabled={busy}
                        onChange={(e) => setScope((p) => ({ ...p, [row.itemCode]: e.target.value as "sku" | "small" }))}
                        className="w-full rounded-md border border-border bg-background px-1.5 py-1 text-xs"
                      >
                        <option value="sku">이 SKU만</option>
                        <option value="small">소분류 전체</option>
                      </select>
                    </td>
                    <td className="py-2 pl-2">
                      <select
                        value=""
                        disabled={busy || managers.length === 0}
                        onChange={(e) => e.target.value && onPick(row, e.target.value)}
                        className="w-full rounded-md border border-border bg-background px-1.5 py-1 text-xs"
                      >
                        <option value="">{busy ? "지정 중..." : "담당자 선택▾"}</option>
                        {managers.map((m) => (
                          <option key={m.manager} value={m.manager}>{m.manager} ({m.team.replace("사업팀", "")})</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function UploadPage() {
  const [selectedType, setSelectedType] = useState<FileType>("sales");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);

  const historyQuery = trpc.upload.getHistory.useQuery({ limit: 20 });
  const utils = trpc.useUtils();
  const isAdmin = getStoredUser()?.role === "admin";

  const handleUpload = useCallback(
    async (file: File) => {
      setUploading(true);
      setUploadProgress({ step: "uploading", progress: 5, message: `"${file.name}" 업로드 중...` });

      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("fileType", selectedType);

        // 1단계: 파일 업로드 요청 (jobId 즉시 반환)
        const res = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });
        const json = await res.json();

        if (!json.success || !json.jobId) {
          setUploadProgress({ step: "error", progress: 0, message: `업로드 실패: ${json.error ?? "알 수 없는 오류"}` });
          toast.error(`업로드 실패: ${json.error ?? "알 수 없는 오류"}`);
          setUploading(false);
          return;
        }

        // 2단계: 백그라운드 작업 완료 대기 (폴링)
        setUploadProgress({ step: "parsing", progress: 10, message: `"${file.name}" 데이터 분석 중...` });
        const jobId = json.jobId;
        const POLL_INTERVAL = 2000;
        const MAX_WAIT = 10 * 60 * 1000; // 최대 10분 (대용량 파일 + 마트 재빌드 고려)
        const startTime = Date.now();

        await new Promise<void>((resolve) => {
          const poll = async () => {
            try {
              const statusRes = await fetch(`/api/upload/status/${jobId}`);
              const status = await statusRes.json();

              if (status.status === "processing") {
                // step/progress 필드로 진행 상태 업데이트
                const step = status.step as "parsing" | "rebuilding" | undefined;
                const progress = status.progress as number | undefined;

                if (step === "rebuilding") {
                  setUploadProgress({
                    step: "rebuilding",
                    progress: progress ?? 70,
                    message: "집계 데이터 재빌드 중...",
                  });
                } else {
                  setUploadProgress({
                    step: "parsing",
                    progress: progress ?? 10,
                    message: `"${file.name}" 파일 분석 및 DB 저장 중...`,
                  });
                }
                setTimeout(poll, POLL_INTERVAL);
              } else if (status.status === "done") {
                setUploadProgress({ step: "done", progress: 100, message: "처리 완료!" });

                // 완료 메시지 구성
                const martInfo = status.martBuilt > 0 ? ` · 마트 ${status.martBuilt.toLocaleString()}행 재빌드 완료` : "";
                const isBomOrSales = selectedType === "bom" || selectedType === "sales";

                if (status.replaced) {
                  toast.success(
                    `업데이트 완료: 기존 ${status.deletedCount.toLocaleString()}건 → ${status.rowCount.toLocaleString()}건으로 교체${martInfo}${isBomOrSales ? " · 이익률이 갱신되었습니다" : ""}`,
                    { duration: 6000 }
                  );
                } else {
                  toast.success(
                    `업로드 완료: ${status.rowCount.toLocaleString()}건 처리됨${martInfo}${isBomOrSales ? " · 이익률이 갱신되었습니다" : ""}`,
                    { duration: 6000 }
                  );
                }

                // 담당자 미지정 SKU 알림 (매출/담당자지정 업로드)
                if (typeof status.unassignedCount === "number" && status.unassignedCount > 0) {
                  toast.warning(
                    `담당자 미지정 SKU ${status.unassignedCount.toLocaleString()}건 (매출 ${fmtAmt(status.unassignedSales ?? 0)}) — 아래 "담당자 미지정 SKU"에서 지정하세요.`,
                    { duration: 10000 }
                  );
                  document.getElementById("unassigned-manager")?.scrollIntoView({ behavior: "smooth", block: "start" });
                }

                utils.upload.getHistory.invalidate();
                utils.kpi.getSummary.invalidate();
                utils.sales.getTrend.invalidate();
                utils.sales.getItemPerf.invalidate();
                utils.managerAssign.getUnassigned.invalidate();
                utils.managerAssign.getUnassignedSummary.invalidate();
                resolve();
              } else if (status.status === "error") {
                setUploadProgress({ step: "error", progress: 0, message: `처리 실패: ${status.error}` });
                toast.error(`업로드 실패: ${status.error}`);
                resolve();
              } else if (Date.now() - startTime > MAX_WAIT) {
                setUploadProgress({ step: "error", progress: 0, message: "업로드 시간이 초과되었습니다 (10분)" });
                toast.error("업로드 시간이 초과되었습니다. 파일 크기를 줄이거나 다시 시도해 주세요.");
                resolve();
              } else {
                setTimeout(poll, POLL_INTERVAL);
              }
            } catch {
              setUploadProgress({ step: "error", progress: 0, message: "업로드 상태 확인 중 오류 발생" });
              toast.error("업로드 상태 확인 중 오류가 발생했습니다.");
              resolve();
            }
          };
          setTimeout(poll, POLL_INTERVAL);
        });
      } catch (e) {
        setUploadProgress({ step: "error", progress: 0, message: "업로드 중 오류가 발생했습니다." });
        toast.error("업로드 중 오류가 발생했습니다.");
      } finally {
        setUploading(false);
        // 완료/오류 후 3초 뒤 진행률 패널 숨기기
        setTimeout(() => setUploadProgress(null), 3000);
      }
    },
    [selectedType, utils]
  );

  if (!isAdmin) {
    return (
      <AppLayout title="데이터 업로드" subtitle="엑셀 파일을 업로드하여 대시보드 데이터를 갱신합니다">
        <div className="max-w-md mx-auto mt-16 text-center rounded-xl border border-border bg-card p-10">
          <p className="text-base font-semibold text-foreground">관리자 전용 페이지입니다</p>
          <p className="text-sm text-muted-foreground mt-2">데이터 업로드는 관리자만 이용할 수 있습니다.</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout
      title="데이터 업로드"
      subtitle="엑셀 파일을 업로드하여 대시보드 데이터를 갱신합니다"
    >
      <div className="max-w-4xl space-y-6">
        {/* File type cards */}
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3">업로드할 파일 유형 선택</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {FILE_TYPES.map((ft) => (
              <button
                key={ft.value}
                onClick={() => !uploading && setSelectedType(ft.value)}
                disabled={uploading}
                className={cn(
                  "rounded-xl border p-3 text-left transition-all",
                  uploading && "opacity-50 cursor-not-allowed",
                  selectedType === ft.value
                    ? "ring-2 ring-primary border-primary/30 bg-primary/5"
                    : "border-border bg-card hover:bg-muted/30"
                )}
              >
                <FileSpreadsheet className="h-5 w-5 mb-2 text-muted-foreground" />
                <div className="text-xs font-semibold text-foreground">{ft.label}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{ft.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Upload zone */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-sm font-semibold text-foreground">파일 업로드</h3>
            <Badge className={FILE_TYPES.find((f) => f.value === selectedType)?.color ?? ""}>
              {FILE_TYPES.find((f) => f.value === selectedType)?.label}
            </Badge>
            {(selectedType === "bom" || selectedType === "sales") && (
              <span className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                <Database className="h-3 w-3" />
                업로드 후 마트 자동 재빌드
              </span>
            )}
          </div>
          <UploadZone fileType={selectedType} onUpload={handleUpload} disabled={uploading} />

          {/* 진행률 패널 */}
          {uploadProgress && <UploadProgressPanel progress={uploadProgress} />}
        </div>

        {/* Column mapping guide */}
        <div className="rounded-xl border border-border bg-muted/30 p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">엑셀 컬럼 매핑 가이드</h3>
          {selectedType === "sales" && (
            <div className="text-xs text-muted-foreground space-y-1">
              <p><strong>매출 데이터</strong> — 필수 컬럼: 날짜(일자/Date), 거래처, 품번, 품명, 수량, 금액(매출/판매금액)</p>
              <p>선택 컬럼: 대분류, 중분류, 소분류, 부서, 단가</p>
              <p className="text-amber-600">※ 날짜 형식: YYYY-MM-DD 또는 YYYY/MM/DD</p>
            </div>
          )}
          {selectedType === "bom" && (
            <div className="text-xs text-muted-foreground space-y-1">
              <p><strong>BOM 원가 (월별 관리)</strong> — 필수 콜럼: 품번, 제조원가</p>
              <p className="font-medium text-foreground">파일명 규칙: <code className="bg-muted px-1 rounded">BOM 202605.xlsx</code> 또는 <code className="bg-muted px-1 rounded">BOM2605.xlsx</code></p>
              <p>파일명의 숫자(YYYYMM 또는 YYMM)로 해당 월 원가로 적용됩니다.</p>
              <p>예) BOM 202604 → 4월 매출에 적용 / BOM 202605 → 5월 매출에 적용</p>
              <p className="text-amber-600">※ 새 BOM 업로드는 해당 월만 적용되며, 이전 월 데이터는 변경되지 않습니다.</p>
            </div>
          )}
          {selectedType === "productTarget" && (
            <div className="text-xs text-muted-foreground space-y-1">
              <p><strong>상품별 목표(SKU)</strong> — "2026년 상품별 목표" 워크북(.xlsx)을 그대로 업로드</p>
              <p>· <strong>상품별 매출 목표</strong> 시트: 품명·품번·대분류·중분류·사업계획 카테고리·담당자 + 26년1월~12월 목표</p>
              <p>· <strong>담당자별 KPI</strong> 시트: 담당자→팀(매트/육아) 매핑에 사용</p>
              <p className="text-teal-600">※ 같은 연도 목표는 전체 교체됩니다. 팀·카테고리·담당자 목표는 SKU 합으로 자동 계산됩니다.</p>
            </div>
          )}
          {selectedType === "managerMap" && (
            <div className="text-xs text-muted-foreground space-y-1">
              <p><strong>담당자 지정</strong> — "sku별 담당 지정" 파일(.xlsx)을 그대로 업로드</p>
              <p>· 필수 컬럼: <strong>품목소분류</strong>, <strong>담당자</strong> (한 소분류당 담당자 1명)</p>
              <p>· 담당자→팀은 상품별 목표(매트/육아) 기준으로 자동 매핑됩니다.</p>
              <p className="text-cyan-600">※ 소분류 기준이라 신상품·AS·반품도 소분류만 맞으면 자동으로 담당자가 잡힙니다. 업로드 시 전체 교체됩니다.</p>
            </div>
          )}
          {selectedType === "target" && (
            <div className="text-xs text-muted-foreground space-y-1">
              <p><strong>목표(월/부서)</strong> — 필수 컬럼: 연도, 월, 부서, 목표금액</p>
              <p>선택 컬럼: 목표수량, 품목코드</p>
            </div>
          )}
          {selectedType === "promotion" && (
            <div className="text-xs text-muted-foreground space-y-1">
              <p><strong>프로모션</strong> — 필수 컬럼: 행사명, 거래처, 시작일, 종료일</p>
              <p>선택 컬럼: 목표금액, 달성금액, 비고</p>
            </div>
          )}
          {selectedType === "inventory" && (
            <div className="text-xs text-muted-foreground space-y-1">
              <p><strong>재고</strong> — 필수 컬럼: 품번, 품명, 재고수량</p>
              <p>선택 컬럼: 창고, 로케이션, 기준일</p>
            </div>
          )}
        </div>

        {/* 담당자 미지정 SKU 관리 */}
        <UnassignedManager />

        {/* Upload history */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="p-4 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground">업로드 이력</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full data-table">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-2.5">파일명</th>
                  <th className="text-left px-4 py-2.5">유형</th>
                  <th className="text-right px-4 py-2.5">처리 건수</th>
                  <th className="text-left px-4 py-2.5">상태</th>
                  <th className="text-left px-4 py-2.5">업로드 일시</th>
                </tr>
              </thead>
              <tbody>
                {historyQuery.isLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/50">
                      {Array.from({ length: 5 }).map((_, j) => (
                        <td key={j} className="px-4 py-2.5"><Skeleton className="h-4 w-full" /></td>
                      ))}
                    </tr>
                  ))
                ) : (historyQuery.data ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-10 text-muted-foreground text-sm">
                      업로드 이력이 없습니다.
                    </td>
                  </tr>
                ) : (
                  (historyQuery.data ?? []).map((h, i) => (
                    <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="px-4 py-2.5 text-sm font-medium max-w-xs truncate">{h.fileName ?? (h as any).filename}</td>
                      <td className="px-4 py-2.5">
                        <Badge className={FILE_TYPES.find((f) => f.value === h.fileType)?.color ?? ""}>
                          {FILE_TYPES.find((f) => f.value === h.fileType)?.label ?? h.fileType}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-right text-sm tabular-nums">
                        {h.rowCount?.toLocaleString() ?? "—"}건
                      </td>
                      <td className="px-4 py-2.5">
                        {(h.status ?? "success") === "success" ? (
                          <span className="flex items-center gap-1 text-emerald-600 text-xs">
                            <CheckCircle2 className="h-3.5 w-3.5" /> 완료
                          </span>
                        ) : String(h.status ?? "success") === "error" ? (
                          <span className="flex items-center gap-1 text-red-600 text-xs">
                            <XCircle className="h-3.5 w-3.5" /> 오류
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-muted-foreground text-xs">
                            <Clock className="h-3.5 w-3.5" /> 처리중
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-sm text-muted-foreground">
                        {h.uploadedAt ? new Date(h.uploadedAt).toLocaleString("ko-KR") : "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
