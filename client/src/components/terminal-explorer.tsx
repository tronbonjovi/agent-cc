import { useCallback, useState, useRef, useEffect, type MouseEvent as ReactMouseEvent } from "react";
import { X } from "lucide-react";
import { useTerminalGroupStore } from "@/stores/terminal-group-store";
import { getTerminalInstanceManager } from "@/lib/terminal-instance-manager";
import type { TerminalConnectionState } from "@shared/types";

function StatusDot({ instanceId }: { instanceId: string }) {
  const [state, setState] = useState<TerminalConnectionState>("initializing");

  useEffect(() => {
    const manager = getTerminalInstanceManager();
    // Get current state
    const current = manager.getConnectionState(instanceId);
    if (current) setState(current);
    // Subscribe to changes
    const unsub = manager.onConnectionStateChange((id, s) => {
      if (id === instanceId) setState(s);
    });
    return unsub;
  }, [instanceId]);

  const color =
    state === "connected"
      ? "bg-green-500"
      : state === "disconnected" || state === "reconnecting"
        ? "bg-yellow-500"
        : state === "expired"
          ? "bg-red-500"
          : "bg-zinc-500";

  return <span className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${color}`} />;
}

function treeConnector(index: number, total: number): string {
  if (total <= 1) return "";
  if (index === 0) return "┌";
  if (index === total - 1) return "└";
  return "├";
}

interface InlineRenameProps {
  currentName: string;
  onConfirm: (name: string) => void;
  onCancel: () => void;
}

function InlineRename({ currentName, onConfirm, onCancel }: InlineRenameProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.select();
  }, []);

  return (
    <input
      ref={inputRef}
      className="bg-background border border-border rounded px-1 text-xs w-full outline-none"
      defaultValue={currentName}
      maxLength={100}
      onBlur={(e) => {
        const v = e.target.value.trim().slice(0, 100);
        if (v) onConfirm(v);
        else onCancel();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          const v = (e.target as HTMLInputElement).value.trim().slice(0, 100);
          if (v) onConfirm(v);
          else onCancel();
        }
        if (e.key === "Escape") onCancel();
      }}
    />
  );
}

export function TerminalExplorer() {
  const groups = useTerminalGroupStore((s) => s.groups);
  const activeGroupId = useTerminalGroupStore((s) => s.activeGroupId);
  const unreadInstanceIds = useTerminalGroupStore((s) => s.unreadInstanceIds);
  const setActiveGroup = useTerminalGroupStore((s) => s.setActiveGroup);
  const setFocusedInstance = useTerminalGroupStore((s) => s.setFocusedInstance);
  const removeInstance = useTerminalGroupStore((s) => s.removeInstance);
  const renameInstance = useTerminalGroupStore((s) => s.renameInstance);

  const explorerWidth = useTerminalGroupStore((s) => s.explorerWidth);
  const setExplorerWidth = useTerminalGroupStore((s) => s.setExplorerWidth);

  const isResizingRef = useRef(false);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    groupId: string;
    instanceId: string;
  } | null>(null);

  const handleKill = useCallback(
    (groupId: string, instanceId: string) => {
      const manager = getTerminalInstanceManager();
      manager.dispose(instanceId);
      removeInstance(groupId, instanceId);
    },
    [removeInstance]
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, groupId: string, instanceId: string) => {
      e.preventDefault();
      setContextMenu({ x: e.clientX, y: e.clientY, groupId, instanceId });
    },
    []
  );

  // Close context menu on click elsewhere
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [contextMenu]);

  const handleResizeMouseDown = useCallback(
    (e: ReactMouseEvent) => {
      e.preventDefault();
      isResizingRef.current = true;
      const startX = e.clientX;
      const startWidth = explorerWidth;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        // Dragging left increases width, dragging right decreases
        const delta = startX - moveEvent.clientX;
        setExplorerWidth(startWidth + delta);
      };

      const handleMouseUp = () => {
        isResizingRef.current = false;
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [explorerWidth, setExplorerWidth]
  );

  const handleInstanceClick = useCallback(
    (groupId: string, instanceId: string) => {
      setActiveGroup(groupId);
      setFocusedInstance(instanceId);
    },
    [setActiveGroup, setFocusedInstance]
  );

  return (
    <div style={{ width: explorerWidth }} className="bg-muted/30 flex flex-col text-xs select-none relative">
      {/* Drag handle — left edge */}
      <div
        onMouseDown={handleResizeMouseDown}
        className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-accent/50 transition-colors z-10"
      />
      <div className="flex-1 overflow-y-auto border-l ml-1">
        {groups.map((group) => {
          const isActive = group.id === activeGroupId;
          const hasUnread = group.instances.some((i) =>
            unreadInstanceIds.has(i.id)
          );

          return (
            <div
              key={group.id}
              className={`border-l-2 ${
                isActive
                  ? "border-blue-500 bg-background"
                  : hasUnread
                    ? "border-transparent bg-accent/20"
                    : "border-transparent"
              }`}
            >
              {group.instances.map((instance, idx) => (
                <div
                  key={instance.id}
                  className={`group flex items-center gap-1.5 px-2 py-1 cursor-pointer hover:bg-accent/30 ${
                    isActive ? "text-foreground" : "text-muted-foreground"
                  }`}
                  onClick={() => handleInstanceClick(group.id, instance.id)}
                  onContextMenu={(e) =>
                    handleContextMenu(e, group.id, instance.id)
                  }
                >
                  <span className="text-muted-foreground/40 w-3 text-center text-[10px]">
                    {treeConnector(idx, group.instances.length)}
                  </span>
                  <StatusDot instanceId={instance.id} />
                  {renamingId === instance.id ? (
                    <InlineRename
                      currentName={instance.name}
                      onConfirm={(name) => {
                        renameInstance(instance.id, name);
                        setRenamingId(null);
                      }}
                      onCancel={() => setRenamingId(null)}
                    />
                  ) : (
                    <span className="truncate flex-1">{instance.name}</span>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleKill(group.id, instance.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 hover:text-foreground p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-popover border border-border rounded shadow-lg py-1 text-xs"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            className="w-full px-3 py-1.5 text-left hover:bg-accent/50"
            onClick={() => {
              setRenamingId(contextMenu.instanceId);
              setContextMenu(null);
            }}
          >
            Rename
          </button>
          <button
            className="w-full px-3 py-1.5 text-left hover:bg-accent/50"
            onClick={() => {
              const instanceId = crypto.randomUUID();
              const manager = getTerminalInstanceManager();
              manager.create(instanceId);
              useTerminalGroupStore
                .getState()
                .splitGroup(contextMenu.groupId, instanceId, "bash");
              setContextMenu(null);
            }}
          >
            Split
          </button>
          <button
            className="w-full px-3 py-1.5 text-left hover:bg-accent/50 text-destructive"
            onClick={() => {
              handleKill(contextMenu.groupId, contextMenu.instanceId);
              setContextMenu(null);
            }}
          >
            Kill
          </button>
        </div>
      )}
    </div>
  );
}
