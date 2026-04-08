// client/src/components/board/archive-zone.tsx

export interface ArchivedMilestone {
  id: string;
  title: string;
  project: string;
  totalTasks: number;
  doneTasks: number;
  completedAt?: string;
}

interface ArchiveZoneProps {
  milestones: ArchivedMilestone[];
}

export function ArchiveZone({ milestones }: ArchiveZoneProps) {
  return (
    <div className="flex flex-col min-h-0">
      {/* Header bar */}
      <div className="flex items-center gap-2 px-4 py-2 border-t border-border/50">
        <span className="text-xs font-medium text-muted-foreground">Archive</span>
        <span className="text-[10px] text-muted-foreground/70 bg-muted px-1.5 py-0.5 rounded">
          {milestones.length} {milestones.length === 1 ? "milestone" : "milestones"}
        </span>
      </div>

      {/* Body */}
      <div className="overflow-y-auto flex-1 px-4 pb-2">
        {milestones.length === 0 ? (
          <div className="flex items-center justify-center py-6 text-xs text-muted-foreground/50">
            No archived milestones
          </div>
        ) : (
          <div className="space-y-1">
            {milestones.map((m) => (
              <div
                key={m.id}
                className="flex items-center gap-2 py-1.5 text-xs"
                style={{ opacity: 0.7 }}
              >
                {/* Emerald status dot */}
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />

                {/* Title */}
                <span className="text-foreground/80 truncate">{m.title}</span>

                {/* Task count */}
                <span className="text-muted-foreground font-mono text-[10px] flex-shrink-0">
                  {m.doneTasks}/{m.totalTasks} tasks
                </span>

                {/* Completion date */}
                {m.completedAt && (
                  <span className="text-muted-foreground/60 text-[10px] flex-shrink-0">
                    {m.completedAt}
                  </span>
                )}

                {/* Spacer */}
                <span className="flex-1" />

                {/* Project name */}
                <span className="text-muted-foreground/60 text-[10px] truncate max-w-[120px]">
                  {m.project}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
