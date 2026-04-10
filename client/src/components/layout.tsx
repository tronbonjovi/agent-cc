import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useScanStatus } from "@/hooks/use-entities";
import { useAppSettings } from "@/hooks/use-settings";
import { SearchTrigger } from "@/components/global-search";
import { SyncIndicator } from "@/components/sync-indicator";
import { UpdateIndicator } from "@/components/update-indicator";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { TerminalPanel } from "./terminal-panel";

import {
  LayoutDashboard,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  BarChart3,
  Kanban,
  BookOpen,
} from "lucide-react";
import { useState, useEffect } from "react";
import React from "react";

interface NavItem {
  path: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  countKey: string | null;
}

const navItems: NavItem[] = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard, countKey: null },
  { path: "/projects", label: "Projects", icon: Kanban, countKey: null },
  { path: "/library", label: "Library", icon: BookOpen, countKey: null },
  { path: "/sessions", label: "Sessions", icon: MessageSquare, countKey: "session" as const },
  { path: "/analytics", label: "Analytics", icon: BarChart3, countKey: null },
  { path: "/settings", label: "Settings", icon: SlidersHorizontal, countKey: null },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { data: status } = useScanStatus();
  const { data: settings } = useAppSettings();
  const [collapsed, setCollapsed] = useState(false);
  const counts = (status?.entityCounts || {}) as Record<string, number>;
  const isScanning = status?.scanning;
  const appName = settings?.appName || "Agent CC";

  // Keyboard shortcut for collapse
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "l") {
        e.preventDefault();
        setCollapsed((c) => !c);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className={cn(
        "border-r flex flex-col transition-all duration-200 relative bg-sidebar",
        collapsed ? "w-14" : "w-56"
      )}>
        {/* Top gradient accent line */}
        <div className="h-px bg-gradient-to-r from-brand-1/40 via-brand-2/30 to-transparent" />
        {/* Scan progress bar */}
        {isScanning && (
          <div className="absolute top-0 left-0 right-0 h-0.5 z-10">
            <div className="h-full bg-blue-500 animate-shimmer" style={{ width: "100%", backgroundSize: "200% 100%", background: "linear-gradient(90deg, transparent, hsl(var(--sidebar-primary)), transparent)" }} />
          </div>
        )}

        {/* Brand */}
        <div className={cn("flex items-center h-14", collapsed ? "px-3 justify-center" : "px-4")}>
          {!collapsed && (
            <span className="font-semibold text-sm whitespace-nowrap">
              {appName}
            </span>
          )}
        </div>
        <div className="mx-3 h-px bg-gradient-to-r from-transparent via-border/40 to-transparent" />

        {/* Search trigger */}
        <div className="p-2">
          <SearchTrigger collapsed={collapsed} />
        </div>

        <ScrollArea className="flex-1">
          <nav className="px-2 pb-2">
            <div className="space-y-0.5">
              {navItems.map((item) => {
                const isActive =
                  item.path === "/"
                    ? location === "/"
                    : location.startsWith(item.path);
                const count = item.countKey === "session"
                  ? (status as any)?.sessionCount
                  : item.countKey ? counts[item.countKey] : null;

                const navContent = (
                  <Link key={item.path} href={item.path}>
                    <div
                      className={cn(
                        "flex items-center rounded-md px-3 py-2 text-sm transition-all duration-150 cursor-pointer group relative",
                        collapsed ? "justify-center" : "gap-2.5",
                        isActive
                          ? "bg-gradient-to-r from-brand-1/15 via-brand-2/10 to-transparent text-sidebar-accent-foreground font-medium"
                          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground hover:translate-x-0.5 hover:shadow-[inset_0_0_12px_hsl(var(--nav-active)/0.06)]"
                      )}
                    >
                      {/* Active indicator pill */}
                      {isActive && (
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-gradient-to-b from-brand-1 to-brand-2 shadow-[0_0_8px_var(--glow-blue)]" />
                      )}
                      <item.icon className={cn("h-4 w-4 flex-shrink-0 transition-all duration-150", isActive && "text-nav-active", !isActive && "group-hover:scale-110 group-hover:text-nav-active/70")} />
                      {!collapsed && (
                        <>
                          <span className="flex-1">{item.label}</span>
                          {count != null && count > 0 && (
                            <span className="text-[10px] font-mono text-muted-foreground tabular-nums">
                              {count}
                            </span>
                          )}
                        </>
                      )}
                      {collapsed && isActive && (
                        <div className="absolute -right-0.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-nav-active" />
                      )}
                    </div>
                  </Link>
                );

                if (collapsed) {
                  return (
                    <Tooltip key={item.path}>
                      <TooltipTrigger asChild>
                        {navContent}
                      </TooltipTrigger>
                      <TooltipContent side="right" className="text-xs">
                        {item.label}
                        {count != null && count > 0 && (
                          <span className="ml-1.5 font-mono text-muted-foreground">({count})</span>
                        )}
                      </TooltipContent>
                    </Tooltip>
                  );
                }

                return <React.Fragment key={item.path}>{navContent}</React.Fragment>;
              })}
            </div>
          </nav>
        </ScrollArea>
        <div className="mx-3 h-px bg-gradient-to-r from-transparent via-border/40 to-transparent" />
        <UpdateIndicator collapsed={collapsed} />
        <div className="mx-3 h-px bg-gradient-to-r from-transparent via-border/40 to-transparent" />
        <SyncIndicator collapsed={collapsed} />
        <div className="mx-3 h-px bg-gradient-to-r from-transparent via-border/40 to-transparent" />
        <ThemeSwitcher collapsed={collapsed} />
        <div className="mx-3 h-px bg-gradient-to-r from-transparent via-border/40 to-transparent" />
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center justify-center h-10 text-muted-foreground hover:text-foreground transition-colors"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className="page-enter">
            {children}
          </div>
        </div>
        <TerminalPanel />
      </main>
    </div>
  );
}
