import { useParams, useLocation } from "wouter";
import { useEntities } from "@/hooks/use-entities";
import { useTaskBoard, useCreateTask, useUpdateTask, useDeleteTask, useReorderTasks, useUpdateTaskConfig } from "@/hooks/use-tasks";
import { TaskSidebar } from "@/components/tasks/task-sidebar";
import { KanbanBoard } from "@/components/tasks/kanban-board";
import { TaskDetailPanel } from "@/components/tasks/task-detail-panel";
import { BoardSetup } from "@/components/tasks/board-setup";
import { ChevronRight } from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import type { ProjectEntity } from "@shared/types";
import type { TaskItem } from "@shared/task-types";

export default function TasksPage() {
  const params = useParams<{ projectId?: string }>();
  const [, setLocation] = useLocation();
  const { data: projects, isLoading: loadingProjects } = useEntities<ProjectEntity>("project");

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(params.projectId || null);
  const [selectedParent, setSelectedParent] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null);
  const [inlineCreateStatus, setInlineCreateStatus] = useState<string | null>(null);

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

  const { data: board, isLoading: loadingBoard } = useTaskBoard(selectedProjectId || undefined);
  const createTask = useCreateTask(selectedProjectId || "");
  const updateTask = useUpdateTask(selectedProjectId || "");
  const deleteTask = useDeleteTask(selectedProjectId || "");
  const reorderTasks = useReorderTasks(selectedProjectId || "");
  const updateConfig = useUpdateTaskConfig(selectedProjectId || "");

  const selectedProject = projects?.find((p) => p.id === selectedProjectId);

  const visibleItems = board?.items.filter((item) => {
    if (selectedParent === null) return true;
    return item.parent === selectedParent;
  }) || [];

  const breadcrumbs: Array<{ label: string; id: string | null }> = [];
  if (selectedProject) {
    breadcrumbs.push({ label: selectedProject.name, id: null });
  }
  if (selectedParent && board) {
    const chain: TaskItem[] = [];
    let current = board.items.find((i) => i.id === selectedParent);
    while (current) {
      chain.unshift(current);
      current = current.parent ? board.items.find((i) => i.id === current!.parent) : undefined;
    }
    for (const item of chain) {
      breadcrumbs.push({ label: item.title, id: item.id });
    }
  }

  const handleAddTask = (status: string) => {
    setInlineCreateStatus(status);
  };

  const handleCreateTask = (title: string, status: string) => {
    createTask.mutate({
      title,
      status,
      parent: selectedParent || undefined,
    });
    setInlineCreateStatus(null);
  };

  const handleStatusChange = (taskId: string, newStatus: string) => {
    updateTask.mutate({ taskId, status: newStatus });
  };

  const handleSetupBoard = () => {
    updateConfig.mutate({});
  };

  if (loadingProjects) {
    return <div className="flex items-center justify-center h-full"><div className="h-8 w-8 animate-spin rounded-full border-4 border-muted-foreground/30 border-t-primary" /></div>;
  }

  const hasBoard = board && (board.items.length > 0 || Object.keys(board.config.columnOrder).length > 0);
  const needsSetup = selectedProjectId && board && !hasBoard;

  return (
    <div className="flex h-full">
      <TaskSidebar
        projects={projects || []}
        selectedProjectId={selectedProjectId}
        onSelectProject={setSelectedProjectId}
        items={board?.items || []}
        selectedParent={selectedParent}
        onSelectParent={setSelectedParent}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedProjectId && (
          <div className="flex items-center gap-1.5 px-4 py-2.5 border-b text-sm">
            {breadcrumbs.map((crumb, i) => (
              <span key={i} className="flex items-center gap-1.5">
                {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/30" />}
                <button
                  onClick={() => setSelectedParent(crumb.id)}
                  className={cn(
                    "hover:text-foreground transition-colors",
                    i === breadcrumbs.length - 1 ? "text-foreground font-medium" : "text-muted-foreground"
                  )}
                >
                  {crumb.label}
                </button>
              </span>
            ))}
            {board?.malformedCount ? (
              <span className="ml-auto text-[10px] text-amber-500/70">{board.malformedCount} file(s) skipped</span>
            ) : null}
          </div>
        )}

        <div className="flex-1 overflow-auto p-4">
          {!selectedProjectId && (
            <div className="flex items-center justify-center h-full text-muted-foreground">Select a project to view tasks</div>
          )}

          {selectedProjectId && loadingBoard && (
            <div className="flex items-center justify-center h-full"><div className="h-8 w-8 animate-spin rounded-full border-4 border-muted-foreground/30 border-t-primary" /></div>
          )}

          {selectedProjectId && !loadingBoard && needsSetup && (
            <BoardSetup projectName={selectedProject?.name || ""} onAcceptDefaults={handleSetupBoard} />
          )}

          {selectedProjectId && board && hasBoard && (
            <KanbanBoard
              config={board.config}
              items={visibleItems}
              onReorder={(input) => reorderTasks.mutate(input)}
              onStatusChange={handleStatusChange}
              onAddTask={handleAddTask}
              onClickTask={setSelectedTask}
              inlineCreateStatus={inlineCreateStatus}
              onCreateSubmit={handleCreateTask}
              onCreateCancel={() => setInlineCreateStatus(null)}
            />
          )}
        </div>
      </div>

      {board && (
        <TaskDetailPanel
          task={selectedTask}
          config={board.config}
          open={selectedTask !== null}
          onClose={() => setSelectedTask(null)}
          onUpdate={(taskId, updates) => updateTask.mutate({ taskId, ...updates })}
          onDelete={(taskId) => deleteTask.mutate(taskId)}
          allItems={board.items}
        />
      )}
    </div>
  );
}
