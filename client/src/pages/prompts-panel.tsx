// client/src/pages/prompts-panel.tsx
//
// Prompts library panel — extracted from the now-deleted message-history.tsx
// during messages-redesign-task005 cleanup. The Library page imports
// `PromptsPanel` from here; the implementation is unchanged from the
// previous home so behavior stays identical.

import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Search, Plus, Star, Copy, Check, Trash2, Pencil, Hash, Sparkles,
} from "lucide-react";
import {
  usePromptTemplates,
  useCreatePrompt,
  useUpdatePrompt,
  useDeletePrompt,
} from "@/hooks/use-prompts";
import type { PromptTemplate } from "@shared/types";

type SortKey = "name" | "recent" | "most-used" | "favorites";

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "..." : s;
}

export function PromptsPanel() {
  const { data: templates, isLoading } = usePromptTemplates();
  const updateMutation = useUpdatePrompt();
  const deleteMutation = useDeletePrompt();

  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("recent");
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<PromptTemplate | undefined>(undefined);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let list = templates || [];
    if (tab === "favorites") list = list.filter(t => t.isFavorite);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(t =>
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.prompt.toLowerCase().includes(q) ||
        t.tags.some(tag => tag.toLowerCase().includes(q))
      );
    }
    const sorted = [...list];
    switch (sortKey) {
      case "name": sorted.sort((a, b) => a.name.localeCompare(b.name)); break;
      case "recent": sorted.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); break;
      case "most-used": sorted.sort((a, b) => b.usageCount - a.usageCount); break;
      case "favorites":
        sorted.sort((a, b) => {
          if (a.isFavorite && !b.isFavorite) return -1;
          if (!a.isFavorite && b.isFavorite) return 1;
          return b.updatedAt.localeCompare(a.updatedAt);
        });
        break;
    }
    return sorted;
  }, [templates, tab, search, sortKey]);

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    for (const t of templates || []) for (const tag of t.tags) tags.add(tag);
    return Array.from(tags).sort();
  }, [templates]);

  const handleCopy = (t: PromptTemplate) => {
    navigator.clipboard.writeText(t.prompt);
    setCopiedId(t.id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const handleFavorite = (t: PromptTemplate) => {
    updateMutation.mutate({ id: t.id, isFavorite: !t.isFavorite });
  };

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id, { onSuccess: () => setDeletingId(null) });
  };

  const openEdit = (t: PromptTemplate) => { setEditing(t); setShowModal(true); };
  const openCreate = () => { setEditing(undefined); setShowModal(true); };
  const closeModal = () => { setShowModal(false); setEditing(undefined); };

  const favCount = (templates || []).filter(t => t.isFavorite).length;

  return (
    <>
      {/* Panel header */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-amber-400" />
          Prompts
          <span className="text-[10px] font-mono normal-case">({(templates || []).length})</span>
        </h2>
        <Button size="sm" onClick={openCreate} className="gap-1.5 h-8 text-xs">
          <Plus className="h-3.5 w-3.5" />
          New
        </Button>
      </div>

      {/* Filters row */}
      <div className="flex items-center gap-2 mb-3">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="h-7">
            <TabsTrigger value="all" className="text-[11px] h-6 px-2">All</TabsTrigger>
            <TabsTrigger value="favorites" className="text-[11px] h-6 px-2 gap-1">
              <Star className="h-2.5 w-2.5" />
              Favs
              {favCount > 0 && <span className="text-[9px] opacity-60">({favCount})</span>}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <select
          value={sortKey}
          onChange={e => setSortKey(e.target.value as SortKey)}
          className="text-[11px] px-2 py-1 rounded-md border border-border bg-background text-foreground h-7"
        >
          <option value="recent">Recent</option>
          <option value="name">A-Z</option>
          <option value="most-used">Most Used</option>
          <option value="favorites">Favs First</option>
        </select>
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-7 h-7 text-[11px]"
          />
        </div>
      </div>

      {/* Tag cloud */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {allTags.map(tag => (
            <Badge
              key={tag}
              variant="outline"
              className={`text-[9px] cursor-pointer transition-colors ${search === tag ? "border-blue-500/50 text-blue-400 bg-blue-500/10" : "hover:border-border"}`}
              onClick={() => setSearch(search === tag ? "" : tag)}
            >
              <Hash className="h-2 w-2 mr-0.5" />{tag}
            </Badge>
          ))}
        </div>
      )}

      {/* Template list */}
      <div className="flex-1 overflow-auto space-y-1.5 min-h-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-20 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">
              {(templates || []).length === 0
                ? "No prompt templates yet"
                : tab === "favorites"
                  ? "No favorites yet"
                  : "No prompts match your search"}
            </p>
            {(templates || []).length === 0 && (
              <Button variant="outline" size="sm" className="mt-2 gap-1 text-xs" onClick={openCreate}>
                <Plus className="h-3 w-3" />
                Create your first
              </Button>
            )}
          </div>
        ) : (
          filtered.map((t, i) => (
            <div
              key={t.id}
              className="rounded-lg border border-border/50 px-3 py-2.5 hover:bg-accent/30 hover:border-border transition-all duration-150 animate-fade-in-up group"
              style={{ animationDelay: `${i * 20}ms` }}
            >
              <div className="flex items-start gap-2">
                {/* Favorite star */}
                <button onClick={() => handleFavorite(t)} className="mt-0.5 flex-shrink-0">
                  <Star className={`h-3.5 w-3.5 transition-colors ${t.isFavorite ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30 hover:text-amber-400/60"}`} />
                </button>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-medium">{t.name}</span>
                    {t.tags.map(tag => (
                      <Badge key={tag} variant="outline" className="text-[9px] px-1 py-0">{tag}</Badge>
                    ))}
                  </div>
                  {t.description && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">{t.description}</p>
                  )}
                  <pre className="text-[10px] text-muted-foreground/60 font-mono mt-1 whitespace-pre-wrap line-clamp-2 leading-relaxed">
                    {truncate(t.prompt, 200)}
                  </pre>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-0.5 flex-shrink-0">
                  {t.usageCount > 0 && (
                    <span className="text-[10px] text-muted-foreground tabular-nums mr-1">{t.usageCount}x</span>
                  )}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button onClick={() => handleCopy(t)} className="p-1 rounded hover:bg-accent transition-colors">
                        {copiedId === t.id
                          ? <Check className="h-3 w-3 text-green-400" />
                          : <Copy className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">Copy prompt</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button onClick={() => openEdit(t)} className="p-1 rounded hover:bg-accent transition-colors">
                        <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">Edit</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button onClick={() => setDeletingId(t.id)} className="p-1 rounded hover:bg-red-500/10 transition-colors">
                        <Trash2 className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity text-red-400" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">Delete</TooltipContent>
                  </Tooltip>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create/Edit modal */}
      {showModal && <PromptModal open={showModal} onClose={closeModal} initial={editing} />}

      {/* Delete confirmation */}
      <Dialog open={!!deletingId} onOpenChange={(v) => { if (!v) setDeletingId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete Prompt</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This will permanently delete this prompt template. This cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deletingId && handleDelete(deletingId)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function PromptModal({
  open, onClose, initial,
}: {
  open: boolean;
  onClose: () => void;
  initial?: PromptTemplate;
}) {
  const createMutation = useCreatePrompt();
  const updateMutation = useUpdatePrompt();
  const isEdit = !!initial;

  const [name, setName] = useState(initial?.name || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [prompt, setPrompt] = useState(initial?.prompt || "");
  const [tagsStr, setTagsStr] = useState(initial?.tags.join(", ") || "");

  const handleSave = () => {
    const tags = tagsStr.split(",").map(t => t.trim()).filter(Boolean);
    if (isEdit) {
      updateMutation.mutate({ id: initial.id, name, description, prompt, tags }, { onSuccess: onClose });
    } else {
      createMutation.mutate({ name, description, prompt, tags }, { onSuccess: onClose });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;
  const canSave = name.trim().length > 0 && prompt.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Prompt" : "New Prompt Template"}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-auto space-y-4 py-2">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Name *</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Code Review Checklist" maxLength={200} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Description</label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief description of what this prompt does" maxLength={500} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Prompt *</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Paste your prompt here..."
              maxLength={5000}
              rows={10}
              className="w-full bg-muted/30 border border-border/50 rounded-lg p-3 text-sm font-mono resize-y focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <p className="text-[10px] text-muted-foreground mt-1 text-right">{prompt.length}/5000</p>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Tags (comma-separated)</label>
            <Input value={tagsStr} onChange={(e) => setTagsStr(e.target.value)} placeholder="e.g. review, code, daily" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={!canSave || isPending} className="gap-1.5">
            {isPending ? "Saving..." : isEdit ? "Update" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
