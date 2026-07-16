import { cn } from "@/lib/utils";

const TEAM_OPTS = [
  { k: "", label: "전체" },
  { k: "매트사업팀", label: "매트사업팀" },
  { k: "육아용품사업팀", label: "육아용품사업팀" },
];

/** 팀 원클릭 토글 (전체 / 매트사업팀 / 육아용품사업팀) — 월간 리포트·매출/수익 공통 */
export function TeamToggle({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs font-medium text-muted-foreground">팀</span>
      <div className="inline-flex rounded-lg border border-border overflow-hidden">
        {TEAM_OPTS.map((t) => (
          <button
            key={t.k}
            onClick={() => onChange(t.k)}
            className={cn(
              "px-3.5 py-1.5 text-xs font-semibold transition-colors border-l first:border-l-0 border-border",
              value === t.k ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {value && <span className="text-[11px] text-muted-foreground">· 해당 팀 담당 상품 기준</span>}
    </div>
  );
}
