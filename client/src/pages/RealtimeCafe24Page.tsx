import { AppLayout } from "@/components/AppLayout";
import { Activity, CheckCircle2, Clock } from "lucide-react";

export default function RealtimeCafe24Page() {
  return (
    <AppLayout title="실시간 분석 · 자사몰 (카페24)" subtitle="카페24 Open API 실시간 연동">
      <div className="max-w-2xl space-y-4">
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="h-5 w-5 text-amber-500" />
            <h3 className="text-base font-semibold text-foreground">연동 준비 중</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            카페24 자사몰의 주문/매출을 실시간(웹훅)으로 가져와 이곳에 표시합니다. 아래 정보가 준비되면 연동을 진행합니다.
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="h-4 w-4 text-primary" />
            <h4 className="text-sm font-semibold text-foreground">연동에 필요한 정보 (카페24)</h4>
          </div>
          <ul className="space-y-2.5 text-sm">
            {[
              ["쇼핑몰 아이디 (Mall ID)", "예: yourstore.cafe24.com 의 yourstore"],
              ["Client ID", "카페24 개발자센터(developers.cafe24.com)에서 앱 생성 후 발급"],
              ["Client Secret", "위 앱의 시크릿 키"],
              ["권한(Scope)", "주문 조회 / 상품 조회 (mall.read_order, mall.read_product 등)"],
              ["관리자 인증", "쇼핑몰 관리자로 OAuth 1회 승인 (제가 안내)"],
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
            * 웹훅 수신용 서버 주소와 OAuth 콜백은 제가 설정합니다. 위 값만 전달해주세요.
          </p>
        </div>
      </div>
    </AppLayout>
  );
}
