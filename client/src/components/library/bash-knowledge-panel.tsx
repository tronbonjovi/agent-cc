import { useState } from "react";
import { useBashKnowledge, useBashSearch } from "@/hooks/use-sessions";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { TerminalSquare } from "lucide-react";

export function BashKnowledgePanel() {
  const { data } = useBashKnowledge();
  const [bashSearch, setBashSearch] = useState("");
  if (!data) return null;

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-medium flex items-center gap-2">
        <TerminalSquare className="h-4 w-4 text-green-400" /> Bash Knowledge Base
        <span className="text-[11px] text-muted-foreground font-normal">({data.uniqueCommands} unique, {data.totalExecutions} total)</span>
      </h2>
      <div className="flex gap-2 flex-wrap">
        {Object.entries(data.byCategory).sort((a, b) => b[1].count - a[1].count).map(([cat, stats]) => (
          <div key={cat} className="text-xs px-2 py-1 rounded border border-border">
            <span className="font-mono">{cat}</span>
            <span className="text-muted-foreground/50 ml-1">{stats.count}x</span>
            <span className={`ml-1 ${stats.successRate >= 90 ? "text-green-400" : stats.successRate >= 70 ? "text-amber-400" : "text-red-400"}`}>{stats.successRate}%</span>
          </div>
        ))}
      </div>
      <Input placeholder="Search commands..." value={bashSearch} onChange={e => setBashSearch(e.target.value)} className="text-xs" />
      {bashSearch.length >= 2 && <BashSearchResults query={bashSearch} />}
      {data.failureHotspots.length > 0 && (
        <div className="rounded-xl border bg-card p-3">
          <span className="text-[11px] text-muted-foreground/60 uppercase tracking-wider">Failure Hotspots</span>
          <div className="mt-1 space-y-1">
            {data.failureHotspots.slice(0, 5).map((f, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="text-red-400 w-8">{f.failCount}x</span>
                <code className="font-mono text-muted-foreground truncate flex-1">{f.command.slice(0, 60)}</code>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function BashSearchResults({ query }: { query: string }) {
  const { data } = useBashSearch(query);
  if (!data) return null;
  return (
    <div className="rounded-xl border bg-card p-3">
      <span className="text-[11px] text-muted-foreground/60">{data.totalMatches} matches</span>
      <div className="mt-1 space-y-1 max-h-40 overflow-auto">
        {data.matches.slice(0, 15).map((m, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <Badge variant="outline" className={`text-[9px] px-1 py-0 ${m.succeeded ? "border-green-500/20 text-green-400" : "border-red-500/20 text-red-400"}`}>
              {m.succeeded ? "OK" : "ERR"}
            </Badge>
            <code className="font-mono text-muted-foreground truncate flex-1">{m.command.slice(0, 80)}</code>
          </div>
        ))}
      </div>
    </div>
  );
}
