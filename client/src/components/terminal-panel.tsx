import { useRef, useEffect } from "react";
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
  // Task008: `height` is NO LONGER used to size this component — the outer
  // vertical <Panel> in layout.tsx owns that via react-resizable-panels.
  // We still subscribe here so the persistence PATCH below re-fires when
  // the outer Panel writes a new height back into the store.
  const height = useTerminalGroupStore((s) => s.height);
  const groups = useTerminalGroupStore((s) => s.groups);
  const activeGroupId = useTerminalGroupStore((s) => s.activeGroupId);
  const explorerWidth = useTerminalGroupStore((s) => s.explorerWidth);
  const loadFromServer = useTerminalGroupStore((s) => s.loadFromServer);
  const createGroup = useTerminalGroupStore((s) => s.createGroup);
  const toSerializable = useTerminalGroupStore((s) => s.toSerializable);
  const markUnread = useTerminalGroupStore((s) => s.markUnread);

  const initializedRef = useRef(false);
  const serverLoadedRef = useRef(false);
  const { resolvedTheme } = useTheme();

  // Load state from server on mount
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    fetch("/api/terminal/panel")
      .then((r) => r.json())
      .then((data: TerminalPanelState) => {
        serverLoadedRef.current = true;
        if (data.groups && data.groups.length > 0) {
          loadFromServer(data);
          // Create manager instances only for those not already live
          const manager = getTerminalInstanceManager();
          for (const group of data.groups) {
            for (const inst of group.instances) {
              if (!manager.has(inst.id)) {
                manager.create(inst.id);
              }
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
        // Server unavailable — create a local-only terminal for usability,
        // but do NOT mark serverLoadedRef true. This suppresses persistence
        // so this fallback can never overwrite valid persisted data.
        const manager = getTerminalInstanceManager();
        if (!manager.hasAny()) {
          const groupId = crypto.randomUUID();
          const instanceId = crypto.randomUUID();
          manager.create(instanceId);
          createGroup(groupId, instanceId, "bash");
        }
      });
  }, [loadFromServer, createGroup]);

  // Persist state to server on changes — debounced to prevent stale overwrites
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!serverLoadedRef.current) return;
    // Cancel any pending save — only the latest state wins
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      const data = toSerializable();
      apiRequest("PATCH", "/api/terminal/panel", data).catch(() => {});
    }, 300);
    return () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    };
  }, [groups, activeGroupId, height, collapsed, explorerWidth, toSerializable]);

  // Subscribe manager to update shell types when server reports them.
  // Only update display name if the user hasn't renamed it.
  useEffect(() => {
    const manager = getTerminalInstanceManager();
    const unsub = manager.onShellType((id, shellType) => {
      const state = useTerminalGroupStore.getState();
      for (const group of state.groups) {
        const inst = group.instances.find((i) => i.id === id);
        if (inst) {
          // Always store the actual shell type
          state.updateShellType(id, shellType);
          // Only update display name if not user-renamed
          if (!inst.userRenamed) {
            // Use updateShellName to avoid setting userRenamed=true
            state.setInstanceName(id, shellType);
          }
          break;
        }
      }
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

  // Reconnect all terminals when browser tab becomes visible again
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        const manager = getTerminalInstanceManager();
        manager.reconnectAll();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  // Sync theme to manager
  useEffect(() => {
    const manager = getTerminalInstanceManager();
    manager.updateTheme(resolvedTheme.variant as "dark" | "light", {
      background: resolvedTheme.colors.background,
      foreground: resolvedTheme.colors.foreground,
      accent: resolvedTheme.colors.accent,
    });
  }, [resolvedTheme]);

  if (collapsed) {
    return (
      <div className="border-t border-border bg-background">
        <TerminalToolbar />
      </div>
    );
  }

  // Task008: this component now fills its parent <Panel> rather than
  // owning a pixel height. The resize handle lives on the outer vertical
  // PanelGroup in layout.tsx — single source of truth.
  return (
    <div className="h-full flex flex-col border-t bg-background">
      <TerminalToolbar />

      <div className="flex-1 flex min-h-0">
        <TerminalGroupView />
        <TerminalExplorer />
      </div>
    </div>
  );
}
