import { DndContext, DragOverlay, closestCorners, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import type { DragStartEvent, DragEndEvent, DragOverEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { useState, useCallback } from "react";
import { KanbanColumn } from "./kanban-column";
import { TaskCard, TaskCardDragOverlay } from "./task-card";
import { InlineCreate } from "./inline-create";
import type { TaskItem, TaskConfig, ReorderInput } from "@shared/task-types";

interface KanbanBoardProps {
  config: TaskConfig;
  items: TaskItem[];
  onReorder: (input: ReorderInput) => void;
  onStatusChange: (taskId: string, newStatus: string) => void;
  onAddTask: (status: string) => void;
  onClickTask: (task: TaskItem) => void;
  inlineCreateStatus: string | null;
  onCreateSubmit: (title: string, status: string) => void;
  onCreateCancel: () => void;
}

function getOrderedItems(items: TaskItem[], status: string, columnOrder: Record<string, string[]>): TaskItem[] {
  const order = columnOrder[status] || [];
  const statusItems = items.filter((i) => i.status === status);
  const ordered: TaskItem[] = [];
  for (const id of order) {
    const item = statusItems.find((i) => i.id === id);
    if (item) ordered.push(item);
  }
  for (const item of statusItems) {
    if (!order.includes(item.id)) ordered.push(item);
  }
  return ordered;
}

export function KanbanBoard({ config, items, onReorder, onStatusChange, onAddTask, onClickTask, inlineCreateStatus, onCreateSubmit, onCreateCancel }: KanbanBoardProps) {
  const [activeTask, setActiveTask] = useState<TaskItem | null>(null);
  const [localOrder, setLocalOrder] = useState<Record<string, string[]> | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const effectiveOrder = localOrder || config.columnOrder;

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const task = items.find((i) => i.id === event.active.id);
    if (task) setActiveTask(task);
    setLocalOrder({ ...config.columnOrder });
  }, [items, config.columnOrder]);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event;
    if (!over || !localOrder) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    let activeColumn: string | null = null;
    for (const [status, ids] of Object.entries(localOrder)) {
      if (ids.includes(activeId)) { activeColumn = status; break; }
    }

    let overColumn: string | null = null;
    if (config.statuses.includes(overId)) {
      overColumn = overId;
    } else {
      for (const [status, ids] of Object.entries(localOrder)) {
        if (ids.includes(overId)) { overColumn = status; break; }
      }
    }

    if (!activeColumn || !overColumn || activeColumn === overColumn) return;

    setLocalOrder((prev) => {
      if (!prev) return prev;
      const next = { ...prev };
      next[activeColumn!] = next[activeColumn!].filter((id) => id !== activeId);
      const overIndex = next[overColumn!].indexOf(overId);
      if (overIndex >= 0) {
        next[overColumn!].splice(overIndex, 0, activeId);
      } else {
        next[overColumn!].push(activeId);
      }
      return next;
    });
  }, [localOrder, config.statuses]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTask(null);

    if (!over || !localOrder) {
      setLocalOrder(null);
      return;
    }

    const activeId = active.id as string;
    const overId = over.id as string;

    let activeColumn: string | null = null;
    for (const [status, ids] of Object.entries(localOrder)) {
      if (ids.includes(activeId)) { activeColumn = status; break; }
    }

    if (!activeColumn) { setLocalOrder(null); return; }

    if (activeId !== overId && localOrder[activeColumn].includes(overId)) {
      const oldIndex = localOrder[activeColumn].indexOf(activeId);
      const newIndex = localOrder[activeColumn].indexOf(overId);
      const newOrder = { ...localOrder };
      newOrder[activeColumn] = arrayMove(newOrder[activeColumn], oldIndex, newIndex);
      setLocalOrder(newOrder);
      onReorder({ columnOrder: newOrder });
    } else {
      onReorder({ columnOrder: localOrder });
    }

    const originalTask = items.find((i) => i.id === activeId);
    if (originalTask && originalTask.status !== activeColumn) {
      onStatusChange(activeId, activeColumn);
    }

    setLocalOrder(null);
  }, [localOrder, items, onReorder, onStatusChange]);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4">
        {config.statuses.map((status) => (
          <KanbanColumn
            key={status}
            status={status}
            items={getOrderedItems(items, status, effectiveOrder)}
            onAddTask={onAddTask}
            renderCard={(item) => {
              const parentItem = item.parent ? items.find((i) => i.id === item.parent) : undefined;
              return (
                <TaskCard
                  key={item.id}
                  task={item}
                  onClick={() => onClickTask(item)}
                  parentTitle={parentItem?.title}
                />
              );
            }}
            inlineCreate={inlineCreateStatus === status ? (
              <InlineCreate status={status} onSubmit={onCreateSubmit} onCancel={onCreateCancel} />
            ) : undefined}
          />
        ))}
      </div>
      <DragOverlay>
        {activeTask && <TaskCardDragOverlay task={activeTask} />}
      </DragOverlay>
    </DndContext>
  );
}
