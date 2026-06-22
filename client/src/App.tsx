import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import SalesPage from "./pages/SalesPage";
import TargetsPage from "./pages/TargetsPage";
import DocPage from "./pages/DocPage";
import AiPage from "./pages/AiPage";
import UploadPage from "./pages/UploadPage";
import MonthlyPage from "./pages/MonthlyPage";
import AdminPage from "./pages/AdminPage";
import ChannelDetailPage from "./pages/ChannelDetailPage";
import ChannelPage from "./pages/ChannelPage";
import NaverRankingPage from "./pages/NaverRankingPage";
import AccessGate from "./components/AccessGate";

function Router() {
  return (
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
      <Route path="/admin" component={AdminPage} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
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
