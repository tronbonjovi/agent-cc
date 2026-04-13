import { useState, useMemo } from "react";
import { useTokenAnatomy } from "@/hooks/use-sessions";
import { Link } from "wouter";
import { Settings2, ArrowUpRight, ArrowDownRight, ArrowRight } from "lucide-react";
import { formatTokens, formatUsd } from "@/lib/format";

// ---- Pure logic (exported for tests) ----

export function computePercentage(systemTokens: number, totalTokens: number): number {
  if (totalTokens === 0) return 0;
  return (systemTokens / totalTokens) * 100;
}

export function formatPercentage(pct: number): string {
  if (pct >= 10) return pct.toFixed(0);
  if (pct >= 1) return pct.toFixed(1);
  return pct.toFixed(2);
}

export type TrendDirection = "growing" | "shrinking" | "stable";

export function computeTrend(shortTermPct: number, longTermPct: number, thresholdPct = 2): TrendDirection {
  const diff = shortTermPct - longTermPct;
  if (diff > thresholdPct) return "growing";
  if (diff < -thresholdPct) return "shrinking";
  return "stable";
}

// ---- Loading skeleton ----

function LoadingSkeleton() {
  return (
    <div className="rounded-xl border bg-card p-4 space-y-4">
      <div className="h-5 w-48 bg-muted rounded animate-pulse" />
      <div className="h-16 w-24 mx-auto bg-muted rounded animate-pulse" />
      <div className="h-4 w-64 mx-auto bg-muted rounded animate-pulse" />
      <div className="grid grid-cols-2 gap-3">
        {[0, 1].map((i) => (
          <div key={i} className="h-10 bg-muted rounded animate-pulse" />
        ))}
      </div>
    </div>
  );
}

// ---- Trend indicator ----

function TrendIndicator({ direction }: { direction: TrendDirection }) {
  if (direction === "growing") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-yellow-400">
        <ArrowUpRight className="h-3.5 w-3.5" />
        growing
      </span>
    );
  }
  if (direction === "shrinking") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-green-400">
        <ArrowDownRight className="h-3.5 w-3.5" />
        shrinking
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <ArrowRight className="h-3.5 w-3.5" />
      stable
    </span>
  );
}

// ---- Main component ----

const DAY_OPTIONS = [7, 30, 90] as const;

export function SystemPromptOverhead() {
  const [days, setDays] = useState<number>(30);

  // Main display data
  const { data, isLoading, error } = useTokenAnatomy(days);
  // Always fetch 7d and 30d for trend comparison
  const { data: data7d } = useTokenAnatomy(7);
  const { data: data30d } = useTokenAnatomy(30);

  const { pct, formattedPct, trend } = useMemo(() => {
    if (!data) return { pct: 0, formattedPct: "0", trend: "stable" as TrendDirection };

    const p = computePercentage(data.systemPrompt.tokens, data.total.tokens);
    const fp = formatPercentage(p);

    // Compute trend: compare 7d % vs 30d %
    let t: TrendDirection = "stable";
    if (data7d && data30d) {
      const pct7d = computePercentage(data7d.systemPrompt.tokens, data7d.total.tokens);
      const pct30d = computePercentage(data30d.systemPrompt.tokens, data30d.total.tokens);
      t = computeTrend(pct7d, pct30d);
    }

    return { pct: p, formattedPct: fp, trend: t };
  }, [data, data7d, data30d]);

  if (isLoading || !data) return <LoadingSkeleton />;

  if (error) {
    return (
      <div className="rounded-xl border bg-card p-4">
        <p className="text-sm text-destructive">Failed to load context overhead</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Day selector */}
      <div className="flex justify-end">
        <div className="flex gap-1">
          {DAY_OPTIONS.map(d => (
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

      {/* Large centered percentage */}
      <div className="text-center space-y-1">
        <div className="flex items-baseline justify-center gap-2">
          <span className="text-4xl font-bold font-mono">{formattedPct}%</span>
          <TrendIndicator direction={trend} />
        </div>
        <p className="text-xs text-muted-foreground">
          of every session is configuration loading
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-muted/50 p-3 text-center">
          <div className="text-lg font-bold font-mono">{formatTokens(data.systemPrompt.tokens)}</div>
          <div className="text-xs text-muted-foreground">system prompt tokens</div>
        </div>
        <div className="rounded-lg bg-muted/50 p-3 text-center">
          <div className="text-lg font-bold font-mono text-green-400">{formatUsd(data.systemPrompt.cost)}</div>
          <div className="text-xs text-muted-foreground">API-equivalent cost</div>
        </div>
      </div>

      {/* Explanatory text */}
      <p className="text-xs text-muted-foreground leading-relaxed">
        Estimated tokens consumed by recurring context each turn — system prompt, CLAUDE.md instructions,
        plugin/skill definitions, memory files, and project configuration. Calculated from the input token
        spike on the first message of each session compared to subsequent messages.
      </p>

      {/* Library link */}
      <Link
        href="/library"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        Manage configuration
        <ArrowUpRight className="h-3 w-3" />
      </Link>
    </div>
  );
}
