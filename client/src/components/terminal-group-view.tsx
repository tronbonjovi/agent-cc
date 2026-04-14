import { Fragment } from "react";
import { TerminalInstance } from "./terminal-instance";
import { useTerminalGroupStore } from "@/stores/terminal-group-store";
// Task008: consolidated on react-resizable-panels v4 — the old `allotment`
// dependency has been removed. We import Group/Panel/Separator with the
// same aliases layout.tsx uses so the two splits read the same.
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from "react-resizable-panels";

export function TerminalGroupView() {
  const activeGroupId = useTerminalGroupStore((s) => s.activeGroupId);
  const groups = useTerminalGroupStore((s) => s.groups);
  const setFocusedInstance = useTerminalGroupStore((s) => s.setFocusedInstance);

  const group = groups.find((g) => g.id === activeGroupId);

  if (!group || group.instances.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        No terminal open. Press + to create one.
      </div>
    );
  }

  if (group.instances.length === 1) {
    return (
      <div className="flex-1">
        <TerminalInstance instanceId={group.instances[0].id} />
      </div>
    );
  }

  // Multi-instance: horizontal split. Equal-share default for each pane,
  // minimum 10% so a pane can't disappear behind rounding. The `key` on
  // PanelGroup forces a clean remount when the instance count changes so
  // the library re-derives default layout rather than shoehorning the old
  // layout into a new child count.
  const equalShare = `${100 / group.instances.length}%`;
  return (
    <div className="flex-1">
      <PanelGroup
        orientation="horizontal"
        key={group.instances.length}
        className="h-full"
      >
        {group.instances.map((instance, i) => (
          <Fragment key={instance.id}>
            {i > 0 && (
              <PanelResizeHandle className="w-px bg-border hover:bg-border/80 transition-colors" />
            )}
            <Panel defaultSize={equalShare} minSize="10%">
              <div
                className="h-full w-full"
                onFocus={() => setFocusedInstance(instance.id)}
                onClick={() => setFocusedInstance(instance.id)}
              >
                <TerminalInstance instanceId={instance.id} />
              </div>
            </Panel>
          </Fragment>
        ))}
      </PanelGroup>
    </div>
  );
}
