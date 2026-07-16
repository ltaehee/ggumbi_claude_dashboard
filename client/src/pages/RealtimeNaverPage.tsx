import { AppLayout } from "@/components/AppLayout";
import { Activity, CheckCircle2, Clock } from "lucide-react";

export default function RealtimeNaverPage() {
  return (
    <AppLayout title="실시간 분석 · 네이버 스마트스토어" subtitle="네이버 커머스 API 연동">
      <div className="max-w-2xl space-y-4">
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="h-5 w-5 text-amber-500" />
            <h3 className="text-base font-semibold text-foreground">연동 준비 중</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            네이버 스마트스토어의 주문/매출을 주기적으로(준실시간) 가져와 이곳에 표시합니다. 아래 정보가 준비되면 연동을 진행합니다.
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="h-4 w-4 text-primary" />
            <h4 className="text-sm font-semibold text-foreground">연동에 필요한 정보 (네이버)</h4>
          </div>
          <ul className="space-y-2.5 text-sm">
            {[
              ["애플리케이션 ID (Client ID)", "네이버 커머스 API 센터에서 애플리케이션 등록 후 발급"],
              ["애플리케이션 시크릿 (Client Secret)", "위 애플리케이션의 시크릿 키"],
              ["판매자(스토어) 정보", "스마트스토어 채널/판매자 ID (애플리케이션과 연결)"],
              ["권한(Scope)", "상품주문 조회 / 상품 조회"],
              ["판매자 승인", "API 센터에서 애플리케이션을 스토어에 연결·승인 (제가 안내)"],
            ].map(([k, v]) => (
              <li key={k} className="flex gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                <div>
                  <span className="font-medium text-foreground">{k}</span>
                  <span className="text-muted-foreground"> — {v}</span>
                </div>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground mt-4">
            * 네이버는 웹훅이 없어 주기적 조회(폴링)로 가져옵니다. 토큰 갱신/스케줄은 제가 설정합니다.
          </p>
        </div>
      </div>
    </AppLayout>
  );
}
