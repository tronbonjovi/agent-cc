import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EntityIcon } from "@/components/entity-badge";
import { EmptyState } from "@/components/empty-state";
import { useScanStatus, useRescan, useEntities } from "@/hooks/use-entities";
import { useRuntimeConfig } from "@/hooks/use-config";
import { useProjects } from "@/hooks/use-projects";
import { useLiveData } from "@/hooks/use-agents";
import { useTogglePin } from "@/hooks/use-sessions";
import {
  RefreshCw, Clock, HardDrive, Cpu, Activity, Database,
  Server, FileText, GitBranch, Search,
  BarChart3, Zap, Loader2,
  Terminal, Keyboard, Download, Bot, Monitor, Check, Pin,
  ChevronDown,
} from "lucide-react";

import type { EntityType, ActiveSession, AgentExecution } from "@shared/types";
import { formatBytes, relativeTime as _relativeTime, shortModel, getTypeColor } from "@/lib/utils";

const entityTypes: EntityType[] = ["project", "mcp", "skill", "plugin", "markdown"];

const quickActions = [
  { label: "View Graph", description: "Explore entity relationships", icon: GitBranch, path: "/graph", color: "text-indigo-400", bg: "bg-indigo-500/10" },
  { label: "Edit CLAUDE.md", description: "Project instructions", icon: FileText, path: "/markdown", color: "text-blue-400", bg: "bg-blue-500/10" },
  { label: "Stats", description: "Usage analytics", icon: BarChart3, path: "/stats", color: "text-amber-400", bg: "bg-amber-500/10" },
  { label: "Export Data", description: "Download backup", icon: Download, path: "/api/export", color: "text-cyan-400", bg: "bg-cyan-500/10" },
  { label: "Search GitHub", description: "Discover MCP servers", icon: Search, path: "/stats?tab=discover", color: "text-emerald-400", bg: "bg-emerald-500/10" },
];

const relativeTime = (dateStr: string | null) => dateStr ? _relativeTime(dateStr) : "-";

function runningDuration(startedAt: number, _tick?: number): string {
  const diff = Date.now() - startedAt;
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remSecs = secs % 60;
  if (mins < 60) return `${mins}m ${remSecs}s`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `${hrs}h ${remMins}m`;
}

function shortSummary(msg: string | undefined, maxWords = 5): string {
  if (!msg) return "";
  const words = msg.trim().split(/\s+/).slice(0, maxWords);
  let result = words.join(" ");
  if (msg.trim().split(/\s+/).length > maxWords) result += "...";
  return result;
}

function useTick(ms: number): number {
  const [tick, setTick] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return tick;
}

const STATUS_CONFIG: Record<string, { dotClass: string; borderClass: string; cardClass: string; label: string }> = {
  thinking: {
    dotClass: "bg-green-500 animate-pulse drop-shadow-[0_0_4px_rgba(34,197,94,0.5)]",
    borderClass: "border-green-500/20",
    cardClass: "",
    label: "Thinking",
  },
  waiting: {
    dotClass: "bg-yellow-500 drop-shadow-[0_0_4px_rgba(234,179,8,0.5)]",
    borderClass: "border-yellow-500/20",
    cardClass: "",
    label: "Waiting",
  },
  idle: {
    dotClass: "bg-muted-foreground/50",
    borderClass: "",
    cardClass: "",
    label: "Idle",
  },
  stale: {
    dotClass: "bg-muted-foreground/30",
    borderClass: "",
    cardClass: "",
    label: "Stale",
  },
};

function getStatusConfig(status?: string) {
  return STATUS_CONFIG[status || ""] || STATUS_CONFIG.stale;
}

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { data: status } = useScanStatus();
  const { data: runtime } = useRuntimeConfig();
  const { data: entities } = useEntities();
  const { data: projects } = useProjects();
  const rescan = useRescan();
  const { data: liveData } = useLiveData();
  const togglePin = useTogglePin();
  const tick = useTick(1000);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showAgents, setShowAgents] = useState(false);
  const prevSessionIdsRef = useRef<Set<string> | null>(null);
  const [newSessionIds, setNewSessionIds] = useState<Set<string>>(new Set());

  const counts = (status?.entityCounts || {}) as Record<string, number>;
  const activeSessions = liveData?.activeSessions || [];
  const stats = liveData?.stats;
  const recentActivity = liveData?.recentActivity || [];
  const hasActive = (stats?.activeSessionCount ?? 0) > 0;

  // Session stats from projects
  const totalSessions = (projects || []).reduce((sum, p) => sum + (p.data.sessionCount || 0), 0);
  const totalSessionSize = (projects || []).reduce((sum, p) => sum + (p.data.sessionSize || 0), 0);

  // Recent changes (sorted by lastModified)
  const recentEntities = (entities || [])
    .filter((e) => e.lastModified)
    .sort((a, b) => (b.lastModified! > a.lastModified! ? 1 : -1))
    .slice(0, 10);

  // Entity color for border
  const entityBorderColor: Record<string, string> = {
    project: "border-l-entity-project shadow-[inset_4px_0_8px_-4px_var(--glow-blue)]",
    mcp: "border-l-entity-mcp shadow-[inset_4px_0_8px_-4px_var(--glow-green)]",
    skill: "border-l-entity-skill shadow-[inset_4px_0_8px_-4px_var(--glow-amber)]",
    plugin: "border-l-entity-plugin shadow-[inset_4px_0_8px_-4px_var(--glow-purple)]",
    markdown: "border-l-entity-markdown shadow-[inset_4px_0_8px_-4px_hsl(var(--entity-markdown)_/_0.15)]",
    config: "border-l-entity-config shadow-[inset_4px_0_8px_-4px_hsl(var(--entity-config)_/_0.15)]",
  };

  // Track new sessions for highlight glow
  useEffect(() => {
    const currentIds = new Set(activeSessions.map(s => s.sessionId));
    if (prevSessionIdsRef.current !== null) {
      const fresh = new Set<string>();
      activeSessions.forEach(s => {
        if (!prevSessionIdsRef.current!.has(s.sessionId)) fresh.add(s.sessionId);
      });
      if (fresh.size > 0) {
        setNewSessionIds(fresh);
        const timer = setTimeout(() => setNewSessionIds(new Set()), 3000);
        return () => clearTimeout(timer);
      }
    }
    prevSessionIdsRef.current = currentIds;
  }, [activeSessions]);

  const handleCopyResume = useCallback((sessionId: string) => {
    navigator.clipboard.writeText(`claude --resume ${sessionId}`);
    setCopiedId(sessionId);
    setTimeout(() => setCopiedId(null), 1500);
  }, []);

  // Collect all agents across all sessions for the dropdown
  const allAgents = activeSessions.flatMap(session =>
    session.activeAgents.map(agent => ({ agent, session }))
  );

  return (
    <div className="p-6 space-y-6 ">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gradient">Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {status?.totalEntities || 0} entities across {entityTypes.length} types
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => rescan.mutate()}
          disabled={rescan.isPending}
          className="gap-2 border-primary/30 hover:bg-primary/10 hover:border-primary/50 hover:shadow-glow transition-all"
        >
          <RefreshCw className={`h-3.5 w-3.5 transition-transform ${rescan.isPending ? "animate-spin" : ""}`} />
          {rescan.isPending ? "Scanning..." : "Rescan"}
        </Button>
      </div>

      {/* Combined system + live status bar */}
      <div className={`flex items-center gap-4 px-4 py-2.5 rounded-lg border border-border/50 status-panel flex-wrap ${hasActive ? "live-border border-green-500/20 shadow-[0_0_20px_rgba(34,197,94,0.08)]" : ""}`}>
        {/* System health indicators */}
        <span className="text-xs font-semibold text-nav-active/80 uppercase tracking-wider">System</span>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-glow-pulse shadow-glow-green" />
          <span className="text-xs text-muted-foreground">Server</span>
        </div>
        <div className="flex items-center gap-1.5">
          {status?.scanning ? (
            <Loader2 className="h-3 w-3 text-primary animate-spin" />
          ) : (
            <span className="w-2 h-2 rounded-full bg-green-500 animate-glow-pulse shadow-glow-green" />
          )}
          <span className="text-xs text-muted-foreground">Scanner</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-glow-pulse shadow-glow-green" />
          <span className="text-xs text-muted-foreground">Watcher</span>
        </div>

        <div className="w-px h-5 bg-border" />

        {/* Live session count */}
        <div className="flex items-center gap-2">
          <Monitor className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs">
            <span className="font-mono font-bold">{stats?.activeSessionCount ?? 0}</span>
            <span className="text-muted-foreground ml-1">
              {(stats?.activeSessionCount ?? 0) !== 1 ? "sessions" : "session"}
            </span>
          </span>
          {hasActive && <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />}
        </div>

        {/* Agent count with dropdown */}
        <div className="relative">
          <button
            className="flex items-center gap-1.5 hover:bg-accent/30 -mx-1 px-1 rounded transition-colors"
            onClick={() => setShowAgents(!showAgents)}
          >
            <Bot className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs">
              <span className="font-mono font-bold">{stats?.activeAgentCount ?? 0}</span>
              <span className="text-muted-foreground ml-1">agent{(stats?.activeAgentCount ?? 0) !== 1 ? "s" : ""}</span>
            </span>
            {allAgents.length > 0 && (
              <ChevronDown className={`h-3 w-3 text-muted-foreground transition-transform ${showAgents ? "rotate-180" : ""}`} />
            )}
          </button>
          {showAgents && allAgents.length > 0 && (
            <div className="absolute top-full left-0 mt-2 w-80 rounded-xl border bg-card shadow-lg z-50 p-3 space-y-2 animate-fade-in-up">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-medium px-1">
                Active Agents ({allAgents.length})
              </div>
              {allAgents.map(({ agent, session }) => (
                <div key={agent.agentId} className={`rounded-lg border px-3 py-2 ${agent.status === "running" ? "border-green-500/20 bg-green-500/5" : "border-border/30 bg-muted/20"}`}>
                  <div className="flex items-center gap-2">
                    {agent.status === "running" ? (
                      <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse drop-shadow-[0_0_4px_rgba(34,197,94,0.5)]" />
                    ) : (
                      <span className="w-2 h-2 rounded-full bg-muted-foreground/30" />
                    )}
                    <span className="text-xs font-medium truncate">{agent.slug || agent.agentId.slice(0, 10)}</span>
                    {agent.agentType && (
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getTypeColor(agent.agentType)}`}>
                        {agent.agentType}
                      </Badge>
                    )}
                  </div>
                  {agent.task && (
                    <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2 ml-4">{agent.task}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1 ml-4 text-[10px] text-muted-foreground/50">
                    {agent.model && <span>{shortModel(agent.model)}</span>}
                    {session.slug && <><span className="text-muted-foreground/20">|</span><span>{session.slug}</span></>}
                    {!session.slug && session.cwd && <><span className="text-muted-foreground/20">|</span><span className="font-mono">{session.cwd.split("/").pop()}</span></>}
                    <span className="text-muted-foreground/20">|</span>
                    <span>{relativeTime(agent.lastWriteTs)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Models in use */}
        <div className="flex items-center gap-1.5">
          <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
          {(stats?.modelsInUse || []).length > 0 ? (
            <div className="flex gap-1">
              {stats!.modelsInUse.map(m => (
                <Badge key={m} variant="outline" className="text-[10px] px-1.5 py-0">{shortModel(m)}</Badge>
              ))}
            </div>
          ) : (
            <span className="text-[10px] text-muted-foreground/50">no models</span>
          )}
        </div>

        {/* Live cost */}
        {activeSessions.some(s => (s.costEstimate ?? 0) > 0) && (
          <>
            <div className="w-px h-5 bg-border" />
            <span className="text-xs font-mono text-green-400">
              ${activeSessions.reduce((sum, s) => sum + (s.costEstimate ?? 0), 0).toFixed(2)}
            </span>
            <span className="text-[10px] text-muted-foreground">active spend</span>
          </>
        )}

        <div className="flex-1" />
        <span className="text-[11px] text-muted-foreground font-mono">
          {status?.lastScanAt ? `Last scan: ${_relativeTime(status.lastScanAt)}` : ""}
        </span>
      </div>

      {/* Active Sessions + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Active Sessions</h2>
          {activeSessions.length === 0 ? (
            <div className="rounded-xl border bg-card">
              <EmptyState icon={Monitor} title="No active Claude sessions" description="Sessions will appear here when Claude Code is running" />
            </div>
          ) : (
            <div className="space-y-3">
              {activeSessions.map((session, i) => (
                <ActiveSessionCard
                  key={session.sessionId}
                  session={session}
                  index={i}
                  tick={tick}
                  isNew={newSessionIds.has(session.sessionId)}
                  copiedId={copiedId}
                  onCopyResume={handleCopyResume}
                  onTogglePin={(id) => togglePin.mutate(id)}
                />
              ))}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Recent Activity</h2>
          {recentActivity.length === 0 ? (
            <div className="rounded-xl border bg-card">
              <EmptyState icon={Activity} title="No agents in the past hour" />
            </div>
          ) : (
            <div className="space-y-2 max-h-[600px] overflow-auto">
              {recentActivity.map((exec, i) => (
                <RecentActivityItem key={exec.agentId} exec={exec} index={i} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {entityTypes.map((type, i) => (
          <div key={type} className="animate-fade-in-up" style={{ animationDelay: `${i * 50}ms` }}>
            <StatCard
              type={type}
              count={counts[type] || 0}
              onClick={() => setLocation(type === "markdown" ? "/markdown" : `/${type}s`)}
            />
          </div>
        ))}
      </div>

      {/* Quick Actions + Session Stats row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Quick Actions */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Zap className="h-4 w-4 text-yellow-400" />
              Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 lg:grid-cols-3 gap-2">
            {quickActions.map((action) => (
              <button
                key={action.path}
                onClick={() => {
                  if (action.path.startsWith("/api/")) {
                    window.open(action.path, "_blank");
                  } else {
                    setLocation(action.path);
                  }
                }}
                className="flex items-center gap-2.5 rounded-lg border border-border/50 px-3 py-3 text-xs hover:bg-accent/50 hover:scale-[1.02] transition-all text-left group gradient-border"
              >
                <div className={`rounded-lg p-1.5 ${action.bg} transition-transform group-hover:scale-110`}>
                  <action.icon className={`h-3.5 w-3.5 ${action.color} transition-transform group-hover:-translate-y-0.5`} />
                </div>
                <div className="min-w-0">
                  <span className="font-medium block">{action.label}</span>
                  <span className="text-[10px] text-muted-foreground">{action.description}</span>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        {/* Session Stats */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              <button
                onClick={() => setLocation("/sessions")}
                className="hover:text-primary transition-colors"
              >
                Sessions
              </button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Total sessions</span>
              <span className="font-mono font-semibold">{totalSessions.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Storage used</span>
              <span className="font-mono font-semibold">{formatBytes(totalSessionSize)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Projects</span>
              <span className="font-mono font-semibold">{(projects || []).length}</span>
            </div>
            {/* Mini breakdown */}
            <div className="pt-2 border-t border-border/50 space-y-1.5">
              {(projects || []).map((p) => (
                <button
                  key={p.id}
                  className="flex justify-between text-xs w-full hover:bg-accent/30 -mx-1 px-1 rounded transition-colors"
                  onClick={() => setLocation(`/projects/${p.id}`)}
                >
                  <span className="text-muted-foreground truncate mr-2">{p.name}</span>
                  <span className="font-mono tabular-nums text-muted-foreground">
                    {p.data.sessionCount}
                  </span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Runtime + Scanner combined */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4 text-emerald-400" />
              System
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {runtime ? (
              <>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <div className="rounded-md bg-muted/30 p-1"><Cpu className="h-3 w-3" /></div> Node
                  </span>
                  <span className="font-mono text-xs">{runtime.nodeVersion}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <div className="rounded-md bg-muted/30 p-1"><HardDrive className="h-3 w-3" /></div> Platform
                  </span>
                  <span className="font-mono text-xs">{runtime.platform}/{runtime.arch}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <div className="rounded-md bg-muted/30 p-1"><Database className="h-3 w-3" /></div> Memory
                  </span>
                  <div className="flex items-center gap-2">
                    {(() => {
                      const rss = runtime.memoryUsage?.rss || 0;
                      const rssMB = Math.round(rss / 1048576);
                      const ceiling = 512;
                      const pct = Math.min(Math.round((rssMB / ceiling) * 100), 100);
                      const circumference = 2 * Math.PI * 13;
                      const color = pct > 80 ? "#ef4444" : pct > 50 ? "#f59e0b" : "#22c55e";
                      return (
                        <div className="flex items-center gap-2" title={`${rssMB} MB RSS / ${ceiling} MB ceiling`}>
                          <svg className="h-8 w-8" viewBox="0 0 36 36">
                            <circle cx="18" cy="18" r="13" fill="none" stroke="hsl(var(--muted) / 0.5)" strokeWidth="2.5" />
                            <circle
                              cx="18" cy="18" r="13" fill="none"
                              stroke={color} strokeWidth="2.5"
                              strokeDasharray={circumference}
                              strokeDashoffset={circumference - (circumference * pct / 100)}
                              strokeLinecap="round"
                              className="memory-ring-track"
                              transform="rotate(-90 18 18)"
                            />
                            <text x="18" y="19.5" textAnchor="middle" className="fill-foreground text-[7px] font-mono font-bold">{rssMB}</text>
                          </svg>
                          <span className="font-mono text-xs">{rssMB} MB</span>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </>
            ) : (
              <div className="text-muted-foreground text-xs">Loading...</div>
            )}
            <div className="pt-2 border-t border-border/50">
              <div className="flex justify-between">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <Clock className="h-3 w-3" /> Last scan
                </span>
                <span className="font-mono text-xs">
                  {status?.lastScanAt ? _relativeTime(status.lastScanAt) : "never"}
                </span>
              </div>
              <div className="flex justify-between mt-1.5">
                <span className="text-muted-foreground">Entities / Relationships</span>
                <span className="font-mono text-xs">{status?.totalEntities || 0} / {status?.totalRelationships || 0}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Keyboard Shortcuts Hint */}
      <button
        onClick={() => window.dispatchEvent(new CustomEvent("toggle-shortcuts-overlay"))}
        className="flex items-center gap-3 px-4 py-2 rounded-lg border border-border/30 bg-card/30 hover:bg-card/50 transition-colors w-full text-left"
      >
        <Keyboard className="h-3.5 w-3.5 text-muted-foreground/50" />
        <span className="text-[11px] text-muted-foreground/50">
          Press <kbd className="px-1 py-0.5 rounded border border-border/50 text-[10px] font-mono">?</kbd> for all keyboard shortcuts
          <span className="mx-2 text-border">|</span>
          <kbd className="px-1 py-0.5 rounded border border-border/50 text-[10px] font-mono">Ctrl+K</kbd> search
          <span className="mx-2 text-border">|</span>
          <kbd className="px-1 py-0.5 rounded border border-border/50 text-[10px] font-mono">G</kbd> then
          <kbd className="px-1 py-0.5 rounded border border-border/50 text-[10px] font-mono">D</kbd> /
          <kbd className="px-1 py-0.5 rounded border border-border/50 text-[10px] font-mono">S</kbd> /
          <kbd className="px-1 py-0.5 rounded border border-border/50 text-[10px] font-mono">G</kbd> /
          <kbd className="px-1 py-0.5 rounded border border-border/50 text-[10px] font-mono">L</kbd> navigate
        </span>
      </button>

      {/* Recent Changes */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Recent Changes</CardTitle>
        </CardHeader>
        <CardContent>
          {recentEntities.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recent changes detected</p>
          ) : (
            <div className="space-y-1">
              {recentEntities.map((entity, i) => (
                <button
                  key={entity.id}
                  className={`flex items-center gap-3 py-2.5 w-full text-left hover:bg-accent/30 -mx-2 px-2 rounded-md transition-colors border-l-[3px] animate-fade-in-up ${entityBorderColor[entity.type] || "border-l-transparent"}`}
                  style={{ animationDelay: `${i * 30}ms` }}
                  onClick={() => {
                    if (entity.type === "markdown") setLocation(`/markdown`);
                    else if (entity.type === "project") setLocation(`/projects/${entity.id}`);
                    else if (entity.type === "mcp") setLocation(`/mcps`);
                    else if (entity.type === "skill") setLocation(`/skills`);
                    else if (entity.type === "plugin") setLocation(`/plugins`);
                    else if (entity.type === "config") setLocation(`/settings`);
                  }}
                >
                  <EntityIcon type={entity.type} className="h-4 w-4 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium">{entity.name}</span>
                    {entity.description && (
                      <p className="text-[11px] text-muted-foreground truncate">{entity.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">{entity.type}</Badge>
                    <span className="text-[11px] text-muted-foreground font-mono whitespace-nowrap flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {entity.lastModified ? _relativeTime(entity.lastModified) : ""}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ActiveSessionCard({
  session,
  index,
  tick,
  isNew,
  copiedId,
  onCopyResume,
  onTogglePin,
}: {
  session: ActiveSession;
  index: number;
  tick: number;
  isNew: boolean;
  copiedId: string | null;
  onCopyResume: (id: string) => void;
  onTogglePin: (id: string) => void;
}) {
  const title = session.slug || shortSummary(session.firstMessage, 5) || session.sessionId.slice(0, 12) + "...";
  const lastMsg = session.lastMessage ? shortSummary(session.lastMessage, 12) : null;
  const firstMsg = session.firstMessage ? shortSummary(session.firstMessage, 8) : null;
  const isCopied = copiedId === session.sessionId;
  const sc = getStatusConfig(session.status);

  return (
    <Card
      className={`animate-fade-in-up ${sc.cardClass} ${sc.borderClass ? `border ${sc.borderClass}` : ""} ${isNew ? "ring-2 ring-green-500/40 shadow-[0_0_20px_rgba(34,197,94,0.2)]" : ""}`}
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="mt-1 flex flex-col items-center gap-0.5 flex-shrink-0">
            <span className={`w-2.5 h-2.5 rounded-full ${sc.dotClass}`} />
            <span className="text-[9px] text-muted-foreground/60 leading-none">{sc.label}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium truncate">{title}</span>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 flex-shrink-0">PID {session.pid}</Badge>
              {session.permissionMode === "bypass" && (
                <Badge className="text-[10px] px-1.5 py-0 flex-shrink-0 bg-red-500/20 text-red-400 border-red-500/30 hover:bg-red-500/20">BYPASS</Badge>
              )}
              {session.permissionMode === "auto-accept" && (
                <Badge className="text-[10px] px-1.5 py-0 flex-shrink-0 bg-yellow-500/20 text-yellow-400 border-yellow-500/30 hover:bg-yellow-500/20">AUTO</Badge>
              )}
              <div className="ml-auto flex-shrink-0 flex items-center gap-0.5">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0"
                  onClick={() => onTogglePin(session.sessionId)}
                  title={session.isPinned ? "Unpin session" : "Pin session"}
                >
                  <Pin className={`h-3.5 w-3.5 ${session.isPinned ? "text-amber-400 fill-amber-400" : "text-muted-foreground"}`} />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0"
                  onClick={() => onCopyResume(session.sessionId)}
                  title="Copy resume command"
                >
                  {isCopied ? (
                    <Check className="h-3.5 w-3.5 text-green-400" />
                  ) : (
                    <Terminal className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </Button>
              </div>
            </div>

            {lastMsg && (
              <p className="text-xs text-foreground/80 mt-1 line-clamp-2">
                <span className="text-[10px] text-muted-foreground/50 mr-1">Latest:</span>
                {lastMsg}
              </p>
            )}
            {firstMsg && firstMsg !== lastMsg && (
              <p className="text-[11px] text-muted-foreground/60 truncate mt-0.5">
                <span className="text-[10px] mr-1">Started:</span>
                {firstMsg}
              </p>
            )}

            <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground flex-wrap">
              <Clock className="h-3 w-3 flex-shrink-0" />
              <span className="tabular-nums">{runningDuration(session.startedAt, tick)}</span>
              <span className="text-muted-foreground/30">|</span>
              <button
                className="font-mono text-[10px] text-muted-foreground/40 hover:text-blue-400 transition-colors"
                onClick={() => navigator.clipboard.writeText(session.sessionId)}
                title="Click to copy UUID"
              >{session.sessionId}</button>
              {session.contextUsage?.model && (
                <>
                  <span className="text-muted-foreground/30">|</span>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">{shortModel(session.contextUsage.model)}</Badge>
                </>
              )}
              {(session.messageCount ?? 0) > 0 && (
                <>
                  <span className="text-muted-foreground/30">|</span>
                  <span className="tabular-nums">{session.messageCount} msgs</span>
                </>
              )}
              {(session.sizeBytes ?? 0) > 0 && (
                <>
                  <span className="text-muted-foreground/30">|</span>
                  <span className="tabular-nums">{session.sizeBytes! > 1048576 ? `${(session.sizeBytes! / 1048576).toFixed(1)} MB` : `${Math.round(session.sizeBytes! / 1024)} KB`}</span>
                </>
              )}
              {(session.costEstimate ?? 0) > 0 && (
                <>
                  <span className="text-muted-foreground/30">|</span>
                  <span className="tabular-nums text-amber-400/70">${session.costEstimate! < 0.01 ? "<0.01" : session.costEstimate!.toFixed(2)}</span>
                </>
              )}
              {session.projectKey && (
                <>
                  <span className="text-muted-foreground/30">|</span>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">{session.projectKey.split("--").pop()}</Badge>
                </>
              )}
              {session.gitBranch && (
                <>
                  <span className="text-muted-foreground/30">|</span>
                  <GitBranch className="h-3 w-3 flex-shrink-0" />
                  <span className="tabular-nums">{session.gitBranch}</span>
                </>
              )}
            </div>
            <div className="text-[10px] text-muted-foreground/40 mt-0.5 font-mono truncate">{session.cwd.replace(/\\/g, "/")}</div>

            {session.contextUsage && (
              <div className="mt-2 flex items-center gap-2" title={`${session.contextUsage.tokensUsed.toLocaleString()} / ${session.contextUsage.maxTokens.toLocaleString()} tokens (${session.contextUsage.percentage}%)`}>
                <span className="text-[10px] text-muted-foreground/60 shrink-0 w-12">Context</span>
                <div className="flex-1 h-2 rounded-full bg-muted/50 overflow-hidden">
                  <div
                    className="h-full rounded-full context-bar-fill"
                    style={{
                      width: `${Math.min(session.contextUsage.percentage, 100)}%`,
                      background: `linear-gradient(90deg, #22c55e, #f59e0b 60%, #ef4444)`,
                      backgroundSize: "200% 100%",
                      backgroundPosition: `${Math.min(session.contextUsage.percentage, 100)}% 0`,
                    }}
                  />
                </div>
                <span className="text-[10px] font-mono tabular-nums text-muted-foreground shrink-0">
                  {session.contextUsage.percentage}%
                </span>
                <span className="text-[9px] text-muted-foreground/40 shrink-0">
                  {Math.round(session.contextUsage.tokensUsed / 1000)}k / {Math.round(session.contextUsage.maxTokens / 1000)}k
                </span>
              </div>
            )}

            {session.activeAgents.length > 0 && (
              <div className="mt-3 space-y-1.5">
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                  Agents ({session.activeAgents.filter(a => a.status === "running").length} running, {session.activeAgents.filter(a => a.status === "recent").length} recent)
                </span>
                {session.activeAgents.map(agent => (
                  <div key={agent.agentId} className={`rounded-md border px-2.5 py-1.5 ${agent.status === "running" ? "border-green-500/20 bg-green-500/5" : "border-border/30 bg-muted/20"}`}>
                    <div className="flex items-center gap-2 text-xs">
                      {agent.status === "running" ? (
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse flex-shrink-0 drop-shadow-[0_0_4px_rgba(34,197,94,0.5)]" />
                      ) : (
                        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30 flex-shrink-0" />
                      )}
                      {agent.agentType && (
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getTypeColor(agent.agentType)}`}>
                          {agent.agentType}
                        </Badge>
                      )}
                      {agent.model && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">{shortModel(agent.model)}</Badge>
                      )}
                      <span className="text-[10px] text-muted-foreground/50 ml-auto tabular-nums">
                        {relativeTime(agent.lastWriteTs)}
                      </span>
                    </div>
                    {agent.task && (
                      <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2 ml-3.5">{agent.task}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function RecentActivityItem({ exec, index }: { exec: AgentExecution; index: number }) {
  return (
    <div
      className="rounded-lg border bg-card p-3 animate-fade-in-up"
      style={{ animationDelay: `${Math.min(index, 10) * 30}ms` }}
    >
      <div className="flex items-start gap-2">
        <span className="text-[11px] text-muted-foreground font-mono flex-shrink-0 w-12 mt-0.5">
          {relativeTime(exec.firstTs)}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            {exec.agentType && (
              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getTypeColor(exec.agentType)}`}>
                {exec.agentType}
              </Badge>
            )}
            <span className="text-xs font-mono truncate">{exec.slug || exec.agentId.slice(0, 8)}</span>
          </div>
          <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{exec.firstMessage || "(no message)"}</p>
        </div>
      </div>
    </div>
  );
}
