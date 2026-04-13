import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useSessionProjectValue, type SessionProjectValueData } from "@/hooks/use-sessions";
import { ArrowUpDown } from "lucide-react";
import { formatTokens, formatUsd } from "@/lib/format";

// ---- Sort logic for project table ----

type ProjectRow = SessionProjectValueData["byProject"][number];
type ProjectSortKey = keyof ProjectRow;
type SortDir = "asc" | "desc";

const PROJECT_COLUMNS: Array<{ key: ProjectSortKey; label: string; format: "text" | "tokens" | "usd" | "number" }> = [
  { key: "project", label: "Project", format: "text" },
  { key: "sessions", label: "Sessions", format: "number" },
  { key: "tokens", label: "Total Tokens", format: "tokens" },
  { key: "avgDepth", label: "Avg Depth", format: "number" },
  { key: "cost", label: "API-Equiv Cost", format: "usd" },
];

// ---- Loading skeleton ----

function LoadingSkeleton() {
  return (
    <div className="rounded-xl border bg-card p-4 space-y-4">
      <div className="h-5 w-56 bg-muted rounded animate-pulse" />
      <div className="space-y-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-8 bg-muted rounded animate-pulse" />
        ))}
      </div>
    </div>
  );
}

// ---- Health badge ----

function HealthBadge({ score }: { score: string }) {
  const color =
    score === "good" ? "text-green-400" :
    score === "fair" ? "text-yellow-400" :
    "text-red-400";
  return <span className={`text-xs font-medium ${color}`}>{score}</span>;
}

// ---- Model badge ----

function ModelBadge({ model }: { model: string }) {
  const short = model.replace("claude-", "").replace(/-\d{8}$/, "");
  return (
    <span className="inline-block px-1.5 py-0.5 rounded bg-muted text-xs font-mono text-muted-foreground">
      {short}
    </span>
  );
}

// ---- Main component ----

export function SessionProjectValue() {
  const [days, setDays] = useState(30);
  const [sortKey, setSortKey] = useState<ProjectSortKey>("cost");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const { data, isLoading, error } = useSessionProjectValue(days);
  const [, setLocation] = useLocation();

  const sortedProjects = useMemo(() => {
    if (!data || data.byProject.length === 0) return [];
    return [...data.byProject].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      const diff = (aVal as number) - (bVal as number);
      return sortDir === "asc" ? diff : -diff;
    });
  }, [data, sortKey, sortDir]);

  function handleSort(key: ProjectSortKey) {
    if (sortKey === key) {
      setSortDir(d => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "project" ? "asc" : "desc");
    }
  }

  function navigateToSession(sessionId: string) {
    setLocation(`/analytics?tab=sessions&id=${sessionId}`);
  }

  if (isLoading || !data) return <LoadingSkeleton />;

  if (error) {
    return (
      <div className="rounded-xl border bg-card p-4">
        <p className="text-sm text-destructive">Failed to load session/project value data</p>
      </div>
    );
  }

  function formatCell(value: string | number, format: "text" | "tokens" | "usd" | "number") {
    if (format === "text") return value;
    if (format === "usd") return formatUsd(value as number);
    if (format === "tokens") return formatTokens(value as number);
    return typeof value === "number" ? value.toFixed(1) : value;
  }

  return (
    <div className="space-y-4">
      {/* ---- Project Breakdown ---- */}
      <div className="space-y-4">
        {/* Day selector */}
        <div className="flex justify-end">
          <div className="flex gap-1">
            {([7, 30, 90] as const).map(d => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-2 py-0.5 text-xs rounded transition-colors ${
                  days === d
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>

        {sortedProjects.length === 0 ? (
          <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">
            No project data for this period
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/50">
                  {PROJECT_COLUMNS.map(col => (
                    <th
                      key={col.key}
                      className="py-2 px-2 text-left text-muted-foreground font-medium cursor-pointer hover:text-foreground transition-colors select-none"
                      onClick={() => handleSort(col.key)}
                    >
                      <span className="inline-flex items-center gap-1">
                        {col.label}
                        {sortKey === col.key && (
                          <ArrowUpDown className="h-3 w-3 text-green-400" />
                        )}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedProjects.map(row => (
                  <tr key={row.project} className="border-b border-border/20 hover:bg-muted/30 transition-colors">
                    {PROJECT_COLUMNS.map(col => (
                      <td
                        key={col.key}
                        className={`py-1.5 px-2 ${
                          col.format === "text"
                            ? "font-mono text-muted-foreground truncate max-w-[200px]"
                            : col.format === "usd"
                              ? "font-mono text-green-400"
                              : "font-mono"
                        }`}
                      >
                        {formatCell(row[col.key], col.format)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Global averages */}
        <div className="flex gap-6 pt-2 border-t border-border/30 text-xs text-muted-foreground">
          <span>Avg tokens/turn: <span className="font-mono text-foreground">{formatTokens(data.avgTokensPerTurn)}</span></span>
          <span>Output/input ratio: <span className="font-mono text-foreground">{data.avgOutputInputRatio.toFixed(2)}</span></span>
        </div>
      </div>

      {/* ---- Most Expensive Sessions ---- */}
      <div className="space-y-3 pt-3 border-t border-border/30">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Most Expensive Sessions</h4>

        {data.topExpensive.length === 0 ? (
          <div className="h-20 flex items-center justify-center text-muted-foreground text-sm">
            No session data
          </div>
        ) : (
          <div className="space-y-1">
            {data.topExpensive.map((s, i) => (
              <div
                key={s.sessionId}
                onClick={() => navigateToSession(s.sessionId)}
                className="flex items-center gap-3 py-1.5 px-2 rounded hover:bg-muted/30 cursor-pointer transition-colors text-xs"
              >
                <span className="text-muted-foreground w-5 text-right font-mono">#{i + 1}</span>
                <span className="truncate flex-1 text-muted-foreground" title={s.firstMessage}>
                  {s.firstMessage}
                </span>
                <ModelBadge model={s.model} />
                <HealthBadge score={s.healthScore} />
                <span className="font-mono text-green-400 w-16 text-right">{formatUsd(s.cost)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ---- Most Efficient Sessions ---- */}
      <div className="space-y-3 pt-3 border-t border-border/30">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Most Efficient Sessions</h4>

        {data.topEfficient.length === 0 ? (
          <div className="h-20 flex items-center justify-center text-muted-foreground text-sm">
            No sessions with 5+ messages in this period
          </div>
        ) : (
          <div className="space-y-1">
            {data.topEfficient.map((s, i) => (
              <div
                key={s.sessionId}
                onClick={() => navigateToSession(s.sessionId)}
                className="flex items-center gap-3 py-1.5 px-2 rounded hover:bg-muted/30 cursor-pointer transition-colors text-xs"
              >
                <span className="text-muted-foreground w-5 text-right font-mono">#{i + 1}</span>
                <span className="truncate flex-1 text-muted-foreground" title={s.firstMessage}>
                  {s.firstMessage}
                </span>
                <span className="font-mono text-muted-foreground">{s.messageCount} msgs</span>
                <span className="font-mono">{formatTokens(s.tokens)} tok</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
