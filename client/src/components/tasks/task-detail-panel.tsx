import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import type { TaskItem, TaskConfig } from "@shared/task-types";

interface TaskDetailPanelProps {
  task: TaskItem | null;
  config: TaskConfig;
  open: boolean;
  onClose: () => void;
  onUpdate: (taskId: string, updates: Record<string, unknown>) => void;
  onDelete: (taskId: string) => void;
  allItems: TaskItem[];
  isFrozen?: boolean;
}

export function TaskDetailPanel({ task, config, open, onClose, onUpdate, onDelete, allItems, isFrozen }: TaskDetailPanelProps) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState("");
  const [type, setType] = useState("");
  const [parent, setParent] = useState<string | null>(null);
  const [labels, setLabels] = useState<string[]>([]);
  const [labelInput, setLabelInput] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setBody(task.body || "");
      setPriority(task.priority || "");
      setType(task.type);
      setParent(task.parent || null);
      setLabels(task.labels || []);
      setDirty(false);
      setConfirmDelete(false);
    }
  }, [task]);

  if (!task) return null;

  const handleSave = () => {
    onUpdate(task.id, {
      title,
      body,
      priority: priority || undefined,
      type,
      parent: parent || null,
      labels: labels.length > 0 ? labels : undefined,
      expectedUpdated: task.updated,
    });
    setDirty(false);
    toast.success("Task saved");
    onClose();
  };

  const handleAddLabel = () => {
    const trimmed = labelInput.trim();
    if (trimmed && !labels.includes(trimmed)) {
      setLabels([...labels, trimmed]);
      setDirty(true);
    }
    setLabelInput("");
  };

  const parentOptions = allItems.filter((i) => i.id !== task.id);

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="w-[480px] sm:max-w-[480px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="sr-only">Task Details</SheetTitle>
        </SheetHeader>

        <div className="space-y-5 pt-2">
          <input
            value={title}
            onChange={(e) => { setTitle(e.target.value); setDirty(true); }}
            className="w-full text-lg font-semibold bg-transparent border-none outline-none focus:ring-0 p-0"
            placeholder="Task title"
            disabled={isFrozen}
          />

          {/* Pipeline info (read-only) */}
          {task.pipelineStage && (
            <div className="rounded border border-zinc-800 bg-zinc-900/50 p-3 space-y-2">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground/60">Pipeline</div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-zinc-500">Stage:</span> <span className="text-zinc-300">{task.pipelineStage}</span></div>
                {task.pipelineBranch && <div><span className="text-zinc-500">Branch:</span> <span className="text-zinc-300 font-mono">{task.pipelineBranch}</span></div>}
                {task.pipelineCost != null && <div><span className="text-zinc-500">Cost:</span> <span className="text-zinc-300">${task.pipelineCost.toFixed(2)}</span></div>}
                {task.pipelineActivity && <div className="col-span-2"><span className="text-zinc-500">Activity:</span> <span className="text-zinc-300">{task.pipelineActivity}</span></div>}
                {task.pipelineBlockedReason && <div className="col-span-2"><span className="text-zinc-500">Blocked:</span> <span className="text-red-400">{task.pipelineBlockedReason}</span></div>}
              </div>
            </div>
          )}

          {isFrozen && (
            <div className="text-xs text-amber-400 bg-amber-950/30 rounded px-3 py-2">
              Editing disabled while this milestone is running.
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-wide text-muted-foreground/60 mb-1 block">Priority</label>
              <select
                value={priority}
                onChange={(e) => { setPriority(e.target.value); setDirty(true); }}
                className="w-full text-sm bg-muted/50 border rounded px-2 py-1.5"
                disabled={isFrozen}
              >
                <option value="">None</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wide text-muted-foreground/60 mb-1 block">Type</label>
              <select
                value={type}
                onChange={(e) => { setType(e.target.value); setDirty(true); }}
                className="w-full text-sm bg-muted/50 border rounded px-2 py-1.5"
                disabled={isFrozen}
              >
                {config.types.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground/60 mb-1 block">Parent</label>
            <select
              value={parent || ""}
              onChange={(e) => { setParent(e.target.value || null); setDirty(true); }}
              className="w-full text-sm bg-muted/50 border rounded px-2 py-1.5"
              disabled={isFrozen}
            >
              <option value="">None (top-level)</option>
              {parentOptions.map((p) => <option key={p.id} value={p.id}>{p.title} ({p.type})</option>)}
            </select>
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground/60 mb-1 block">Labels</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {labels.map((label) => (
                <Badge key={label} variant="secondary" className="text-xs gap-1">
                  {label}
                  {!isFrozen && (
                    <button onClick={() => { setLabels(labels.filter((l) => l !== label)); setDirty(true); }}>
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={labelInput}
                onChange={(e) => setLabelInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddLabel(); } }}
                placeholder="Add label..."
                className="text-sm h-8"
                disabled={isFrozen}
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground/60 mb-1 block">Description</label>
            <textarea
              value={body}
              onChange={(e) => { setBody(e.target.value); setDirty(true); }}
              className="w-full min-h-[120px] text-sm bg-muted/30 border rounded p-2 resize-y font-mono"
              placeholder="Task description (markdown supported)"
              disabled={isFrozen}
            />
          </div>

          <div className="flex gap-4 text-[11px] text-muted-foreground/40">
            <span>Created: {task.created}</span>
            <span>Updated: {task.updated}</span>
          </div>

          {!isFrozen && (
            <div className="flex items-center justify-between pt-2 border-t">
              {!confirmDelete ? (
                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="h-4 w-4 mr-1" /> Delete
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button variant="destructive" size="sm" onClick={() => { onDelete(task.id); onClose(); }}>Confirm Delete</Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Button>
                </div>
              )}
              <Button size="sm" disabled={!dirty} onClick={handleSave}>Save Changes</Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
