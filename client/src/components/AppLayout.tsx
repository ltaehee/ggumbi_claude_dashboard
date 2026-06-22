import { useState } from "react";
import { AppSidebar } from "./AppSidebar";
import { Button } from "@/components/ui/button";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";

interface AppLayoutProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  mainClassName?: string;
}

export function AppLayout({ children, title, subtitle, actions, mainClassName }: AppLayoutProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <AppSidebar collapsed={collapsed} onToggle={() => setCollapsed((v) => !v)} />

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top header */}
        <header className="flex items-center justify-between px-5 py-3 border-b border-border bg-card/50 backdrop-blur-sm min-h-[56px] shrink-0">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground"
              onClick={() => setCollapsed((v) => !v)}
            >
              {collapsed ? (
                <PanelLeftOpen className="h-4 w-4" />
              ) : (
                <PanelLeftClose className="h-4 w-4" />
              )}
            </Button>
            {title && (
              <div>
                <h1 className="text-base font-semibold text-foreground leading-tight">{title}</h1>
                {subtitle && (
                  <p className="text-xs text-muted-foreground leading-tight">{subtitle}</p>
                )}
              </div>
            )}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>

        {/* Content */}
        <main className={cn("flex-1 overflow-y-auto p-5 transition-colors duration-500", mainClassName)}>
          <div className={cn("animate-fade-in")}>{children}</div>
        </main>
      </div>
    </div>
  );
}
