// client/src/pages/board.tsx

import { BoardHeader } from "@/components/board/board-header";
import { BoardSidePanel } from "@/components/board/board-side-panel";
import { BoardTaskCard } from "@/components/board/board-task-card";
import { ProjectZone } from "@/components/board/project-zone";
import { ProjectPopout } from "@/components/board/project-popout";
import { ArchiveZone } from "@/components/board/archive-zone";
import type { ArchivedMilestone } from "@/components/board/archive-zone";
import type { ProjectCardData } from "@/components/board/project-card";
import { useBoardState, useBoardStats, useBoardEvents, applyBoardFilters, useBoardProjects, useArchivedMilestones } from "@/hooks/use-board";
import { BOARD_COLUMNS } from "@/lib/board-columns";
import { useState, useMemo, useCallback } from "react";
import { useLocation } from "wouter";
import type { BoardFilter } from "@shared/board-types";

export default function BoardPage() {
  const [filter, setFilter] = useState<BoardFilter>({});
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [anchorRect, setAnchorRect] = useState<{ top: number; left: number; right: number; bottom: number; width: number; height: number } | null>(null);

  // Project popout state
  const [selectedProject, setSelectedProject] = useState<ProjectCardData | null>(null);
  const [projectAnchorRect, setProjectAnchorRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);

  const [, setLocation] = useLocation();

  const handleCardClick = useCallback((task: { id: string }, e: React.MouseEvent) => {
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    setAnchorRect({ top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height });
    setSelectedTaskId(task.id);
  }, []);

  const handleProjectClick = useCallback((project: ProjectCardData, e: React.MouseEvent) => {
    if (project.isCurrent) {
      setLocation(`/projects/${project.id}`);
      return;
    }
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    setProjectAnchorRect({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
    setSelectedProject(project);
  }, [setLocation]);

  const { data: board, isLoading } = useBoardState();
  const { data: stats } = useBoardStats();
  const { connected } = useBoardEvents();
  const boardProjects = useBoardProjects();
  const { data: archivedMilestones } = useArchivedMilestones();

  const filteredTasks = useMemo(
    () => board ? applyBoardFilters(board.tasks, filter) : [],
    [board, filter],
  );

  const tasksByColumn = useMemo(() => {
    const map: Record<string, typeof filteredTasks> = {};
    for (const col of BOARD_COLUMNS) {
      map[col.id] = filteredTasks.filter(t => t.column === col.id);
    }
    return map;
  }, [filteredTasks]);

  // Derive selected task from fresh query data so panel always shows current state
  const selectedTask = selectedTaskId
    ? board?.tasks.find(t => t.id === selectedTaskId) ?? null
    : null;

  // Map archived milestones to ArchiveZone format
  const archiveData: ArchivedMilestone[] = useMemo(() => {
    if (!archivedMilestones) return [];
    return archivedMilestones.map(m => ({
      id: m.id,
      title: m.title,
      project: m.project,
      totalTasks: m.totalTasks,
      doneTasks: m.doneTasks,
    }));
  }, [archivedMilestones]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted-foreground/30 border-t-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <BoardHeader
        stats={stats}
        filter={filter}
        onFilterChange={setFilter}
        projects={board?.projects || []}
        milestones={board?.milestones || []}
        sseConnected={connected}
      />

      {/* Zone 1: Projects (35%) */}
      <div className="min-h-0" style={{ flex: 35 }}>
        <ProjectZone
          projects={boardProjects}
          onProjectClick={handleProjectClick}
        />
      </div>

      {/* Zone 2: Kanban Board (35%) */}
      <div className="min-h-0 overflow-x-auto overflow-y-hidden p-4" style={{ flex: 35 }}>
        <div className="flex gap-3 h-full min-w-max">
          {BOARD_COLUMNS.map(col => (
            <div key={col.id} className="w-72 flex flex-col bg-muted/30 rounded-lg border">
              {/* Column header */}
              <div className="flex items-center gap-2 px-3 py-2.5 border-b">
                <div className={`w-2 h-2 rounded-full ${col.color}`} />
                <span className="text-sm font-medium">{col.label}</span>
                <span className="text-[10px] text-muted-foreground ml-auto font-mono">
                  {tasksByColumn[col.id]?.length || 0}
                </span>
              </div>

              {/* Cards */}
              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {tasksByColumn[col.id]?.map(task => (
                  <BoardTaskCard
                    key={task.id}
                    task={task}
                    onClick={(t, e) => handleCardClick(t, e)}
                  />
                ))}
                {(!tasksByColumn[col.id] || tasksByColumn[col.id].length === 0) && (
                  <div className="text-xs text-muted-foreground/50 text-center py-8">
                    No tasks
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Zone 3: Archive (30%) */}
      <div className="min-h-0" style={{ flex: 30 }}>
        <ArchiveZone milestones={archiveData} />
      </div>

      {/* Task side panel */}
      <BoardSidePanel
        task={selectedTask}
        open={selectedTask !== null}
        onClose={() => { setSelectedTaskId(null); setAnchorRect(null); }}
        anchorRect={anchorRect}
      />

      {/* Project popout */}
      {selectedProject && projectAnchorRect && (
        <ProjectPopout
          project={selectedProject}
          anchorRect={projectAnchorRect}
          onClose={() => { setSelectedProject(null); setProjectAnchorRect(null); }}
          onNavigate={(projectId) => {
            setSelectedProject(null);
            setProjectAnchorRect(null);
            setLocation(`/projects/${projectId}`);
          }}
        />
      )}
    </div>
  );
}
