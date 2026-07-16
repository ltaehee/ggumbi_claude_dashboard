import { useFilters } from "@/contexts/FilterContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users } from "lucide-react";

// 고정 사업팀
export const TEAMS = ["매트사업팀", "육아용품사업팀"];

/**
 * 팀 필터: 선택한 사업팀으로 전역 필터(team)를 설정.
 * 서버에서 product_targets(담당자→팀) 기준으로 담당 품명을 자동 조회해 걸러줌.
 */
export function TeamFilter() {
  const { filters, setTeam } = useFilters();
  const current = filters.team || "all";

  return (
    <Select value={current} onValueChange={(v) => setTeam(v === "all" ? "" : v)}>
      <SelectTrigger className="h-8 text-xs w-36 gap-1">
        <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all" className="text-xs">전체 팀</SelectItem>
        {TEAMS.map((t) => (
          <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
