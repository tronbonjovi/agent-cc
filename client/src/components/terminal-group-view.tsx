import { Allotment } from "allotment";
import { TerminalInstance } from "./terminal-instance";
import { useTerminalGroupStore } from "@/stores/terminal-group-store";
import "allotment/dist/style.css";

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

  return (
    <div className="flex-1">
      <Allotment>
        {group.instances.map((instance) => (
          <Allotment.Pane key={instance.id}>
            <div
              className="h-full w-full"
              onFocus={() => setFocusedInstance(instance.id)}
              onClick={() => setFocusedInstance(instance.id)}
            >
              <TerminalInstance instanceId={instance.id} />
            </div>
          </Allotment.Pane>
        ))}
      </Allotment>
    </div>
  );
}
