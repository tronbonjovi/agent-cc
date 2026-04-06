import { useParams, useLocation } from "wouter";
import { useEntities } from "@/hooks/use-entities";
import { useTaskBoard } from "@/hooks/use-tasks";
import { PipelineBoard } from "@/components/tasks/pipeline-board";
import { TaskDetailPanel } from "@/components/tasks/task-detail-panel";
import { ProjectPicker } from "@/components/tasks/project-picker";
import { useState, useEffect } from "react";
import type { ProjectEntity } from "@shared/types";
import type { TaskItem } from "@shared/task-types";

export default function TasksPage() {
  const params = useParams<{ projectId?: string }>();
  const [, setLocation] = useLocation();
  const { data: projects, isLoading: loadingProjects } = useEntities<ProjectEntity>("project");

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(params.projectId || null);
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null);

  useEffect(() => {
    if (!selectedProjectId && projects?.length) {
      setSelectedProjectId(projects[0].id);
    }
  }, [projects, selectedProjectId]);

  useEffect(() => {
    if (selectedProjectId && selectedProjectId !== params.projectId) {
      setLocation(`/tasks/${selectedProjectId}`);
    }
  }, [selectedProjectId]);

  // Main board query (excludes removed tasks)
  const { data: board, isLoading: loadingBoard } = useTaskBoard(selectedProjectId || undefined);

  // TODO: Add a second query with includeRemoved=true for the audit row
  // For now, removedItems will be empty until we add the query param support
  const removedItems: TaskItem[] = [];

  if (loadingProjects) {
    return <div className="flex items-center justify-center h-full"><div className="h-8 w-8 animate-spin rounded-full border-4 border-muted-foreground/30 border-t-primary" /></div>;
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header bar */}
      <div className="flex items-center gap-1.5 px-4 py-2.5 border-b text-sm">
        <ProjectPicker
          projects={projects || []}
          selectedProjectId={selectedProjectId}
          onSelectProject={(id) => { setSelectedProjectId(id); setSelectedTask(null); }}
        />
        {board?.malformedCount ? (
          <span className="ml-auto text-[10px] text-amber-500/70">{board.malformedCount} file(s) skipped</span>
        ) : null}
      </div>

      {/* Board area */}
      <div className="flex-1 overflow-hidden">
        {!selectedProjectId && (
          <div className="flex items-center justify-center h-full text-muted-foreground">Select a project to view tasks</div>
        )}

        {selectedProjectId && loadingBoard && (
          <div className="flex items-center justify-center h-full"><div className="h-8 w-8 animate-spin rounded-full border-4 border-muted-foreground/30 border-t-primary" /></div>
        )}

        {selectedProjectId && board && (
          <PipelineBoard
            items={board.items}
            removedItems={removedItems}
            projectId={selectedProjectId}
            onClickTask={setSelectedTask}
          />
        )}
      </div>

      {/* Detail panel */}
      {board && (
        <TaskDetailPanel
          task={selectedTask}
          config={board.config}
          open={selectedTask !== null}
          onClose={() => setSelectedTask(null)}
          onUpdate={() => {}}
          onDelete={() => {}}
          allItems={board.items}
        />
      )}
    </div>
  );
}
