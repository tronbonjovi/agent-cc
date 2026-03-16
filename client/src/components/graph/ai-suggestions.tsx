import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Sparkles, Check, X, Loader2, Undo2 } from "lucide-react";
import type { CustomNode, CustomEdge } from "@shared/types";

interface AISuggestion {
  nodes: CustomNode[];
  edges: CustomEdge[];
  reasoning: string[];
}

interface Props {
  onAccepted: () => void;
}

export function AISuggestionButton({ onAccepted }: Props) {
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<AISuggestion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedNodes, setSelectedNodes] = useState<Set<string>>(new Set());
  const [selectedEdges, setSelectedEdges] = useState<Set<number>>(new Set());
  const [lastAccepted, setLastAccepted] = useState<{ nodes: CustomNode[]; edges: CustomEdge[] } | null>(null);
  const [undoing, setUndoing] = useState(false);

  const fetchSuggestions = async () => {
    setLoading(true);
    setError(null);
    setSuggestions(null);

    try {
      const resp = await fetch("/api/graph/ai-suggest", { method: "POST" });
      if (!resp.ok) {
        const data = await resp.json();
        throw new Error(data.message || "Failed to get suggestions");
      }
      const data = await resp.json() as AISuggestion;
      setSuggestions(data);
      setSelectedNodes(new Set(data.nodes.map((n) => n.id)));
      setSelectedEdges(new Set(data.edges.map((_, i) => i)));
      setOpen(true);
    } catch (err: any) {
      setError(err.message || "Failed to get AI suggestions");
    } finally {
      setLoading(false);
    }
  };

  const acceptSelected = async () => {
    if (!suggestions) return;

    const nodes = suggestions.nodes.filter((n) => selectedNodes.has(n.id));
    const edges = suggestions.edges.filter((_, i) => selectedEdges.has(i));

    try {
      await fetch("/api/graph/ai-suggest/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodes, edges }),
      });
      setLastAccepted({ nodes, edges });
      setSuggestions(null);
      setOpen(false);
      onAccepted();
    } catch {
      setError("Failed to save suggestions");
    }
  };

  const undoAccepted = useCallback(async () => {
    if (!lastAccepted) return;
    setUndoing(true);
    try {
      // Delete each accepted node and edge
      for (const node of lastAccepted.nodes) {
        await fetch(`/api/graph/custom-nodes/${encodeURIComponent(node.id)}`, { method: "DELETE" });
      }
      for (const edge of lastAccepted.edges) {
        await fetch(`/api/graph/custom-edges/${encodeURIComponent(edge.id)}`, { method: "DELETE" });
      }
      setLastAccepted(null);
      onAccepted();
    } catch {
      setError("Failed to undo");
    } finally {
      setUndoing(false);
    }
  }, [lastAccepted, onAccepted]);

  const toggleNode = (id: string) => {
    setSelectedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleEdge = (idx: number) => {
    setSelectedEdges((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const totalSelected = suggestions ? selectedNodes.size + selectedEdges.size : 0;
  const totalItems = suggestions ? suggestions.nodes.length + suggestions.edges.length : 0;

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 text-xs gap-1"
        onClick={fetchSuggestions}
        disabled={loading}
        title="AI-assisted graph suggestions"
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Sparkles className="h-3.5 w-3.5 text-amber-400" />
        )}
        {loading ? "Analyzing..." : "AI Suggest"}
      </Button>

      {loading && (
        <span className="text-[10px] text-muted-foreground animate-pulse">This may take a minute</span>
      )}

      {error && (
        <span className="text-[10px] text-red-400">{error}</span>
      )}

      {/* Undo button — shown after accepting */}
      {lastAccepted && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs gap-1 text-amber-400"
          onClick={undoAccepted}
          disabled={undoing}
          title="Undo last AI suggestions"
        >
          <Undo2 className="h-3.5 w-3.5" />
          Undo
        </Button>
      )}

      {/* Suggestions panel as Sheet (slides from right) */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-[400px] sm:w-[440px] flex flex-col p-0">
          <SheetHeader className="px-6 pt-6 pb-4 border-b border-border/50 shrink-0">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-400" />
              <SheetTitle className="text-base">AI Suggestions</SheetTitle>
            </div>
            <SheetDescription className="text-xs">
              {totalItems} suggestions found. Select the ones you want to add to your graph.
            </SheetDescription>
            {/* Select all / none */}
            <div className="flex gap-2 mt-2">
              <Button
                size="sm" variant="outline" className="text-xs h-6 px-2"
                onClick={() => {
                  if (!suggestions) return;
                  setSelectedNodes(new Set(suggestions.nodes.map((n) => n.id)));
                  setSelectedEdges(new Set(suggestions.edges.map((_, i) => i)));
                }}
              >Select all</Button>
              <Button
                size="sm" variant="outline" className="text-xs h-6 px-2"
                onClick={() => { setSelectedNodes(new Set()); setSelectedEdges(new Set()); }}
              >Select none</Button>
            </div>
          </SheetHeader>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {suggestions && suggestions.nodes.length > 0 && (
              <div className="mb-5">
                <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
                  Nodes ({suggestions.nodes.length})
                </div>
                <div className="space-y-1">
                  {suggestions.nodes.map((node) => (
                    <label
                      key={node.id}
                      className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-accent/50 cursor-pointer border border-transparent hover:border-border/50"
                    >
                      <input
                        type="checkbox"
                        checked={selectedNodes.has(node.id)}
                        onChange={() => toggleNode(node.id)}
                        className="h-3.5 w-3.5 rounded shrink-0"
                      />
                      <div
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: node.color || "#f59e0b" }}
                      />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm truncate block">{node.label}</span>
                        {node.description && (
                          <span className="text-[10px] text-muted-foreground line-clamp-2">{node.description}</span>
                        )}
                      </div>
                      <Badge variant="outline" className="text-[9px] shrink-0">{node.subType}</Badge>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {suggestions && suggestions.edges.length > 0 && (
              <div className="mb-5">
                <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
                  Edges ({suggestions.edges.length})
                </div>
                <div className="space-y-1">
                  {suggestions.edges.map((edge, i) => (
                    <label
                      key={i}
                      className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-accent/50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedEdges.has(i)}
                        onChange={() => toggleEdge(i)}
                        className="h-3.5 w-3.5 rounded shrink-0"
                      />
                      <span className="text-xs text-muted-foreground truncate flex-1">
                        {edge.source} → {edge.target}
                      </span>
                      <Badge variant="outline" className="text-[9px] shrink-0">{edge.label}</Badge>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {suggestions && suggestions.reasoning.length > 0 && (
              <div className="border-t border-border/50 pt-3">
                <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2">Reasoning</div>
                <ul className="space-y-1">
                  {suggestions.reasoning.map((r, i) => (
                    <li key={i} className="text-xs text-muted-foreground leading-relaxed">{r}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Fixed footer */}
          <div className="flex gap-2 px-6 py-4 border-t border-border/50 shrink-0">
            <Button className="flex-1 gap-1.5" onClick={acceptSelected} disabled={totalSelected === 0}>
              <Check className="h-4 w-4" />
              Accept{totalSelected > 0 ? ` (${totalSelected})` : ""}
            </Button>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Dismiss
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
