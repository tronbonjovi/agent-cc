// client/src/pages/board.tsx

import { BoardHeader } from "@/components/board/board-header";
import { BoardSidePanel } from "@/components/board/board-side-panel";
import { BoardTaskCard } from "@/components/board/board-task-card";
import { ProjectZone } from "@/components/board/project-zone";
import { ProjectPopout } from "@/components/board/project-popout";
import { CompletedMilestonesZone } from "@/components/board/completed-milestones-zone";
import type { ProjectCardData } from "@/components/board/project-card";
import { useBoardState, useBoardStats, useBoardEvents, applyBoardFilters, useBoardProjects } from "@/hooks/use-board";
import { useResizeHandle } from "@/hooks/use-resize-handle";
import { BOARD_COLUMNS } from "@/lib/board-columns";
import { useState, useMemo, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { useBreakpoint, isMobile } from "@/hooks/use-breakpoint";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { BoardFilter, BoardColumn } from "@shared/board-types";

/** Drag handle bar rendered between panels */
function ResizeHandle({ onMouseDown, side }: { onMouseDown: (e: React.MouseEvent) => void; side: "left" | "right" }) {
  return (
    <div
      onMouseDown={onMouseDown}
      className={`w-1 hover:w-1.5 bg-transparent hover:bg-foreground/10 cursor-col-resize transition-all shrink-0 ${
        side === "right" ? "border-r border-border" : "border-l border-border"
      }`}
      title="Drag to resize"
    />
  );
}

export default function BoardPage() {
  const breakpoint = useBreakpoint();
  const mobile = isMobile(breakpoint);
  const isLarge = breakpoint === "lg" || breakpoint === "xl";

  const [filter, setFilter] = useState<BoardFilter>({});
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [anchorRect, setAnchorRect] = useState<{ top: number; left: number; right: number; bottom: number; width: number; height: number } | null>(null);

  // Project popout state
  const [selectedProject, setSelectedProject] = useState<ProjectCardData | null>(null);
  const [projectAnchorRect, setProjectAnchorRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);

  // Collapsible projects panel for md and below
  const [projectsExpanded, setProjectsExpanded] = useState(true);

  // Mobile column tab switching (sm/xs)
  const [activeColumn, setActiveColumn] = useState<BoardColumn>("queue");

  // Resizable sidebars (lg+ only)
  const leftResize = useResizeHandle({ initialWidth: 260, minWidth: 180, maxWidth: 400, side: "right" });
  const rightResize = useResizeHandle({ initialWidth: 220, minWidth: 160, maxWidth: 360, side: "left" });

  const [, setLocation] = useLocation();

  // Auto-collapse projects panel on smaller breakpoints
  useEffect(() => {
    if (mobile) {
      setProjectsExpanded(false);
    } else {
      setProjectsExpanded(true);
    }
  }, [mobile]);

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

  // Clean stale project IDs from filter when projects change (deletion or prune)
  useEffect(() => {
    if (!filter.projects?.length || !boardProjects.length) return;
    const validIds = new Set(boardProjects.map((p) => p.id));
    const cleaned = filter.projects.filter((id) => validIds.has(id));
    if (cleaned.length !== filter.projects.length) {
      setFilter((prev) => ({ ...prev, projects: cleaned.length ? cleaned : undefined }));
    }
  }, [boardProjects, filter.projects]);

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

      {/* 3-zone layout at lg+: Left sidebar | Kanban | Right sidebar */}
      {/* Stacked at md and below */}
      <div className={`flex min-h-0 flex-1 ${isLarge ? "flex-row" : "flex-col"}`}>

        {/* Zone 1: Projects sidebar */}
        {isLarge ? (
          <>
            <div style={{ width: leftResize.width }} className="shrink-0 overflow-hidden">
              <ProjectZone
                projects={boardProjects}
                onProjectClick={handleProjectClick}
              />
            </div>
            <ResizeHandle onMouseDown={leftResize.onMouseDown} side="right" />
          </>
        ) : (
          <div className="border-b">
            <button
              onClick={() => setProjectsExpanded(!projectsExpanded)}
              className="w-full flex items-center gap-2 px-4 py-2 text-sm font-semibold hover:bg-muted/50 transition-colors"
              aria-expanded={projectsExpanded}
            >
              {projectsExpanded ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
              Projects
              <span className="text-xs text-muted-foreground font-normal">
                {boardProjects.length}
              </span>
            </button>
            {projectsExpanded && (
              <ProjectZone
                projects={boardProjects}
                onProjectClick={handleProjectClick}
              />
            )}
          </div>
        )}

        {/* Zone 2: Kanban Board (center, takes remaining space) */}
        <div
          className="min-h-0 flex-1 overflow-hidden"
          style={{ padding: "var(--card-gap)" }}
        >
          {/* Mobile column tabs (sm/xs) */}
          {mobile && (
            <div className="flex gap-1 mb-2 overflow-x-auto pb-1">
              {BOARD_COLUMNS.map(col => (
                <button
                  key={col.id}
                  onClick={() => setActiveColumn(col.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                    activeColumn === col.id
                      ? "bg-foreground/10 text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${col.color}`} />
                  {col.label}
                  <span className="text-[10px] font-mono opacity-60">
                    {tasksByColumn[col.id]?.length || 0}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Kanban columns */}
          <div
            className={`h-full ${
              mobile
                ? "flex flex-col"
                : breakpoint === "md"
                  ? "flex overflow-x-auto snap-x snap-mandatory"
                  : "flex overflow-x-auto"
            }`}
            style={{ gap: "var(--card-gap)" }}
          >
            {BOARD_COLUMNS.map(col => {
              // On mobile, only show the active column
              if (mobile && col.id !== activeColumn) return null;

              return (
                <div
                  key={col.id}
                  className={`flex flex-col bg-muted/30 rounded-lg border snap-start ${
                    mobile
                      ? "flex-1 min-h-0"
                      : breakpoint === "md"
                        ? "min-w-[260px] w-[45%] shrink-0"
                        : "w-72 shrink-0"
                  }`}
                >
                  {/* Column header */}
                  <div className="flex items-center gap-2 px-3 py-2.5 border-b">
                    <div className={`w-2 h-2 rounded-full ${col.color}`} />
                    <span className="text-sm font-medium">{col.label}</span>
                    <span className="text-[10px] text-muted-foreground ml-auto font-mono">
                      {tasksByColumn[col.id]?.length || 0}
                    </span>
                  </div>

                  {/* Cards */}
                  <div
                    className="flex-1 overflow-y-auto"
                    style={{ padding: "var(--card-padding)", display: "flex", flexDirection: "column", gap: "var(--card-gap)" }}
                  >
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
              );
            })}
          </div>
        </div>

        {/* Zone 3: Completed milestones sidebar (lg+ only) */}
        {isLarge && (
          <>
            <ResizeHandle onMouseDown={rightResize.onMouseDown} side="left" />
            <div style={{ width: rightResize.width }} className="shrink-0 overflow-hidden">
              <CompletedMilestonesZone milestones={board?.milestones || []} />
            </div>
          </>
        )}
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
