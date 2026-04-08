import { useCallback } from "react";
import { Columns2, Plus, ChevronDown, ChevronUp } from "lucide-react";
import { useTerminalGroupStore } from "@/stores/terminal-group-store";
import { getTerminalInstanceManager } from "@/lib/terminal-instance-manager";

export function TerminalToolbar() {
  const activeGroupId = useTerminalGroupStore((s) => s.activeGroupId);
  const collapsed = useTerminalGroupStore((s) => s.collapsed);
  const createGroup = useTerminalGroupStore((s) => s.createGroup);
  const splitGroup = useTerminalGroupStore((s) => s.splitGroup);
  const setCollapsed = useTerminalGroupStore((s) => s.setCollapsed);

  const handleNew = useCallback(() => {
    const groupId = crypto.randomUUID();
    const instanceId = crypto.randomUUID();
    const manager = getTerminalInstanceManager();
    manager.create(instanceId);
    createGroup(groupId, instanceId, "bash");
  }, [createGroup]);

  const handleSplit = useCallback(() => {
    if (!activeGroupId) return;
    const instanceId = crypto.randomUUID();
    const manager = getTerminalInstanceManager();
    manager.create(instanceId);
    splitGroup(activeGroupId, instanceId, "bash");
  }, [activeGroupId, splitGroup]);

  const handleToggle = useCallback(() => {
    setCollapsed(!collapsed);
  }, [setCollapsed, collapsed]);

  return (
    <div className="flex items-center h-8 bg-muted/30 border-b px-2 justify-end gap-0.5">
      {!collapsed && (
        <>
          <button
            onClick={handleSplit}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
            title="Split terminal"
            disabled={!activeGroupId}
          >
            <Columns2 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={handleNew}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
            title="New terminal"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </>
      )}
      <button
        onClick={handleToggle}
        className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
        title={collapsed ? "Expand panel" : "Collapse panel"}
      >
        {collapsed ? (
          <ChevronUp className="h-3.5 w-3.5" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5" />
        )}
      </button>
    </div>
  );
}
