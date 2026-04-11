import { useState } from "react";
import { ChevronRight, DollarSign, History, PieChart, Bot, Zap, FileText } from "lucide-react";
import { useCostAnalytics } from "@/hooks/use-sessions";
import { useAppSettings } from "@/hooks/use-settings";
import { TokenAnatomy } from "./TokenAnatomy";
import { ModelIntelligence } from "./ModelIntelligence";
import { CacheEfficiency } from "./CacheEfficiency";
import { SystemPromptOverhead } from "./SystemPromptOverhead";
import { SessionProjectValue } from "./SessionProjectValue";

// ---- Collapsible Section Wrapper ----

function CollapsibleSection({ title, icon, defaultOpen = true, children }: {
  title: string;
  icon: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border bg-card">
      <button
        onClick={() => setOpen(prev => !prev)}
        className="w-full flex items-center gap-2 p-4 text-left hover:bg-accent/30 transition-colors rounded-xl"
      >
        {icon}
        <span className="text-sm font-medium flex-1">{title}</span>
        <ChevronRight
          className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${open ? "rotate-90" : ""}`}
        />
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

// ---- Utilities (duplicated from stats.tsx for self-containment) ----

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

// ---- Historical Lookup (collapsible) ----

function HistoricalLookup() {
  const [expanded, setExpanded] = useState(false);
  const { data: costs, isLoading } = useCostAnalytics();
  const { data: settings } = useAppSettings();
  const billingMode = settings?.billingMode || "auto";
  const isSub = billingMode === "subscription" || billingMode === "auto";

  return (
    <div className="rounded-xl border bg-card">
      <button
        onClick={() => setExpanded((prev) => !prev)}
        className="w-full flex items-center gap-2 p-4 text-left hover:bg-accent/30 transition-colors rounded-xl"
      >
        <History className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium flex-1">Historical Data</span>
        <ChevronRight
          className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${expanded ? "rotate-90" : ""}`}
        />
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-border/50">
          {isLoading || !costs ? (
            <p className="text-sm text-muted-foreground pt-3">Loading historical data...</p>
          ) : (
            <>
              {/* Summary stats header */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3">
                <div className="rounded-lg border bg-muted/20 p-3">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground/60 font-medium">
                    {isSub ? "Total Tokens" : "Total Cost"}
                  </p>
                  <p className="text-lg font-bold font-mono mt-1 text-green-400">
                    {isSub
                      ? formatTokens(costs.totalInputTokens + costs.totalOutputTokens)
                      : formatUsd(costs.totalCostUsd)}
                  </p>
                </div>
                <div className="rounded-lg border bg-muted/20 p-3">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground/60 font-medium">Input Tokens</p>
                  <p className="text-lg font-bold font-mono mt-1">{formatTokens(costs.totalInputTokens)}</p>
                </div>
                <div className="rounded-lg border bg-muted/20 p-3">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground/60 font-medium">Output Tokens</p>
                  <p className="text-lg font-bold font-mono mt-1">{formatTokens(costs.totalOutputTokens)}</p>
                </div>
                <div className="rounded-lg border bg-muted/20 p-3">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground/60 font-medium">Sessions</p>
                  <p className="text-lg font-bold font-mono mt-1">{costs.totalSessions}</p>
                </div>
              </div>

              {/* Daily spend bar chart */}
              {costs.byDay.length > 0 && (
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground/60 font-medium mb-2">
                    Daily Spend (last 14 days)
                  </p>
                  <div className="space-y-1">
                    {costs.byDay.slice(-14).map((d) => {
                      const maxCost = Math.max(...costs.byDay.slice(-14).map((x) => x.cost));
                      const pct = maxCost > 0 ? (d.cost / maxCost) * 100 : 0;
                      return (
                        <div key={d.date} className="flex items-center gap-2 text-xs">
                          <span className="font-mono text-muted-foreground/60 w-20 flex-shrink-0">
                            {d.date.slice(5)}
                          </span>
                          <div className="flex-1 h-4 bg-muted/30 rounded overflow-hidden">
                            <div className="h-full bg-green-500/30 rounded" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="font-mono text-green-400 w-16 text-right flex-shrink-0">
                            {formatUsd(d.cost)}
                          </span>
                          <span className="text-muted-foreground/50 w-10 text-right flex-shrink-0">
                            {d.sessions}s
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ---- Main CostsTab ----

export default function CostsTab() {
  return (
    <div className="space-y-6">
      <CollapsibleSection title="Token Anatomy" icon={<PieChart className="h-4 w-4 text-cyan-400" />}>
        <TokenAnatomy />
      </CollapsibleSection>
      <CollapsibleSection title="Model Intelligence" icon={<Bot className="h-4 w-4 text-cyan-400" />}>
        <ModelIntelligence />
      </CollapsibleSection>
      <CollapsibleSection title="Cache Efficiency" icon={<Zap className="h-4 w-4 text-green-400" />}>
        <CacheEfficiency />
      </CollapsibleSection>
      <CollapsibleSection title="Context Overhead" icon={<FileText className="h-4 w-4 text-indigo-400" />}>
        <SystemPromptOverhead />
      </CollapsibleSection>
      <CollapsibleSection title="Session & Project Value" icon={<DollarSign className="h-4 w-4 text-green-400" />}>
        <SessionProjectValue />
      </CollapsibleSection>
      <HistoricalLookup />
    </div>
  );
}
