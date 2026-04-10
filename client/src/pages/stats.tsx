import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { PageContainer } from "@/components/page-container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ListSkeleton } from "@/components/skeleton";
import { useScanStatus, useRescan } from "@/hooks/use-entities";
import {
  BarChart3,
  Bot,
  MessageSquare,
  HardDrive,
  FolderOpen,
  DollarSign,
  TrendingUp,
  Zap,
  Cpu,
  Shield,
  Activity,
  FileText,
  FolderPlus,
  Trash2,
  Edit3,
  Clock,
  Search,
  Star,
  ExternalLink,
  Sparkles,
  RefreshCw,
} from "lucide-react";
import { formatBytes, formatDayLabel, isToday, relativeTime } from "@/lib/utils";
import { SessionAnalyticsTab } from "@/components/session-analytics-panel";
import { Suspense, lazy } from "react";
const GraphPage = lazy(() => import("@/pages/graph"));

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

interface CostTokenBreakdown {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreation: number;
}

interface CostAnalytics {
  totalCost: number;
  totalTokens: CostTokenBreakdown;
  weeklyComparison: { thisWeek: number; lastWeek: number; changePct: number };
  monthlyTotalCost: number;
  byModel: Record<string, {
    cost: number;
    tokens: CostTokenBreakdown;
    sessions: number;
  }>;
  byProject: Array<{
    projectKey: string;
    projectName: string;
    cost: number;
    sessions: number;
  }>;
  byDay: Array<{
    date: string;
    cost: number;
    computeCost: number;
    cacheCost: number;
  }>;
  topSessions: Array<{
    sessionId: string;
    firstMessage: string;
    model: string;
    cost: number;
    subagentCount: number;
    subagentCost: number;
    tokens: CostTokenBreakdown;
  }>;
  planLimits: {
    pro: { limit: number; label: string };
    max5x: { limit: number; label: string };
    max20x: { limit: number; label: string };
  };
}

// ---- Utilities ----

function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(0) + "K";
  return n.toString();
}

function formatCost(n: number): string {
  return "$" + n.toFixed(2);
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

const MODEL_COLORS: Record<string, string> = {
  opus: "bg-orange-500",
  sonnet: "bg-blue-500",
  haiku: "bg-green-500",
};

function getModelColor(model: string): string {
  const lower = model.toLowerCase();
  for (const [key, color] of Object.entries(MODEL_COLORS)) {
    if (lower.includes(key)) return color;
  }
  const fallbacks = ["bg-cyan-500", "bg-pink-500", "bg-amber-500", "bg-indigo-500"];
  let hash = 0;
  for (let i = 0; i < model.length; i++) hash = (hash * 31 + model.charCodeAt(i)) | 0;
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
            <Card className="gradient-border">
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
                      className={`w-full rounded-t-sm transition-all duration-300 min-h-[2px] ${today ? "bg-gradient-to-t from-blue-500 to-blue-400 shadow-[0_0_8px_rgba(59,130,246,0.3)]" : day.count > 0 ? "bg-gradient-to-t from-blue-500/60 to-blue-400/40 group-hover:from-blue-500/80 group-hover:to-blue-400/60" : "bg-muted/20"}`}
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
  const [, setLocation] = useLocation();
  const [period, setPeriod] = useState<7 | 30 | 90>(30);
  const { data, isLoading } = useQuery<CostAnalytics>({
    queryKey: ["/api/analytics/costs", period],
    queryFn: async () => {
      const res = await fetch(`/api/analytics/costs?days=${period}`);
      if (!res.ok) throw new Error("Failed to fetch cost analytics");
      return res.json();
    },
    staleTime: 60000,
  });

  if (isLoading || !data) return <LoadingSkeleton title="cost data" />;

  const maxDayCost = Math.max(...data.byDay.map((d) => d.cost), 0.01);
  const currentSpend = data.monthlyTotalCost;
  const maxPlanLimit = data.planLimits.max20x.limit;
  const spendPctOf100 = maxPlanLimit > 0 ? (currentSpend / data.planLimits.max5x.limit) * 100 : 0;
  let spendColor = "bg-green-500";
  if (spendPctOf100 > 80) spendColor = "bg-red-500";
  else if (spendPctOf100 > 50) spendColor = "bg-yellow-500";
  const modelEntries = Object.entries(data.byModel).sort((a, b) => b[1].cost - a[1].cost);

  return (
    <div className="space-y-6">
      {/* Period Selector */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground mr-1">Period:</span>
        {([7, 30, 90] as const).map((d) => (
          <button
            key={d}
            onClick={() => setPeriod(d)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              period === d
                ? "bg-primary text-primary-foreground"
                : "bg-muted/50 text-muted-foreground hover:bg-muted"
            }`}
          >
            {d}d
          </button>
        ))}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: DollarSign, color: "text-green-400", label: `Cost (${period}d)`, value: formatCost(data.totalCost) },
          { icon: TrendingUp, color: "text-blue-400", label: "Compute Tokens", value: formatTokens(data.totalTokens.input + data.totalTokens.output) },
          { icon: Zap, color: "text-amber-400", label: "Cache Tokens", value: formatTokens(data.totalTokens.cacheRead + data.totalTokens.cacheCreation) },
          { icon: Shield, color: "text-purple-400", label: "Sessions", value: Object.values(data.byModel).reduce((s, m) => s + m.sessions, 0).toString() },
        ].map((item, i) => (
          <div key={item.label} className="animate-fade-in-up" style={{ animationDelay: `${i * 50}ms` }}>
            <Card className="gradient-border">
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

      {/* Weekly Comparison */}
      {data.weeklyComparison && (
        <Card className="animate-fade-in-up" style={{ animationDelay: "150ms" }}>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <TrendingUp className={`h-5 w-5 ${data.weeklyComparison.changePct > 0 ? "text-red-400" : data.weeklyComparison.changePct < 0 ? "text-green-400" : "text-muted-foreground"}`} />
                <div>
                  <div className="text-sm font-medium">This Week</div>
                  <div className="text-2xl font-bold font-mono tabular-nums">{formatCost(data.weeklyComparison.thisWeek)}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm text-muted-foreground">vs Last Week</div>
                <div className="text-lg font-mono tabular-nums text-muted-foreground">{formatCost(data.weeklyComparison.lastWeek)}</div>
              </div>
              <div className={`text-right px-3 py-1.5 rounded-lg ${
                data.weeklyComparison.changePct > 20 ? "bg-red-500/10 text-red-400" :
                data.weeklyComparison.changePct > 0 ? "bg-amber-500/10 text-amber-400" :
                data.weeklyComparison.changePct < 0 ? "bg-green-500/10 text-green-400" :
                "bg-muted/30 text-muted-foreground"
              }`}>
                <div className="text-xs">Change</div>
                <div className="text-lg font-bold font-mono tabular-nums">
                  {data.weeklyComparison.changePct > 0 ? "+" : ""}{data.weeklyComparison.changePct}%
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Daily Cost Chart */}
      <Card className="animate-fade-in-up" style={{ animationDelay: "200ms" }}>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-green-400" />
            Daily Cost
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 ml-1">{`Last ${period} days`}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-1 h-48">
            {data.byDay.map((day) => {
              const totalHeight = maxDayCost > 0 ? (day.cost / maxDayCost) * 100 : 0;
              const cacheHeight = maxDayCost > 0 ? (day.cacheCost / maxDayCost) * 100 : 0;
              const computeHeight = totalHeight - cacheHeight;
              const today = isToday(day.date);
              return (
                <div key={day.date} className="flex-1 flex flex-col items-center gap-1 group">
                  <span className={`text-[9px] font-mono tabular-nums transition-opacity ${day.cost > 0 ? "opacity-0 group-hover:opacity-100" : "opacity-0"} ${today ? "text-green-400 font-semibold" : "text-muted-foreground"}`}>
                    ${day.cost.toFixed(2)}
                  </span>
                  <div className="w-full flex-1 flex items-end">
                    <div className="w-full flex flex-col items-stretch">
                      <div
                        className={`w-full rounded-t-sm ${today ? "bg-blue-400" : "bg-blue-400/50 group-hover:bg-blue-400/70"}`}
                        style={{ height: `${Math.max(computeHeight, 0)}%` }}
                        title={`Compute: $${day.computeCost.toFixed(2)}`}
                      />
                      <div
                        className={`w-full ${today ? "bg-green-500" : "bg-green-500/50 group-hover:bg-green-500/70"}`}
                        style={{ height: `${Math.max(cacheHeight, day.cost > 0 ? 2 : 0)}%` }}
                        title={`Cache: $${day.cacheCost.toFixed(2)}`}
                      />
                    </div>
                  </div>
                  <span className={`text-[8px] whitespace-nowrap ${today ? "text-green-400 font-semibold" : "text-muted-foreground/60"}`}>
                    {formatDayLabel(day.date)}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-4 mt-2 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-blue-400" />Compute (input + output)</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-green-500" />Cache (read + write)</span>
          </div>
        </CardContent>
      </Card>

      {/* Plan Comparison */}
      <Card className="animate-fade-in-up" style={{ animationDelay: "250ms" }}>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-blue-400" />
            Plan Comparison
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Current Spend</span>
              <span className="font-mono font-bold tabular-nums">{formatCost(currentSpend)}</span>
            </div>
            <div className="relative h-6 rounded-full bg-muted/30 overflow-hidden">
              <div className={`h-full rounded-full ${spendColor} transition-all duration-500 opacity-80`} style={{ width: `${Math.min((currentSpend / Math.max(maxPlanLimit, 1)) * 100, 100)}%` }} />
              <div className="absolute top-0 bottom-0 w-px bg-yellow-400/70" style={{ left: `${(data.planLimits.max5x.limit / maxPlanLimit) * 100}%` }} title="Max $100/mo" />
              <div className="absolute top-0 bottom-0 w-px bg-red-400/70" style={{ left: "100%" }} title="Max $200/mo" />
            </div>
            <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-muted/50" />{data.planLimits.pro.label}</span>
              <span className="flex items-center gap-1.5"><span className="w-px h-3 bg-yellow-400/70" />{data.planLimits.max5x.label}</span>
              <span className="flex items-center gap-1.5"><span className="w-px h-3 bg-red-400/70" />{data.planLimits.max20x.label}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Model & Project Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="animate-fade-in-up" style={{ animationDelay: "300ms" }}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Cpu className="h-4 w-4 text-purple-400" />
              Per-Model Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            {modelEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground">No model data available</p>
            ) : (
              <div className="space-y-0.5">
                <div className="flex items-center text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider px-2 py-1.5">
                  <span className="w-48 min-w-0">Model</span>
                  <span className="w-14 text-right">In</span>
                  <span className="w-14 text-right">Out</span>
                  <span className="w-14 text-right">Cache</span>
                  <span className="flex-1 text-right">Cost</span>
                </div>
                {modelEntries.map(([model, md]) => (
                  <div key={model} className="flex items-center w-full text-sm px-2 py-2 rounded-md hover:bg-accent/30 transition-colors">
                    <span className="w-48 min-w-0 flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${getModelColor(model)}`} />
                      <span className="text-muted-foreground text-xs font-mono truncate">{model.replace("claude-", "")}</span>
                    </span>
                    <span className="w-14 text-right font-mono tabular-nums text-xs text-muted-foreground">{formatTokens(md.tokens.input)}</span>
                    <span className="w-14 text-right font-mono tabular-nums text-xs text-muted-foreground">{formatTokens(md.tokens.output)}</span>
                    <span className="w-14 text-right font-mono tabular-nums text-xs text-muted-foreground">{formatTokens(md.tokens.cacheRead)}</span>
                    <span className="flex-1 text-right font-mono tabular-nums text-xs text-amber-400/80">{formatCost(md.cost)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="animate-fade-in-up" style={{ animationDelay: "350ms" }}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FolderOpen className="h-4 w-4 text-orange-400" />
              Per-Project Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.byProject.length === 0 ? (
              <p className="text-sm text-muted-foreground">No project data available</p>
            ) : (
              <div className="space-y-0.5 max-h-[400px] overflow-auto">
                <div className="flex items-center text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider px-2 py-1.5 sticky top-0 bg-card">
                  <span className="flex-1">Project</span>
                  <span className="w-16 text-right">Cost</span>
                  <span className="w-16 text-right">Sessions</span>
                </div>
                {data.byProject.map((project) => (
                  <div
                    key={project.projectKey}
                    className="flex items-center w-full text-sm px-2 py-2 rounded-md hover:bg-accent/30 transition-colors cursor-pointer"
                    onClick={() => setLocation(`/sessions?project=${encodeURIComponent(project.projectKey)}`)}
                  >
                    <span className="flex-1 truncate text-muted-foreground hover:text-foreground transition-colors">
                      {project.projectName}
                    </span>
                    <span className="w-16 text-right font-mono tabular-nums text-xs text-amber-400/80">{formatCost(project.cost)}</span>
                    <span className="w-16 text-right font-mono tabular-nums text-xs text-muted-foreground">{project.sessions}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top Sessions */}
      {data.topSessions && data.topSessions.length > 0 && (
        <Card className="animate-fade-in-up" style={{ animationDelay: "375ms" }}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Star className="h-4 w-4 text-amber-400" />
              Most Expensive Sessions
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 ml-1">Top 20</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-0.5 max-h-[500px] overflow-auto">
              <div className="flex items-center text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider px-2 py-1.5 sticky top-0 bg-card">
                <span className="flex-1">Session</span>
                <span className="w-24 text-right">Model</span>
                <span className="w-16 text-right">Cost</span>
              </div>
              {data.topSessions.map((session) => (
                <div key={session.sessionId} className="flex items-center w-full text-sm px-2 py-2 rounded-md hover:bg-accent/30 transition-colors">
                  <span className="flex-1 truncate text-muted-foreground hover:text-foreground transition-colors">
                    {session.firstMessage || session.sessionId.slice(0, 8)}
                    {session.subagentCount > 0 && (
                      <span className="ml-2 text-[10px] text-purple-400">
                        {session.subagentCount} agent{session.subagentCount > 1 ? "s" : ""} (+{formatCost(session.subagentCost)})
                      </span>
                    )}
                  </span>
                  <span className="w-24 text-right">
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${
                      session.model.includes("opus") ? "text-orange-400 border-orange-400/30" :
                      session.model.includes("haiku") ? "text-green-400 border-green-400/30" :
                      "text-blue-400 border-blue-400/30"
                    }`}>{session.model.replace("claude-", "")}</Badge>
                  </span>
                  <span className="w-16 text-right font-mono tabular-nums text-xs text-amber-400/80">{formatCost(session.cost)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
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

// ---- Tab: Discover ----

interface DiscoveryResult {
  id: number;
  name: string;
  description: string | null;
  url: string;
  stars: number;
  language: string | null;
  topics: string[];
  category: string;
  updatedAt: string;
}

const suggestedSearches = [
  { label: "MCP Servers", query: "mcp server model context protocol", icon: "mcp" },
  { label: "Claude Tools", query: "claude code tools", icon: "skill" },
  { label: "AI Plugins", query: "ai assistant plugin typescript", icon: "plugin" },
  { label: "Finance APIs", query: "mcp finance api", icon: "mcp" },
  { label: "Database MCP", query: "mcp database postgresql sqlite", icon: "mcp" },
  { label: "Browser Automation", query: "mcp browser playwright puppeteer", icon: "mcp" },
];

const discoverCategoryColors: Record<string, string> = {
  mcp: "border-entity-mcp/30 text-entity-mcp bg-entity-mcp/5",
  plugin: "border-entity-plugin/30 text-entity-plugin bg-entity-plugin/5",
  skill: "border-entity-skill/30 text-entity-skill bg-entity-skill/5",
  other: "border-entity-markdown/30 text-entity-markdown bg-entity-markdown/5",
};

const languageColors: Record<string, string> = {
  TypeScript: "bg-blue-500", JavaScript: "bg-yellow-500", Python: "bg-green-500",
  Go: "bg-cyan-500", Rust: "bg-orange-500", Java: "bg-red-500",
};

function starBadgeColor(stars: number): string {
  if (stars >= 1000) return "bg-yellow-500/10 text-yellow-400 border-yellow-500/30";
  if (stars >= 100) return "bg-amber-500/10 text-amber-400 border-amber-500/30";
  return "bg-muted text-muted-foreground border-border";
}

function DiscoverTab() {
  const [query, setQuery] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  const { data: results, isLoading } = useQuery<DiscoveryResult[]>({
    queryKey: [`/api/discovery/search?q=${encodeURIComponent(searchTerm)}`],
    enabled: searchTerm.length > 0,
  });

  const handleSearch = (q?: string) => {
    const term = q || query.trim();
    if (term) { setQuery(term); setSearchTerm(term); }
  };

  return (
    <div className="space-y-6">
      <div className="flex gap-2 max-w-2xl">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search GitHub (e.g. 'mcp server finance')..." value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSearch()} className="pl-9" />
        </div>
        <Button onClick={() => handleSearch()} disabled={isLoading || !query.trim()}>{isLoading ? "Searching..." : "Search"}</Button>
      </div>

      {!results && !isLoading && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Sparkles className="h-4 w-4" />Suggested searches</div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {suggestedSearches.map((s, i) => (
              <button key={s.query} onClick={() => handleSearch(s.query)} className="flex items-center gap-2 rounded-lg border border-border/50 px-4 py-3 text-sm hover:bg-accent/50 hover:scale-[1.02] transition-all text-left card-hover animate-fade-in-up" style={{ animationDelay: `${i * 50}ms` }}>
                <Badge variant="outline" className={`text-[10px] px-1.5 ${discoverCategoryColors[s.icon] || discoverCategoryColors.other}`}>{s.icon}</Badge>
                <span>{s.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {isLoading && <ListSkeleton rows={5} />}

      {results && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{results.length} results for "{searchTerm}"</p>
            {results.length > 0 && <div className="flex items-center gap-1 text-xs text-muted-foreground"><TrendingUp className="h-3 w-3" /> Sorted by stars</div>}
          </div>
          {results.map((repo, i) => (
            <Card key={repo.id} className="card-hover animate-fade-in-up" style={{ animationDelay: `${i * 30}ms` }}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <a href={repo.url} target="_blank" rel="noopener noreferrer" className="font-medium text-sm hover:underline">{repo.name}</a>
                      <Badge variant="outline" className={`text-[10px] ${discoverCategoryColors[repo.category] || discoverCategoryColors.other}`}>{repo.category}</Badge>
                      {repo.language && (
                        <div className="flex items-center gap-1">
                          <span className={`w-2 h-2 rounded-full ${languageColors[repo.language] || "bg-gray-500"}`} />
                          <Badge variant="secondary" className="text-[10px]">{repo.language}</Badge>
                        </div>
                      )}
                    </div>
                    {repo.description && <p className="text-xs text-muted-foreground mb-2 leading-relaxed">{repo.description}</p>}
                    {repo.topics.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {repo.topics.slice(0, 6).map((topic) => (<Badge key={topic} variant="secondary" className="text-[10px] px-1.5">{topic}</Badge>))}
                        {repo.topics.length > 6 && <span className="text-[10px] text-muted-foreground">+{repo.topics.length - 6}</span>}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3 ml-4 flex-shrink-0">
                    <Badge variant="outline" className={`text-xs gap-1 ${starBadgeColor(repo.stars)}`}>
                      <Star className="h-3 w-3" /><span className="font-mono">{repo.stars.toLocaleString()}</span>
                    </Badge>
                    <a href={repo.url} target="_blank" rel="noopener noreferrer">
                      <Button variant="ghost" size="icon" className="h-7 w-7"><ExternalLink className="h-3.5 w-3.5" /></Button>
                    </a>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {results.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <Search className="h-8 w-8 mx-auto mb-2 opacity-20" />
              <p className="text-sm">No results found for "{searchTerm}"</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---- Main Analytics Page ----

export default function Stats() {
  const defaultTab = new URLSearchParams(window.location.search).get("tab") || "sessions";

  return (
    <PageContainer title="Analytics">
      <p className="text-sm text-muted-foreground -mt-2">
        Sessions, usage, costs, activity, graph, and discovery
      </p>

      <Tabs defaultValue={defaultTab}>
        <div className="overflow-x-auto whitespace-nowrap scrollbar-thin">
          <TabsList>
            <TabsTrigger value="sessions" className="whitespace-nowrap">Sessions</TabsTrigger>
            <TabsTrigger value="usage" className="whitespace-nowrap">Usage</TabsTrigger>
            <TabsTrigger value="costs" className="whitespace-nowrap">Costs</TabsTrigger>
            <TabsTrigger value="activity" className="whitespace-nowrap">Activity</TabsTrigger>
            <TabsTrigger value="graph" className="whitespace-nowrap">Graph</TabsTrigger>
            <TabsTrigger value="discover" className="whitespace-nowrap">Discover</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="sessions" className="mt-4">
          <SessionAnalyticsTab />
        </TabsContent>

        <TabsContent value="usage" className="mt-4">
          <UsageTab />
        </TabsContent>

        <TabsContent value="costs" className="mt-4">
          <CostsTab />
        </TabsContent>

        <TabsContent value="activity" className="mt-4">
          <ActivityTab />
        </TabsContent>

        <TabsContent value="graph" className="mt-4">
          <Suspense fallback={<LoadingSkeleton title="graph" />}>
            <GraphPage />
          </Suspense>
        </TabsContent>

        <TabsContent value="discover" className="mt-4">
          <DiscoverTab />
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}
