import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useScanStatus } from "@/hooks/use-entities";
import { useAppSettings } from "@/hooks/use-settings";
import { useBreakpoint, isMobile } from "@/hooks/use-breakpoint";
import { SearchTrigger } from "@/components/global-search";
import { SyncIndicator } from "@/components/sync-indicator";
import { UpdateIndicator } from "@/components/update-indicator";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { TerminalPanel } from "./terminal-panel";
import { ChatPanel } from "./chat/chat-panel";
import { useLayoutStore } from "@/stores/layout-store";
import { useTerminalGroupStore } from "@/stores/terminal-group-store";
// react-resizable-panels v4.x API: Group + Panel + Separator,
// `orientation` instead of `direction`.
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from "react-resizable-panels";
import type { PanelImperativeHandle } from "react-resizable-panels";

import {
  LayoutDashboard,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  BarChart3,
  Kanban,
  BookOpen,
  Menu,
  MessageSquare,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
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
  { path: "/analytics", label: "Analytics", icon: BarChart3, countKey: null },
  { path: "/settings", label: "Settings", icon: SlidersHorizontal, countKey: null },
];

/**
 * Sidebar visual state:
 * - "expanded"  — full width (w-56 / 224px), labels visible
 * - "collapsed" — icon-only (w-14 / 56px), tooltips on hover
 * - "hidden"    — sidebar not rendered, mobile hamburger menu shown instead
 */
type SidebarState = "expanded" | "collapsed" | "hidden";

/** Determine the default sidebar state for a given breakpoint tier. */
function defaultSidebarState(bp: ReturnType<typeof useBreakpoint>): SidebarState {
  if (isMobile(bp)) return "hidden";
  if (bp === "md") return "collapsed";
  return "expanded"; // lg, xl
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { data: status } = useScanStatus();
  const { data: settings } = useAppSettings();
  const breakpoint = useBreakpoint();
  const [sidebarState, setSidebarState] = useState<SidebarState>(() => defaultSidebarState(breakpoint));
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const manualToggleRef = useRef(false);
  const counts = (status?.entityCounts || {}) as Record<string, number>;
  const isScanning = status?.scanning;
  const appName = settings?.appName || "Agent CC";

  // Right-side chat panel state (persisted in localStorage via zustand).
  // task005 replaces the slot placeholder with <ChatPanel />.
  const chatPanelWidth = useLayoutStore((s) => s.chatPanelWidth);
  const chatPanelCollapsed = useLayoutStore((s) => s.chatPanelCollapsed);
  const setChatPanelWidth = useLayoutStore((s) => s.setChatPanelWidth);
  const toggleChatPanel = useLayoutStore((s) => s.toggleChatPanel);

  // Task008: the outer vertical Panel wrapping the terminal component is
  // the single source of truth for terminal height. We size it from the
  // persisted store value and write back on resize so server persistence
  // (the PATCH /api/terminal/panel flow inside the terminal panel) keeps
  // working.
  const terminalHeight = useTerminalGroupStore((s) => s.height);
  const setTerminalHeight = useTerminalGroupStore((s) => s.setHeight);
  const terminalCollapsed = useTerminalGroupStore((s) => s.collapsed);
  // Imperative handle on the terminal Panel. The collapse toggle
  // drives size changes through this ref rather than via a structural
  // conditional — the PanelGroup stays mounted so <main> children
  // keep their React identity and don't refetch on every collapse.
  const terminalPanelRef = useRef<PanelImperativeHandle | null>(null);

  // Collapsed height = the toolbar's own height (h-8 = 32px). The
  // terminal Panel clamps to this via dynamic min/max when collapsed,
  // so TerminalPanel's collapsed-render (toolbar-only) fits exactly
  // with no blank gap above or below.
  const TERMINAL_COLLAPSED_PX = 32;

  // Sync the Panel's size to the store's collapsed flag. The grab
  // handle never touches this — only the toolbar chevron does.
  useEffect(() => {
    const ref = terminalPanelRef.current;
    if (!ref) return;
    if (terminalCollapsed) {
      ref.resize(TERMINAL_COLLAPSED_PX);
    } else {
      ref.resize(terminalHeight);
    }
    // terminalHeight intentionally omitted — when the user drags the
    // handle we don't want this effect re-firing and yanking the Panel
    // back to the old persisted value. Only collapse toggles drive the
    // imperative resize.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terminalCollapsed]);

  // Reset sidebar state when breakpoint changes (unless user manually toggled within same tier)
  useEffect(() => {
    manualToggleRef.current = false;
    setSidebarState(defaultSidebarState(breakpoint));
    // Close mobile drawer when leaving mobile
    if (!isMobile(breakpoint)) {
      setMobileDrawerOpen(false);
    }
  }, [breakpoint]);

  // Keyboard shortcut for collapse (Ctrl+L / Cmd+L)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "l") {
        e.preventDefault();
        manualToggleRef.current = true;
        if (isMobile(breakpoint)) {
          // At mobile: toggle drawer open/closed
          setMobileDrawerOpen((o) => !o);
        } else if (breakpoint === "md") {
          // At tablet: toggle between collapsed and hidden
          setSidebarState((s) => (s === "collapsed" ? "hidden" : "collapsed"));
        } else {
          // At desktop: toggle between expanded and collapsed
          setSidebarState((s) => (s === "expanded" ? "collapsed" : "expanded"));
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [breakpoint]);

  const collapsed = sidebarState === "collapsed";
  const sidebarVisible = sidebarState !== "hidden";
  const mobile = isMobile(breakpoint);

  /** Shared nav item renderer — used in both sidebar and mobile drawer. */
  const renderNavItems = (inDrawer: boolean) => {
    const showLabels = inDrawer || !collapsed;
    return (
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
                  onClick={() => { if (inDrawer) setMobileDrawerOpen(false); }}
                  className={cn(
                    "flex items-center rounded-md px-3 py-2 text-sm transition-all duration-150 cursor-pointer group relative",
                    !showLabels ? "justify-center" : "gap-2.5",
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
                  {showLabels && (
                    <>
                      <span className="flex-1">{item.label}</span>
                      {count != null && count > 0 && (
                        <span className="text-[10px] font-mono text-muted-foreground tabular-nums">
                          {count}
                        </span>
                      )}
                    </>
                  )}
                  {!showLabels && isActive && (
                    <div className="absolute -right-0.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-nav-active" />
                  )}
                </div>
              </Link>
            );

            if (!showLabels) {
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
    );
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop/Tablet Sidebar */}
      {sidebarVisible && (
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
            {renderNavItems(false)}
          </ScrollArea>
          <div className="mx-3 h-px bg-gradient-to-r from-transparent via-border/40 to-transparent" />
          <UpdateIndicator collapsed={collapsed} />
          <div className="mx-3 h-px bg-gradient-to-r from-transparent via-border/40 to-transparent" />
          <SyncIndicator collapsed={collapsed} />
          <div className="mx-3 h-px bg-gradient-to-r from-transparent via-border/40 to-transparent" />
          <ThemeSwitcher collapsed={collapsed} />
          <div className="mx-3 h-px bg-gradient-to-r from-transparent via-border/40 to-transparent" />
          {/*
            Chat panel toggle — calls the layout store's toggleChatPanel().
            aria-pressed reflects whether the panel is currently open so
            assistive tech and visual state stay in sync. When open, the
            button gets a subtle bg-accent treatment; no animations (per
            project memory feedback_no_bounce_animations).
          */}
          <button
            data-testid="sidebar-chat-toggle"
            onClick={() => toggleChatPanel()}
            aria-pressed={!chatPanelCollapsed}
            aria-label={chatPanelCollapsed ? "Open chat panel" : "Close chat panel"}
            className={cn(
              "flex items-center h-10 text-muted-foreground hover:text-foreground transition-colors",
              collapsed ? "justify-center" : "px-4 gap-2.5",
              !chatPanelCollapsed && "bg-accent/40 text-foreground",
            )}
          >
            <MessageSquare className="h-4 w-4 flex-shrink-0" />
            {!collapsed && <span className="text-sm">Chat</span>}
          </button>
          <div className="mx-3 h-px bg-gradient-to-r from-transparent via-border/40 to-transparent" />
          <button
            onClick={() => {
              manualToggleRef.current = true;
              if (breakpoint === "md") {
                setSidebarState((s) => (s === "collapsed" ? "hidden" : "collapsed"));
              } else {
                setSidebarState((s) => (s === "expanded" ? "collapsed" : "expanded"));
              }
            }}
            className="flex items-center justify-center h-10 text-muted-foreground hover:text-foreground transition-colors"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </aside>
      )}

      {/* Mobile hamburger menu + Sheet drawer */}
      {mobile && (
        <Sheet open={mobileDrawerOpen} onOpenChange={setMobileDrawerOpen}>
          <SheetContent side="left" className="w-64 p-0 bg-sidebar">
            <SheetTitle className="sr-only">Navigation menu</SheetTitle>
            {/* Brand */}
            <div className="flex items-center h-14 px-4">
              <span className="font-semibold text-sm whitespace-nowrap">
                {appName}
              </span>
            </div>
            <div className="mx-3 h-px bg-gradient-to-r from-transparent via-border/40 to-transparent" />

            <div className="p-2">
              <SearchTrigger collapsed={false} />
            </div>

            <ScrollArea className="flex-1">
              {renderNavItems(true)}
            </ScrollArea>
            <div className="mx-3 h-px bg-gradient-to-r from-transparent via-border/40 to-transparent" />
            <ThemeSwitcher collapsed={false} />
          </SheetContent>
        </Sheet>
      )}

      {/*
        3-column resizable shell:
          [sidebar (already rendered above as a flex sibling)]
          [ center column: main content (top) + terminal (bottom) ]
          [ right: chat panel slot — task005 mounts <ChatPanel /> here ]

        Sidebar stays outside the PanelGroup so its existing
        breakpoint-aware collapse logic keeps working unchanged.
        The horizontal PanelGroup sizes center + chat; the center
        column itself is a nested vertical PanelGroup so the terminal
        is constrained to the center and no longer spans under chat.
      */}
      <PanelGroup orientation="horizontal" className="flex-1 min-w-0">
        <Panel defaultSize="70%" minSize="30%">
          <main className="h-full flex flex-col overflow-hidden">
            {/* Mobile hamburger button */}
            {mobile && (
              <div className="flex items-center h-14 px-4 border-b bg-background">
                <button
                  onClick={() => setMobileDrawerOpen(true)}
                  className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Open mobile menu"
                >
                  <Menu className="h-5 w-5" />
                </button>
                <span className="ml-2 font-semibold text-sm">{appName}</span>
              </div>
            )}
            {/*
              Terminal area: the PanelGroup stays mounted regardless of
              collapse state so <main> children keep stable React
              identity (no refetch on collapse toggle). Collapse state
              is driven by:
                1. Dynamic min/max clamping the terminal Panel to its
                   toolbar height when collapsed, normal floor/ceiling
                   otherwise.
                2. An imperative panelRef.resize() in a useEffect so the
                   Panel actually snaps to the new size on toggle.
                3. CSS hiding the resize handle when collapsed so the
                   user cannot drag the panel open or closed — the
                   toolbar chevron is the only open/close mechanism.

              groupResizeBehavior "preserve-pixel-size" keeps the
              terminal at the user's chosen height when the window
              resizes; main stays relative so the library's "≥1
              relative panel per group" invariant is satisfied.
            */}
            <PanelGroup orientation="vertical" className="flex-1 min-h-0">
              <Panel minSize="20%">
                <div className="h-full overflow-hidden">
                  <div className="page-enter h-full">
                    {children}
                  </div>
                </div>
              </Panel>
              <PanelResizeHandle
                className={cn(
                  "group bg-border transition-colors flex items-center justify-center",
                  terminalCollapsed
                    ? "h-0 pointer-events-none opacity-0"
                    : "h-1.5 hover:bg-accent/50 cursor-row-resize"
                )}
              >
                {!terminalCollapsed && (
                  <div className="w-10 h-0.5 bg-muted-foreground/20 rounded-full group-hover:bg-muted-foreground/40 transition-colors" />
                )}
              </PanelResizeHandle>
              <Panel
                panelRef={terminalPanelRef}
                defaultSize={terminalCollapsed ? TERMINAL_COLLAPSED_PX : terminalHeight}
                minSize={terminalCollapsed ? TERMINAL_COLLAPSED_PX : 100}
                maxSize={terminalCollapsed ? TERMINAL_COLLAPSED_PX : undefined}
                groupResizeBehavior="preserve-pixel-size"
                onResize={(panelSize) => {
                  // When collapsed, the Panel is clamped at the toolbar
                  // height — do NOT persist that as the user's expanded
                  // height. Only writes from the expanded state update
                  // the store.
                  if (terminalCollapsed) return;
                  const px = Math.round(panelSize.inPixels);
                  if (Number.isFinite(px) && px !== terminalHeight) {
                    setTerminalHeight(px);
                  }
                }}
              >
                <TerminalPanel />
              </Panel>
            </PanelGroup>
          </main>
        </Panel>
        {!chatPanelCollapsed && (
          <>
            <PanelResizeHandle className="group w-1.5 bg-border hover:bg-accent/50 transition-colors flex items-center justify-center cursor-col-resize">
              <div className="h-10 w-0.5 bg-muted-foreground/20 rounded-full group-hover:bg-muted-foreground/40 transition-colors" />
            </PanelResizeHandle>
            <Panel
              defaultSize={chatPanelWidth}
              minSize={240}
              maxSize={800}
              onResize={(panelSize) => {
                const px = Math.round(panelSize.inPixels);
                if (Number.isFinite(px) && px !== chatPanelWidth) {
                  setChatPanelWidth(px);
                }
              }}
            >
              <div
                data-testid="chat-panel-slot"
                className="h-full border-l bg-background overflow-hidden"
              >
                <ChatPanel />
              </div>
            </Panel>
          </>
        )}
      </PanelGroup>
    </div>
  );
}
