import { Link, useLocation } from "wouter";
import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  Calendar,
  Database,
  LayoutDashboard,
  Package,
  ShieldCheck,
  ShoppingBag,
  Target,
  TrendingUp,
  Upload,
  LogOut,
  Activity,
  ChevronDown,
  ChevronRight,
  CalendarRange,
} from "lucide-react";
import { getStoredUser, logout } from "@/components/AccessGate";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
}

const navItems: NavItem[] = [
  {
    label: "월간 종합 리포트",
    href: "/monthly",
    icon: <CalendarRange className="h-4 w-4" />,
  },
  {
    label: "매출/수익 분석",
    href: "/",
    icon: <TrendingUp className="h-4 w-4" />,
  },
  {
    label: "채널별 분석",
    href: "/channel",
    icon: <LayoutDashboard className="h-4 w-4" />,
  },
  {
    label: "프로모션/목표 관리",
    href: "/targets",
    icon: <Target className="h-4 w-4" />,
  },
  // 임시 숨김 (2026-07): 페이지/라우트(/doc)와 DocPage.tsx는 그대로 있음. 아래 블록 주석 해제하면 즉시 복구.
  // {
  //   label: "품목별 재고 가용 일수 분석",
  //   href: "/doc",
  //   icon: <Package className="h-4 w-4" />,
  // },
  {
    label: "네이버 랭킹 분석",
    href: "/naver-ranking",
    icon: <ShoppingBag className="h-4 w-4" />,
  },
];

// 실시간 분석 (하위 메뉴)
const realtimeItems = [
  { label: "자사몰 (카페24)", href: "/realtime/cafe24" },
  { label: "네이버 스마트스토어", href: "/realtime/naver" },
];

const bottomItems: NavItem[] = [
  {
    label: "데이터 업로드",
    href: "/upload",
    icon: <Upload className="h-4 w-4" />,
    adminOnly: true,
  },
  {
    label: "데이터 관리자",
    href: "/admin",
    icon: <ShieldCheck className="h-4 w-4" />,
  },
];

interface AppSidebarProps {
  collapsed?: boolean;
  onToggle?: () => void;
}

export function AppSidebar({ collapsed = false, onToggle }: AppSidebarProps) {
  const [location] = useLocation();
  const isAdmin = getStoredUser()?.role === "admin";
  const [rtOpen, setRtOpen] = useState(location.startsWith("/realtime"));

  const isActive = (href: string) => {
    if (href === "/") return location === "/";
    return location.startsWith(href);
  };

  return (
    <aside
      className={cn(
        "flex flex-col h-full bg-sidebar text-sidebar-foreground border-r border-sidebar-border transition-all duration-200",
        collapsed ? "w-14" : "w-56"
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 py-4 border-b border-sidebar-border min-h-[56px]">
        <div className="w-7 h-7 rounded-lg bg-sidebar-primary flex items-center justify-center shrink-0">
          <Database className="h-4 w-4 text-sidebar-primary-foreground" />
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <div className="text-sm font-bold text-sidebar-foreground leading-tight">꿈비</div>
            <div className="text-[10px] text-sidebar-foreground/50 leading-tight">전략사업본부</div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {navItems.map((item) => (
          <Link key={item.href} href={item.href}>
            <div
              className={cn(
                "flex items-center gap-2.5 px-2 py-2 rounded-md text-sm transition-all cursor-pointer",
                isActive(item.href)
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
              )}
              title={collapsed ? item.label : undefined}
            >
              <span className="shrink-0">{item.icon}</span>
              {!collapsed && <span className="truncate">{item.label}</span>}
            </div>
          </Link>
        ))}

        {/* 실시간 분석 (하위: 자사몰 / 네이버) */}
        <div>
          <button
            onClick={() => setRtOpen((o) => !o)}
            title={collapsed ? "실시간 분석" : undefined}
            className={cn(
              "w-full flex items-center gap-2.5 px-2 py-2 rounded-md text-sm transition-all cursor-pointer",
              location.startsWith("/realtime")
                ? "text-sidebar-accent-foreground font-medium"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
            )}
          >
            <span className="shrink-0"><Activity className="h-4 w-4" /></span>
            {!collapsed && <span className="truncate flex-1 text-left">실시간 분석</span>}
            {!collapsed && (rtOpen ? <ChevronDown className="h-3.5 w-3.5 opacity-60" /> : <ChevronRight className="h-3.5 w-3.5 opacity-60" />)}
          </button>
          {!collapsed && rtOpen && (
            <div className="ml-3.5 mt-0.5 space-y-0.5 border-l border-sidebar-border pl-2">
              {realtimeItems.map((sub) => (
                <Link key={sub.href} href={sub.href}>
                  <div
                    className={cn(
                      "flex items-center px-2 py-1.5 rounded-md text-[13px] transition-all cursor-pointer",
                      isActive(sub.href)
                        ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                        : "text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                    )}
                  >
                    <span className="truncate">{sub.label}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </nav>

      {/* Bottom items */}
      <div className="px-2 pb-3 border-t border-sidebar-border pt-2 space-y-0.5">
        {bottomItems.map((item) => {
          // 관리자 전용 항목인데 관리자가 아니면 → 비활성 + 안내 툴팁
          if (item.adminOnly && !isAdmin) {
            return (
              <Tooltip key={item.href}>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-2.5 px-2 py-2 rounded-md text-sm text-sidebar-foreground/35 cursor-not-allowed select-none">
                    <span className="shrink-0">{item.icon}</span>
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right">관리자만 이용할 수 있습니다</TooltipContent>
              </Tooltip>
            );
          }
          return (
            <Link key={item.href} href={item.href}>
              <div
                className={cn(
                  "flex items-center gap-2.5 px-2 py-2 rounded-md text-sm transition-all cursor-pointer",
                  isActive(item.href)
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                )}
                title={collapsed ? item.label : undefined}
              >
                <span className="shrink-0">{item.icon}</span>
                {!collapsed && <span className="truncate">{item.label}</span>}
              </div>
            </Link>
          );
        })}

        {/* 로그인 사용자 + 로그아웃 */}
        <button
          onClick={logout}
          title={collapsed ? "로그아웃" : undefined}
          className="w-full flex items-center gap-2.5 px-2 py-2 rounded-md text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground transition-all"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && (
            <span className="truncate">
              로그아웃
              {getStoredUser()?.id ? ` (${getStoredUser()!.id})` : ""}
            </span>
          )}
        </button>
      </div>
    </aside>
  );
}
