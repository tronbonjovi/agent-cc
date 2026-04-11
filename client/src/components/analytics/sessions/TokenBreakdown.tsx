import { Badge } from "@/components/ui/badge";
import { shortModel } from "@/lib/utils";
import type { AssistantRecord, UserRecord } from "@shared/session-types";

interface TokenRow {
  index: number;
  role: "user" | "assistant";
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  model: string;
  cumulativeTotal: number;
}

interface TokenMessage {
  role: "user" | "assistant";
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  model: string;
}

/** Build token rows with cumulative totals. Exported for testing. */
export function buildTokenRows(messages: TokenMessage[]): TokenRow[] {
  let cumulative = 0;
  return messages.map((m, i) => {
    cumulative += m.inputTokens + m.outputTokens;
    return {
      index: i,
      role: m.role,
      inputTokens: m.inputTokens,
      outputTokens: m.outputTokens,
      cacheReadTokens: m.cacheReadTokens,
      cacheCreationTokens: m.cacheCreationTokens,
      model: m.model,
      cumulativeTotal: cumulative,
    };
  });
}

function formatK(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

interface TokenBreakdownProps {
  assistantMessages: AssistantRecord[];
  userMessages: UserRecord[];
}

export function TokenBreakdown({ assistantMessages, userMessages }: TokenBreakdownProps) {
  // Interleave by timestamp for chronological view
  const combined: TokenMessage[] = [];
  for (const m of assistantMessages) {
    combined.push({
      role: "assistant",
      inputTokens: m.usage.inputTokens,
      outputTokens: m.usage.outputTokens,
      cacheReadTokens: m.usage.cacheReadTokens,
      cacheCreationTokens: m.usage.cacheCreationTokens,
      model: m.model,
    });
  }
  // User messages don't have token usage in the same way — only assistant messages have usage blocks
  // But we include them for turn context if they have tool results
  const rows = buildTokenRows(combined);

  if (rows.length === 0) {
    return <div className="p-4 text-sm text-muted-foreground">No token data available</div>;
  }

  // Simple sparkline: bar chart of input+output per message
  const maxTokens = Math.max(...rows.map(r => r.inputTokens + r.outputTokens), 1);

  return (
    <div className="space-y-3 p-4">
      {/* Sparkline (simple bar visualization) */}
      <div className="flex items-end gap-px h-12">
        {rows.map((row, i) => {
          const total = row.inputTokens + row.outputTokens;
          const height = Math.max((total / maxTokens) * 100, 2);
          return (
            <div
              key={i}
              className="flex-1 bg-primary/40 rounded-t-sm min-w-[2px] max-w-[8px]"
              style={{ height: `${height}%` }}
              title={`#${i}: ${formatK(total)} tokens`}
            />
          );
        })}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-muted-foreground border-b border-border/30">
              <th className="text-left py-1 px-1">#</th>
              <th className="text-left py-1 px-1">Role</th>
              <th className="text-right py-1 px-1">Input</th>
              <th className="text-right py-1 px-1">Cache R</th>
              <th className="text-right py-1 px-1">Output</th>
              <th className="text-right py-1 px-1">Cache W</th>
              <th className="text-left py-1 px-1">Model</th>
              <th className="text-right py-1 px-1">Cumulative</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.index} className="border-b border-border/10 hover:bg-muted/20">
                <td className="py-1 px-1 text-muted-foreground">{row.index}</td>
                <td className="py-1 px-1">
                  <Badge variant={row.role === "assistant" ? "default" : "outline"} className="text-[9px] px-1 py-0">
                    {row.role === "assistant" ? "A" : "U"}
                  </Badge>
                </td>
                <td className="py-1 px-1 text-right">{formatK(row.inputTokens)}</td>
                <td className="py-1 px-1 text-right text-emerald-500">{row.cacheReadTokens > 0 ? formatK(row.cacheReadTokens) : "-"}</td>
                <td className="py-1 px-1 text-right">{formatK(row.outputTokens)}</td>
                <td className="py-1 px-1 text-right text-amber-500">{row.cacheCreationTokens > 0 ? formatK(row.cacheCreationTokens) : "-"}</td>
                <td className="py-1 px-1">{shortModel(row.model)}</td>
                <td className="py-1 px-1 text-right text-muted-foreground">{formatK(row.cumulativeTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
