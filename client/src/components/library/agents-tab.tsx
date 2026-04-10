import { useState } from "react";
import {
  useAgentDefinitions,
  useAgentExecutions,
  useAgentExecution,
  useAgentStats,
  useCreateAgentDefinition,
} from "@/hooks/use-agents";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ListSkeleton } from "@/components/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Bot,
  MessageSquare,
  Tags,
  FileCode,
  Search,
  ChevronDown,
  ChevronRight,
  Plus,
  Info,
  HelpCircle,
  Zap,
  GitBranch,
  Package,
  ShoppingBag,
} from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { EntityCard } from "@/components/library/entity-card";
import { formatBytes, relativeTime, shortModel, getTypeColor } from "@/lib/utils";
import type { AgentDefinition, AgentExecution } from "@shared/types";

const rt = (s: string | null) => s ? relativeTime(s) : "-";

const MODEL_COLORS: Record<string, string> = {
  "claude-opus-4-6": "border-purple-500/30 text-purple-400",
  "claude-sonnet-4-6": "border-blue-500/30 text-blue-400",
  "claude-haiku-4-5-20251001": "border-green-500/30 text-green-400",
};

function getModelColor(model: string | null): string {
  if (!model) return "border-muted-foreground/30 text-muted-foreground";
  for (const [key, color] of Object.entries(MODEL_COLORS)) {
    if (model.includes(key.split("-").slice(1, 3).join("-"))) return color;
  }
  return "border-cyan-500/30 text-cyan-400";
}

export default function AgentsTab() {
  const [tab, setTab] = useState<"definitions" | "history" | "stats">("definitions");
  const [showGuide, setShowGuide] = useState(false);

  const { data: stats } = useAgentStats();

  const statCards = [
    { label: "Total Executions", value: stats?.totalExecutions ?? 0, icon: Bot, color: "text-cyan-400", tooltip: "How many times agents have been spawned across all sessions. Each time Claude Code launches a subagent (Explore, Plan, etc.), it counts as one execution." },
    { label: "Sessions w/ Agents", value: stats?.sessionsWithAgents ?? 0, icon: MessageSquare, color: "text-blue-400", tooltip: "Number of Claude Code sessions that used at least one subagent. Shows how often agent-assisted workflows are used." },
    { label: "Agent Types", value: Object.keys(stats?.byType || {}).length, icon: Tags, color: "text-purple-400", tooltip: "Distinct agent types used (e.g. Explore, Plan, general-purpose). These are the built-in subagent roles Claude Code can spawn." },
    { label: "Definitions", value: stats?.totalDefinitions ?? 0, icon: FileCode, color: "text-green-400", tooltip: "Agent definition files (.md) discovered from plugins and user agents. These define what agents are available for Claude Code to use." },
  ];

  return (
    <div className="space-y-4">
      {/* Summary line */}
      <p className="text-sm text-muted-foreground">
        {stats?.totalDefinitions ?? 0} definitions, {stats?.totalExecutions ?? 0} subagent executions across {stats?.sessionsWithAgents ?? 0} sessions
      </p>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {statCards.map((s, i) => (
          <div key={s.label} className="rounded-xl border bg-card p-4 animate-fade-in-up group relative" style={{ animationDelay: `${i * 50}ms` }}>
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground/60 font-medium">{s.label}</p>
                  <Info className="h-3 w-3 text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors cursor-help" />
                </div>
                <p className="text-2xl font-bold font-mono mt-1">{s.value}</p>
              </div>
              <div className="rounded-xl bg-muted/50 p-2.5">
                <s.icon className={`h-5 w-5 ${s.color}`} />
              </div>
            </div>
            {/* Tooltip */}
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-3 py-2 bg-popover border border-border rounded-lg shadow-lg text-xs text-muted-foreground max-w-[240px] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
              {s.tooltip}
            </div>
          </div>
        ))}
      </div>

      {/* Sub-tabs */}
      <div className="flex items-center gap-1 border-b border-border">
        {(["definitions", "history", "stats"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t
                ? "border-blue-500 text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "definitions" ? "Definitions" : t === "history" ? "History" : "Stats"}
          </button>
        ))}
      </div>

      {/* Learn guide */}
      <AgentLearnGuide show={showGuide} onToggle={() => setShowGuide(!showGuide)} />

      {/* Tab content */}
      {tab === "definitions" && <DefinitionsTab />}
      {tab === "history" && <HistoryTab />}
      {tab === "stats" && <StatsTab />}
    </div>
  );
}

const GROUP_DESCRIPTIONS: Record<string, string> = {
  "Anthropic Official": "Bundled with Claude Code's official plugin marketplace. These are specialized subagents that Claude Code can spawn for tasks like code review, architecture planning, and SDK verification. They run only when explicitly invoked by a plugin or skill — not automatically.",
  "Your Agents": "Custom agents you created. These live in ~/.claude/agents/ and can be used as subagent types in your skills and workflows.",
};

function getGroupDescription(label: string): string | undefined {
  return GROUP_DESCRIPTIONS[label];
}

/** Deduplicate agents by name — keep the one with more content (description + tools) */
function deduplicateDefinitions(defs: AgentDefinition[]): AgentDefinition[] {
  const byName = new Map<string, AgentDefinition>();
  for (const def of defs) {
    const existing = byName.get(def.name);
    if (!existing) {
      byName.set(def.name, def);
    } else {
      const score = (d: AgentDefinition) =>
        (d.description?.length || 0) + d.tools.length * 500 + (d.model && d.model !== "inherit" ? 200 : 0);
      const existingScore = score(existing);
      const newScore = score(def);
      if (newScore > existingScore) {
        byName.set(def.name, def);
      }
    }
  }
  return Array.from(byName.values());
}

/** Group definitions by marketplace / source */
function groupDefinitions(defs: AgentDefinition[]): { label: string; description?: string; defs: AgentDefinition[] }[] {
  const unique = deduplicateDefinitions(defs);
  const groups: Map<string, AgentDefinition[]> = new Map();
  for (const def of unique) {
    const key = def.marketplace || (def.source === "user" ? "Your Agents" : def.pluginName || "Other");
    const arr = groups.get(key) || [];
    arr.push(def);
    groups.set(key, arr);
  }
  return Array.from(groups.entries())
    .sort((a, b) => {
      if (a[0] === "Your Agents") return -1;
      if (b[0] === "Your Agents") return 1;
      return a[0].localeCompare(b[0]);
    })
    .map(([label, defs]) => ({
      label,
      description: getGroupDescription(label),
      defs,
    }));
}

/** Collapsible guide: How Claude Code Agents Work */
function AgentLearnGuide({ show, onToggle }: { show: boolean; onToggle: () => void }) {
  return (
    <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5">
      <button onClick={onToggle} className="w-full flex items-center gap-2 px-4 py-3 text-sm font-medium text-cyan-400 hover:text-cyan-300 transition-colors">
        <HelpCircle className="h-4 w-4" />
        How Claude Code Agents Work
        {show ? <ChevronDown className="h-3.5 w-3.5 ml-auto" /> : <ChevronRight className="h-3.5 w-3.5 ml-auto" />}
      </button>
      {show && (
        <div className="px-4 pb-4 space-y-4 text-sm border-t border-cyan-500/10 pt-3">

          {/* Architecture diagram */}
          <div className="rounded-lg border border-border/30 bg-muted/20 p-3">
            <p className="text-[10px] text-muted-foreground/60 text-center mb-2">Agent Architecture</p>
            <div className="flex items-center justify-center gap-2 text-xs">
              <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-center">
                <Bot className="h-4 w-4 text-blue-400 mx-auto mb-1" />
                <span className="text-blue-400 font-medium">Claude Code</span>
                <p className="text-[9px] text-muted-foreground mt-0.5">Main session</p>
              </div>
              <div className="flex flex-col items-center gap-1 text-muted-foreground/40">
                <span className="text-[9px]">spawns</span>
                <GitBranch className="h-3 w-3 rotate-90" />
              </div>
              <div className="space-y-1.5">
                <div className="rounded border border-purple-500/20 bg-purple-500/5 px-2.5 py-1 text-purple-400 text-[11px]">
                  <Zap className="h-3 w-3 inline mr-1" />Explore agent
                </div>
                <div className="rounded border border-green-500/20 bg-green-500/5 px-2.5 py-1 text-green-400 text-[11px]">
                  <Zap className="h-3 w-3 inline mr-1" />Plan agent
                </div>
                <div className="rounded border border-orange-500/20 bg-orange-500/5 px-2.5 py-1 text-orange-400 text-[11px]">
                  <Zap className="h-3 w-3 inline mr-1" />Custom agent
                </div>
              </div>
            </div>
          </div>

          {/* What are agents */}
          <div>
            <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5">What are agents?</h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Agents are specialized subprocesses that Claude Code spawns to handle complex tasks autonomously. Each agent runs with its own context window and tool access, keeping the main conversation clean.
            </p>
          </div>

          {/* Types of agents */}
          <div>
            <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5">Built-in agent types</h4>
            <div className="space-y-1.5 text-xs">
              <div className="flex gap-2"><Badge variant="outline" className="text-[10px] px-1.5 py-0 border-purple-500/30 text-purple-400 flex-shrink-0">Explore</Badge><span className="text-muted-foreground">Fast codebase exploration — finds files, searches code, answers questions about structure.</span></div>
              <div className="flex gap-2"><Badge variant="outline" className="text-[10px] px-1.5 py-0 border-green-500/30 text-green-400 flex-shrink-0">Plan</Badge><span className="text-muted-foreground">Designs implementation strategies — reads code, considers trade-offs, returns step-by-step plans.</span></div>
              <div className="flex gap-2"><Badge variant="outline" className="text-[10px] px-1.5 py-0 border-blue-500/30 text-blue-400 flex-shrink-0">General</Badge><span className="text-muted-foreground">Full-capability agent for multi-step tasks — has access to all tools.</span></div>
            </div>
          </div>

          {/* Plugin agents */}
          <div>
            <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5">Plugin agents (what you see here)</h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Plugins can define custom agents as <code className="text-[11px] bg-muted/50 px-1 rounded">.md</code> files with frontmatter + a system prompt. These agents are invoked by plugins and skills — they don't run automatically. Claude Code uses them when a skill or plugin explicitly spawns them via the Agent tool.
            </p>
          </div>

          {/* File structure */}
          <div>
            <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5">Agent file structure</h4>
            <pre className="bg-muted/50 rounded p-2.5 text-[11px] font-mono leading-relaxed">{"---\nname: my-agent\ndescription: What this agent does\nmodel: sonnet          # or opus, haiku, inherit\ncolor: green           # badge color\ntools: Read, Grep, Glob  # allowed tools\n---\n\nYou are a specialist agent that...\n(system prompt in markdown)"}</pre>
          </div>

          {/* Where agents live */}
          <div>
            <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5">Where agents live</h4>
            <div className="space-y-1 text-xs text-muted-foreground">
              <div className="flex gap-2"><code className="text-[10px] bg-muted/50 px-1.5 py-0.5 rounded font-mono flex-shrink-0">~/.claude/agents/</code><span>Your custom agents (create new ones here)</span></div>
              <div className="flex gap-2"><code className="text-[10px] bg-muted/50 px-1.5 py-0.5 rounded font-mono flex-shrink-0">~/.claude/plugins/.../agents/</code><span>Plugin-provided agents (read-only)</span></div>
            </div>
          </div>

          {/* When to create */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-2">
              <p className="text-green-400 font-medium text-xs mb-1">When to create an agent</p>
              <ul className="text-muted-foreground text-[11px] space-y-0.5">
                <li>Repetitive multi-step workflows</li>
                <li>Specialized review/analysis tasks</li>
                <li>Tasks needing specific tool access</li>
                <li>Parallel work on independent subtasks</li>
              </ul>
            </div>
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-2">
              <p className="text-amber-400 font-medium text-xs mb-1">Good to know</p>
              <ul className="text-muted-foreground text-[11px] space-y-0.5">
                <li>Agents run in their own context window</li>
                <li>They can't see the parent conversation</li>
                <li>Results are returned as a single message</li>
                <li>Use <code className="bg-muted/50 px-0.5 rounded">model: haiku</code> for speed</li>
              </ul>
            </div>
          </div>

          {/* How to create */}
          <div>
            <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5">Creating a custom agent</h4>
            <ol className="text-xs text-muted-foreground space-y-0.5 list-decimal list-inside">
              <li>Click <strong className="text-foreground">Create Agent</strong> above, or create a <code className="bg-muted/50 px-0.5 rounded">.md</code> file in <code className="bg-muted/50 px-0.5 rounded">~/.claude/agents/</code></li>
              <li>Add frontmatter (name, description, model, tools)</li>
              <li>Write the system prompt — tell the agent exactly what to do</li>
              <li>Reference it in skills via <code className="bg-muted/50 px-0.5 rounded">subagent_type: "your-agent"</code></li>
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}

/** Section heading for three-tier layout */
function TierHeading({ icon: Icon, label, count }: { icon: React.ComponentType<{ className?: string }>; label: string; count: number }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <h2 className="text-sm font-semibold">{label}</h2>
      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{count}</Badge>
    </div>
  );
}

function DefinitionsTab() {
  const { data: definitions, isLoading } = useAgentDefinitions();
  const [createOpen, setCreateOpen] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const createAgent = useCreateAgentDefinition();
  const [form, setForm] = useState({ name: "", description: "", model: "sonnet", color: "", tools: "", content: "" });

  const handleCreate = () => {
    createAgent.mutate({
      name: form.name,
      description: form.description || undefined,
      model: form.model || undefined,
      color: form.color || undefined,
      tools: form.tools ? form.tools.split(",").map(t => t.trim()).filter(Boolean) : undefined,
      content: form.content || undefined,
    }, {
      onSuccess: () => {
        setCreateOpen(false);
        setForm({ name: "", description: "", model: "sonnet", color: "", tools: "", content: "" });
      },
    });
  };

  const toggleGroup = (label: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  if (isLoading) return <ListSkeleton rows={4} />;

  const allDefs = definitions ? deduplicateDefinitions(definitions) : [];
  const groups = definitions ? groupDefinitions(definitions) : [];

  // Three-tier: all definitions on disk are "installed"
  // No API concept of saved-but-inactive agents currently
  const installedCount = allDefs.length;
  const savedDefs: AgentDefinition[] = [];

  const buildAgentTags = (def: AgentDefinition): string[] => {
    const tags: string[] = [];
    if (def.source) tags.push(def.source);
    if (def.model && def.model !== "inherit") tags.push(def.model);
    if (def.tools.length > 0) tags.push(`${def.tools.length} tools`);
    return tags;
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> Create Agent
        </Button>
      </div>

      {/* --- Installed --- */}
      <section>
        <TierHeading icon={Bot} label="Installed" count={installedCount} />

        {groups.length === 0 ? (
          <EmptyState icon={Bot} title="No installed agents" description="Create a custom agent to get started" />
        ) : (
          <div className="space-y-6">
            {groups.map(group => {
              const isCollapsed = collapsedGroups.has(group.label);
              return (
                <div key={group.label}>
                  <button
                    onClick={() => toggleGroup(group.label)}
                    className="flex items-center gap-2 mb-1 group/header hover:opacity-80 transition-opacity"
                  >
                    {isCollapsed
                      ? <ChevronRight className="h-4 w-4 text-muted-foreground/60" />
                      : <ChevronDown className="h-4 w-4 text-muted-foreground/60" />
                    }
                    <h3 className="text-sm font-semibold">{group.label}</h3>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-muted-foreground/20 text-muted-foreground">
                      {group.defs.length}
                    </Badge>
                  </button>
                  {group.description && !isCollapsed && (
                    <div className="flex items-start gap-1.5 mb-3 ml-6">
                      <Info className="h-3 w-3 text-muted-foreground/40 mt-0.5 flex-shrink-0" />
                      <p className="text-[11px] text-muted-foreground/60 leading-relaxed">{group.description}</p>
                    </div>
                  )}
                  {!group.description && <div className="mb-3" />}
                  {!isCollapsed && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-card">
                      {group.defs.map((def, i) => (
                        <EntityCard
                          key={def.id}
                          icon={<Bot className="h-4 w-4 text-cyan-400" />}
                          name={def.name}
                          description={def.description}
                          status="installed"
                          tags={buildAgentTags(def)}
                          onClick={() => toggleGroup(`detail:${def.id}`)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* --- Saved --- */}
      <section>
        <TierHeading icon={Package} label="Saved" count={savedDefs.length} />
        {savedDefs.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-card">
            {savedDefs.map((def) => (
              <EntityCard
                key={def.id}
                icon={<Bot className="h-4 w-4 text-cyan-400" />}
                name={def.name}
                description={def.description}
                status="saved"
                tags={buildAgentTags(def)}
                actions={[{ label: "Enable", onClick: () => {} }]}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground/60 pl-6">No saved agents — all discovered agents are currently active</p>
        )}
      </section>

      {/* --- Marketplace --- */}
      <section>
        <TierHeading icon={ShoppingBag} label="Marketplace" count={0} />
        <div className="rounded-lg border border-dashed border-muted-foreground/20 p-6 text-center">
          <ShoppingBag className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Marketplace coming soon</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Browse and install community agent definitions</p>
        </div>
      </section>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Agent</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Agent name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            <Input placeholder="Description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <select
                value={form.model}
                onChange={e => setForm({ ...form, model: e.target.value })}
                className="text-sm px-3 py-2 rounded-md border border-border bg-background text-foreground"
              >
                <option value="sonnet">Sonnet</option>
                <option value="opus">Opus</option>
                <option value="haiku">Haiku</option>
                <option value="inherit">Inherit</option>
              </select>
              <Input placeholder="Color (e.g. green)" value={form.color} onChange={e => setForm({ ...form, color: e.target.value })} />
            </div>
            <Input placeholder="Tools (comma-separated)" value={form.tools} onChange={e => setForm({ ...form, tools: e.target.value })} />
            <textarea
              placeholder="System prompt (markdown)"
              value={form.content}
              onChange={e => setForm({ ...form, content: e.target.value })}
              className="w-full h-32 text-sm px-3 py-2 rounded-md border border-border bg-background text-foreground resize-y font-mono"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!form.name || createAgent.isPending}>
              {createAgent.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function HistoryTab() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [sortKey, setSortKey] = useState("firstTs:desc");
  const [expanded, setExpanded] = useState<string | null>(null);

  const [sort, order] = sortKey.split(":") as [string, string];
  const { data: executions, isLoading } = useAgentExecutions({
    type: typeFilter || undefined,
    q: search || undefined,
    sort,
    order,
  });
  const expandedDetail = useAgentExecution(expanded || undefined);

  if (isLoading) return <ListSkeleton rows={6} />;

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Subagent executions — these are built-in agents (Explore, Plan, general-purpose) that Claude Code spawns automatically during conversations, not plugin-defined agents.
      </p>
      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search agents..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="text-xs px-2.5 py-1.5 rounded-md border border-border bg-background text-foreground"
        >
          <option value="">All Types</option>
          <option value="Explore">Explore</option>
          <option value="Plan">Plan</option>
          <option value="general-purpose">General Purpose</option>
          <option value="claude-code-guide">Claude Code Guide</option>
        </select>
        <select
          value={sortKey}
          onChange={e => setSortKey(e.target.value)}
          className="text-xs px-2.5 py-1.5 rounded-md border border-border bg-background text-foreground"
        >
          <option value="firstTs:desc">Newest First</option>
          <option value="firstTs:asc">Oldest First</option>
          <option value="sizeBytes:desc">Largest First</option>
          <option value="messageCount:desc">Most Messages</option>
        </select>
      </div>

      {!executions || executions.length === 0 ? (
        <EmptyState icon={Bot} title="No agent executions found" description="Agents will appear here when Claude Code spawns subagents" />
      ) : (
        <div className="space-y-2">
          {executions.map((exec, i) => (
            <ExecutionCard
              key={exec.agentId}
              exec={exec}
              index={i}
              isExpanded={expanded === exec.agentId}
              detail={expanded === exec.agentId ? expandedDetail.data : undefined}
              onToggleExpand={() => setExpanded(expanded === exec.agentId ? null : exec.agentId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ExecutionCard({
  exec,
  index,
  isExpanded,
  detail,
  onToggleExpand,
}: {
  exec: AgentExecution;
  index: number;
  isExpanded: boolean;
  detail?: any;
  onToggleExpand: () => void;
}) {
  return (
    <Card
      className="group card-hover animate-fade-in-up cursor-pointer"
      style={{ animationDelay: `${Math.min(index, 20) * 30}ms` }}
      onClick={onToggleExpand}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {exec.agentType && (
                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getTypeColor(exec.agentType)}`}>
                  {exec.agentType}
                </Badge>
              )}
              <span className="text-sm font-medium font-mono">{exec.slug || exec.agentId.slice(0, 12)}</span>
              {exec.model && (
                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getModelColor(exec.model)}`}>
                  {shortModel(exec.model)}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
              {exec.firstMessage || "(no message)"}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[11px] text-muted-foreground font-mono">{rt(exec.firstTs)}</span>
              <span className="text-muted-foreground/30 text-[11px]">/</span>
              <span className="text-[11px] text-muted-foreground font-mono">{exec.messageCount} msgs</span>
              <span className="text-muted-foreground/30 text-[11px]">/</span>
              <span className="text-[11px] text-muted-foreground font-mono">{formatBytes(exec.sizeBytes)}</span>
            </div>
          </div>
          <div className="flex-shrink-0 mt-1">
            {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground/50" /> : <ChevronRight className="h-4 w-4 text-muted-foreground/50" />}
          </div>
        </div>

        {isExpanded && (
          <div className="mt-4 pt-4 border-t border-border/50 space-y-3">
            {/* Metadata grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div>
                <span className="text-muted-foreground/60">Agent ID</span>
                <p className="font-mono mt-0.5 truncate">{exec.agentId}</p>
              </div>
              <div>
                <span className="text-muted-foreground/60">Session</span>
                <p className="font-mono mt-0.5 truncate">{exec.sessionId.slice(0, 12)}...</p>
              </div>
              <div>
                <span className="text-muted-foreground/60">First</span>
                <p className="font-mono mt-0.5">{exec.firstTs ? new Date(exec.firstTs).toLocaleString() : "-"}</p>
              </div>
              <div>
                <span className="text-muted-foreground/60">Last</span>
                <p className="font-mono mt-0.5">{exec.lastTs ? new Date(exec.lastTs).toLocaleString() : "-"}</p>
              </div>
            </div>

            {/* Full first message */}
            {exec.firstMessage && (
              <div>
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Task</span>
                <p className="text-sm mt-1 text-muted-foreground leading-relaxed">{exec.firstMessage.slice(0, 500)}</p>
              </div>
            )}

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

function StatsTab() {
  const { data: stats, isLoading } = useAgentStats();

  if (isLoading) return <ListSkeleton rows={4} />;
  if (!stats) return <div className="text-muted-foreground text-center py-12">No stats available</div>;

  const typeEntries = Object.entries(stats.byType).sort((a, b) => b[1] - a[1]);
  const modelEntries = Object.entries(stats.byModel).sort((a, b) => b[1] - a[1]);
  const maxType = typeEntries[0]?.[1] || 1;
  const maxModel = modelEntries[0]?.[1] || 1;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Agent type distribution */}
      <div className="rounded-xl border bg-card p-5">
        <h3 className="text-sm font-medium mb-4">Agent Type Distribution</h3>
        <div className="space-y-3">
          {typeEntries.map(([type, count]) => (
            <div key={type}>
              <div className="flex items-center justify-between text-xs mb-1">
                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getTypeColor(type)}`}>
                  {type}
                </Badge>
                <span className="font-mono text-muted-foreground">
                  {count} ({((count / stats.totalExecutions) * 100).toFixed(1)}%)
                </span>
              </div>
              <div className="h-2 rounded-full bg-muted/30 overflow-hidden">
                <div
                  className="h-full rounded-full bg-blue-500 transition-all duration-500"
                  style={{ width: `${(count / maxType) * 100}%` }}
                />
              </div>
            </div>
          ))}
          {typeEntries.length === 0 && (
            <p className="text-xs text-muted-foreground">No data</p>
          )}
        </div>
      </div>

      {/* Model usage distribution */}
      <div className="rounded-xl border bg-card p-5">
        <h3 className="text-sm font-medium mb-4">Model Usage</h3>
        <div className="space-y-3">
          {modelEntries.map(([model, count]) => (
            <div key={model}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-mono truncate max-w-[200px]">{shortModel(model)}</span>
                <span className="font-mono text-muted-foreground">
                  {count} ({((count / stats.totalExecutions) * 100).toFixed(1)}%)
                </span>
              </div>
              <div className="h-2 rounded-full bg-muted/30 overflow-hidden">
                <div
                  className="h-full rounded-full bg-purple-500 transition-all duration-500"
                  style={{ width: `${(count / maxModel) * 100}%` }}
                />
              </div>
            </div>
          ))}
          {modelEntries.length === 0 && (
            <p className="text-xs text-muted-foreground">No data</p>
          )}
        </div>
      </div>

      {/* Summary card */}
      <div className="rounded-xl border bg-card p-5 md:col-span-2">
        <h3 className="text-sm font-medium mb-4">Summary</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold font-mono">{stats.totalExecutions}</p>
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider mt-1">Total Agents</p>
          </div>
          <div>
            <p className="text-2xl font-bold font-mono">{stats.totalDefinitions}</p>
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider mt-1">Definitions</p>
          </div>
          <div>
            <p className="text-2xl font-bold font-mono">{stats.sessionsWithAgents}</p>
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider mt-1">Sessions</p>
          </div>
          <div>
            <p className="text-2xl font-bold font-mono">{Object.keys(stats.byType).length}</p>
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider mt-1">Agent Types</p>
          </div>
        </div>
      </div>
    </div>
  );
}
