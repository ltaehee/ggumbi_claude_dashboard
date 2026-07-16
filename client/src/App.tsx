import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import AccessGate from "./components/AccessGate";

// 페이지를 지연 로딩(코드 분할)하여 초기 번들 크기를 줄이고 첫 화면 로딩을 빠르게
const SalesPage = lazy(() => import("./pages/SalesPage"));
const TargetsPage = lazy(() => import("./pages/TargetsPage"));
const DocPage = lazy(() => import("./pages/DocPage"));
const AiPage = lazy(() => import("./pages/AiPage"));
const UploadPage = lazy(() => import("./pages/UploadPage"));
const MonthlyPage = lazy(() => import("./pages/MonthlyPage"));
const AdminPage = lazy(() => import("./pages/AdminPage"));
const ChannelDetailPage = lazy(() => import("./pages/ChannelDetailPage"));
const ChannelPage = lazy(() => import("./pages/ChannelPage"));
const NaverRankingPage = lazy(() => import("./pages/NaverRankingPage"));
const RealtimeCafe24Page = lazy(() => import("./pages/RealtimeCafe24Page"));
const RealtimeNaverPage = lazy(() => import("./pages/RealtimeNaverPage"));

function PageLoading() {
  return (
    <div className="flex items-center justify-center h-[60vh] text-sm text-muted-foreground">
      <span className="flex items-center gap-2">
        <span className="w-4 h-4 border-2 border-muted-foreground/30 border-t-foreground rounded-full animate-spin" />
        불러오는 중...
      </span>
    </div>
  );
}

function Router() {
  return (
    <Suspense fallback={<PageLoading />}>
      <Switch>
        <Route path="/" component={SalesPage} />
        <Route path="/targets" component={TargetsPage} />
        <Route path="/doc" component={DocPage} />
        <Route path="/ai" component={AiPage} />
        <Route path="/upload" component={UploadPage} />
        <Route path="/monthly" component={MonthlyPage} />
        <Route path="/monthly-targets" component={TargetsPage} />
        <Route path="/channel" component={ChannelPage} />
        <Route path="/channel/:name" component={ChannelDetailPage} />
        <Route path="/naver-ranking" component={NaverRankingPage} />
        <Route path="/realtime/cafe24" component={RealtimeCafe24Page} />
        <Route path="/realtime/naver" component={RealtimeNaverPage} />
        <Route path="/admin" component={AdminPage} />
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          {/* AccessGate wraps the entire app - blocks access until password is verified */}
          <AccessGate>
            <Router />
          </AccessGate>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
