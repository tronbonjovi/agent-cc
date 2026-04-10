import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { PageContainer } from "@/components/page-container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useScanStatus, useRescan } from "@/hooks/use-entities";
import { useCostAnalytics } from "@/hooks/use-sessions";
import { useAppSettings } from "@/hooks/use-settings";
import {
  BarChart3,
  Bot,
  MessageSquare,
  HardDrive,
  FolderOpen,
  DollarSign,
  Activity,
  FileText,
  FolderPlus,
  Trash2,
  Edit3,
  Clock,
  RefreshCw,
} from "lucide-react";
import { formatBytes, formatDayLabel, isToday, relativeTime } from "@/lib/utils";
import { NerveCenterPanel, FileHeatmapPanel, SessionHealthPanel, DecisionLogPanel, WorkflowConfigPanel, WeeklyDigestPanel } from "@/components/session-analytics-panel";
import ChartsTab from "@/components/analytics/charts-tab";

// ---- Types ----

interface StatsOverview {
  sessionsPerDay: { date: string; count: number }[];
  topProjects: { name: string; sessions: number; size: number }[];
  agentTypeDistribution: Record<string, number>;
  modelDistribution: Record<string, number>;
  totalTokensEstimate: number;
  totalSessions: number;
  totalAgentExecutions: number;
  averageSessionSize: number;
}

// ---- Utilities ----

function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(0) + "K";
  return n.toString();
}

function formatUsd(n: number): string {
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(4)}`;
}


const distributionColors: Record<string, string> = {
  Explore: "bg-blue-500",
  Plan: "bg-purple-500",
  "general-purpose": "bg-emerald-500",
  Opus: "bg-orange-500",
  Sonnet: "bg-blue-500",
  Haiku: "bg-green-500",
};

function getDistributionColor(key: string): string {
  for (const [pattern, color] of Object.entries(distributionColors)) {
    if (key.toLowerCase().includes(pattern.toLowerCase())) return color;
  }
  const fallbacks = ["bg-cyan-500", "bg-pink-500", "bg-amber-500", "bg-indigo-500", "bg-teal-500"];
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0;
  return fallbacks[Math.abs(hash) % fallbacks.length];
}

// ---- Shared components ----

function DistributionBars({ data, label }: { data: Record<string, number>; label: string }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((sum, [, v]) => sum + v, 0);
  if (total === 0) return <div className="text-sm text-muted-foreground">No {label.toLowerCase()} data</div>;

  return (
    <div className="space-y-2.5">
      <div className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">{label}</div>
      {entries.map(([key, value]) => {
        const pct = Math.round((value / total) * 100);
        const color = getDistributionColor(key);
        return (
          <div key={key} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground truncate mr-2">{key}</span>
              <span className="font-mono tabular-nums text-xs text-muted-foreground">
                {value} <span className="text-muted-foreground/50">({pct}%)</span>
              </span>
            </div>
            <div className="h-2 rounded-full bg-muted/30 overflow-hidden">
              <div className={`h-full rounded-full ${color} transition-all duration-500`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LoadingSkeleton({ title }: { title: string }) {
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">Loading {title}...</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="pt-6">
              <div className="h-4 bg-muted/30 rounded w-20 mb-2" />
              <div className="h-8 bg-muted/30 rounded w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ---- Tab: Usage ----

function UsageTab() {
  const [, setLocation] = useLocation();
  const { data, isLoading } = useQuery<StatsOverview>({
    queryKey: ["/api/stats/overview"],
    staleTime: 30000,
  });

  if (isLoading || !data) return <LoadingSkeleton title="usage stats" />;

  const maxDayCount = Math.max(...data.sessionsPerDay.map((d) => d.count), 1);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: MessageSquare, color: "text-blue-400", label: "Total Sessions", value: data.totalSessions.toLocaleString() },
          { icon: Bot, color: "text-purple-400", label: "Agent Executions", value: data.totalAgentExecutions.toLocaleString() },
          { icon: HardDrive, color: "text-emerald-400", label: "Avg Session Size", value: formatBytes(data.averageSessionSize) },
          { icon: FolderOpen, color: "text-orange-400", label: "Total Storage", value: formatBytes(data.totalTokensEstimate) },
        ].map((item, i) => (
          <div key={item.label} className="animate-fade-in-up" style={{ animationDelay: `${i * 50}ms` }}>
            <Card>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1.5">
                  <item.icon className={`h-4 w-4 ${item.color}`} />
                  <span className="text-xs font-medium">{item.label}</span>
                </div>
                <div className="text-2xl font-bold font-mono tabular-nums">{item.value}</div>
              </CardContent>
            </Card>
          </div>
        ))}
      </div>

      {/* Sessions per Day */}
      <Card className="animate-fade-in-up" style={{ animationDelay: "200ms" }}>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-blue-400" />
            Sessions per Day
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 ml-1">Last 14 days</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-1.5 h-48">
            {data.sessionsPerDay.map((day) => {
              const heightPct = maxDayCount > 0 ? (day.count / maxDayCount) * 100 : 0;
              const today = isToday(day.date);
              return (
                <div key={day.date} className="flex-1 flex flex-col items-center gap-1 group">
                  <span className={`text-[10px] font-mono tabular-nums transition-opacity ${day.count > 0 ? "opacity-100" : "opacity-0 group-hover:opacity-50"} ${today ? "text-blue-400 font-semibold" : "text-muted-foreground"}`}>
                    {day.count}
                  </span>
                  <div className="w-full flex-1 flex items-end">
                    <div
                      className={`w-full rounded-t-sm transition-all duration-300 min-h-[2px] ${today ? "bg-blue-500" : day.count > 0 ? "bg-blue-500/50 group-hover:bg-blue-500/70" : "bg-muted/20"}`}
                      style={{ height: `${Math.max(heightPct, 2)}%` }}
                    />
                  </div>
                  <span className={`text-[9px] whitespace-nowrap ${today ? "text-blue-400 font-semibold" : "text-muted-foreground/60"}`}>
                    {formatDayLabel(day.date)}
                  </span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Two columns: Projects + Distributions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="animate-fade-in-up" style={{ animationDelay: "250ms" }}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FolderOpen className="h-4 w-4 text-blue-400" />
              Top Projects
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.topProjects.length === 0 ? (
              <p className="text-sm text-muted-foreground">No project data available</p>
            ) : (
              <div className="space-y-0.5">
                <div className="flex items-center text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider px-2 py-1.5">
                  <span className="flex-1">Project</span>
                  <span className="w-20 text-right">Sessions</span>
                  <span className="w-20 text-right">Size</span>
                </div>
                {data.topProjects.map((project) => (
                  <button
                    key={project.name}
                    className="flex items-center w-full text-sm hover:bg-accent/30 px-2 py-2 rounded-md transition-colors text-left group"
                    onClick={() => setLocation("/projects")}
                  >
                    <span className="flex-1 truncate text-muted-foreground group-hover:text-foreground transition-colors">{project.name}</span>
                    <span className="w-20 text-right font-mono tabular-nums text-xs">{project.sessions}</span>
                    <span className="w-20 text-right font-mono tabular-nums text-xs text-muted-foreground">{formatBytes(project.size)}</span>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="animate-fade-in-up" style={{ animationDelay: "300ms" }}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Bot className="h-4 w-4 text-purple-400" />
              Distributions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <DistributionBars data={data.agentTypeDistribution} label="Agent Type" />
            <div className="border-t border-border/50" />
            <DistributionBars data={data.modelDistribution} label="Model" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ---- Tab: Costs ----

function CostsTab() {
  const { data: costs, isLoading } = useCostAnalytics();
  const { data: settings } = useAppSettings();
  const billingMode = settings?.billingMode || "auto";
  const isSub = billingMode === "subscription" || billingMode === "auto";

  if (isLoading || !costs) return <LoadingSkeleton title="cost data" />;

  return (
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
                <span className="font-mono text-muted-foreground truncate min-w-0 max-w-[300px]">{proj}</span>
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
  );
}

// ---- Tab: Activity ----

function getTimePeriod(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHrs = diffMs / (1000 * 60 * 60);
  if (diffHrs < 24 && date.getDate() === now.getDate()) return "Today";
  if (diffHrs < 48) return "Yesterday";
  return "Earlier";
}

const eventIcons: Record<string, React.ElementType> = {
  add: FolderPlus, change: Edit3, unlink: Trash2, addDir: FolderPlus,
};
const eventColors: Record<string, string> = {
  add: "text-green-400", change: "text-amber-400", unlink: "text-red-400", addDir: "text-blue-400",
};
const eventBorderColors: Record<string, string> = {
  add: "border-green-500", change: "border-amber-500", unlink: "border-red-500", addDir: "border-blue-500",
};

function ActivityTab() {
  const { data: changes, isLoading } = useQuery<string[]>({
    queryKey: ["/api/watcher/changes"],
    refetchInterval: 5000,
  });
  const { data: status } = useScanStatus();
  const rescan = useRescan();

  const parsed = (changes || []).map((entry) => {
    const match = entry.match(/^(.+?) \[(.+?)\] (.+)$/);
    if (!match) return { timestamp: "", event: "unknown", path: entry };
    return { timestamp: match[1], event: match[2], path: match[3] };
  }).reverse();

  const grouped = parsed.reduce((acc, entry) => {
    const period = entry.timestamp ? getTimePeriod(entry.timestamp) : "Earlier";
    if (!acc[period]) acc[period] = [];
    acc[period].push(entry);
    return acc;
  }, {} as Record<string, typeof parsed>);

  const statusData = status as any;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { value: statusData?.scanVersion || 0, label: "Scan Version" },
          { value: statusData?.totalEntities || 0, label: "Total Entities" },
          { value: statusData?.totalRelationships || 0, label: "Relationships" },
          { value: `${statusData?.lastScanDuration || 0}ms`, label: "Last Scan" },
        ].map((stat, i) => (
          <Card key={stat.label} className="animate-fade-in-up" style={{ animationDelay: `${i * 50}ms` }}>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold tabular-nums">{stat.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4 text-emerald-400" />
              Change Log
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">{parsed.length} events</Badge>
              <Button variant="outline" size="sm" onClick={() => rescan.mutate()} disabled={rescan.isPending} className="gap-1.5 h-7 text-xs">
                <RefreshCw className={`h-3 w-3 ${rescan.isPending ? "animate-spin" : ""}`} />
                Rescan
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : parsed.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Activity className="h-8 w-8 mx-auto mb-2 opacity-20" />
              <p className="text-sm">No filesystem changes detected yet</p>
              <p className="text-xs mt-1">Changes to skills, memory, MCPs, and configs will appear here</p>
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(grouped).map(([period, entries]) => (
                <div key={period}>
                  <div className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest mb-2">{period}</div>
                  <div className="relative pl-4">
                    <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border/50" />
                    <div className="space-y-0.5">
                      {entries.map((entry, i) => {
                        const Icon = eventIcons[entry.event] || FileText;
                        const color = eventColors[entry.event] || "text-muted-foreground";
                        const borderColor = eventBorderColors[entry.event] || "border-muted";
                        return (
                          <div key={i} className="flex items-center gap-3 py-2 relative animate-fade-in-up" style={{ animationDelay: `${i * 15}ms` }}>
                            <div className={`absolute -left-4 w-2 h-2 rounded-full border-2 ${borderColor} bg-card z-10`} />
                            <Icon className={`h-3.5 w-3.5 flex-shrink-0 ${color}`} />
                            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${color} border-current/30`}>{entry.event}</Badge>
                            <span className="text-sm font-mono truncate flex-1">{entry.path}</span>
                            {entry.timestamp && (
                              <span className="text-[11px] text-muted-foreground font-mono flex-shrink-0 flex items-center gap-1">
                                <Clock className="h-3 w-3" />{relativeTime(entry.timestamp)}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---- Main Analytics Page ----

const NERVE_SUBTABS = [
  { id: "overview", label: "Overview" },
  { id: "files", label: "File Heatmap" },
  { id: "health", label: "Session Health" },
  { id: "decisions", label: "Decisions" },
  { id: "workflows", label: "Workflows" },
] as const;

type NerveSubTabId = typeof NERVE_SUBTABS[number]["id"];

function NerveCenterWithSubtabs() {
  const [nerveSubTab, setNerveSubTab] = useState<NerveSubTabId>("overview");
  const [digestOpen, setDigestOpen] = useState(false);

  return (
    <div className="space-y-4">
      {/* Secondary tab bar */}
      <div className="flex gap-1 overflow-x-auto pb-2 border-b border-border/50 scrollbar-thin">
        {NERVE_SUBTABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setNerveSubTab(tab.id)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
              nerveSubTab === tab.id
                ? "bg-primary/20 text-primary border border-primary/30"
                : "text-muted-foreground hover:bg-accent/30 hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {nerveSubTab === "overview" && (
        <div className="space-y-4">
          <NerveCenterPanel />
          {/* Weekly Digest — collapsible section */}
          <div className="rounded-xl border bg-card">
            <button
              onClick={() => setDigestOpen(!digestOpen)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-accent/30 transition-colors rounded-xl"
            >
              <span>Weekly Digest</span>
              <span className="text-xs text-muted-foreground">{digestOpen ? "collapse" : "expand"}</span>
            </button>
            {digestOpen && (
              <div className="px-4 pb-4">
                <WeeklyDigestPanel />
              </div>
            )}
          </div>
        </div>
      )}

      {nerveSubTab === "files" && <FileHeatmapPanel />}
      {nerveSubTab === "health" && <SessionHealthPanel />}
      {nerveSubTab === "decisions" && <DecisionLogPanel />}
      {nerveSubTab === "workflows" && <WorkflowConfigPanel />}
    </div>
  );
}

export default function Stats() {
  const defaultTab = new URLSearchParams(window.location.search).get("tab") || "nerve-center";

  return (
    <PageContainer title="Analytics">
      <p className="text-sm text-muted-foreground -mt-2">
        Nerve center, costs, activity, and charts
      </p>

      <Tabs defaultValue={defaultTab}>
        <div className="overflow-x-auto whitespace-nowrap scrollbar-thin">
          <TabsList>
            <TabsTrigger value="nerve-center" className="whitespace-nowrap">Nerve Center</TabsTrigger>
            <TabsTrigger value="costs" className="whitespace-nowrap">Costs</TabsTrigger>
            <TabsTrigger value="activity" className="whitespace-nowrap">Activity</TabsTrigger>
            <TabsTrigger value="charts" className="whitespace-nowrap">Charts</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="nerve-center" className="mt-4">
          <NerveCenterWithSubtabs />
        </TabsContent>

        <TabsContent value="costs" className="mt-4">
          <CostsTab />
        </TabsContent>

        <TabsContent value="activity" className="mt-4">
          <ActivityTab />
        </TabsContent>

        <TabsContent value="charts" className="mt-4">
          <ChartsTab />
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}
