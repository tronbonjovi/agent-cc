import { useState, useEffect, useRef } from "react";
import { useSessions, useSessionDetail, useDeleteSession, useBulkDeleteSessions, useDeleteAllSessions, useUndoDeleteSessions, useDeepSearch, useSessionSummary, useSessionCost, useSessionCommits, useSessionDiffs, useTogglePin, useSaveNote, useSessionNames } from "@/hooks/use-sessions";
import { getSessionDisplayName } from "@/lib/session-display-name";
import { useDebouncedValue } from "@/hooks/use-debounce";
import { apiRequest } from "@/lib/queryClient";
import { PageContainer } from "@/components/page-container";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ListSkeleton } from "@/components/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Search, Terminal, Trash2, Copy, Check, ChevronDown, ChevronRight,
  MessageSquare, X, AlertTriangle, Undo2, FolderOpen,
  Sparkles, Zap, DollarSign, FileText,
  GitCommit, BarChart3, Settings,
  BookOpen, Pin, StickyNote,
} from "lucide-react";
import type { SessionData, DeepSearchMatch } from "@shared/types";
import { formatBytes, relativeTime as _relativeTime } from "@/lib/utils";
import { EmptyState } from "@/components/empty-state";
import { MessagesPanel as MessagesTabContent, PromptsPanel as PromptsTabContent } from "@/pages/message-history";

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function HighlightText({ text, query }: { text: string; query: string }) {
  if (!query || !text) return <>{text}</>;
  try {
    const parts = text.split(new RegExp(`(${escapeRegex(query)})`, "gi"));
    return (
      <>
        {parts.map((part, i) =>
          part.toLowerCase() === query.toLowerCase() ? (
            <mark key={i}>{part}</mark>
          ) : (
            part
          )
        )}
      </>
    );
  } catch {
    return <>{text}</>;
  }
}

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return "-";
  return _relativeTime(dateStr);
}

function formatUsd(n: number): string {
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(4)}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default function Sessions() {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("lastTs:desc");
  const [hideEmpty, setHideEmpty] = useState(false);
  const [activeOnly, setActiveOnly] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: "single" | "bulk" | "all"; id?: string } | null>(null);
  const [searchMode, setSearchMode] = useState<"titles" | "deep">("titles");
  const [activeTab, setActiveTab] = useState<"sessions" | "messages" | "prompts">("sessions");

  // Read project filter and highlight from URL
  const urlParams = new URLSearchParams(window.location.search);
  const [projectFilter, setProjectFilter] = useState(urlParams.get("project") || "");
  const highlightId = urlParams.get("highlight") || "";
  const highlightApplied = useRef(false);

  const [sort, order] = sortKey.split(":") as [string, string];
  const debouncedSearch = useDebouncedValue(search, 300);
  const { data, isLoading } = useSessions({ q: debouncedSearch || undefined, sort, order, hideEmpty, activeOnly, project: projectFilter || undefined });
  const expandedDetail = useSessionDetail(expanded || undefined);
  const deleteSession = useDeleteSession();
  const bulkDelete = useBulkDeleteSessions();
  const deleteAll = useDeleteAllSessions();
  const undoDelete = useUndoDeleteSessions();
  const deepSearchQuery = useDeepSearch({ q: searchMode === "deep" ? debouncedSearch : undefined, project: projectFilter || undefined });
  const togglePin = useTogglePin();
  const saveNote = useSaveNote();

  const { data: sessionNames } = useSessionNames();

  const sessions = data?.sessions || [];
  const stats = data?.stats;

  // Auto-expand and scroll to highlighted session (from board "View Full Session" link)
  useEffect(() => {
    if (!highlightId || !sessions.length || highlightApplied.current) return;
    const match = sessions.find(s => s.id === highlightId);
    if (!match) return;
    highlightApplied.current = true;
    setExpanded(highlightId);
    // Scroll after render
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-session-id="${highlightId}"]`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("session-highlight", "ring-2", "ring-blue-500/50");
        setTimeout(() => el.classList.remove("session-highlight", "ring-2", "ring-blue-500/50"), 3000);
      }
    });
  }, [highlightId, sessions]);

  const handleCopyResume = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(`claude --resume ${id}`);
    setCopiedId("resume:" + id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const handleCopyId = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const handleToggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDelete = () => {
    if (!deleteConfirm) return;
    if (deleteConfirm.type === "single" && deleteConfirm.id) {
      deleteSession.mutate(deleteConfirm.id);
      selected.delete(deleteConfirm.id);
      setSelected(new Set(selected));
      if (expanded === deleteConfirm.id) setExpanded(null);
    } else if (deleteConfirm.type === "bulk") {
      bulkDelete.mutate(Array.from(selected));
      if (expanded && selected.has(expanded)) setExpanded(null);
      setSelected(new Set());
    } else if (deleteConfirm.type === "all") {
      deleteAll.mutate();
      setSelected(new Set());
      setExpanded(null);
    }
    setDeleteConfirm(null);
  };

  const canUndo = (data as any)?.canUndo === true;

  const handleOpenFolder = async (filePath: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const folder = filePath.replace(/\/[^/]+$/, "");
    try { await apiRequest("POST", "/api/actions/open-folder", { path: folder }); } catch {}
  };

  return (
    <PageContainer title="Sessions">
      {/* Subheader + Search */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {sessions.length} session{sessions.length !== 1 ? "s" : ""}{stats ? `, ${formatBytes(stats.totalSize)}` : ""}
          </p>
          <div className="flex items-center gap-0 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64 sm:flex-initial">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder={searchMode === "deep" ? "Deep search content..." : "Search sessions..."} value={search} onChange={e => setSearch(e.target.value)} className="pl-9 rounded-r-none" />
            </div>
            <div className="flex border border-l-0 border-border rounded-r-md overflow-hidden flex-shrink-0">
              <button
                onClick={() => setSearchMode("titles")}
                className={`text-[11px] px-2.5 py-[7px] transition-colors whitespace-nowrap ${
                  searchMode === "titles" ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                Titles
              </button>
              <button
                onClick={() => setSearchMode("deep")}
                className={`text-[11px] px-2.5 py-[7px] transition-colors whitespace-nowrap ${
                  searchMode === "deep" ? "bg-purple-500/10 text-purple-400 font-medium" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                <Zap className="h-3 w-3 inline mr-0.5" />Deep
              </button>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setHideEmpty(!hideEmpty)}
            className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border transition-colors whitespace-nowrap ${
              hideEmpty ? "border-primary/30 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            Hide Empty
          </button>
          <button
            onClick={() => setActiveOnly(!activeOnly)}
            className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border transition-colors whitespace-nowrap ${
              activeOnly ? "border-primary/30 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            Active Only
          </button>
          <select
            value={sortKey}
            onChange={e => setSortKey(e.target.value)}
            className="text-xs px-2.5 py-1.5 rounded-md border border-border bg-background text-foreground"
          >
            <option value="lastTs:desc">Newest First</option>
            <option value="lastTs:asc">Oldest First</option>
            <option value="slug:asc">Name A-Z</option>
            <option value="slug:desc">Name Z-A</option>
            <option value="sizeBytes:desc">Largest First</option>
            <option value="sizeBytes:asc">Smallest First</option>
            <option value="messageCount:desc">Most Messages</option>
            <option value="messageCount:asc">Fewest Messages</option>
          </select>
          <div className="flex-1" />
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setDeleteConfirm({ type: "all" })}
            disabled={sessions.length === 0}
            className="gap-1.5"
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete All
          </Button>
        </div>
      </div>

      {/* Tab bar — scrollable at narrow widths */}
      <div className="flex items-center gap-1 border-b border-border overflow-x-auto whitespace-nowrap scrollbar-thin">
        <button
          onClick={() => setActiveTab("sessions")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap flex-shrink-0 ${
            activeTab === "sessions" ? "border-blue-500 text-blue-400" : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <MessageSquare className="h-3.5 w-3.5 inline mr-1.5" />Sessions
        </button>
        <button
          onClick={() => setActiveTab("messages")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap flex-shrink-0 ${
            activeTab === "messages" ? "border-blue-500 text-blue-400" : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <BookOpen className="h-3.5 w-3.5 inline mr-1.5" />Messages
        </button>
        <button
          onClick={() => setActiveTab("prompts")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap flex-shrink-0 ${
            activeTab === "prompts" ? "border-amber-500 text-amber-400" : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Sparkles className="h-3.5 w-3.5 inline mr-1.5" />Prompts
        </button>
      </div>

      {activeTab === "messages" ? (
        <div className="flex-1 min-h-0" style={{ height: "calc(100vh - 220px)" }}>
          <MessagesTabContent />
        </div>
      ) : activeTab === "prompts" ? (
        <div className="flex-1 min-h-0" style={{ height: "calc(100vh - 220px)" }}>
          <PromptsTabContent />
        </div>
      ) : (
      <>
      {/* Undo bar */}
      {canUndo && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg border border-amber-500/30 bg-amber-500/5">
          <Undo2 className="h-4 w-4 text-amber-400 flex-shrink-0" />
          <span className="text-sm text-muted-foreground">Sessions were deleted.</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => undoDelete.mutate()}
            disabled={undoDelete.isPending}
            className="gap-1.5 border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
          >
            <Undo2 className="h-3.5 w-3.5" /> {undoDelete.isPending ? "Restoring..." : "Undo"}
          </Button>
        </div>
      )}

      {/* Project filter banner */}
      {projectFilter && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg border border-cyan-500/30 bg-cyan-500/5">
          <FolderOpen className="h-4 w-4 text-cyan-400 flex-shrink-0" />
          <span className="text-sm text-muted-foreground">
            Filtered by project: <span className="font-medium text-foreground">{projectFilter}</span>
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setProjectFilter("");
              window.history.replaceState({}, "", window.location.pathname);
            }}
            className="gap-1.5 border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10"
          >
            <X className="h-3.5 w-3.5" /> Clear
          </Button>
        </div>
      )}

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="sticky top-0 z-10 flex items-center gap-3 px-4 py-2.5 rounded-lg border border-blue-500/30 bg-blue-500/5">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setDeleteConfirm({ type: "bulk" })}
            className="gap-1.5"
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete Selected
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelected(new Set())}
          >
            <X className="h-3.5 w-3.5 mr-1" /> Clear
          </Button>
        </div>
      )}

      {/* Session list / Deep search results */}
      {searchMode === "deep" && debouncedSearch && debouncedSearch.length >= 2 ? (
        // Deep search mode
        <>
          {deepSearchQuery.isLoading && (
            <div className="flex items-center justify-center py-12">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-blue-500" />
              <span className="ml-3 text-sm text-muted-foreground">Searching sessions...</span>
            </div>
          )}
          {deepSearchQuery.isError && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
              Search failed: {deepSearchQuery.error instanceof Error ? deepSearchQuery.error.message : "Unknown error"}
            </div>
          )}
          {deepSearchQuery.data && deepSearchQuery.data.results.length === 0 && !deepSearchQuery.isLoading && (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <p className="text-sm">No results found for &quot;{debouncedSearch}&quot;</p>
              <p className="text-xs mt-1">Searched {deepSearchQuery.data.searchedSessions} of {deepSearchQuery.data.totalSessions} sessions</p>
              <p className="text-xs mt-2 opacity-70">Try different terms or switch to Titles mode</p>
            </div>
          )}
          {deepSearchQuery.data && deepSearchQuery.data.results.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
                <Zap className="h-3.5 w-3.5 text-purple-400" />
                {deepSearchQuery.data.totalMatches} matches across {deepSearchQuery.data.results.length} sessions
                ({deepSearchQuery.data.searchedSessions} searched in {deepSearchQuery.data.durationMs}ms)
              </div>
              {deepSearchQuery.data.results.map((match, i) => (
                <DeepSearchCard
                  key={match.sessionId}
                  match={match}
                  index={i}
                  searchQuery={debouncedSearch}
                  isExpanded={expanded === match.sessionId}
                  onToggleExpand={(id) => setExpanded(expanded === id ? null : id)}
                  onCopyResume={handleCopyResume}
                  copiedId={copiedId}
                />
              ))}
            </div>
          )}
        </>
      ) : isLoading ? (
        <ListSkeleton rows={6} />
      ) : sessions.length === 0 ? (
        <EmptyState icon={MessageSquare} title="No sessions found" description="Try adjusting your search or filters" />
      ) : (
        <div className="space-y-2">
          {/* Pinned sessions first */}
          {sessions.filter(s => s.isPinned).length > 0 && !search && (
            <>
              <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
                <Pin className="h-3.5 w-3.5 text-amber-400" /> Pinned
              </div>
              {sessions.filter(s => s.isPinned).map((s, i) => (
                <SessionCard
                  key={"pin-" + s.id} session={s} index={i}
                  isSelected={selected.has(s.id)} isExpanded={expanded === s.id} copiedId={copiedId}
                  detail={expanded === s.id ? expandedDetail.data : undefined}
                  onToggleSelect={handleToggleSelect} onToggleExpand={(id) => setExpanded(expanded === id ? null : id)}
                  onCopyId={handleCopyId} onCopyResume={handleCopyResume} onOpenFolder={handleOpenFolder}
                  onDelete={(id, e) => { e.stopPropagation(); setDeleteConfirm({ type: "single", id }); }}
                  onTogglePin={(id) => togglePin.mutate(id)} onSaveNote={(id, text) => saveNote.mutate({ id, text })}
                  searchQuery={search} sessionNames={sessionNames}
                />
              ))}
              <div className="border-b border-border/30" />
            </>
          )}
          {sessions.filter(s => !s.isPinned || !!search).map((s, i) => (
            <SessionCard
              key={s.id} session={s} index={i}
              isSelected={selected.has(s.id)} isExpanded={expanded === s.id} copiedId={copiedId}
              detail={expanded === s.id ? expandedDetail.data : undefined}
              onToggleSelect={handleToggleSelect} onToggleExpand={(id) => setExpanded(expanded === id ? null : id)}
              onCopyId={handleCopyId} onCopyResume={handleCopyResume} onOpenFolder={handleOpenFolder}
              onDelete={(id, e) => { e.stopPropagation(); setDeleteConfirm({ type: "single", id }); }}
              onTogglePin={(id) => togglePin.mutate(id)} onSaveNote={(id, text) => saveNote.mutate({ id, text })}
              searchQuery={search} sessionNames={sessionNames}
            />
          ))}
        </div>
      )}

      </>
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={(open) => { if (!open) setDeleteConfirm(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-400" />
              {deleteConfirm?.type === "all"
                ? `Delete all ${stats?.totalCount ?? 0} sessions?`
                : deleteConfirm?.type === "bulk"
                ? `Delete ${selected.size} session(s)?`
                : "Delete session?"}
            </DialogTitle>
            <DialogDescription>
              {deleteConfirm?.type === "all"
                ? `All session files will be moved to trash${sessions.filter(s => s.isPinned).length > 0 ? ` (${sessions.filter(s => s.isPinned).length} pinned session${sessions.filter(s => s.isPinned).length !== 1 ? "s" : ""} will be kept)` : ""}. You can undo this immediately after.`
                : "Session files will be moved to trash. You can undo this immediately after."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}


function SessionCard({
  session: s,
  index: i,
  isSelected,
  isExpanded,
  copiedId,
  detail,
  onToggleSelect,
  onToggleExpand,
  onCopyId,
  onCopyResume,
  onOpenFolder,
  onDelete,
  onTogglePin,
  onSaveNote,
  searchQuery,
  sessionNames,
}: {
  session: SessionData;
  index: number;
  isSelected: boolean;
  isExpanded: boolean;
  copiedId: string | null;
  detail?: any;
  onToggleSelect: (id: string, e: React.MouseEvent) => void;
  onToggleExpand: (id: string) => void;
  onCopyId: (id: string, e: React.MouseEvent) => void;
  onCopyResume: (id: string, e: React.MouseEvent) => void;
  onOpenFolder: (filePath: string, e: React.MouseEvent) => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
  onTogglePin?: (id: string) => void;
  onSaveNote?: (id: string, text: string) => void;
  searchQuery?: string;
  sessionNames?: Record<string, string>;
}) {
  const resumeCopied = copiedId === "resume:" + s.id;
  const [noteText, setNoteText] = useState(s.note || "");
  const [editingNote, setEditingNote] = useState(false);

  return (
    <Card
      data-session-id={s.id}
      className={`group card-hover animate-fade-in-up cursor-pointer ${s.isEmpty ? "opacity-50" : ""} ${isSelected ? "ring-1 ring-blue-500/50" : ""}`}
      style={{ animationDelay: `${i * 30}ms` }}
      onClick={() => onToggleExpand(s.id)}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {/* Checkbox */}
          <input
            type="checkbox"
            checked={isSelected}
            onClick={(e) => onToggleSelect(s.id, e)}
            onChange={() => {}}
            className="mt-1.5 h-4 w-4 rounded border-border accent-blue-500 cursor-pointer"
          />

          {/* Active indicator */}
          {s.isActive && (
            <span className="mt-2 w-2.5 h-2.5 rounded-full bg-green-500 pulse-ring flex-shrink-0" style={{ color: "#22c55e40" }} />
          )}

          {/* Row number */}
          <span className="text-xs font-mono text-muted-foreground/50 mt-1.5 w-6 text-right flex-shrink-0">
            #{i + 1}
          </span>

          {/* Main content — display name is primary, slug is secondary */}
          <div className="flex-1 min-w-0">
            {/* Session title: custom name > slug > first message > empty label */}
            {sessionNames?.[s.id] || s.firstMessage || s.slug ? (
              <p className="text-sm font-medium line-clamp-1">
                <HighlightText
                  text={getSessionDisplayName(s.id, { customNames: sessionNames, slug: s.slug, firstMessage: s.firstMessage })}
                  query={searchQuery || ""}
                />
              </p>
            ) : (
              <p className="text-sm text-muted-foreground/50 italic">(empty session)</p>
            )}
            {/* Meta line: time + slug */}
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="text-[11px] text-muted-foreground font-mono whitespace-nowrap">
                {relativeTime(s.lastTs)}
              </span>
              <span className="text-muted-foreground/30 text-[11px]">/</span>
              <button
                className="text-[10px] text-muted-foreground/40 font-mono hover:text-blue-400 transition-colors"
                onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(s.id); onCopyId(s.id, e); }}
                title="Click to copy UUID"
              >{s.id}</button>
              {s.slug && (
                <>
                  <span className="text-muted-foreground/30 text-[11px]">/</span>
                  <span className="text-[11px] text-muted-foreground/60 font-mono truncate max-w-[180px]"><HighlightText text={s.slug} query={searchQuery || ""} /></span>
                </>
              )}
              {s.hasSummary && (
                <>
                  <span className="text-muted-foreground/30 text-[11px]">/</span>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-purple-500/30 text-purple-400">
                    <Sparkles className="h-2.5 w-2.5 mr-0.5" />AI
                  </Badge>
                  {s.summaryTopics && s.summaryTopics.length > 0 && s.summaryTopics.slice(0, 3).map(t => (
                    <Badge key={t} variant="outline" className="text-[10px] px-1.5 py-0 border-purple-500/20 text-purple-300/70">{t}</Badge>
                  ))}
                </>
              )}
              {s.note && (
                <>
                  <span className="text-muted-foreground/30 text-[11px]">/</span>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-yellow-500/30 text-yellow-400">
                    <StickyNote className="h-2.5 w-2.5 mr-0.5" />Note
                  </Badge>
                </>
              )}
            </div>
          </div>

          {/* Right side stats */}
          <div className="text-right flex-shrink-0 space-y-0.5">
            <div className="text-xs font-mono text-muted-foreground tabular-nums">
              {s.messageCount} msgs
            </div>
            <div className="text-xs font-mono text-muted-foreground tabular-nums">
              {formatBytes(s.sizeBytes)}
            </div>
          </div>

          {/* Pin indicator (clickable) */}
          {s.isPinned && onTogglePin && (
            <button onClick={(e) => { e.stopPropagation(); onTogglePin(s.id); }} className="flex-shrink-0 mt-1.5 hover:opacity-70" title="Unpin">
              <Pin className="h-3.5 w-3.5 text-amber-400" />
            </button>
          )}

          {/* Hover actions — hidden on mobile, visible on md+ hover */}
          <div className="hidden md:flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
            {onTogglePin && !s.isPinned && (
              <button
                onClick={(e) => { e.stopPropagation(); onTogglePin(s.id); }}
                className="p-1.5 rounded hover:bg-amber-500/10 transition-colors"
                title="Pin"
              >
                <Pin className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            )}
            <button
              onClick={(e) => onCopyResume(s.id, e)}
              className="p-1.5 rounded hover:bg-green-500/10 transition-colors"
              title="Copy resume command"
            >
              {resumeCopied ? (
                <Check className="h-3.5 w-3.5 text-green-400" />
              ) : (
                <Terminal className="h-3.5 w-3.5 text-green-400" />
              )}
            </button>
            <button
              onClick={(e) => onOpenFolder(s.filePath, e)}
              className="p-1.5 rounded hover:bg-accent transition-colors"
              title="Open folder"
            >
              <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
            <button
              onClick={(e) => onCopyId(s.id, e)}
              className="p-1.5 rounded hover:bg-accent transition-colors"
              title="Copy UUID"
            >
              {copiedId === s.id ? (
                <Check className="h-3.5 w-3.5 text-green-400" />
              ) : (
                <Copy className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </button>
            <button
              onClick={(e) => onDelete(s.id, e)}
              className="p-1.5 rounded hover:bg-red-500/10 transition-colors"
              title="Delete session"
            >
              <Trash2 className="h-3.5 w-3.5 text-red-400" />
            </button>
          </div>

          {/* Expand indicator */}
          <div className="mt-1.5 flex-shrink-0">
            {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground/50" /> : <ChevronRight className="h-4 w-4 text-muted-foreground/50" />}
          </div>
        </div>

        {/* Expanded detail */}
        {isExpanded && (
          <div className="mt-4 pt-4 border-t border-border/50 space-y-4">
            {/* Full first message */}
            {s.firstMessage && (
              <div>
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">First Message</span>
                <p className="text-sm mt-1 text-muted-foreground leading-relaxed">{s.firstMessage.slice(0, 500)}</p>
              </div>
            )}

            {/* Metadata grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div>
                <span className="text-muted-foreground/60">UUID</span>
                <div className="flex items-center gap-1 mt-0.5">
                  <code className="font-mono text-muted-foreground truncate">{s.id}</code>
                  <button onClick={(e) => onCopyId(s.id, e)} className="p-0.5 rounded hover:bg-accent">
                    {copiedId === s.id ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
                  </button>
                </div>
              </div>
              <div>
                <span className="text-muted-foreground/60">Slug</span>
                <p className="font-mono mt-0.5">{s.slug || "-"}</p>
              </div>
              <div>
                <span className="text-muted-foreground/60">First</span>
                <p className="font-mono mt-0.5">{s.firstTs ? new Date(s.firstTs).toLocaleString() : "-"}</p>
              </div>
              <div>
                <span className="text-muted-foreground/60">Last</span>
                <p className="font-mono mt-0.5">{s.lastTs ? new Date(s.lastTs).toLocaleString() : "-"}</p>
              </div>
              <div>
                <span className="text-muted-foreground/60">Size</span>
                <p className="font-mono mt-0.5">{formatBytes(s.sizeBytes)}</p>
              </div>
              <div>
                <span className="text-muted-foreground/60">Messages</span>
                <p className="font-mono mt-0.5">{s.messageCount}</p>
              </div>
              <div>
                <span className="text-muted-foreground/60">Git Branch</span>
                <p className="font-mono mt-0.5">{s.gitBranch || "-"}</p>
              </div>
              <div>
                <span className="text-muted-foreground/60">Version</span>
                <p className="font-mono mt-0.5">{s.version || "-"}</p>
              </div>
            </div>

            {/* Resume command */}
            <div>
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Resume Command</span>
              <div className="flex items-center gap-2 mt-1">
                <code className="text-xs font-mono bg-muted px-3 py-1.5 rounded flex-1">claude --resume {s.id}</code>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={(e) => onCopyResume(s.id, e)}>
                  {resumeCopied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
                  {resumeCopied ? "Copied" : "Copy"}
                </Button>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={(e) => onOpenFolder(s.filePath, e)}>
                <FolderOpen className="h-3.5 w-3.5" /> Open Folder
              </Button>
              <Button variant="destructive" size="sm" className="gap-1.5" onClick={(e) => onDelete(s.id, e)}>
                <Trash2 className="h-3.5 w-3.5" /> Delete Session
              </Button>
            </div>

            {/* AI Summary */}
            {s.hasSummary && <SessionSummarySection sessionId={s.id} />}

            {/* Note */}
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <StickyNote className="h-3.5 w-3.5 text-yellow-400" />
                <span className="text-[11px] uppercase tracking-wider text-yellow-400 font-medium">Note</span>
                {!editingNote && (
                  <button onClick={(e) => { e.stopPropagation(); setEditingNote(true); setNoteText(s.note || ""); }} className="text-[11px] text-muted-foreground hover:text-foreground">
                    {s.note ? "edit" : "+ add note"}
                  </button>
                )}
              </div>
              {s.note && !editingNote && (
                <p className="text-xs text-muted-foreground bg-yellow-500/5 border border-yellow-500/20 rounded px-3 py-2">{s.note}</p>
              )}
              {editingNote && (
                <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                  <textarea
                    value={noteText}
                    onChange={e => setNoteText(e.target.value)}
                    placeholder="Add a note about this session..."
                    className="flex-1 text-xs font-mono bg-muted/30 rounded px-3 py-2 border border-border resize-none h-16"
                    autoFocus
                  />
                  <div className="flex flex-col gap-1">
                    <Button size="sm" onClick={() => { if (onSaveNote) onSaveNote(s.id, noteText); setEditingNote(false); }}>Save</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingNote(false)}>Cancel</Button>
                  </div>
                </div>
              )}
            </div>

            {/* Cost + Commits + Diffs */}
            <SessionCostCommits sessionId={s.id} />
            <SessionDiffsViewer sessionId={s.id} />

            {/* Message timeline */}
            {detail?.records && detail.records.length > 0 && (
              <div>
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Message Timeline</span>
                <div className="mt-2 space-y-1.5 max-h-60 overflow-auto">
                  {detail.records.slice(0, 10).map((r: any, idx: number) => (
                    <div key={idx} className="flex items-start gap-2 text-xs">
                      <Badge
                        variant="outline"
                        className={`text-[10px] px-1.5 py-0 flex-shrink-0 mt-0.5 ${
                          r.role === "user" ? "border-blue-500/30 text-blue-400" : "border-green-500/30 text-green-400"
                        }`}
                      >
                        {r.role || r.type}
                      </Badge>
                      <span className="text-muted-foreground/50 font-mono flex-shrink-0 w-14">
                        {r.timestamp ? new Date(r.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
                      </span>
                      <span className="text-muted-foreground line-clamp-1">{r.contentPreview || "(no content)"}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const outcomeColors: Record<string, string> = {
  completed: "border-green-500/30 text-green-400",
  abandoned: "border-amber-500/30 text-amber-400",
  ongoing: "border-blue-500/30 text-blue-400",
  error: "border-red-500/30 text-red-400",
};

function SessionSummarySection({ sessionId }: { sessionId: string }) {
  const { data: summary } = useSessionSummary(sessionId);

  if (!summary) return null;

  return (
    <div className="rounded-lg border border-purple-500/20 bg-purple-500/5 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Sparkles className="h-3.5 w-3.5 text-purple-400" />
        <span className="text-[11px] uppercase tracking-wider text-purple-400 font-medium">AI Summary</span>
        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${outcomeColors[summary.outcome] || "border-border text-muted-foreground"}`}>
          {summary.outcome}
        </Badge>
      </div>
      <p className="text-sm text-muted-foreground leading-relaxed">{summary.summary}</p>
      {summary.topics.length > 0 && (
        <div className="flex gap-1 flex-wrap">
          {summary.topics.map(t => (
            <Badge key={t} variant="outline" className="text-[10px] px-1.5 py-0 border-purple-500/20 text-purple-300/80">{t}</Badge>
          ))}
        </div>
      )}
      {summary.toolsUsed.length > 0 && (
        <div className="text-[11px] text-muted-foreground/60">
          Tools: {summary.toolsUsed.join(", ")}
        </div>
      )}
      {summary.filesModified.length > 0 && (
        <div className="text-[11px] text-muted-foreground/60">
          Files: {summary.filesModified.slice(0, 5).map(f => f.split("/").pop()).join(", ")}{summary.filesModified.length > 5 ? ` +${summary.filesModified.length - 5} more` : ""}
        </div>
      )}
    </div>
  );
}

function SessionCostCommits({ sessionId }: { sessionId: string }) {
  const { data: cost } = useSessionCost(sessionId);
  const { data: commitsData } = useSessionCommits(sessionId);
  const commits = commitsData?.commits || [];

  if (!cost && commits.length === 0) return null;

  return (
    <div className="space-y-2">
      {cost && cost.estimatedCostUsd > 0 && (
        <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-3">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="h-3.5 w-3.5 text-green-400" />
            <span className="text-[11px] uppercase tracking-wider text-green-400 font-medium">Session Cost</span>
            <span className="text-sm font-mono font-bold text-green-400 ml-auto">{formatUsd(cost.estimatedCostUsd)}</span>
          </div>
          <div className="flex gap-4 text-[11px] text-muted-foreground">
            <span>Input: {formatTokens(cost.inputTokens)}</span>
            <span>Output: {formatTokens(cost.outputTokens)}</span>
            {cost.cacheReadTokens > 0 && <span>Cache read: {formatTokens(cost.cacheReadTokens)}</span>}
            <span>Models: {cost.models.join(", ")}</span>
          </div>
        </div>
      )}
      {commits.length > 0 && (
        <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3">
          <div className="flex items-center gap-2 mb-1">
            <GitCommit className="h-3.5 w-3.5 text-cyan-400" />
            <span className="text-[11px] uppercase tracking-wider text-cyan-400 font-medium">Linked Commits ({commits.length})</span>
          </div>
          <div className="space-y-1">
            {commits.map(c => (
              <div key={c.hash} className="flex items-center gap-2 text-xs">
                <code className="font-mono text-cyan-400/70">{c.hash.slice(0, 7)}</code>
                <span className="text-muted-foreground truncate flex-1">{c.message}</span>
                <span className="text-muted-foreground/50 flex-shrink-0">{c.filesChanged} files</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SessionDiffsViewer({ sessionId }: { sessionId: string }) {
  const [showDiffs, setShowDiffs] = useState(false);
  const { data } = useSessionDiffs(showDiffs ? sessionId : undefined);

  return (
    <div>
      <button
        onClick={() => setShowDiffs(!showDiffs)}
        className="text-[11px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
      >
        <FileText className="h-3 w-3" />
        {showDiffs ? "Hide" : "Show"} file changes {data ? `(${data.totalDiffs})` : ""}
      </button>
      {showDiffs && data && data.diffs.length > 0 && (
        <div className="mt-2 space-y-2 max-h-80 overflow-auto">
          {data.diffs.map((d, i) => (
            <div key={i} className="rounded border border-border/50 p-2 text-xs">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="outline" className={`text-[9px] px-1 py-0 ${d.tool === "Write" ? "border-green-500/20 text-green-400" : "border-amber-500/20 text-amber-400"}`}>
                  {d.tool}
                </Badge>
                <span className="font-mono text-muted-foreground truncate">{d.filePath.split("/").pop()}</span>
                <span className="text-muted-foreground/40 text-[10px] ml-auto">{d.timestamp ? new Date(d.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}</span>
              </div>
              {d.tool === "Edit" && d.oldString && d.newString && (
                <div className="font-mono text-[11px] space-y-1">
                  <pre className="bg-red-500/10 text-red-300 rounded px-2 py-1 overflow-x-auto whitespace-pre-wrap max-h-20">- {d.oldString.slice(0, 200)}</pre>
                  <pre className="bg-green-500/10 text-green-300 rounded px-2 py-1 overflow-x-auto whitespace-pre-wrap max-h-20">+ {d.newString.slice(0, 200)}</pre>
                </div>
              )}
              {d.tool === "Write" && d.content && (
                <pre className="font-mono text-[11px] bg-green-500/10 text-green-300 rounded px-2 py-1 overflow-x-auto whitespace-pre-wrap max-h-20">{d.content.slice(0, 300)}</pre>
              )}
            </div>
          ))}
        </div>
      )}
      {showDiffs && data && data.diffs.length === 0 && (
        <p className="text-[11px] text-muted-foreground mt-1">No file changes found in this session</p>
      )}
    </div>
  );
}

function DeepSearchCard({
  match,
  index,
  searchQuery,
  isExpanded,
  onToggleExpand,
  onCopyResume,
  copiedId,
}: {
  match: DeepSearchMatch;
  index: number;
  searchQuery: string;
  isExpanded: boolean;
  onToggleExpand: (id: string) => void;
  onCopyResume: (id: string, e: React.MouseEvent) => void;
  copiedId: string | null;
}) {
  const s = match.session;
  const resumeCopied = copiedId === "resume:" + s.id;

  return (
    <Card
      className="group card-hover animate-fade-in-up cursor-pointer"
      style={{ animationDelay: `${index * 30}ms` }}
      onClick={() => onToggleExpand(s.id)}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <span className="text-xs font-mono text-muted-foreground/50 mt-1.5 w-6 text-right flex-shrink-0">
            #{index + 1}
          </span>

          <div className="flex-1 min-w-0 space-y-2">
            {/* Session title */}
            <div className="flex items-center gap-2">
              {s.firstMessage ? (
                <p className="text-sm font-medium line-clamp-1 flex-1"><HighlightText text={s.firstMessage} query={searchQuery} /></p>
              ) : (
                <p className="text-sm text-muted-foreground/50 italic flex-1">(empty session)</p>
              )}
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-purple-500/30 text-purple-400 flex-shrink-0">
                {match.matchCount} match{match.matchCount !== 1 ? "es" : ""}
              </Badge>
            </div>

            {/* Match snippets (show up to 3) */}
            <div className="space-y-1">
              {match.matches.slice(0, 3).map((m, idx) => (
                <div key={idx} className="flex items-start gap-2 text-xs">
                  <Badge
                    variant="outline"
                    className={`text-[10px] px-1.5 py-0 flex-shrink-0 mt-0.5 ${
                      m.role === "user" ? "border-blue-500/30 text-blue-400" : "border-green-500/30 text-green-400"
                    }`}
                  >
                    {m.role}
                  </Badge>
                  <span className="text-muted-foreground line-clamp-2">
                    <HighlightText text={m.text} query={searchQuery} />
                  </span>
                </div>
              ))}
              {match.matches.length > 3 && (
                <span className="text-[11px] text-muted-foreground/50">+{match.matches.length - 3} more matches</span>
              )}
            </div>

            {/* Meta line */}
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-mono">
              <span>{relativeTime(s.lastTs)}</span>
              <span className="text-muted-foreground/30">/</span>
              <span>{s.messageCount} msgs</span>
              <span className="text-muted-foreground/30">/</span>
              <span>{formatBytes(s.sizeBytes)}</span>
              {s.hasSummary && (
                <>
                  <span className="text-muted-foreground/30">/</span>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-purple-500/30 text-purple-400">
                    <Sparkles className="h-2.5 w-2.5 mr-0.5" />AI
                  </Badge>
                </>
              )}
            </div>
          </div>

          {/* Hover actions — hidden on mobile, visible on md+ hover */}
          <div className="hidden md:flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
            <button
              onClick={(e) => onCopyResume(s.id, e)}
              className="p-1.5 rounded hover:bg-green-500/10 transition-colors"
              title="Copy resume command"
            >
              {resumeCopied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Terminal className="h-3.5 w-3.5 text-green-400" />}
            </button>
          </div>

          <div className="mt-1.5 flex-shrink-0">
            {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground/50" /> : <ChevronRight className="h-4 w-4 text-muted-foreground/50" />}
          </div>
        </div>

        {/* Expanded: show all matches + summary */}
        {isExpanded && (
          <div className="mt-4 pt-4 border-t border-border/50 space-y-4">
            {/* All matches */}
            <div>
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">All Matches</span>
              <div className="mt-2 space-y-1.5 max-h-60 overflow-auto">
                {match.matches.map((m, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-xs">
                    <Badge
                      variant="outline"
                      className={`text-[10px] px-1.5 py-0 flex-shrink-0 mt-0.5 ${
                        m.role === "user" ? "border-blue-500/30 text-blue-400" : "border-green-500/30 text-green-400"
                      }`}
                    >
                      {m.role}
                    </Badge>
                    <span className="text-muted-foreground">
                      <HighlightText text={m.text} query={searchQuery} />
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Summary */}
            {s.hasSummary && <SessionSummarySection sessionId={s.id} />}

            {/* Actions */}
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" className="gap-1.5" onClick={(e) => onCopyResume(s.id, e)}>
                {resumeCopied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Terminal className="h-3.5 w-3.5" />}
                {resumeCopied ? "Copied" : "Resume"}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
