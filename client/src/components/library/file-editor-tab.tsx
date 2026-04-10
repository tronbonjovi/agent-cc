import { makeRelativePath } from "@/hooks/use-entities";
import { useMarkdownFiles, useContextSummary } from "@/hooks/use-markdown";
import { useRuntimeConfig } from "@/hooks/use-config";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useState, useMemo } from "react";
import {
  AlertTriangle, HelpCircle, ChevronDown, ChevronRight,
  CheckCircle, Clipboard, Check, Wrench, Zap, Link2,
  CircleDot, Eye, Layers,
} from "lucide-react";
import MemoryDiagram from "@/components/memory-diagram";

// ── Memory Health Analysis ──────────────────────────────────────────────────

interface MemoryHealth {
  status: "healthy" | "attention" | "issues";
  label: string;
  issues: string[];
  noFrontmatter: Array<{ name: string; path: string }>;
  memoryMdLines: number;
  memoryMdMissing: boolean;
  overSized: Array<{ name: string; lines: number }>;
  staleFiles: Array<{ name: string; daysOld: number; path: string }>;
  totalLines: number;
  fileCount: number;
}

export function analyzeMemoryHealth(files: any[], homeDir: string | null): MemoryHealth {
  const memFiles = files.filter(f => f.data.category === "memory");
  const claudeMdFiles = files.filter(f => f.data.category === "claude-md");
  const memoryMdFiles = memFiles.filter(f => f.name === "MEMORY.md");
  const memoryOther = memFiles.filter(f => f.name !== "MEMORY.md");

  const noFrontmatter = memoryOther.filter(f => !f.data.frontmatter).map(f => ({ name: f.name, path: makeRelativePath(f.path, homeDir) }));
  const memoryMd = memoryMdFiles[0];
  const memoryMdLines = memoryMd?.data.lineCount || 0;
  const memoryMdMissing = memoryMdFiles.length === 0;
  const overSized = memoryOther.filter(f => (f.data.lineCount || 0) > 150).map(f => ({ name: f.name, lines: f.data.lineCount || 0 }));
  const staleFiles = memoryOther.filter(f => {
    if (!f.lastModified) return false;
    return Math.floor((Date.now() - new Date(f.lastModified).getTime()) / 86400000) > 60;
  }).map(f => ({ name: f.name, daysOld: Math.floor((Date.now() - new Date(f.lastModified).getTime()) / 86400000), path: makeRelativePath(f.path, homeDir) }));

  const totalMemLines = memFiles.reduce((s, f) => s + (f.data.lineCount || 0), 0);
  const totalClaudeLines = claudeMdFiles.reduce((s, f) => s + (f.data.lineCount || 0), 0);
  const totalLines = totalMemLines + totalClaudeLines;

  const issues: string[] = [];
  if (memoryMdMissing) issues.push("MEMORY.md index file is missing");
  if (memoryMdLines > 150) issues.push(`MEMORY.md is ${memoryMdLines}/200 lines (near limit)`);
  if (noFrontmatter.length > 0) issues.push(`${noFrontmatter.length} file${noFrontmatter.length > 1 ? "s" : ""} missing frontmatter`);
  if (overSized.length > 0) issues.push(`${overSized.length} file${overSized.length > 1 ? "s" : ""} over 150 lines`);
  if (staleFiles.length > 0) issues.push(`${staleFiles.length} file${staleFiles.length > 1 ? "s" : ""} older than 60 days`);
  if (totalLines > 1500) issues.push(`Total ${totalLines} always-loaded lines (high)`);

  const status = issues.length === 0 ? "healthy" : issues.length <= 2 ? "attention" : "issues";
  const label = status === "healthy"
    ? `${memoryOther.length} files, ${totalMemLines} lines, MEMORY.md ${memoryMdLines}/200`
    : issues.join(" · ");

  return { status, label, issues, noFrontmatter, memoryMdLines, memoryMdMissing, overSized, staleFiles, totalLines, fileCount: memoryOther.length };
}

function generateFixPrompt(health: MemoryHealth): string {
  if (health.issues.length === 0) return "";
  const parts: string[] = ["Review and organize my Claude Code memory files. Here's what needs attention:\n"];
  let n = 1;
  if (health.noFrontmatter.length > 0) {
    parts.push(`${n}. These files are missing frontmatter:`);
    for (const f of health.noFrontmatter) parts.push(`   - ${f.path}`);
    parts.push("   Add appropriate frontmatter to each.\n"); n++;
  }
  if (health.memoryMdMissing) { parts.push(`${n}. MEMORY.md index file is missing. Create one.\n`); n++; }
  if (health.memoryMdLines > 150) { parts.push(`${n}. MEMORY.md is ${health.memoryMdLines} lines (limit 200). Trim it.\n`); n++; }
  if (health.overSized.length > 0) {
    parts.push(`${n}. Files over 150 lines:`);
    for (const f of health.overSized) parts.push(`   - ${f.name} (${f.lines} lines)`);
    parts.push("   Review and trim.\n"); n++;
  }
  if (health.staleFiles.length > 0) {
    parts.push(`${n}. Files older than 60 days:`);
    for (const f of health.staleFiles) parts.push(`   - ${f.name} (${f.daysOld} days old)`);
    parts.push("   Check if still relevant.\n"); n++;
  }
  parts.push("After cleanup, verify MEMORY.md is under 100 lines and all files have frontmatter.");
  return parts.join("\n");
}

// ── Fix It Modal ────────────────────────────────────────────────────────────

function FixItModal({ open, onClose, health }: { open: boolean; onClose: () => void; health: MemoryHealth }) {
  const [copied, setCopied] = useState(false);
  const prompt = useMemo(() => generateFixPrompt(health), [health]);
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Wrench className="h-5 w-5 text-amber-400" />Get Organized</DialogTitle></DialogHeader>
        <div className="flex-1 overflow-auto p-4 space-y-4">
          {health.issues.length === 0 ? (
            <div className="text-center py-8"><CheckCircle className="h-10 w-10 text-green-400 mx-auto mb-3" /><p className="text-sm font-medium">Well-organized</p></div>
          ) : (
            <>
              <div className="space-y-1">
                <p className="text-sm font-medium">Issues ({health.issues.length})</p>
                {health.issues.map((issue, i) => (<div key={i} className="flex items-center gap-2 text-xs text-amber-400"><AlertTriangle className="h-3 w-3 flex-shrink-0" />{issue}</div>))}
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-2">Paste into Claude Code:</p>
                <div className="relative">
                  <pre className="bg-muted/50 rounded-lg p-4 text-xs font-mono whitespace-pre-wrap max-h-60 overflow-auto border border-border/50">{prompt}</pre>
                  <Button size="sm" variant="outline" className="absolute top-2 right-2 gap-1.5" onClick={() => { navigator.clipboard.writeText(prompt); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
                    {copied ? <Check className="h-3 w-3 text-green-400" /> : <Clipboard className="h-3 w-3" />}{copied ? "Copied" : "Copy"}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Memory Learn Guide ──────────────────────────────────────────────────────

function MemoryLearnGuide({ show, onToggle }: { show: boolean; onToggle: () => void }) {
  return (
    <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5">
      <button onClick={onToggle} className="w-full flex items-center gap-2 px-4 py-3 text-sm font-medium text-cyan-400 hover:text-cyan-300 transition-colors">
        <HelpCircle className="h-4 w-4" />How Claude Code Memory Works
        {show ? <ChevronDown className="h-3.5 w-3.5 ml-auto" /> : <ChevronRight className="h-3.5 w-3.5 ml-auto" />}
      </button>
      {show && (
        <div className="px-4 pb-4 space-y-4 text-sm border-t border-cyan-500/10 pt-3">
          <div className="rounded-lg border border-border/30 bg-muted/20 p-2">
            <p className="text-[10px] text-muted-foreground/60 text-center mb-1">Hover for details</p>
            <MemoryDiagram />
          </div>
          <div className="border-t border-border/30 pt-3"><p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider mb-2">Reference</p></div>
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider mb-1.5">Loaded every session</h4>
            <ul className="space-y-1 text-xs text-muted-foreground">
              <li><strong className="text-foreground">CLAUDE.md</strong> — project instructions, loaded in full</li>
              <li><strong className="text-foreground">MEMORY.md</strong> — index file. <span className="text-red-400">Hard limit: 200 lines</span></li>
              <li><strong className="text-foreground">Memory files</strong> linked from MEMORY.md</li>
            </ul>
          </div>
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider mb-1.5">Memory types</h4>
            <div className="grid grid-cols-2 gap-1.5 text-xs">
              <div className="flex gap-1.5"><Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500/30 text-amber-400 flex-shrink-0">Feedback</Badge><span className="text-muted-foreground">Corrections. Prevents repeated mistakes.</span></div>
              <div className="flex gap-1.5"><Badge variant="outline" className="text-[10px] px-1.5 py-0 border-blue-500/30 text-blue-400 flex-shrink-0">Project</Badge><span className="text-muted-foreground">Ongoing work context.</span></div>
              <div className="flex gap-1.5"><Badge variant="outline" className="text-[10px] px-1.5 py-0 border-green-500/30 text-green-400 flex-shrink-0">Reference</Badge><span className="text-muted-foreground">External resources.</span></div>
              <div className="flex gap-1.5"><Badge variant="outline" className="text-[10px] px-1.5 py-0 border-purple-500/30 text-purple-400 flex-shrink-0">User</Badge><span className="text-muted-foreground">Your role, preferences.</span></div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-2">
              <p className="text-green-400 font-medium text-xs mb-1">Save</p>
              <ul className="text-muted-foreground text-[11px] space-y-0.5"><li>Decisions and why</li><li>Lessons learned</li><li>Feedback / preferences</li><li>External references</li></ul>
            </div>
            <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-2">
              <p className="text-red-400 font-medium text-xs mb-1">Don't save</p>
              <ul className="text-muted-foreground text-[11px] space-y-0.5"><li>File paths / code structure</li><li>Endpoint lists / git history</li><li>Anything already in CLAUDE.md</li></ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── File Dependency Graph ───────────────────────────────────────────────────

function buildDependencyGraph(files: any[]) {
  const edges: Array<{ source: string; target: string }> = [];
  const inboundCount = new Map<string, number>();
  const fileByName = new Map<string, string>();
  for (const f of files) fileByName.set(f.name.toLowerCase(), f.name);
  for (const f of files) {
    const links = f.data?.links as string[] | undefined;
    if (!links) continue;
    for (const link of links) {
      const targetName = link.split("/").pop()?.toLowerCase() || "";
      const target = fileByName.get(targetName);
      if (target && target !== f.name) {
        edges.push({ source: f.name, target });
        inboundCount.set(target, (inboundCount.get(target) || 0) + 1);
      }
    }
  }
  const orphans = files.filter(f => f.name !== "MEMORY.md" && !inboundCount.has(f.name)).map(f => f.name);
  const hubs = Array.from(inboundCount.entries()).filter(([, c]) => c >= 3).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  const merges: Array<{ files: string[]; reason: string }> = [];
  const memoryOther = files.filter(f => f.name !== "MEMORY.md");
  for (let i = 0; i < memoryOther.length; i++) {
    for (let j = i + 1; j < memoryOther.length; j++) {
      const a = memoryOther[i], b = memoryOther[j];
      const aWords = new Set((a.data.preview || "").toLowerCase().split(/\s+/).filter((w: string) => w.length > 4));
      const bWords = new Set((b.data.preview || "").toLowerCase().split(/\s+/).filter((w: string) => w.length > 4));
      let overlap = 0;
      Array.from(aWords).forEach(w => { if (bWords.has(w)) overlap++; });
      if (overlap >= 5 && aWords.size > 0 && bWords.size > 0 && overlap / Math.min(aWords.size, bWords.size) > 0.3) {
        merges.push({ files: [a.name, b.name], reason: `${overlap} shared keywords` });
      }
    }
  }
  return { edges, orphans, hubs, merges: merges.slice(0, 3) };
}

function FileDependencyGraph({ files }: { files: any[] }) {
  const [expanded, setExpanded] = useState(false);
  const memoryFiles = files.filter(f => f.data.category === "memory");
  const { edges, orphans, hubs, merges } = useMemo(() => buildDependencyGraph(memoryFiles), [memoryFiles]);
  if (edges.length === 0 && orphans.length === 0) return null;
  const bySource = new Map<string, string[]>();
  for (const e of edges) { if (!bySource.has(e.source)) bySource.set(e.source, []); bySource.get(e.source)!.push(e.target); }
  return (
    <div className="rounded-lg border border-border/50">
      <button onClick={() => setExpanded(!expanded)} className="w-full flex items-center gap-2 px-4 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
        <Link2 className="h-3.5 w-3.5" /><span>File Relationships</span>
        <span className="text-[10px] opacity-60">{edges.length} links · {orphans.length} orphans</span>
        {expanded ? <ChevronDown className="h-3 w-3 ml-auto" /> : <ChevronRight className="h-3 w-3 ml-auto" />}
      </button>
      {expanded && (
        <div className="px-4 pb-3 space-y-3 border-t border-border/30 pt-2">
          {hubs.length > 0 && (<div><p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider mb-1">Hubs</p><div className="flex flex-wrap gap-1.5">{hubs.map(h => (<Badge key={h.name} variant="outline" className="text-[10px] border-blue-500/30 text-blue-400 bg-blue-500/5 gap-1"><CircleDot className="h-2.5 w-2.5" />{h.name} ({h.count})</Badge>))}</div></div>)}
          <div><p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider mb-1">References</p><div className="space-y-1">{Array.from(bySource.entries()).map(([source, targets]) => (<div key={source} className="flex items-center gap-1.5 text-[11px]"><span className="font-medium text-foreground truncate max-w-[140px]">{source}</span><span className="text-muted-foreground/40">→</span><span className="text-muted-foreground truncate">{targets.join(", ")}</span></div>))}</div></div>
          {orphans.length > 0 && (<div><p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider mb-1">Orphans</p><div className="flex flex-wrap gap-1.5">{orphans.map(name => (<Badge key={name} variant="outline" className="text-[10px] border-amber-500/30 text-amber-400 bg-amber-500/5">{name}</Badge>))}</div></div>)}
          {merges.length > 0 && (<div><p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider mb-1">Merge Suggestions</p><div className="space-y-1">{merges.map((m, i) => (<div key={i} className="text-[11px] text-muted-foreground"><Layers className="h-3 w-3 inline mr-1 text-cyan-400" />{m.files.join(" + ")} <span className="opacity-60">({m.reason})</span></div>))}</div></div>)}
        </div>
      )}
    </div>
  );
}

// ── Memory Budget Meter ─────────────────────────────────────────────────────

function MemoryBudgetMeter({ files }: { files: any[] }) {
  const memFiles = files.filter(f => f.data.category === "memory");
  const memoryMd = memFiles.find(f => f.name === "MEMORY.md");
  const memoryMdLines = memoryMd?.data.lineCount || 0;
  const totalMemLines = memFiles.reduce((s, f) => s + (f.data.lineCount || 0), 0);
  const totalTokens = memFiles.reduce((s, f) => s + (f.data.tokenEstimate || 0), 0);
  const claudeMdFiles = files.filter(f => f.data.category === "claude-md");
  const totalClaudeTokens = claudeMdFiles.reduce((s, f) => s + (f.data.tokenEstimate || 0), 0);
  const pct = Math.round((memoryMdLines / 200) * 100);
  const color = pct < 50 ? "bg-green-500" : pct < 75 ? "bg-amber-500" : "bg-red-500";

  return (
    <div className="rounded-lg border border-border/50 px-4 py-2.5 space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground flex items-center gap-1.5"><Zap className="h-3 w-3" />Context Budget</span>
        <span className="font-mono tabular-nums">{memoryMdLines}/200 lines ({pct}%)</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{totalMemLines} memory lines · ~{totalTokens.toLocaleString()} tokens</span>
        <span>{claudeMdFiles.length} CLAUDE.md · ~{totalClaudeTokens.toLocaleString()} tokens</span>
      </div>
    </div>
  );
}

// ── Context Summary ─────────────────────────────────────────────────────────

function ContextSummaryPanel() {
  const [expanded, setExpanded] = useState(false);
  const { data: ctx } = useContextSummary();
  if (!ctx) return null;
  return (
    <div className="rounded-lg border border-border/50">
      <button onClick={() => setExpanded(!expanded)} className="w-full flex items-center gap-2 px-4 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
        <Eye className="h-3.5 w-3.5" /><span>What Claude Loads</span>
        <span className="text-[10px] opacity-60">{ctx.totalLines} lines · ~{ctx.totalTokens.toLocaleString()} tokens · {ctx.skillFiles.length} skills</span>
        {expanded ? <ChevronDown className="h-3 w-3 ml-auto" /> : <ChevronRight className="h-3 w-3 ml-auto" />}
      </button>
      {expanded && (
        <div className="px-4 pb-3 space-y-2 border-t border-border/30 pt-2 text-xs">
          {ctx.claudeMdFiles.length > 0 && (<div><p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider mb-1">CLAUDE.md Files</p>{ctx.claudeMdFiles.map(f => (<div key={f.name} className="flex justify-between text-[11px]"><span className="text-blue-400">{f.name}</span><span className="text-muted-foreground tabular-nums">{f.lines} lines · {f.sections} sections · ~{f.tokens} tok</span></div>))}</div>)}
          {ctx.memoryFiles.length > 0 && (<div><p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider mb-1">Memory Files ({ctx.memoryFiles.length})</p>{ctx.memoryFiles.map(f => (<div key={f.name} className="flex justify-between text-[11px]"><span className="text-purple-400">{f.name}</span><span className="text-muted-foreground tabular-nums">{f.type} · {f.lines} lines</span></div>))}</div>)}
          {ctx.skillFiles.length > 0 && (<div><p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider mb-1">Available Skills ({ctx.skillFiles.length})</p><div className="flex flex-wrap gap-1.5">{ctx.skillFiles.map((s, i) => (<Badge key={`${s.slash}-${i}`} variant="outline" className="text-[10px] border-entity-skill/30 text-entity-skill bg-entity-skill/5 font-mono">{s.slash}</Badge>))}</div></div>)}
          <div className="flex items-center gap-2 pt-1 border-t border-border/30 text-[10px] text-muted-foreground">
            <span>MEMORY.md: {ctx.memoryMdUsage.lines}/{ctx.memoryMdUsage.limit} ({ctx.memoryMdUsage.percentage}%)</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Info Tab (formerly File Editor Tab) ─────────────────────────────────────

export default function FileEditorTab() {
  const [showFixIt, setShowFixIt] = useState(false);
  const [showLearn, setShowLearn] = useState(false);
  const { data: files, isLoading } = useMarkdownFiles();
  const { data: runtimeConfig } = useRuntimeConfig();
  const homeDir = runtimeConfig?.homeDir || null;

  if (isLoading) {
    return <div className="flex items-center justify-center py-12 text-muted-foreground">Loading...</div>;
  }

  const health = analyzeMemoryHealth(files || [], homeDir);
  const colors = { healthy: "border-green-500/30 bg-green-500/5 text-green-400", attention: "border-amber-500/30 bg-amber-500/5 text-amber-400", issues: "border-red-500/30 bg-red-500/5 text-red-400" };
  const icons = { healthy: <CheckCircle className="h-3.5 w-3.5" />, attention: <AlertTriangle className="h-3.5 w-3.5" />, issues: <AlertTriangle className="h-3.5 w-3.5" /> };

  return (
    <div className="space-y-4">
      {/* 2-column grid for insight modules */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Column 1: Memory Health + Budget */}
        <div className="space-y-4">
          <button onClick={() => setShowFixIt(true)} className={`w-full flex items-center gap-2 px-4 py-2.5 rounded-lg border text-xs ${colors[health.status]}`}>
            {icons[health.status]}
            <span className="flex-1 text-left">{health.label}</span>
            {health.status === "healthy" ? <span className="text-green-400 font-medium">Healthy</span> : <span className="flex items-center gap-1"><Wrench className="h-3 w-3" /> Get Organized</span>}
          </button>
          <MemoryBudgetMeter files={files || []} />
          <FileDependencyGraph files={files || []} />
        </div>

        {/* Column 2: Context Summary + Learn Guide */}
        <div className="space-y-4">
          <ContextSummaryPanel />
          <MemoryLearnGuide show={showLearn} onToggle={() => setShowLearn(!showLearn)} />
        </div>
      </div>

      <FixItModal open={showFixIt} onClose={() => setShowFixIt(false)} health={health} />
    </div>
  );
}
