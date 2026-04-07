import { useRef, useCallback, useEffect } from "react";
import { ChevronUp, Terminal } from "lucide-react";
import { useTerminalGroupStore } from "@/stores/terminal-group-store";
import { getTerminalInstanceManager } from "@/lib/terminal-instance-manager";
import { useTheme } from "@/hooks/use-theme";
import { TerminalToolbar } from "./terminal-toolbar";
import { TerminalGroupView } from "./terminal-group-view";
import { TerminalExplorer } from "./terminal-explorer";
import { apiRequest } from "@/lib/queryClient";
import type { TerminalPanelState } from "@shared/types";

export function TerminalPanel() {
  const collapsed = useTerminalGroupStore((s) => s.collapsed);
  const height = useTerminalGroupStore((s) => s.height);
  const groups = useTerminalGroupStore((s) => s.groups);
  const activeGroupId = useTerminalGroupStore((s) => s.activeGroupId);
  const setHeight = useTerminalGroupStore((s) => s.setHeight);
  const setCollapsed = useTerminalGroupStore((s) => s.setCollapsed);
  const loadFromServer = useTerminalGroupStore((s) => s.loadFromServer);
  const createGroup = useTerminalGroupStore((s) => s.createGroup);
  const toSerializable = useTerminalGroupStore((s) => s.toSerializable);
  const markUnread = useTerminalGroupStore((s) => s.markUnread);

  const isResizingRef = useRef(false);
  const initializedRef = useRef(false);
  const { resolvedTheme } = useTheme();

  // Load state from server on mount
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    fetch("/api/terminal/panel")
      .then((r) => r.json())
      .then((data: TerminalPanelState) => {
        if (data.groups && data.groups.length > 0) {
          loadFromServer(data);
          // Recreate manager instances for all persisted terminals
          const manager = getTerminalInstanceManager();
          for (const group of data.groups) {
            for (const inst of group.instances) {
              manager.create(inst.id);
            }
          }
        } else {
          // No saved state — create initial terminal
          const groupId = crypto.randomUUID();
          const instanceId = crypto.randomUUID();
          const manager = getTerminalInstanceManager();
          manager.create(instanceId);
          createGroup(groupId, instanceId, "bash");
        }
      })
      .catch(() => {
        // Server unavailable — create initial terminal
        const groupId = crypto.randomUUID();
        const instanceId = crypto.randomUUID();
        const manager = getTerminalInstanceManager();
        manager.create(instanceId);
        createGroup(groupId, instanceId, "bash");
      });
  }, [loadFromServer, createGroup]);

  // Persist state to server on changes
  useEffect(() => {
    if (!initializedRef.current || groups.length === 0) return;
    const data = toSerializable();
    apiRequest("PATCH", "/api/terminal/panel", data).catch(() => {});
  }, [groups, activeGroupId, height, collapsed, toSerializable]);

  // Subscribe manager to update shell types when server reports them
  useEffect(() => {
    const manager = getTerminalInstanceManager();
    const unsub = manager.onShellType((id, shellType) => {
      useTerminalGroupStore.getState().renameInstance(id, shellType);
    });
    return unsub;
  }, []);

  // Subscribe to activity events for unread tracking
  useEffect(() => {
    const manager = getTerminalInstanceManager();
    const unsub = manager.onActivity((id) => {
      const state = useTerminalGroupStore.getState();
      // Only mark unread if the instance is NOT in the active group
      const activeGroup = state.groups.find((g) => g.id === state.activeGroupId);
      const isInActiveGroup = activeGroup?.instances.some((i) => i.id === id);
      if (!isInActiveGroup) {
        markUnread(id);
      }
    });
    return unsub;
  }, [markUnread]);

  // Sync theme to manager
  useEffect(() => {
    const manager = getTerminalInstanceManager();
    manager.updateTheme(resolvedTheme.variant as "dark" | "light", {
      background: resolvedTheme.colors.background,
      foreground: resolvedTheme.colors.foreground,
      accent: resolvedTheme.colors.accent,
    });
  }, [resolvedTheme]);

  // Drag-to-resize
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isResizingRef.current = true;
      const startY = e.clientY;
      const startHeight = height;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const delta = startY - moveEvent.clientY;
        const newHeight = Math.max(
          100,
          Math.min(startHeight + delta, window.innerHeight - 200)
        );
        setHeight(newHeight);
      };

      const handleMouseUp = () => {
        isResizingRef.current = false;
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [height, setHeight]
  );

  if (collapsed) {
    return (
      <div className="border-t border-border bg-background">
        <div className="flex items-center h-8 px-2">
          <button
            onClick={() => setCollapsed(false)}
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
    <div style={{ height }} className="flex flex-col border-t bg-background">
      {/* Drag handle */}
      <div
        onMouseDown={handleMouseDown}
        className="h-1.5 cursor-row-resize flex items-center justify-center hover:bg-accent/50 transition-colors group"
      >
        <div className="w-10 h-0.5 bg-muted-foreground/20 rounded-full group-hover:bg-muted-foreground/40 transition-colors" />
      </div>

      <TerminalToolbar />

      <div className="flex-1 flex min-h-0">
        <TerminalGroupView />
        <TerminalExplorer />
      </div>
    </div>
  );
}
