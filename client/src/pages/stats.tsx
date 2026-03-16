import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart3, Bot, MessageSquare, HardDrive, FolderOpen } from "lucide-react";

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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + " MB";
  return (bytes / 1073741824).toFixed(2) + " GB";
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

const distributionColors: Record<string, string> = {
  // Agent types
  Explore: "bg-blue-500",
  Plan: "bg-purple-500",
  "general-purpose": "bg-emerald-500",
  // Models
  Opus: "bg-orange-500",
  Sonnet: "bg-blue-500",
  Haiku: "bg-green-500",
};

function getDistributionColor(key: string): string {
  for (const [pattern, color] of Object.entries(distributionColors)) {
    if (key.toLowerCase().includes(pattern.toLowerCase())) return color;
  }
  // Fallback cycle
  const fallbacks = ["bg-cyan-500", "bg-pink-500", "bg-amber-500", "bg-indigo-500", "bg-teal-500"];
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0;
  return fallbacks[Math.abs(hash) % fallbacks.length];
}

function DistributionBars({ data, label }: { data: Record<string, number>; label: string }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((sum, [, v]) => sum + v, 0);
  if (total === 0) {
    return (
      <div className="text-sm text-muted-foreground">No {label.toLowerCase()} data</div>
    );
  }

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
              <div
                className={`h-full rounded-full ${color} transition-all duration-500`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function Stats() {
  const [, setLocation] = useLocation();
  const { data, isLoading } = useQuery<StatsOverview>({
    queryKey: ["/api/stats/overview"],
    staleTime: 30000,
  });

  if (isLoading || !data) {
    return (
      <div className="p-6 space-y-6 max-w-[1400px]">
        <div>
          <h1 className="text-2xl font-bold text-gradient">Stats</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Loading analytics...</p>
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

  const maxDayCount = Math.max(...data.sessionsPerDay.map((d) => d.count), 1);

  return (
    <div className="p-6 space-y-6 max-w-[1400px]">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gradient">Stats</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Analytics and usage overview
        </p>
      </div>

      {/* Section 1: Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="animate-fade-in-up" style={{ animationDelay: "0ms" }}>
          <Card className="gradient-border">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1.5">
                <MessageSquare className="h-4 w-4 text-blue-400" />
                <span className="text-xs font-medium">Total Sessions</span>
              </div>
              <div className="text-2xl font-bold font-mono tabular-nums">
                {data.totalSessions.toLocaleString()}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="animate-fade-in-up" style={{ animationDelay: "50ms" }}>
          <Card className="gradient-border">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1.5">
                <Bot className="h-4 w-4 text-purple-400" />
                <span className="text-xs font-medium">Agent Executions</span>
              </div>
              <div className="text-2xl font-bold font-mono tabular-nums">
                {data.totalAgentExecutions.toLocaleString()}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="animate-fade-in-up" style={{ animationDelay: "100ms" }}>
          <Card className="gradient-border">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1.5">
                <HardDrive className="h-4 w-4 text-emerald-400" />
                <span className="text-xs font-medium">Avg Session Size</span>
              </div>
              <div className="text-2xl font-bold font-mono tabular-nums">
                {formatBytes(data.averageSessionSize)}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="animate-fade-in-up" style={{ animationDelay: "150ms" }}>
          <Card className="gradient-border">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1.5">
                <FolderOpen className="h-4 w-4 text-orange-400" />
                <span className="text-xs font-medium">Total Storage</span>
              </div>
              <div className="text-2xl font-bold font-mono tabular-nums">
                {formatBytes(data.totalTokensEstimate)}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Section 2: Sessions per Day Chart */}
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
                <div
                  key={day.date}
                  className="flex-1 flex flex-col items-center gap-1 group"
                >
                  {/* Count label */}
                  <span className={`text-[10px] font-mono tabular-nums transition-opacity ${
                    day.count > 0 ? "opacity-100" : "opacity-0 group-hover:opacity-50"
                  } ${today ? "text-blue-400 font-semibold" : "text-muted-foreground"}`}>
                    {day.count}
                  </span>
                  {/* Bar */}
                  <div className="w-full flex-1 flex items-end">
                    <div
                      className={`w-full rounded-t-sm transition-all duration-300 min-h-[2px] ${
                        today
                          ? "bg-gradient-to-t from-blue-500 to-blue-400 shadow-[0_0_8px_rgba(59,130,246,0.3)]"
                          : day.count > 0
                            ? "bg-gradient-to-t from-blue-500/60 to-blue-400/40 group-hover:from-blue-500/80 group-hover:to-blue-400/60"
                            : "bg-muted/20"
                      }`}
                      style={{ height: `${Math.max(heightPct, 2)}%` }}
                    />
                  </div>
                  {/* Date label */}
                  <span className={`text-[9px] whitespace-nowrap ${
                    today ? "text-blue-400 font-semibold" : "text-muted-foreground/60"
                  }`}>
                    {formatDayLabel(day.date)}
                  </span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Section 3: Two columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: Top Projects */}
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
                {/* Header row */}
                <div className="flex items-center text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider px-2 py-1.5">
                  <span className="flex-1">Project</span>
                  <span className="w-20 text-right">Sessions</span>
                  <span className="w-20 text-right">Size</span>
                </div>
                {data.topProjects.map((project, i) => (
                  <button
                    key={project.name}
                    className="flex items-center w-full text-sm hover:bg-accent/30 px-2 py-2 rounded-md transition-colors text-left group"
                    onClick={() => {
                      // Navigate using project name as a search-friendly path
                      setLocation(`/projects`);
                    }}
                  >
                    <span className="flex-1 truncate text-muted-foreground group-hover:text-foreground transition-colors">
                      {project.name}
                    </span>
                    <span className="w-20 text-right font-mono tabular-nums text-xs">
                      {project.sessions}
                    </span>
                    <span className="w-20 text-right font-mono tabular-nums text-xs text-muted-foreground">
                      {formatBytes(project.size)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right: Distribution cards */}
        <div className="space-y-4">
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
    </div>
  );
}
