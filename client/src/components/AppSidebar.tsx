import { Link, useLocation } from "wouter";
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
} from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
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
  {
    label: "품목별 재고 가용 일수 분석",
    href: "/doc",
    icon: <Package className="h-4 w-4" />,
  },
  {
    label: "네이버 랭킹 분석",
    href: "/naver-ranking",
    icon: <ShoppingBag className="h-4 w-4" />,
  },
];

const bottomItems: NavItem[] = [
  {
    label: "데이터 업로드",
    href: "/upload",
    icon: <Upload className="h-4 w-4" />,
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
            <div className="text-[10px] text-sidebar-foreground/50 leading-tight">국내사업팀</div>
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
      </nav>

      {/* Bottom items */}
      <div className="px-2 pb-3 border-t border-sidebar-border pt-2 space-y-0.5">
        {bottomItems.map((item) => (
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
      </div>
    </aside>
  );
}
