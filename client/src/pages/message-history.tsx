import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { ListSkeleton } from "@/components/skeleton";
import {
  Search, ChevronDown, ChevronRight, MessageSquare, Clock, FolderOpen,
  User, Bot, Wrench, Loader2, Plus, Star, Copy, Check, Trash2, Pencil,
  Hash, Sparkles,
} from "lucide-react";
import { relativeTime, shortModel } from "@/lib/utils";
import { usePromptTemplates, useCreatePrompt, useUpdatePrompt, useDeletePrompt } from "@/hooks/use-prompts";
import type { SessionData, SessionStats, PromptTemplate } from "@shared/types";

const rt = (s: string | null) => s ? relativeTime(s) : "-";

interface SessionMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  model?: string;
  tokenCount?: number;
  hasToolUse?: boolean;
  toolNames?: string[];
}

interface MessagesResponse {
  sessionId: string;
  totalMessages: number;
  messages: SessionMessage[];
}

function formatTime(timestamp: string): string {
  if (!timestamp) return "";
  try {
    return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
  } catch { return ""; }
}

function lastPathSegment(fullPath: string): string {
  if (!fullPath || fullPath === "(no project)") return fullPath || "";
  const normalized = fullPath.replace(/\\/g, "/").replace(/\/$/, "");
  const parts = normalized.split("/");
  return parts[parts.length - 1] || fullPath;
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "..." : s;
}

type SortKey = "name" | "recent" | "most-used" | "favorites";

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function MessageHistory() {
  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gradient">Messages</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Session history and prompt templates
        </p>
      </div>

      {/* Split layout */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6" style={{ height: "calc(100vh - 160px)" }}>
        {/* Left: Message History — 3 cols */}
        <div className="lg:col-span-3 flex flex-col min-h-0">
          <MessagesPanel />
        </div>

        {/* Right: Prompts — 2 cols */}
        <div className="lg:col-span-2 flex flex-col min-h-0">
          <PromptsPanel />
        </div>
      </div>
    </div>
  );
}

// ─── Messages Panel ──────────────────────────────────────────────────────────

function MessagesPanel() {
  const [search, setSearch] = useState("");
  const [expandedSession, setExpandedSession] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ sessions: SessionData[]; stats: SessionStats }>({
    queryKey: [`/api/sessions?sort=lastTs&order=desc&hideEmpty=true`],
    staleTime: 60000,
  });

  const sessions = data?.sessions || [];

  const filteredSessions = search
    ? sessions.filter((s) => {
        const q = search.toLowerCase();
        return (
          (s.firstMessage && s.firstMessage.toLowerCase().includes(q)) ||
          (s.slug && s.slug.toLowerCase().includes(q)) ||
          (s.projectKey && s.projectKey.toLowerCase().includes(q))
        );
      })
    : sessions;

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <MessageSquare className="h-4 w-4" />
          History
          <span className="text-[10px] font-mono normal-case">({sessions.length})</span>
        </h2>
        <div className="relative w-56">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search sessions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto space-y-2 min-h-0">
        {isLoading ? (
          <ListSkeleton rows={6} />
        ) : filteredSessions.length === 0 ? (
          <div className="text-muted-foreground text-center py-12 text-sm">
            {search ? "No sessions match your search" : "No sessions with messages found"}
          </div>
        ) : (
          filteredSessions.map((session, i) => (
            <SessionRow
              key={session.id}
              session={session}
              index={i}
              isExpanded={expandedSession === session.id}
              onToggle={() =>
                setExpandedSession(expandedSession === session.id ? null : session.id)
              }
            />
          ))
        )}
      </div>
    </>
  );
}

// ─── Prompts Panel ───────────────────────────────────────────────────────────

function PromptsPanel() {
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

// ─── Prompt Modal ────────────────────────────────────────────────────────────

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

// ─── Session Row ─────────────────────────────────────────────────────────────

function SessionRow({
  session, index, isExpanded, onToggle,
}: {
  session: SessionData;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const project = lastPathSegment(session.projectKey);

  return (
    <Card
      className={`card-hover animate-fade-in-up cursor-pointer ${isExpanded ? "ring-1 ring-blue-500/30" : ""}`}
      style={{ animationDelay: `${Math.min(index, 20) * 30}ms` }}
    >
      <CardContent className="p-0">
        <div className="flex items-center gap-3 p-4 hover:bg-accent/20 transition-colors" onClick={onToggle}>
          <div className="flex-shrink-0 text-muted-foreground/50">
            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium line-clamp-1">
              {session.firstMessage || session.slug || "(untitled)"}
            </p>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="text-[11px] text-muted-foreground font-mono whitespace-nowrap flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {rt(session.lastTs)}
              </span>
              {project && (
                <>
                  <span className="text-muted-foreground/30 text-[11px]">/</span>
                  <span className="text-[11px] text-muted-foreground/60 flex items-center gap-1">
                    <FolderOpen className="h-3 w-3" />
                    {project}
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <MessageSquare className="h-3.5 w-3.5" />
              <span className="font-mono tabular-nums">{session.messageCount}</span>
            </div>
            <span className="text-[11px] text-muted-foreground/50 font-mono">
              {formatDate(session.lastTs)}
            </span>
          </div>
        </div>

        {isExpanded && <ExpandedMessages sessionId={session.id} />}
      </CardContent>
    </Card>
  );
}

// ─── Expanded Messages ───────────────────────────────────────────────────────

function ExpandedMessages({ sessionId }: { sessionId: string }) {
  const { data, isLoading } = useQuery<MessagesResponse>({
    queryKey: [`/api/sessions/${sessionId}/messages`],
    staleTime: 120000,
  });

  if (isLoading) {
    return (
      <div className="px-4 pb-4 pt-2 border-t border-border/30">
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading messages...
        </div>
      </div>
    );
  }

  if (!data || data.messages.length === 0) {
    return (
      <div className="px-4 pb-4 pt-2 border-t border-border/30">
        <p className="text-sm text-muted-foreground py-4 text-center">No messages found</p>
      </div>
    );
  }

  return (
    <div className="px-4 pb-4 pt-2 border-t border-border/30">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
          Conversation ({data.totalMessages} messages)
        </span>
      </div>
      <div className="space-y-1.5 max-h-[500px] overflow-auto">
        {data.messages.map((msg, idx) => (
          <MessageRow key={idx} message={msg} />
        ))}
      </div>
    </div>
  );
}

// ─── Message Row ─────────────────────────────────────────────────────────────

function MessageRow({ message }: { message: SessionMessage }) {
  const isUser = message.role === "user";

  return (
    <div
      className={`flex items-start gap-2.5 text-xs rounded-md px-3 py-2 transition-colors hover:bg-accent/20 ${
        isUser ? "border-l-2 border-l-blue-500/50" : "border-l-2 border-l-green-500/50"
      }`}
    >
      <div className="flex-shrink-0 mt-0.5">
        {isUser ? <User className="h-3.5 w-3.5 text-blue-400" /> : <Bot className="h-3.5 w-3.5 text-green-400" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm leading-relaxed line-clamp-3 ${isUser ? "text-foreground" : "text-muted-foreground"}`}>
          {message.content || "(no content)"}
        </p>
        {message.hasToolUse && message.toolNames && message.toolNames.length > 0 && (
          <div className="flex items-center gap-1 mt-1 flex-wrap">
            <Wrench className="h-3 w-3 text-muted-foreground/50" />
            {message.toolNames.map((tool, i) => (
              <Badge key={i} variant="outline" className="text-[9px] px-1 py-0 text-muted-foreground/70 border-muted-foreground/20">
                {tool}
              </Badge>
            ))}
          </div>
        )}
      </div>
      <div className="flex-shrink-0 text-right space-y-0.5">
        <span className="text-[10px] text-muted-foreground/50 font-mono tabular-nums block">
          {formatTime(message.timestamp)}
        </span>
        {message.model && (
          <Badge variant="outline" className="text-[9px] px-1 py-0">
            {shortModel(message.model ?? null)}
          </Badge>
        )}
      </div>
    </div>
  );
}
