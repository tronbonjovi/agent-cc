import { useState, useRef, useCallback, useEffect } from "react";
import { TerminalInstance } from "./terminal-instance";
import { useTerminalPanel, useUpdateTerminalPanel } from "@/hooks/use-terminal";
import type { TerminalTab } from "@shared/types";

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function TerminalPanel() {
  const { data: panelState } = useTerminalPanel();
  const updatePanel = useUpdateTerminalPanel();

  const [tabs, setTabs] = useState<TerminalTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [splitTabId, setSplitTabId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [height, setHeight] = useState(300);
  const [isResizing, setIsResizing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Sync from server state on load
  useEffect(() => {
    if (panelState) {
      setHeight(panelState.height);
      setCollapsed(panelState.collapsed);
      if (panelState.tabs.length > 0) {
        setTabs(panelState.tabs);
        setActiveTabId(panelState.activeTabId);
        setSplitTabId(panelState.splitTabId);
      }
    }
  }, [panelState]);

  // Create initial terminal if none exist
  useEffect(() => {
    if (panelState && tabs.length === 0) {
      const initial: TerminalTab = { id: generateId(), name: "Terminal 1" };
      setTabs([initial]);
      setActiveTabId(initial.id);
    }
  }, [panelState, tabs.length]);

  // Persist state on changes (debounced by storage layer)
  const persistState = useCallback(
    (updates: {
      tabs?: TerminalTab[];
      activeTabId?: string | null;
      splitTabId?: string | null;
      height?: number;
      collapsed?: boolean;
    }) => {
      updatePanel.mutate({
        tabs: updates.tabs ?? tabs,
        activeTabId: updates.activeTabId ?? activeTabId,
        splitTabId: updates.splitTabId ?? splitTabId,
        height: updates.height ?? height,
        collapsed: updates.collapsed ?? collapsed,
      });
    },
    [tabs, activeTabId, splitTabId, height, collapsed, updatePanel]
  );

  const addTab = useCallback(() => {
    const newTab: TerminalTab = {
      id: generateId(),
      name: `Terminal ${tabs.length + 1}`,
    };
    const newTabs = [...tabs, newTab];
    setTabs(newTabs);
    setActiveTabId(newTab.id);
    persistState({ tabs: newTabs, activeTabId: newTab.id });
  }, [tabs, persistState]);

  const closeTab = useCallback(
    (tabId: string) => {
      const newTabs = tabs.filter((t) => t.id !== tabId);
      let newActiveId = activeTabId;
      let newSplitId = splitTabId;

      if (splitTabId === tabId) {
        newSplitId = null;
      }
      if (activeTabId === tabId) {
        newActiveId = newTabs.length > 0 ? newTabs[newTabs.length - 1].id : null;
      }

      setTabs(newTabs);
      setActiveTabId(newActiveId);
      setSplitTabId(newSplitId);
      persistState({
        tabs: newTabs,
        activeTabId: newActiveId,
        splitTabId: newSplitId,
      });
    },
    [tabs, activeTabId, splitTabId, persistState]
  );

  const toggleSplit = useCallback(() => {
    if (splitTabId) {
      setSplitTabId(null);
      persistState({ splitTabId: null });
    } else if (tabs.length >= 2) {
      const other = tabs.find((t) => t.id !== activeTabId);
      if (other) {
        setSplitTabId(other.id);
        persistState({ splitTabId: other.id });
      }
    }
  }, [tabs, activeTabId, splitTabId, persistState]);

  const toggleCollapse = useCallback(() => {
    const newCollapsed = !collapsed;
    setCollapsed(newCollapsed);
    persistState({ collapsed: newCollapsed });
  }, [collapsed, persistState]);

  // Drag-to-resize
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsResizing(true);
      const startY = e.clientY;
      const startHeight = height;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const delta = startY - moveEvent.clientY;
        const newHeight = Math.max(100, Math.min(startHeight + delta, window.innerHeight - 200));
        setHeight(newHeight);
      };

      const handleMouseUp = () => {
        setIsResizing(false);
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        // Persist final height
        const panel = panelRef.current;
        if (panel) {
          persistState({ height: panel.offsetHeight });
        }
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [height, persistState]
  );

  // Rename tab on double-click
  const handleRenameTab = useCallback(
    (tabId: string, newName: string) => {
      const newTabs = tabs.map((t) =>
        t.id === tabId ? { ...t, name: newName } : t
      );
      setTabs(newTabs);
      persistState({ tabs: newTabs });
    },
    [tabs, persistState]
  );

  if (collapsed) {
    return (
      <div className="border-t bg-background">
        <div className="flex items-center h-8 px-2 gap-2">
          <button
            onClick={toggleCollapse}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            ▲ Terminal
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={panelRef} style={{ height }} className="flex flex-col border-t bg-background">
      {/* Drag handle */}
      <div
        onMouseDown={handleMouseDown}
        className={`h-1 cursor-row-resize flex items-center justify-center hover:bg-accent transition-colors ${
          isResizing ? "bg-accent" : ""
        }`}
      >
        <div className="w-8 h-0.5 bg-muted-foreground/30 rounded-full" />
      </div>

      {/* Tab bar */}
      <div className="flex items-center h-8 px-1 border-b bg-muted/30 text-xs">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`flex items-center gap-1 px-2 h-full cursor-pointer border-r border-border ${
              tab.id === activeTabId
                ? "bg-background text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <span
              onClick={() => {
                setActiveTabId(tab.id);
                persistState({ activeTabId: tab.id });
              }}
              onDoubleClick={() => {
                const newName = prompt("Rename terminal:", tab.name);
                if (newName) handleRenameTab(tab.id, newName);
              }}
            >
              {tab.name}
            </span>
            {tabs.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
                className="ml-1 text-muted-foreground hover:text-foreground"
              >
                ×
              </button>
            )}
          </div>
        ))}

        <div className="flex items-center ml-auto gap-1 px-1">
          {tabs.length >= 2 && (
            <button
              onClick={toggleSplit}
              className={`px-1.5 py-0.5 rounded text-muted-foreground hover:text-foreground transition-colors ${
                splitTabId ? "bg-accent text-foreground" : ""
              }`}
              title={splitTabId ? "Unsplit" : "Split view"}
            >
              ⬜⬜
            </button>
          )}
          <button
            onClick={addTab}
            className="px-1.5 py-0.5 rounded text-muted-foreground hover:text-foreground transition-colors"
            title="New terminal"
          >
            ＋
          </button>
          <button
            onClick={toggleCollapse}
            className="px-1.5 py-0.5 rounded text-muted-foreground hover:text-foreground transition-colors"
            title="Collapse panel"
          >
            ▼
          </button>
        </div>
      </div>

      {/* Terminal area */}
      <div className="flex-1 flex min-h-0">
        <div className={splitTabId ? "flex-1 border-r border-border" : "flex-1"}>
          {tabs.map((tab) => (
            <TerminalInstance
              key={tab.id}
              id={tab.id}
              isVisible={tab.id === activeTabId}
            />
          ))}
        </div>
        {splitTabId && (
          <div className="flex-1">
            <TerminalInstance
              key={`split-${splitTabId}`}
              id={`split-${splitTabId}`}
              isVisible={true}
            />
          </div>
        )}
      </div>
    </div>
  );
}
