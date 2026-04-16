import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
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
import { useChatTabsStore } from "@/stores/chat-tabs-store";
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
  History,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import React from "react";

/**
 * Chat session entry returned from GET /api/chat/sessions. Matches the
 * shape in server/routes/chat.ts (the chatSessions mapping in db.ts).
 */
interface ChatSessionEntry {
  conversationId: string;
  sessionId: string;
  title: string;
  createdAt: string;
}

interface ChatSessionsResponse {
  sessions: ChatSessionEntry[];
}

async function fetchChatSessions(): Promise<ChatSessionsResponse> {
  const res = await fetch("/api/chat/sessions");
  if (!res.ok) {
    throw new Error(`GET /api/chat/sessions failed: ${res.status}`);
  }
  return res.json();
}

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
  // task006 mounts <ChatPanel /> into the slot and adds the sidebar toggle.
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

  // task006: chat panel uses the same always-mounted pattern. When
  // collapsed the panel clamps to a thin vertical bar (~32px) holding the
  // chevron — same visual weight as the terminal's collapsed toolbar,
  // rotated to the vertical axis. The ChatPanel subtree stays mounted
  // across collapse toggles so SSE subscriptions + tab state are never
  // torn down.
  const CHAT_COLLAPSED_PX = 32;
  const chatPanelRef = useRef<PanelImperativeHandle | null>(null);

  // Hydrate the chat-tabs store once on mount. This is a top-level
  // concern because multiple chat surfaces (the side panel, task002's tab
  // bar, eventually a full-page chat view) all read from the same store —
  // loading here guarantees whichever mounts first sees persisted tabs.
  // chat-workflows-tabs-task001.
  const loadChatTabs = useChatTabsStore((s) => s.load);
  const chatTabsLoaded = useChatTabsStore((s) => s.loaded);
  useEffect(() => {
    if (!chatTabsLoaded) {
      void loadChatTabs();
    }
    // Run once on mount — the store itself guards against double-loads via
    // the `loaded` flag, but keeping deps empty keeps intent obvious.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // task006: same pattern for the chat panel. The chat Panel itself
  // stays mounted in both states; only its width flips between the
  // stored expanded width and the bar-width clamp. Dep array excludes
  // `chatPanelWidth` for the same reason as above — we never want a
  // drag-driven width change to re-fire this effect and snap the Panel
  // back.
  useEffect(() => {
    const ref = chatPanelRef.current;
    if (!ref) return;
    if (chatPanelCollapsed) {
      ref.resize(CHAT_COLLAPSED_PX);
    } else {
      ref.resize(chatPanelWidth);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatPanelCollapsed]);

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
        {/*
          task006 — chat panel uses always-mounted collapse bar (mirrors
          terminal-panel pattern above). Structural conditionals that
          unmount the Panel tear down ChatPanel's SSE subscriptions + tab
          state on every collapse toggle; the always-mounted + imperative
          resize pattern keeps React identity stable.

          The resize handle hides (w-0 / pointer-events-none / opacity-0)
          when collapsed so the only way to open/close is the chevron in
          the vertical bar. When expanded, no maxSize constraint — the
          panel is fully fluid per `feedback_no_layout_constraints`.
        */}
        <PanelResizeHandle
          className={cn(
            "group bg-border transition-colors flex items-center justify-center",
            chatPanelCollapsed
              ? "w-0 pointer-events-none opacity-0"
              : "w-1.5 hover:bg-accent/50 cursor-col-resize",
          )}
        >
          {!chatPanelCollapsed && (
            <div className="h-10 w-0.5 bg-muted-foreground/20 rounded-full group-hover:bg-muted-foreground/40 transition-colors" />
          )}
        </PanelResizeHandle>
        <Panel
          panelRef={chatPanelRef}
          defaultSize={chatPanelCollapsed ? CHAT_COLLAPSED_PX : chatPanelWidth}
          minSize={chatPanelCollapsed ? CHAT_COLLAPSED_PX : 0}
          maxSize={chatPanelCollapsed ? CHAT_COLLAPSED_PX : undefined}
          groupResizeBehavior="preserve-pixel-size"
          onResize={(panelSize) => {
            // When collapsed the Panel is clamped at CHAT_COLLAPSED_PX —
            // don't persist that as the user's expanded width.
            if (chatPanelCollapsed) return;
            const px = Math.round(panelSize.inPixels);
            if (Number.isFinite(px) && px !== chatPanelWidth) {
              setChatPanelWidth(px);
            }
          }}
        >
          <div
            data-testid="chat-panel-slot"
            className="h-full flex border-l bg-background overflow-hidden"
          >
            {/*
              Vertical collapse bar — always visible, ~32px wide. The
              chevron flips on state: ChevronRight (>) when collapsed →
              click expands; ChevronLeft (<) when expanded → click
              collapses. Same border/background treatment as the terminal
              toolbar (bg-muted/30, border), just rotated to the vertical
              axis.
            */}
            <div
              data-testid="chat-collapse-bar"
              className="flex flex-col items-center w-8 shrink-0 bg-muted/30 border-r py-2 gap-1"
              style={{ width: CHAT_COLLAPSED_PX }}
            >
              <button
                onClick={() => toggleChatPanel()}
                aria-pressed={!chatPanelCollapsed}
                aria-label={chatPanelCollapsed ? "Expand chat panel" : "Collapse chat panel"}
                title={chatPanelCollapsed ? "Expand chat panel" : "Collapse chat panel"}
                className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
              >
                {chatPanelCollapsed ? (
                  <ChevronRight className="h-3.5 w-3.5" />
                ) : (
                  <ChevronLeft className="h-3.5 w-3.5" />
                )}
              </button>
              {/*
                Chat history popover — task007 replaces the deleted in-panel
                sidebar with this lightweight trigger. Visible in BOTH
                collapsed and expanded states (per contract) because it
                lives on the always-rendered collapse bar.
              */}
              <ChatHistoryPopover />
            </div>
            {/*
              ChatPanel itself stays ALWAYS mounted — toggling its
              visibility via CSS keeps the SSE EventSource alive + tab
              store wiring intact across collapse flips. A structural
              conditional (`{!collapsed && <ChatPanel/>}`) would tear
              down the EventSource on every collapse, which is the exact
              anti-pattern `reference_always_mounted_collapse` warns
              against. We use Tailwind's `hidden` utility to toggle
              display:none — React keeps the subtree mounted.
            */}
            <div
              className={cn(
                "flex-1 min-w-0 overflow-hidden",
                chatPanelCollapsed && "hidden",
              )}
            >
              <ChatPanel />
            </div>
          </div>
        </Panel>
      </PanelGroup>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ChatHistoryPopover — task007 (chat-ux-cleanup)
//
// Small history icon on the chat collapse bar. Clicking opens a popover with
// recent chat sessions (title + date); clicking a session routes through the
// tab store's openTab() so it becomes a real tab in the chat surface.
//
// Why inline fetch (not a shared hook)? There's no pre-existing
// useChatSessions hook — the deleted ConversationSidebar held an inline
// fetch for the same endpoint. Extracting to a hook for one caller was out
// of scope for this task; if a second caller appears, promote then.
//
// Why a sub-component (not inline JSX)? The popover needs local open-state
// so session clicks can close it. Keeping that state out of the Layout
// render body avoids pointless re-renders of the whole layout on popover
// open/close.
// ---------------------------------------------------------------------------
function ChatHistoryPopover() {
  const [open, setOpen] = useState(false);
  const openTab = useChatTabsStore((s) => s.openTab);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["chat-sessions"],
    queryFn: fetchChatSessions,
    staleTime: 15_000,
    enabled: open, // Only fetch when the user actually opens the popover.
  });

  const sessions = data?.sessions ?? [];

  const handleClick = async (conversationId: string, title: string) => {
    try {
      await openTab(conversationId, title);
      setOpen(false);
    } catch (err) {
      console.error("[chat-history-popover] openTab failed", err);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          data-testid="chat-history-trigger"
          aria-label="Recent chat sessions"
          title="Recent chat sessions"
          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
        >
          <History className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="left"
        align="start"
        className="w-72 p-0 max-h-96 overflow-y-auto"
      >
        <div className="sticky top-0 border-b bg-background/95 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Recent chat sessions
        </div>
        {isLoading && (
          <div className="px-3 py-2 text-xs text-muted-foreground" role="status">
            Loading...
          </div>
        )}
        {isError && (
          <div className="px-3 py-2 text-xs text-destructive" role="alert">
            Failed to load sessions
          </div>
        )}
        {!isLoading && !isError && sessions.length === 0 && (
          <div className="px-3 py-2 text-xs italic text-muted-foreground">
            No recent sessions
          </div>
        )}
        {sessions.length > 0 && (
          <ul>
            {sessions.map((s) => (
              <li key={s.conversationId}>
                <button
                  type="button"
                  onClick={() => handleClick(s.conversationId, s.title)}
                  className="block w-full text-left px-3 py-2 text-xs hover:bg-muted/60 border-b last:border-b-0"
                  data-testid={`chat-history-item-${s.conversationId}`}
                >
                  <div className="truncate font-medium text-foreground">
                    {s.title}
                  </div>
                  <div className="text-xs text-muted-foreground/70">
                    {new Date(s.createdAt).toLocaleDateString()}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
