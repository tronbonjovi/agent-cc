import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/empty-state";
import { useScanStatus, useRescan } from "@/hooks/use-entities";
import { useLiveData } from "@/hooks/use-agents";
import { useTogglePin, useSessionNames, useRenameSession } from "@/hooks/use-sessions";
import { useAppSettings } from "@/hooks/use-settings";
import { getSessionDisplayName } from "@/lib/session-display-name";
import {
  RefreshCw, Clock, Cpu, Activity,
  GitBranch, Loader2,
  Terminal, Bot, Monitor, Check, Pin,
  ChevronDown, Pencil,
} from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";

import { PageContainer } from "@/components/page-container";
import type { EntityType, ActiveSession, AgentExecution } from "@shared/types";
import { relativeTime as _relativeTime, shortModel, getTypeColor } from "@/lib/utils";

const entityTypes: EntityType[] = ["project", "mcp", "skill", "plugin", "markdown"];


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
  // Strip YAML frontmatter (--- ... ---) that workflow system adds to sessions
  const cleaned = msg.replace(/^---\n[\s\S]*?\n---\n*/, "").trim();
  if (!cleaned) return "";
  const words = cleaned.split(/\s+/).slice(0, maxWords);
  let result = words.join(" ");
  if (cleaned.split(/\s+/).length > maxWords) result += "...";
  return result;
}

function thresholdColor(
  value: number,
  thresholds?: { yellow: number; red: number }
): string {
  if (!thresholds) return "";
  if (value >= thresholds.red) return "text-red-400/80";
  if (value >= thresholds.yellow) return "text-amber-400/80";
  return "text-emerald-400/80";
}

function readableProjectKey(key: string): string {
  const lastSegment = key.split("--").pop() || key;
  return lastSegment
    .replace(/^-/, "~/")
    .replace(/-/g, "/");
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
    dotClass: "bg-primary animate-pulse",
    borderClass: "border-primary/20",
    cardClass: "",
    label: "Thinking",
  },
  waiting: {
    dotClass: "bg-yellow-500",
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
  const rescan = useRescan();
  const { data: liveData } = useLiveData();
  const togglePin = useTogglePin();
  const { data: sessionNames } = useSessionNames();
  const renameSession = useRenameSession();
  const { data: settings } = useAppSettings();
  const tick = useTick(1000);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showAgents, setShowAgents] = useState(false);
  const prevSessionIdsRef = useRef<Set<string> | null>(null);
  const [newSessionIds, setNewSessionIds] = useState<Set<string>>(new Set());

  const activeSessions = liveData?.activeSessions || [];
  const stats = liveData?.stats;
  const recentActivity = liveData?.recentActivity || [];
  const hasActive = (stats?.activeSessionCount ?? 0) > 0;

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
    <PageContainer
      className="overflow-hidden flex flex-col"
      title="Dashboard"
      actions={
        <>
          <span className="text-sm text-muted-foreground hidden sm:inline">
            {status?.totalEntities || 0} entities across {entityTypes.length} types
          </span>
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
        </>
      }
    >

      {/* Combined system + live status bar */}
      <div className={`flex items-center gap-4 px-4 py-2.5 rounded-lg border border-border/50 status-panel flex-wrap ${hasActive ? "live-border border-primary/20" : ""}`}>
        {/* System health indicators */}
        <span className="text-xs font-semibold text-nav-active/80 uppercase tracking-wider">System</span>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-primary animate-glow-pulse " />
          <span className="text-xs text-muted-foreground">Server</span>
        </div>
        <div className="flex items-center gap-1.5">
          {status?.scanning ? (
            <Loader2 className="h-3 w-3 text-primary animate-spin" />
          ) : (
            <span className="w-2 h-2 rounded-full bg-primary animate-glow-pulse " />
          )}
          <span className="text-xs text-muted-foreground">Scanner</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-primary animate-glow-pulse " />
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
          {hasActive && <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />}
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
                <div key={agent.agentId} className={`rounded-lg border px-3 py-2 ${agent.status === "running" ? "border-primary/20 bg-primary/5" : "border-border/30 bg-muted/20"}`}>
                  <div className="flex items-center gap-2">
                    {agent.status === "running" ? (
                      <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
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
            <span className="text-xs font-mono text-primary">
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

      {/* Active Sessions — scrollable region */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="w-[85%] max-w-[1400px] mx-auto space-y-3 py-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Active Sessions</h2>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2 h-7 text-xs">
                  <Activity className="h-3.5 w-3.5" />
                  Recent Activity
                  {recentActivity.length > 0 && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-0.5">{recentActivity.length}</Badge>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-96 max-h-80 overflow-y-auto p-3">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Recent Activity</h3>
                {recentActivity.length === 0 ? (
                  <p className="text-xs text-muted-foreground/60 py-4 text-center">No agents in the past hour</p>
                ) : (
                  <div className="space-y-2">
                    {recentActivity.map((exec, i) => (
                      <RecentActivityItem key={exec.agentId} exec={exec} index={i} />
                    ))}
                  </div>
                )}
              </PopoverContent>
            </Popover>
          </div>
          {activeSessions.length === 0 ? (
            <div className="rounded-xl border bg-card">
              <EmptyState icon={Monitor} title="No active Claude sessions" description="Sessions will appear here when Claude Code is running" />
            </div>
          ) : (
            <div
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
              style={{ gap: "var(--card-gap)" }}
            >
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
                  onRename={(id, name) => renameSession.mutate({ id, name })}
                  sessionNames={sessionNames}
                  healthThresholds={settings?.healthThresholds}
                />
              ))}
            </div>
          )}
        </div>
      </div>

    </PageContainer>
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
  onRename,
  sessionNames,
  healthThresholds,
}: {
  session: ActiveSession;
  index: number;
  tick: number;
  isNew: boolean;
  copiedId: string | null;
  onCopyResume: (id: string) => void;
  onTogglePin: (id: string) => void;
  onRename: (id: string, name: string) => void;
  sessionNames?: Record<string, string>;
  healthThresholds?: { context: { yellow: number; red: number }; cost: { yellow: number; red: number }; messages: { yellow: number; red: number }; dataSize: { yellow: number; red: number } };
}) {
  const title = getSessionDisplayName(session.sessionId, {
    customNames: sessionNames,
    slug: session.slug,
    firstMessage: session.firstMessage,
  });
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  const handleStartRename = () => {
    setRenameValue(sessionNames?.[session.sessionId] || "");
    setIsRenaming(true);
    setTimeout(() => renameInputRef.current?.focus(), 50);
  };

  const handleConfirmRename = () => {
    onRename(session.sessionId, renameValue);
    setIsRenaming(false);
  };

  const handleCancelRename = () => {
    setIsRenaming(false);
  };
  const lastMsg = session.lastMessage ? shortSummary(session.lastMessage, 12) : null;
  const firstMsg = session.firstMessage ? shortSummary(session.firstMessage, 8) : null;
  const isCopied = copiedId === session.sessionId;
  const sc = getStatusConfig(session.status);

  return (
    <Card
      className={`animate-fade-in-up ${sc.cardClass} ${sc.borderClass ? `border ${sc.borderClass}` : ""} ${isNew ? "ring-2 ring-primary/40 ring-offset-1" : ""}`}
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <CardContent className="overflow-hidden" style={{ padding: "var(--card-padding)" }}>
        <div className="flex items-start gap-3">
          <div className="mt-1 flex flex-col items-center gap-0.5 flex-shrink-0">
            <span className={`w-2.5 h-2.5 rounded-full ${sc.dotClass}`} />
            <span className="text-[9px] text-muted-foreground/60 leading-none">{sc.label}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {isRenaming ? (
                <Input
                  ref={renameInputRef}
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleConfirmRename();
                    if (e.key === "Escape") handleCancelRename();
                  }}
                  onBlur={handleConfirmRename}
                  className="h-6 text-sm px-1.5 py-0 w-48"
                  placeholder="Session name..."
                />
              ) : (
                <span className="text-sm font-medium truncate" title={session.slug || session.sessionId}>{title}</span>
              )}
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
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0"
                  onClick={handleStartRename}
                  title="Rename session"
                >
                  <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
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
                  <span className={`tabular-nums ${thresholdColor(session.messageCount ?? 0, healthThresholds?.messages)}`}>{session.messageCount} msgs</span>
                </>
              )}
              {(session.sizeBytes ?? 0) > 0 && (
                <>
                  <span className="text-muted-foreground/30">|</span>
                  <span className={`tabular-nums ${thresholdColor(Math.round((session.sizeBytes ?? 0) / 1024), healthThresholds?.dataSize)}`}>{session.sizeBytes! > 1048576 ? `${(session.sizeBytes! / 1048576).toFixed(1)} MB` : `${Math.round(session.sizeBytes! / 1024)} KB`}</span>
                </>
              )}
              {(session.costEstimate ?? 0) > 0 && (
                <>
                  <span className="text-muted-foreground/30">|</span>
                  <span className={`tabular-nums ${thresholdColor(session.costEstimate ?? 0, healthThresholds?.cost) || "text-amber-400/70"}`}>${session.costEstimate! < 0.01 ? "<0.01" : session.costEstimate!.toFixed(2)}</span>
                </>
              )}
              {session.projectKey && (
                <>
                  <span className="text-muted-foreground/30">|</span>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">{readableProjectKey(session.projectKey)}</Badge>
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
                  <div key={agent.agentId} className={`rounded-md border px-2.5 py-1.5 ${agent.status === "running" ? "border-primary/20 bg-primary/5" : "border-border/30 bg-muted/20"}`}>
                    <div className="flex items-center gap-2 text-xs">
                      {agent.status === "running" ? (
                        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse flex-shrink-0" />
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
