import { useReducer, useRef, useCallback, useEffect, useState } from "react";
import { TerminalInstance, type TerminalInstanceHandle } from "./terminal-instance";
import { useTerminalPanel, useUpdateTerminalPanel } from "@/hooks/use-terminal";
import type { TerminalTab, TerminalConnectionState } from "@shared/types";
import { Plus, X, Columns2, ChevronDown, ChevronUp, Terminal } from "lucide-react";

const MAX_TAB_NAME_LENGTH = 100;

function generateId(): string {
  return crypto.randomUUID();
}

// --- Reducer for atomic state transitions (fixes stale closure issues) ---

interface PanelState {
  tabs: TerminalTab[];
  activeTabId: string | null;
  splitTabId: string | null;
  collapsed: boolean;
  height: number;
}

type PanelAction =
  | { type: "INIT_FROM_SERVER"; state: PanelState }
  | { type: "CREATE_INITIAL_TAB"; tab: TerminalTab }
  | { type: "ADD_TAB"; tab: TerminalTab }
  | { type: "CLOSE_TAB"; tabId: string }
  | { type: "SET_ACTIVE"; tabId: string }
  | { type: "TOGGLE_SPLIT" }
  | { type: "TOGGLE_COLLAPSE" }
  | { type: "SET_HEIGHT"; height: number }
  | { type: "RENAME_TAB"; tabId: string; name: string };

function panelReducer(state: PanelState, action: PanelAction): PanelState {
  switch (action.type) {
    case "INIT_FROM_SERVER":
      return action.state;

    case "CREATE_INITIAL_TAB":
      return {
        ...state,
        tabs: [action.tab],
        activeTabId: action.tab.id,
      };

    case "ADD_TAB":
      return {
        ...state,
        tabs: [...state.tabs, action.tab],
        activeTabId: action.tab.id,
      };

    case "CLOSE_TAB": {
      const newTabs = state.tabs.filter((t) => t.id !== action.tabId);
      let newActiveId = state.activeTabId;
      let newSplitId = state.splitTabId;

      if (state.splitTabId === action.tabId) newSplitId = null;
      if (state.activeTabId === action.tabId) {
        newActiveId = newTabs.length > 0 ? newTabs[newTabs.length - 1].id : null;
      }

      return { ...state, tabs: newTabs, activeTabId: newActiveId, splitTabId: newSplitId };
    }

    case "SET_ACTIVE":
      return { ...state, activeTabId: action.tabId };

    case "TOGGLE_SPLIT": {
      if (state.splitTabId) {
        return { ...state, splitTabId: null };
      }
      if (state.tabs.length >= 2) {
        const other = state.tabs.find((t) => t.id !== state.activeTabId);
        if (other) return { ...state, splitTabId: other.id };
      }
      return state;
    }

    case "TOGGLE_COLLAPSE":
      return { ...state, collapsed: !state.collapsed };

    case "SET_HEIGHT":
      return { ...state, height: action.height };

    case "RENAME_TAB":
      return {
        ...state,
        tabs: state.tabs.map((t) =>
          t.id === action.tabId ? { ...t, name: action.name } : t
        ),
      };

    default:
      return state;
  }
}

const initialState: PanelState = {
  tabs: [],
  activeTabId: null,
  splitTabId: null,
  collapsed: false,
  height: 300,
};

export function TerminalPanel() {
  const { data: panelState } = useTerminalPanel();
  const updatePanel = useUpdateTerminalPanel();
  const [state, dispatch] = useReducer(panelReducer, initialState);
  const [connectionStates, setConnectionStates] = useState<Record<string, TerminalConnectionState>>({});
  const terminalRefs = useRef<Map<string, TerminalInstanceHandle>>(new Map());
  const initializedRef = useRef(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const isResizingRef = useRef(false);
  const stateRef = useRef(state);

  // Keep ref in sync for use in event handlers
  stateRef.current = state;

  // Sync from server state ONLY on initial load
  useEffect(() => {
    if (panelState && !initializedRef.current) {
      initializedRef.current = true;
      if (panelState.tabs.length > 0) {
        dispatch({
          type: "INIT_FROM_SERVER",
          state: {
            tabs: panelState.tabs,
            activeTabId: panelState.activeTabId,
            splitTabId: panelState.splitTabId,
            collapsed: panelState.collapsed,
            height: panelState.height,
          },
        });
      } else {
        // No saved tabs — create initial terminal
        dispatch({
          type: "INIT_FROM_SERVER",
          state: {
            tabs: [],
            activeTabId: null,
            splitTabId: null,
            collapsed: panelState.collapsed,
            height: panelState.height,
          },
        });
        const initial: TerminalTab = { id: generateId(), name: "Terminal 1" };
        dispatch({ type: "CREATE_INITIAL_TAB", tab: initial });
      }
    }
  }, [panelState]);

  // Persist state to server whenever it changes (after initialization)
  useEffect(() => {
    if (!initializedRef.current || state.tabs.length === 0) return;
    updatePanel.mutate({
      tabs: state.tabs,
      activeTabId: state.activeTabId,
      splitTabId: state.splitTabId,
      height: state.height,
      collapsed: state.collapsed,
    });
  }, [state.tabs, state.activeTabId, state.splitTabId, state.height, state.collapsed]);

  const addTab = useCallback(() => {
    const current = stateRef.current;
    const maxNum = current.tabs.reduce((max, t) => {
      const match = t.name.match(/^Terminal (\d+)$/);
      return match ? Math.max(max, parseInt(match[1], 10)) : max;
    }, 0);
    const newTab: TerminalTab = {
      id: generateId(),
      name: `Terminal ${maxNum + 1}`,
    };
    dispatch({ type: "ADD_TAB", tab: newTab });
  }, []);

  const closeTab = useCallback((tabId: string) => {
    // Kill the server-side PTY immediately (don't let it linger in grace period)
    const handle = terminalRefs.current.get(tabId);
    if (handle) handle.killSession();
    // Also kill split instance if it exists
    const splitHandle = terminalRefs.current.get(`split-${tabId}`);
    if (splitHandle) splitHandle.killSession();
    terminalRefs.current.delete(tabId);
    terminalRefs.current.delete(`split-${tabId}`);
    dispatch({ type: "CLOSE_TAB", tabId });
  }, []);

  const toggleSplit = useCallback(() => {
    dispatch({ type: "TOGGLE_SPLIT" });
  }, []);

  const toggleCollapse = useCallback(() => {
    dispatch({ type: "TOGGLE_COLLAPSE" });
  }, []);

  // Drag-to-resize — uses refs to avoid stale closures
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizingRef.current = true;
    const startY = e.clientY;
    const startHeight = stateRef.current.height;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = startY - moveEvent.clientY;
      const newHeight = Math.max(100, Math.min(startHeight + delta, window.innerHeight - 200));
      dispatch({ type: "SET_HEIGHT", height: newHeight });
    };

    const handleMouseUp = () => {
      isResizingRef.current = false;
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, []);

  const handleConnectionStateChange = useCallback((terminalId: string, connState: TerminalConnectionState) => {
    setConnectionStates(prev => ({ ...prev, [terminalId]: connState }));
  }, []);

  const handleRenameTab = useCallback((tabId: string, newName: string) => {
    const trimmed = newName.trim().slice(0, MAX_TAB_NAME_LENGTH);
    if (trimmed) {
      dispatch({ type: "RENAME_TAB", tabId, name: trimmed });
    }
  }, []);

  // Clean up document listeners on unmount
  useEffect(() => {
    return () => {
      // Safety: remove any lingering drag listeners
      isResizingRef.current = false;
    };
  }, []);

  if (state.collapsed) {
    return (
      <div className="border-t border-border bg-background">
        <div className="flex items-center h-8 px-2">
          <button
            onClick={toggleCollapse}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-accent/50"
          >
            <ChevronUp className="h-3 w-3" />
            <Terminal className="h-3 w-3" />
            <span>Terminal</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={panelRef} style={{ height: state.height }} className="flex flex-col border-t bg-background">
      {/* Drag handle */}
      <div
        onMouseDown={handleMouseDown}
        className="h-1.5 cursor-row-resize flex items-center justify-center hover:bg-accent/50 transition-colors group"
      >
        <div className="w-10 h-0.5 bg-muted-foreground/20 rounded-full group-hover:bg-muted-foreground/40 transition-colors" />
      </div>

      {/* Tab bar */}
      <div className="flex items-center h-8 px-1 border-b bg-muted/30 text-xs">
        {state.tabs.map((tab) => (
          <div
            key={tab.id}
            className={`flex items-center gap-1 px-2 h-full cursor-pointer border-r border-border ${
              tab.id === state.activeTabId
                ? "bg-background text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <span
              className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${
                (() => {
                  const s = connectionStates[tab.id];
                  if (s === "connected") return "bg-green-500";
                  if (s === "disconnected" || s === "reconnecting") return "bg-yellow-500";
                  if (s === "expired") return "bg-red-500";
                  return "bg-zinc-500";
                })()
              }`}
            />
            <span
              onClick={() => dispatch({ type: "SET_ACTIVE", tabId: tab.id })}
              onDoubleClick={() => {
                const newName = prompt("Rename terminal:", tab.name);
                if (newName) handleRenameTab(tab.id, newName);
              }}
            >
              {tab.name}
            </span>
            {state.tabs.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
                className="ml-1 p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        ))}

        <div className="flex items-center ml-auto gap-0.5 px-1">
          {state.tabs.length >= 2 && (
            <button
              onClick={toggleSplit}
              className={`p-1 rounded hover:bg-accent/50 transition-colors ${
                state.splitTabId ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
              title={state.splitTabId ? "Unsplit" : "Split view"}
            >
              <Columns2 className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={addTab}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
            title="New terminal"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={toggleCollapse}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
            title="Collapse panel"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Terminal area — split shows two different tabs side by side, each with its own PTY */}
      <div className="flex-1 flex min-h-0">
        <div className={state.splitTabId ? "flex-1 border-r border-border" : "flex-1"}>
          {state.tabs.map((tab) => (
            <TerminalInstance
              key={tab.id}
              ref={(handle) => {
                if (handle) terminalRefs.current.set(tab.id, handle);
                else terminalRefs.current.delete(tab.id);
              }}
              id={tab.id}
              isVisible={tab.id === state.activeTabId}
              onConnectionStateChange={handleConnectionStateChange}
            />
          ))}
        </div>
        {state.splitTabId && (
          <div className="flex-1">
            {state.tabs.map((tab) => (
              <TerminalInstance
                key={`split-${tab.id}`}
                ref={(handle) => {
                  const splitId = `split-${tab.id}`;
                  if (handle) terminalRefs.current.set(splitId, handle);
                  else terminalRefs.current.delete(splitId);
                }}
                id={`split-${tab.id}`}
                isVisible={tab.id === state.splitTabId}
                onConnectionStateChange={handleConnectionStateChange}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
