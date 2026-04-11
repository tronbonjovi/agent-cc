import { useState, useMemo } from "react";
import { useModelIntelligence, type ModelIntelligenceRow } from "@/hooks/use-sessions";
import { Cpu, ArrowUpDown } from "lucide-react";

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

// ---- Sort logic ----

type SortKey = keyof ModelIntelligenceRow;
type SortDir = "asc" | "desc";

const COLUMNS: Array<{ key: SortKey; label: string; format: "text" | "tokens" | "usd" }> = [
  { key: "model", label: "Model", format: "text" },
  { key: "sessions", label: "Sessions", format: "tokens" },
  { key: "inputTokens", label: "Input Tokens", format: "tokens" },
  { key: "cacheReadTokens", label: "Cache Read", format: "tokens" },
  { key: "cacheCreationTokens", label: "Cache Creation", format: "tokens" },
  { key: "outputTokens", label: "Output Tokens", format: "tokens" },
  { key: "apiEquivCost", label: "API-Equiv Cost", format: "usd" },
  { key: "cacheSavings", label: "Cache Savings", format: "usd" },
];

// ---- Loading skeleton ----

function LoadingSkeleton() {
  return (
    <div className="rounded-xl border bg-card p-4 space-y-4">
      <div className="h-5 w-48 bg-muted rounded animate-pulse" />
      <div className="space-y-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-8 bg-muted rounded animate-pulse" />
        ))}
      </div>
    </div>
  );
}

// ---- Main component ----

export function ModelIntelligence() {
  const [days, setDays] = useState(30);
  const [sortKey, setSortKey] = useState<SortKey>("apiEquivCost");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const { data, isLoading, error } = useModelIntelligence(days);

  const sorted = useMemo(() => {
    if (!data || data.length === 0) return [];
    return [...data].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      const diff = (aVal as number) - (bVal as number);
      return sortDir === "asc" ? diff : -diff;
    });
  }, [data, sortKey, sortDir]);

  const totals = useMemo(() => {
    if (!data || data.length === 0) return null;
    return {
      sessions: data.reduce((s, r) => s + r.sessions, 0),
      inputTokens: data.reduce((s, r) => s + r.inputTokens, 0),
      cacheReadTokens: data.reduce((s, r) => s + r.cacheReadTokens, 0),
      cacheCreationTokens: data.reduce((s, r) => s + r.cacheCreationTokens, 0),
      outputTokens: data.reduce((s, r) => s + r.outputTokens, 0),
      apiEquivCost: data.reduce((s, r) => s + r.apiEquivCost, 0),
      cacheSavings: data.reduce((s, r) => s + r.cacheSavings, 0),
    };
  }, [data]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "model" ? "asc" : "desc");
    }
  }

  if (isLoading || !data) return <LoadingSkeleton />;

  if (error) {
    return (
      <div className="rounded-xl border bg-card p-4">
        <p className="text-sm text-destructive">Failed to load model intelligence</p>
      </div>
    );
  }

  function formatCell(value: string | number, format: "text" | "tokens" | "usd") {
    if (format === "text") return value;
    if (format === "usd") return formatUsd(value as number);
    return formatTokens(value as number);
  }

  return (
    <div className="rounded-xl border bg-card p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Cpu className="h-4 w-4 text-cyan-400" />
          <h3 className="text-sm font-medium">Model Intelligence</h3>
        </div>
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

      {sorted.length === 0 ? (
        <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">
          No model data for this period
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/50">
                {COLUMNS.map(col => (
                  <th
                    key={col.key}
                    className="py-2 px-2 text-left text-muted-foreground font-medium cursor-pointer hover:text-foreground transition-colors select-none"
                    onClick={() => handleSort(col.key)}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.label}
                      {sortKey === col.key && (
                        <ArrowUpDown className="h-3 w-3 text-cyan-400" />
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map(row => (
                <tr key={row.model} className="border-b border-border/20 hover:bg-muted/30 transition-colors">
                  {COLUMNS.map(col => (
                    <td
                      key={col.key}
                      className={`py-1.5 px-2 ${
                        col.format === "text"
                          ? "font-mono text-muted-foreground"
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
              {/* Totals row */}
              {totals && (
                <tr className="border-t border-border font-medium">
                  <td className="py-1.5 px-2 text-muted-foreground">Total</td>
                  <td className="py-1.5 px-2 font-mono">{totals.sessions}</td>
                  <td className="py-1.5 px-2 font-mono">{formatTokens(totals.inputTokens)}</td>
                  <td className="py-1.5 px-2 font-mono">{formatTokens(totals.cacheReadTokens)}</td>
                  <td className="py-1.5 px-2 font-mono">{formatTokens(totals.cacheCreationTokens)}</td>
                  <td className="py-1.5 px-2 font-mono">{formatTokens(totals.outputTokens)}</td>
                  <td className="py-1.5 px-2 font-mono text-green-400">{formatUsd(totals.apiEquivCost)}</td>
                  <td className="py-1.5 px-2 font-mono text-green-400">{formatUsd(totals.cacheSavings)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
