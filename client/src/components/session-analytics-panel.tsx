import { useState } from "react";
import { useCostAnalytics, useFileHeatmap, useHealthAnalytics, useStaleAnalytics, useFileTimeline, useNerveCenter, useBashKnowledge, useBashSearch, useWeeklyDigest, usePromptTemplates, useCreatePrompt, useDeletePrompt, useWorkflowConfig, useUpdateWorkflow, useRunWorkflows } from "@/hooks/use-sessions";
import { useAppSettings } from "@/hooks/use-settings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DollarSign, FileText, Activity, Archive,
  Calendar, Settings,
  Plus, Play, BookOpen,
  Server, TerminalSquare,
  X, AlertTriangle, Check, Copy, Trash2, Loader2,
} from "lucide-react";
import { formatBytes, relativeTime } from "@/lib/utils";
import { useLocation } from "wouter";

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

const ANALYTICS_TABS = [
  { id: "nerve-center", label: "Nerve Center" },
  { id: "usage", label: "Usage Analytics" },
] as const;

type AnalyticsTabId = typeof ANALYTICS_TABS[number]["id"];

export function SessionAnalyticsTab() {
  const { data: costs } = useCostAnalytics();
  const { data: settings } = useAppSettings();
  const billingMode = settings?.billingMode || "auto";
  const isSub = billingMode === "subscription" || billingMode === "auto"; // default to subscription view

  const [analyticsTab, setAnalyticsTab] = useState<AnalyticsTabId>(() => {
    const params = new URLSearchParams(window.location.search);
    return (params.get("atab") as AnalyticsTabId) || "nerve-center";
  });

  const handleTabChange = (tab: AnalyticsTabId) => {
    setAnalyticsTab(tab);
    const params = new URLSearchParams(window.location.search);
    params.set("atab", tab);
    window.history.replaceState({}, "", `?${params.toString()}`);
  };

  return (
    <div className="space-y-4">
      {/* Analytics Tab Bar */}
      <div className="flex gap-1 overflow-x-auto pb-2 border-b border-border/50 scrollbar-thin">
        {ANALYTICS_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
              analyticsTab === tab.id
                ? "bg-primary/20 text-primary border border-primary/30"
                : "text-muted-foreground hover:bg-accent/30 hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {analyticsTab === "nerve-center" && <NerveCenterPanel />}

      {analyticsTab === "usage" && costs && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-green-400" /> {isSub ? "Usage Analytics" : "Cost Analytics"}
            <span className="text-[11px] text-muted-foreground font-normal">({costs.totalSessions} sessions scanned in {costs.durationMs}ms){isSub ? " — Subscription plan" : ""}</span>
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-xl border bg-card p-4">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground/60 font-medium">{isSub ? "Total Tokens" : "Total Cost"}</p>
              <p className="text-2xl font-bold font-mono mt-1 text-green-400">{isSub ? formatTokens(costs.totalInputTokens + costs.totalOutputTokens) : formatUsd(costs.totalCostUsd)}</p>
            </div>
            <div className="rounded-xl border bg-card p-4">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground/60 font-medium">Input Tokens</p>
              <p className="text-2xl font-bold font-mono mt-1">{formatTokens(costs.totalInputTokens)}</p>
            </div>
            <div className="rounded-xl border bg-card p-4">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground/60 font-medium">Output Tokens</p>
              <p className="text-2xl font-bold font-mono mt-1">{formatTokens(costs.totalOutputTokens)}</p>
            </div>
            <div className="rounded-xl border bg-card p-4">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground/60 font-medium">Sessions</p>
              <p className="text-2xl font-bold font-mono mt-1">{costs.totalSessions}</p>
            </div>
          </div>

          {/* By model */}
          <div className="rounded-xl border bg-card p-4">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground/60 font-medium mb-2">Cost by Model</p>
            <div className="space-y-1.5">
              {Object.entries(costs.byModel).sort((a, b) => b[1].cost - a[1].cost).map(([model, data]) => (
                <div key={model} className="flex items-center justify-between text-xs">
                  <span className="font-mono text-muted-foreground">{model}</span>
                  <div className="flex items-center gap-4">
                    <span className="text-muted-foreground/60">{formatTokens(data.tokens)} tokens</span>
                    <span className="text-muted-foreground/60">{data.sessions} sessions</span>
                    <span className="font-mono font-medium text-green-400 w-20 text-right">{formatUsd(data.cost)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* By day (last 14 days) */}
          {costs.byDay.length > 0 && (
            <div className="rounded-xl border bg-card p-4">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground/60 font-medium mb-2">Daily Spend (last 14 days)</p>
              <div className="space-y-1">
                {costs.byDay.slice(-14).map(d => {
                  const maxCost = Math.max(...costs.byDay.slice(-14).map(x => x.cost));
                  const pct = maxCost > 0 ? (d.cost / maxCost) * 100 : 0;
                  return (
                    <div key={d.date} className="flex items-center gap-2 text-xs">
                      <span className="font-mono text-muted-foreground/60 w-20 flex-shrink-0">{d.date.slice(5)}</span>
                      <div className="flex-1 h-4 bg-muted/30 rounded overflow-hidden">
                        <div className="h-full bg-green-500/30 rounded" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="font-mono text-green-400 w-16 text-right flex-shrink-0">{formatUsd(d.cost)}</span>
                      <span className="text-muted-foreground/50 w-10 text-right flex-shrink-0">{d.sessions}s</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Top sessions by cost */}
          {costs.topSessions.length > 0 && (
            <div className="rounded-xl border bg-card p-4">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground/60 font-medium mb-2">Most Expensive Sessions</p>
              <div className="space-y-1">
                {costs.topSessions.slice(0, 10).map((s, i) => (
                  <div key={s.sessionId} className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground/50 w-5 text-right">#{i + 1}</span>
                    <span className="text-muted-foreground truncate flex-1">{s.firstMessage || "(no message)"}</span>
                    <span className="text-muted-foreground/50">{formatTokens(s.tokens)}</span>
                    <span className="font-mono text-green-400 w-16 text-right font-medium">{formatUsd(s.cost)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* By project */}
          {Object.keys(costs.byProject).length > 0 && (
            <div className="rounded-xl border bg-card p-4">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground/60 font-medium mb-2">Cost by Project</p>
              <div className="space-y-1">
                {Object.entries(costs.byProject).sort((a, b) => b[1].cost - a[1].cost).slice(0, 10).map(([proj, data]) => (
                  <div key={proj} className="flex items-center justify-between text-xs">
                    <span className="font-mono text-muted-foreground truncate max-w-[300px]">{proj}</span>
                    <div className="flex items-center gap-4">
                      <span className="text-muted-foreground/50">{data.sessions} sessions</span>
                      <span className="font-mono text-green-400 w-16 text-right font-medium">{formatUsd(data.cost)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  );
}

export function FileHeatmapPanel() {
  const { data: files } = useFileHeatmap();
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      {files && files.files.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium flex items-center gap-2">
            <FileText className="h-4 w-4 text-orange-400" /> File Heatmap
            <span className="text-[11px] text-muted-foreground font-normal">({files.totalFiles} files, {files.totalOperations} operations)</span>
          </h2>
          <div className="rounded-xl border bg-card p-4">
            <div className="space-y-1">
              {files.files.slice(0, 25).map((f, i) => {
                const maxTouch = files.files[0]?.touchCount || 1;
                const pct = (f.touchCount / maxTouch) * 100;
                return (
                  <div key={f.filePath} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-muted/30 rounded px-1 -mx-1 py-0.5" onClick={() => setSelectedFile(selectedFile === f.filePath ? null : f.filePath)}>
                    <span className="text-muted-foreground/50 w-5 text-right">#{i + 1}</span>
                    <span className="font-mono text-orange-400/80 hover:text-orange-300 truncate flex-1" title={f.filePath}>{f.fileName}</span>
                    <div className="w-32 h-3 bg-muted/30 rounded overflow-hidden flex-shrink-0">
                      <div className="h-full bg-orange-500/40 rounded" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-muted-foreground/60 w-8 text-right">{f.touchCount}</span>
                    <div className="flex gap-1 w-24 flex-shrink-0">
                      {f.operations.read > 0 && <Badge variant="outline" className="text-[9px] px-1 py-0 border-blue-500/20 text-blue-400">R:{f.operations.read}</Badge>}
                      {f.operations.edit > 0 && <Badge variant="outline" className="text-[9px] px-1 py-0 border-amber-500/20 text-amber-400">E:{f.operations.edit}</Badge>}
                      {f.operations.write > 0 && <Badge variant="outline" className="text-[9px] px-1 py-0 border-green-500/20 text-green-400">W:{f.operations.write}</Badge>}
                    </div>
                    <span className="text-muted-foreground/40 text-[10px] w-12 text-right">{f.sessionCount}s</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
      {selectedFile && <FileTimelinePanel filePath={selectedFile} onClose={() => setSelectedFile(null)} />}
    </div>
  );
}

/** Map health reason to a color class for the pill */
function reasonPillColor(reason: string): string {
  // Red for error-related reasons
  if (reason === "high error rate" || reason === "excessive retries" || reason === "context overflow") {
    return "bg-red-500/15 text-red-400";
  }
  // Amber for warnings
  return "bg-amber-500/15 text-amber-400";
}

/** Extract a short project name from an encoded projectKey */
function shortProjectName(key?: string): string {
  if (!key) return "unknown";
  // Keys look like -home-tron-dev-projects-agent-cc — grab the last path segment
  const parts = key.replace(/^-/, "").split("-");
  return parts[parts.length - 1] || key;
}

type SortField = "sessionId" | "projectKey" | "lastTs" | "toolErrors" | "estimatedCostUsd" | "healthScore";
type SortDir = "asc" | "desc";

export function SessionHealthPanel() {
  const { data: health } = useHealthAnalytics();
  const { data: stale } = useStaleAnalytics();
  const [, setLocation] = useLocation();
  const [showGood, setShowGood] = useState(false);
  const [sortField, setSortField] = useState<SortField>("lastTs");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir(field === "lastTs" ? "desc" : "asc");
    }
  };

  const sortIndicator = (field: SortField) => {
    if (sortField !== field) return "";
    return sortDir === "asc" ? " \u2191" : " \u2193";
  };

  // Filter sessions
  const filtered = health
    ? health.sessions.filter(s => showGood || s.healthScore !== "good")
    : [];

  // Sort sessions
  const sorted = [...filtered].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    switch (sortField) {
      case "sessionId":
        return dir * a.sessionId.localeCompare(b.sessionId);
      case "projectKey":
        return dir * (a.projectKey || "").localeCompare(b.projectKey || "");
      case "lastTs":
        return dir * ((a.lastTs || "").localeCompare(b.lastTs || ""));
      case "toolErrors":
        return dir * (a.toolErrors - b.toolErrors);
      case "estimatedCostUsd":
        return dir * ((a.estimatedCostUsd ?? 0) - (b.estimatedCostUsd ?? 0));
      case "healthScore": {
        const order: Record<string, number> = { poor: 0, fair: 1, good: 2 };
        return dir * ((order[a.healthScore] ?? 1) - (order[b.healthScore] ?? 1));
      }
      default:
        return 0;
    }
  });

  const headerClass = "px-2 py-2 text-[11px] uppercase tracking-wider text-muted-foreground/60 font-medium cursor-pointer hover:text-foreground transition-colors select-none whitespace-nowrap text-left";

  return (
    <div className="space-y-6">
      {health && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4 text-red-400" /> Session Health
            </h2>
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={showGood}
                onChange={e => setShowGood(e.target.checked)}
                className="rounded border-border"
              />
              Include good sessions
            </label>
          </div>

          {/* Summary counters */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="text-green-400 font-medium">{health.goodCount} good</span>
            <span className="text-amber-400 font-medium">{health.fairCount} fair</span>
            <span className="text-red-400 font-medium">{health.poorCount} poor</span>
          </div>

          {sorted.length === 0 ? (
            <div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
              No unhealthy sessions found
            </div>
          ) : (
            <div className="rounded-xl border bg-card overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className={headerClass} onClick={() => handleSort("sessionId")}>Session{sortIndicator("sessionId")}</th>
                    <th className={headerClass} onClick={() => handleSort("projectKey")}>Project{sortIndicator("projectKey")}</th>
                    <th className={headerClass} onClick={() => handleSort("lastTs")}>When{sortIndicator("lastTs")}</th>
                    <th className={headerClass} onClick={() => handleSort("toolErrors")}>Errors{sortIndicator("toolErrors")}</th>
                    <th className={headerClass} onClick={() => handleSort("estimatedCostUsd")}>Cost{sortIndicator("estimatedCostUsd")}</th>
                    <th className={`${headerClass} cursor-default hover:text-muted-foreground/60`}>Health Reasons</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map(s => (
                    <tr
                      key={s.sessionId}
                      className="border-b border-border/30 hover:bg-accent/20 cursor-pointer transition-colors"
                      onClick={() => setLocation(`/sessions?highlight=${s.sessionId}`)}
                    >
                      <td className="px-2 py-2 font-mono text-muted-foreground">
                        <span className={`inline-block w-2 h-2 rounded-full mr-2 ${
                          s.healthScore === "poor" ? "bg-red-500" : s.healthScore === "fair" ? "bg-amber-500" : "bg-green-500"
                        }`} />
                        {s.sessionId.slice(0, 8)}...
                      </td>
                      <td className="px-2 py-2 text-muted-foreground truncate max-w-[120px]">{shortProjectName(s.projectKey)}</td>
                      <td className="px-2 py-2 text-muted-foreground whitespace-nowrap">{s.lastTs ? relativeTime(s.lastTs) : "-"}</td>
                      <td className="px-2 py-2 font-mono text-red-400">{s.toolErrors}</td>
                      <td className="px-2 py-2 font-mono text-amber-400">{formatUsd(s.estimatedCostUsd ?? 0)}</td>
                      <td className="px-2 py-2">
                        <div className="flex flex-wrap gap-1">
                          {(s.healthReasons || []).map(reason => (
                            <span key={reason} className={`inline-block text-[10px] px-1.5 py-0.5 rounded-full ${reasonPillColor(reason)}`}>
                              {reason}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {stale && (stale.totalStale > 0 || stale.totalEmpty > 0) && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium flex items-center gap-2">
            <Archive className="h-4 w-4 text-amber-400" /> Stale Sessions
          </h2>
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
            <div className="flex items-center gap-4 text-sm">
              <span><strong className="text-amber-400">{stale.totalEmpty}</strong> empty sessions</span>
              <span><strong className="text-amber-400">{stale.totalStale}</strong> stale sessions (30+ days, &lt;5 msgs)</span>
              <span className="text-muted-foreground">Reclaimable: <strong>{formatBytes(stale.reclaimableBytes)}</strong></span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function NerveCenterPanel() {
  const { data } = useNerveCenter();
  if (!data) return null;

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-medium flex items-center gap-2">
        <Server className="h-4 w-4 text-cyan-400" /> Operations Nerve Center
        <span className="text-[11px] text-muted-foreground font-normal">(auto-refreshes every 30s)</span>
      </h2>
      <div className="flex gap-2 flex-wrap">
        {data.services.map(svc => (
          <div key={svc.name} className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border ${
            svc.status === "up" ? "border-green-500/30 bg-green-500/5 text-green-400" : "border-red-500/30 bg-red-500/5 text-red-400"
          }`}>
            <span className={`w-2 h-2 rounded-full ${svc.status === "up" ? "bg-green-500" : "bg-red-500"}`} />
            {svc.name} :{svc.port}
            {svc.responseMs !== undefined && <span className="text-muted-foreground/50">{svc.responseMs}ms</span>}
          </div>
        ))}
      </div>
      <div className="rounded-xl border bg-card p-3 flex items-center justify-between">
        <div>
          <span className="text-[11px] text-muted-foreground/60 uppercase tracking-wider">Weekly Spend Pacing</span>
          <p className="text-lg font-bold font-mono text-green-400">{formatUsd(data.costPacing.thisWeek)}</p>
        </div>
        <div className="text-right">
          <span className="text-[11px] text-muted-foreground/60">vs avg {formatUsd(data.costPacing.avgWeek)}</span>
          <p className={`text-lg font-bold font-mono ${data.costPacing.pacingPct > 120 ? "text-red-400" : data.costPacing.pacingPct > 100 ? "text-amber-400" : "text-green-400"}`}>
            {data.costPacing.pacingPct}%
          </p>
        </div>
      </div>
      {data.attentionItems.length > 0 && (
        <div className="space-y-1">
          {data.attentionItems.map((item, i) => (
            <div key={i} className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded border ${
              item.severity === "critical" ? "border-red-500/30 bg-red-500/5 text-red-400" :
              item.severity === "warning" ? "border-amber-500/30 bg-amber-500/5 text-amber-400" :
              "border-blue-500/20 bg-blue-500/5 text-blue-400"
            }`}>
              <AlertTriangle className="h-3 w-3 flex-shrink-0" />
              {item.message}
            </div>
          ))}
        </div>
      )}
      {data.overnightActivity.length > 0 && (
        <div>
          <span className="text-[11px] text-muted-foreground/60 uppercase tracking-wider">Recent Activity (12h)</span>
          <div className="mt-1 space-y-0.5">
            {data.overnightActivity.slice(0, 5).map((a, i) => (
              <p key={i} className="text-xs text-muted-foreground">- {a}</p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

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

export function WeeklyDigestPanel() {
  const { data: digest } = useWeeklyDigest();
  if (!digest) return null;

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-medium flex items-center gap-2">
        <Calendar className="h-4 w-4 text-blue-400" /> Weekly Digest
        <span className="text-[11px] text-muted-foreground font-normal">{digest.weekStart} to {digest.weekEnd}</span>
      </h2>
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
          <div><p className="text-[11px] text-muted-foreground/60">Sessions</p><p className="text-xl font-bold font-mono">{digest.totalSessions}</p></div>
          <div><p className="text-[11px] text-muted-foreground/60">Cost</p><p className="text-xl font-bold font-mono text-green-400">{formatUsd(digest.totalCost)}</p></div>
          <div><p className="text-[11px] text-muted-foreground/60">Tokens</p><p className="text-xl font-bold font-mono">{formatTokens(digest.totalTokens)}</p></div>
          <div><p className="text-[11px] text-muted-foreground/60">Health</p><p className="text-xl font-bold font-mono"><span className="text-green-400">{digest.healthSummary.good}</span>/<span className="text-amber-400">{digest.healthSummary.fair}</span>/<span className="text-red-400">{digest.healthSummary.poor}</span></p></div>
        </div>
        {digest.topAccomplishments.length > 0 && (
          <div>
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground/60 font-medium mb-1">Accomplishments</p>
            <div className="space-y-0.5">
              {digest.topAccomplishments.slice(0, 5).map((a, i) => (
                <p key={i} className="text-xs text-muted-foreground">- {a}</p>
              ))}
            </div>
          </div>
        )}
        {digest.projectBreakdown.length > 0 && (
          <div>
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground/60 font-medium mb-1">Projects</p>
            <div className="space-y-0.5">
              {digest.projectBreakdown.slice(0, 5).map(p => (
                <div key={p.project} className="flex justify-between text-xs">
                  <span className="font-mono text-muted-foreground truncate">{p.project}</span>
                  <span className="text-muted-foreground/60">{p.sessions}s / {formatUsd(p.cost)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function PromptLibraryPanel() {
  const { data: templates } = usePromptTemplates();
  const createPrompt = useCreatePrompt();
  const deletePrompt = useDeletePrompt();
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPrompt, setNewPrompt] = useState("");
  const [copiedPromptId, setCopiedPromptId] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-indigo-400" /> Prompt Library
          <span className="text-[11px] text-muted-foreground font-normal">({templates?.length || 0} templates)</span>
        </h2>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowForm(!showForm)}>
          <Plus className="h-3.5 w-3.5" /> New Template
        </Button>
      </div>

      {showForm && (
        <div className="rounded-xl border bg-card p-4 space-y-2">
          <Input placeholder="Template name" value={newName} onChange={e => setNewName(e.target.value)} />
          <textarea
            placeholder="Prompt text..."
            value={newPrompt}
            onChange={e => setNewPrompt(e.target.value)}
            className="w-full h-24 text-xs font-mono bg-muted/30 rounded-lg p-3 border border-border resize-none"
          />
          <div className="flex gap-2">
            <Button size="sm" disabled={!newName || !newPrompt || createPrompt.isPending} onClick={() => {
              createPrompt.mutate({ name: newName, prompt: newPrompt }, {
                onSuccess: () => { setNewName(""); setNewPrompt(""); setShowForm(false); },
              });
            }}>Save</Button>
            <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {templates && templates.length > 0 && (
        <div className="space-y-2">
          {templates.map(t => (
            <div key={t.id} className="rounded-xl border bg-card p-3 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{t.name}</p>
                <p className="text-xs text-muted-foreground line-clamp-2 font-mono mt-0.5">{t.prompt}</p>
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <button
                  className="p-1.5 rounded hover:bg-accent transition-colors"
                  title="Copy prompt"
                  onClick={() => { navigator.clipboard.writeText(t.prompt); setCopiedPromptId(t.id); setTimeout(() => setCopiedPromptId(null), 1500); }}
                >
                  {copiedPromptId === t.id ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
                </button>
                <button
                  className="p-1.5 rounded hover:bg-red-500/10 transition-colors"
                  title="Delete"
                  onClick={() => deletePrompt.mutate(t.id)}
                >
                  <Trash2 className="h-3.5 w-3.5 text-red-400" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function WorkflowConfigPanel() {
  const { data: config } = useWorkflowConfig();
  const updateWorkflow = useUpdateWorkflow();
  const runWorkflows = useRunWorkflows();

  if (!config) return null;

  const toggle = (key: keyof typeof config) => {
    updateWorkflow.mutate({ [key]: !config[key] });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium flex items-center gap-2">
          <Settings className="h-4 w-4 text-gray-400" /> Auto-Workflows
        </h2>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => runWorkflows.mutate()} disabled={runWorkflows.isPending}>
          {runWorkflows.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          Run Now
        </Button>
      </div>
      <div className="rounded-xl border bg-card p-4 space-y-3">
        {([
          { key: "autoSummarize" as const, label: "Auto-summarize new sessions", desc: "Summarize completed sessions automatically" },
          { key: "autoArchiveStale" as const, label: "Flag stale sessions", desc: "Identify sessions older than 30 days with <5 messages" },
        ]).map(item => (
          <div key={item.key} className="flex items-center justify-between">
            <div>
              <p className="text-sm">{item.label}</p>
              <p className="text-[11px] text-muted-foreground">{item.desc}</p>
            </div>
            <button
              onClick={() => toggle(item.key)}
              className={`w-10 h-5 rounded-full transition-colors ${config[item.key] ? "bg-blue-500" : "bg-muted"}`}
            >
              <div className={`w-4 h-4 rounded-full bg-white transition-transform ${config[item.key] ? "translate-x-5" : "translate-x-0.5"}`} />
            </button>
          </div>
        ))}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm">Daily cost alert</p>
            <p className="text-[11px] text-muted-foreground">Notify when daily spend exceeds threshold</p>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">$</span>
            <input
              type="number"
              value={config.costAlertThreshold || ""}
              onChange={e => updateWorkflow.mutate({ costAlertThreshold: e.target.value ? Number(e.target.value) : null })}
              placeholder="off"
              className="w-16 text-xs font-mono px-2 py-1 rounded border border-border bg-background"
            />
          </div>
        </div>
      </div>
      {runWorkflows.data && (
        <div className="text-xs text-muted-foreground space-y-0.5">
          {(runWorkflows.data as { ran: string[]; errors: string[] }).ran.map((r: string, i: number) => <p key={i} className="text-green-400">- {r}</p>)}
          {(runWorkflows.data as { ran: string[]; errors: string[] }).errors.map((e: string, i: number) => <p key={i} className="text-red-400">- {e}</p>)}
        </div>
      )}
    </div>
  );
}

function FileTimelinePanel({ filePath, onClose }: { filePath: string; onClose: () => void }) {
  const { data, isLoading } = useFileTimeline(filePath);
  const fileName = filePath.replace(/\\/g, "/").split("/").pop() || filePath;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium flex items-center gap-2">
          <FileText className="h-4 w-4 text-orange-400" /> Timeline: <code className="font-mono text-orange-400">{fileName}</code>
          {data && <span className="text-[11px] text-muted-foreground font-normal">({data.totalSessions} sessions, {data.entries.length} changes)</span>}
        </h2>
        <Button variant="ghost" size="sm" onClick={onClose}><X className="h-3.5 w-3.5" /></Button>
      </div>
      {isLoading && <div className="text-sm text-muted-foreground">Loading...</div>}
      {data && data.entries.length > 0 && (
        <div className="rounded-xl border bg-card p-4 space-y-2 max-h-96 overflow-auto">
          {data.entries.map((e, i) => (
            <div key={i} className="border-b border-border/30 pb-2 last:border-0">
              <div className="flex items-center gap-2 text-xs mb-1">
                <Badge variant="outline" className={`text-[9px] px-1 py-0 ${e.tool === "Write" ? "border-green-500/20 text-green-400" : "border-amber-500/20 text-amber-400"}`}>
                  {e.tool}
                </Badge>
                <span className="text-muted-foreground/50 font-mono">{e.timestamp ? new Date(e.timestamp).toLocaleString() : ""}</span>
                <span className="text-muted-foreground truncate flex-1">{e.firstMessage}</span>
              </div>
              {e.tool === "Edit" && e.oldString && e.newString && (
                <div className="font-mono text-[11px] space-y-1 ml-4">
                  <pre className="bg-red-500/10 text-red-300 rounded px-2 py-1 overflow-x-auto whitespace-pre-wrap max-h-16">- {e.oldString.slice(0, 150)}</pre>
                  <pre className="bg-green-500/10 text-green-300 rounded px-2 py-1 overflow-x-auto whitespace-pre-wrap max-h-16">+ {e.newString.slice(0, 150)}</pre>
                </div>
              )}
              {e.tool === "Write" && e.content && (
                <pre className="font-mono text-[11px] bg-green-500/10 text-green-300 rounded px-2 py-1 overflow-x-auto whitespace-pre-wrap max-h-16 ml-4">{e.content.slice(0, 200)}</pre>
              )}
            </div>
          ))}
        </div>
      )}
      {data && data.entries.length === 0 && <p className="text-xs text-muted-foreground">No changes found for this file</p>}
    </div>
  );
}
