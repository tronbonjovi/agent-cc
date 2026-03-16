import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DollarSign,
  TrendingUp,
  Zap,
  AlertTriangle,
  Server,
  FolderOpen,
  Cpu,
  Shield,
} from "lucide-react";

interface DailyCost {
  date: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  cost: number;
}

interface ModelBreakdown {
  inputTokens: number;
  outputTokens: number;
  cost: number;
  sessions: number;
}

interface ProjectBreakdown {
  project: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  sessions: number;
}

interface ErrorEntry {
  type: string;
  count: number;
  lastSeen: string;
  example: string;
}

interface CostAnalytics {
  dailyCosts: DailyCost[];
  byModel: Record<string, ModelBreakdown>;
  byProject: ProjectBreakdown[];
  totalCost: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheWriteTokens: number;
  planLimits: {
    pro: { limit: number; label: string };
    max5x: { limit: number; label: string };
    max20x: { limit: number; label: string };
  };
  errors: ErrorEntry[];
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(0) + "K";
  return n.toString();
}

function formatCost(n: number): string {
  return "$" + n.toFixed(2);
}

function formatDayLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dayDate = new Date(d);
  dayDate.setHours(0, 0, 0, 0);
  if (dayDate.getTime() === today.getTime()) return "Today";
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const month = d.getMonth() + 1;
  const day = d.getDate();
  return `${days[d.getDay()]} ${month}/${day}`;
}

function isToday(dateStr: string): boolean {
  const today = new Date().toISOString().slice(0, 10);
  return dateStr === today;
}

function lastPathSegment(fullPath: string): string {
  if (!fullPath || fullPath === "(no project)") return fullPath || "Unknown";
  const normalized = fullPath.replace(/\\/g, "/").replace(/\/$/, "");
  const parts = normalized.split("/");
  return parts[parts.length - 1] || fullPath;
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

const ERROR_STYLES: Record<string, { bg: string; border: string; text: string; icon: typeof AlertTriangle }> = {
  tool_error: { bg: "bg-red-500/10", border: "border-red-500/30", text: "text-red-400", icon: AlertTriangle },
  compilation: { bg: "bg-orange-500/10", border: "border-orange-500/30", text: "text-orange-400", icon: Cpu },
  test_failure: { bg: "bg-yellow-500/10", border: "border-yellow-500/30", text: "text-yellow-400", icon: AlertTriangle },
  permission: { bg: "bg-purple-500/10", border: "border-purple-500/30", text: "text-purple-400", icon: Shield },
  network: { bg: "bg-blue-500/10", border: "border-blue-500/30", text: "text-blue-400", icon: Server },
  other: { bg: "bg-zinc-500/10", border: "border-zinc-500/30", text: "text-zinc-400", icon: AlertTriangle },
};

export default function CostDashboard() {
  const [, setLocation] = useLocation();
  const { data, isLoading } = useQuery<CostAnalytics>({
    queryKey: ["/api/analytics/costs"],
    staleTime: 60000,
  });

  if (isLoading || !data) {
    return (
      <div className="p-6 space-y-6 max-w-[1400px]">
        <div>
          <h1 className="text-2xl font-bold text-gradient">Cost Analytics</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Loading cost data...</p>
        </div>
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

  // Calculate cache savings
  // Without cache: cache_read tokens would have been charged at full input rate
  // With cache: they were charged at cacheRead rate (10% of input)
  // Savings = (cacheReadTokens * inputPrice - cacheReadTokens * cacheReadPrice) summed across models
  // Approximate using sonnet pricing as dominant model
  const inputPricePerToken = 3 / 1_000_000; // sonnet input
  const cacheReadPricePerToken = 0.3 / 1_000_000; // sonnet cache read
  const costWithoutCache =
    data.totalCost +
    data.totalCacheReadTokens * (inputPricePerToken - cacheReadPricePerToken);
  const cacheSavings = costWithoutCache > 0
    ? ((costWithoutCache - data.totalCost) / costWithoutCache) * 100
    : 0;

  const maxDayCost = Math.max(...data.dailyCosts.map((d) => d.cost), 0.01);

  // Plan comparison
  const currentSpend = data.totalCost;
  const maxPlanLimit = data.planLimits.max20x.limit;
  const spendPctOf100 = maxPlanLimit > 0 ? (currentSpend / data.planLimits.max5x.limit) * 100 : 0;
  let spendColor = "bg-green-500";
  if (spendPctOf100 > 80) spendColor = "bg-red-500";
  else if (spendPctOf100 > 50) spendColor = "bg-yellow-500";

  const modelEntries = Object.entries(data.byModel).sort((a, b) => b[1].cost - a[1].cost);

  return (
    <div className="p-6 space-y-6 max-w-[1400px]">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gradient">Cost Analytics</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {formatCost(data.totalCost)} this month
        </p>
      </div>

      {/* Section 1: Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="animate-fade-in-up" style={{ animationDelay: "0ms" }}>
          <Card className="gradient-border">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1.5">
                <DollarSign className="h-4 w-4 text-green-400" />
                <span className="text-xs font-medium">Total Cost</span>
              </div>
              <div className="text-2xl font-bold font-mono tabular-nums">
                {formatCost(data.totalCost)}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="animate-fade-in-up" style={{ animationDelay: "50ms" }}>
          <Card className="gradient-border">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1.5">
                <TrendingUp className="h-4 w-4 text-blue-400" />
                <span className="text-xs font-medium">Input Tokens</span>
              </div>
              <div className="text-2xl font-bold font-mono tabular-nums">
                {formatTokens(data.totalInputTokens)}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="animate-fade-in-up" style={{ animationDelay: "100ms" }}>
          <Card className="gradient-border">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1.5">
                <Zap className="h-4 w-4 text-amber-400" />
                <span className="text-xs font-medium">Output Tokens</span>
              </div>
              <div className="text-2xl font-bold font-mono tabular-nums">
                {formatTokens(data.totalOutputTokens)}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="animate-fade-in-up" style={{ animationDelay: "150ms" }}>
          <Card className="gradient-border">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1.5">
                <Shield className="h-4 w-4 text-purple-400" />
                <span className="text-xs font-medium">Cache Savings</span>
              </div>
              <div className="text-2xl font-bold font-mono tabular-nums">
                {cacheSavings.toFixed(0)}%
              </div>
              <div className="text-[10px] text-muted-foreground/60 mt-0.5">
                {formatTokens(data.totalCacheReadTokens)} cached reads
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Section 2: Daily Cost Chart (30 days) */}
      <Card className="animate-fade-in-up" style={{ animationDelay: "200ms" }}>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-green-400" />
            Daily Cost
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 ml-1">Last 30 days</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-1 h-48">
            {data.dailyCosts.map((day) => {
              const heightPct = maxDayCost > 0 ? (day.cost / maxDayCost) * 100 : 0;
              const today = isToday(day.date);
              return (
                <div
                  key={day.date}
                  className="flex-1 flex flex-col items-center gap-1 group"
                >
                  {/* Cost label */}
                  <span className={`text-[9px] font-mono tabular-nums transition-opacity ${
                    day.cost > 0 ? "opacity-0 group-hover:opacity-100" : "opacity-0"
                  } ${today ? "text-green-400 font-semibold" : "text-muted-foreground"}`}>
                    ${day.cost.toFixed(2)}
                  </span>
                  {/* Bar */}
                  <div className="w-full flex-1 flex items-end">
                    <div
                      className={`w-full rounded-t-sm transition-all duration-300 min-h-[2px] ${
                        today
                          ? "bg-gradient-to-t from-green-500 to-green-400 shadow-[0_0_8px_rgba(34,197,94,0.3)]"
                          : day.cost > 0
                            ? "bg-gradient-to-t from-green-500/60 to-green-400/40 group-hover:from-green-500/80 group-hover:to-green-400/60"
                            : "bg-muted/20"
                      }`}
                      style={{ height: `${Math.max(heightPct, 2)}%` }}
                    />
                  </div>
                  {/* Date label — show every 5th or today */}
                  <span className={`text-[8px] whitespace-nowrap ${
                    today ? "text-green-400 font-semibold" : "text-muted-foreground/60"
                  }`}>
                    {formatDayLabel(day.date)}
                  </span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Section 3: Plan Comparison */}
      <Card className="animate-fade-in-up" style={{ animationDelay: "250ms" }}>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-blue-400" />
            Plan Comparison
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Current spend bar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Current Spend</span>
                <span className="font-mono font-bold tabular-nums">{formatCost(currentSpend)}</span>
              </div>
              <div className="relative h-6 rounded-full bg-muted/30 overflow-hidden">
                {/* Spend fill */}
                <div
                  className={`h-full rounded-full ${spendColor} transition-all duration-500 opacity-80`}
                  style={{ width: `${Math.min((currentSpend / Math.max(maxPlanLimit, 1)) * 100, 100)}%` }}
                />
                {/* $100 threshold line */}
                <div
                  className="absolute top-0 bottom-0 w-px bg-yellow-400/70"
                  style={{ left: `${(data.planLimits.max5x.limit / maxPlanLimit) * 100}%` }}
                  title="Max $100/mo"
                />
                {/* $200 threshold line */}
                <div
                  className="absolute top-0 bottom-0 w-px bg-red-400/70"
                  style={{ left: "100%" }}
                  title="Max $200/mo"
                />
              </div>
              {/* Legend */}
              <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-muted/50" />
                  {data.planLimits.pro.label}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-px h-3 bg-yellow-400/70" />
                  {data.planLimits.max5x.label}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-px h-3 bg-red-400/70" />
                  {data.planLimits.max20x.label}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section 4: Two columns — Model & Project Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: Per-Model Breakdown */}
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
                {/* Header row */}
                <div className="flex items-center text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider px-2 py-1.5">
                  <span className="flex-1">Model</span>
                  <span className="w-20 text-right">Input</span>
                  <span className="w-20 text-right">Output</span>
                  <span className="w-16 text-right">Cost</span>
                  <span className="w-16 text-right">Sessions</span>
                </div>
                {modelEntries.map(([model, data]) => (
                  <div
                    key={model}
                    className="flex items-center w-full text-sm px-2 py-2 rounded-md hover:bg-accent/30 transition-colors"
                  >
                    <span className="flex-1 flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${getModelColor(model)}`} />
                      <span className="text-muted-foreground capitalize">{model}</span>
                    </span>
                    <span className="w-20 text-right font-mono tabular-nums text-xs text-muted-foreground">
                      {formatTokens(data.inputTokens)}
                    </span>
                    <span className="w-20 text-right font-mono tabular-nums text-xs text-muted-foreground">
                      {formatTokens(data.outputTokens)}
                    </span>
                    <span className="w-16 text-right font-mono tabular-nums text-xs text-amber-400/80">
                      {formatCost(data.cost)}
                    </span>
                    <span className="w-16 text-right font-mono tabular-nums text-xs text-muted-foreground">
                      {data.sessions}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right: Per-Project Breakdown */}
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
                {/* Header row */}
                <div className="flex items-center text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider px-2 py-1.5 sticky top-0 bg-card">
                  <span className="flex-1">Project</span>
                  <span className="w-16 text-right">Cost</span>
                  <span className="w-16 text-right">Sessions</span>
                </div>
                {data.byProject.map((project) => (
                  <div
                    key={project.project}
                    className="flex items-center w-full text-sm px-2 py-2 rounded-md hover:bg-accent/30 transition-colors cursor-pointer"
                    onClick={() => setLocation(`/sessions?project=${encodeURIComponent(project.project)}`)}
                  >
                    <span className="flex-1 truncate text-muted-foreground hover:text-foreground transition-colors">
                      {lastPathSegment(project.project)}
                    </span>
                    <span className="w-16 text-right font-mono tabular-nums text-xs text-amber-400/80">
                      {formatCost(project.cost)}
                    </span>
                    <span className="w-16 text-right font-mono tabular-nums text-xs text-muted-foreground">
                      {project.sessions}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Section 5: Error Breakdown */}
      {data.errors.length > 0 && (
        <Card className="animate-fade-in-up" style={{ animationDelay: "400ms" }}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-400" />
              Error Breakdown
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 ml-1">
                {data.errors.reduce((sum, e) => sum + e.count, 0)} total
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {data.errors.map((err) => {
                const style = ERROR_STYLES[err.type] || ERROR_STYLES.other;
                const Icon = style.icon;
                return (
                  <div
                    key={err.type}
                    className={`rounded-lg border p-3 ${style.bg} ${style.border}`}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <Icon className={`h-4 w-4 ${style.text}`} />
                      <span className={`text-sm font-medium ${style.text}`}>
                        {err.type.replace(/_/g, " ")}
                      </span>
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ml-auto ${style.text} border-current`}>
                        {err.count}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground line-clamp-2">
                      {err.example}
                    </p>
                    {err.lastSeen && (
                      <p className="text-[10px] text-muted-foreground/50 mt-1">
                        Last: {new Date(err.lastSeen).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
