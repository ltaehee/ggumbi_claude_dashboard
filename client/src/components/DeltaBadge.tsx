import { cn } from "@/lib/utils";
import { deltaClass, deltaIcon } from "@/lib/format";

interface DeltaBadgeProps {
  value: number | null | undefined;
  label?: string;
  size?: "xs" | "sm" | "md";
  className?: string;
  unit?: string; // 표기 단위 (기본 "%", 퍼센트포인트는 "%p")
}

export function DeltaBadge({ value, label, size = "sm", className, unit = "%" }: DeltaBadgeProps) {
  // 비교군 없음 (null)
  if (value == null) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-0.5 font-normal tabular-nums text-muted-foreground/60",
          size === "xs" ? "text-[10px]" : size === "sm" ? "text-xs" : "text-sm",
          className
        )}
      >
        <span>비교군없음</span>
        {label && <span className="ml-0.5">{label}</span>}
      </span>
    );
  }

  const cls = deltaClass(value);
  const icon = deltaIcon(value);
  const pct = `${value >= 0 ? "+" : ""}${value.toFixed(1)}${unit}`;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 font-semibold tabular-nums",
        size === "xs" ? "text-[10px]" : size === "sm" ? "text-xs" : "text-sm",
        cls === "delta-up" && "text-emerald-500",
        cls === "delta-down" && "text-red-500",
        cls === "delta-neutral" && "text-muted-foreground",
        className
      )}
    >
      <span className="text-[10px] leading-none">{icon}</span>
      <span>{pct}</span>
      {label && <span className="text-muted-foreground font-normal ml-0.5">{label}</span>}
    </span>
  );
}
