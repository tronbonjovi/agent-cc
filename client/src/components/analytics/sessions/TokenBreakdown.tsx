import { Badge } from "@/components/ui/badge";
import { shortModel } from "@/lib/utils";
import type {
  AssistantRecord,
  UserRecord,
  SerializedSessionTreeForClient,
  SessionTreeNode,
  AssistantTurnNode,
  SubagentRootNode,
} from "@shared/session-types";
import {
  resolveAssistantTurnOwner,
  colorClassForOwner,
  type ToolOwner,
} from "./subagent-colors";

/**
 * One row in the token table. Tree mode populates `owner` from
 * `resolveAssistantTurnOwner`; flat mode always returns `{ kind: "session-root", agentId: null }`
 * because there is no tree to resolve against (and the Agent column does not
 * render at all when `tree` is null/undefined). The shared shape keeps both
 * builders interchangeable from the component's render path.
 */
export interface TokenRow {
  index: number;
  role: "user" | "assistant";
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  model: string;
  /** ISO 8601 timestamp; empty string when the source had no timestamp. */
  timestamp: string;
  cumulativeTotal: number;
  owner: ToolOwner;
}

/**
 * Flat fallback row builder — today's behavior, retained verbatim for
 * backward compatibility. Walks `assistantMessages` in iteration order and
 * computes a running `cumulativeTotal` of `inputTokens + outputTokens`.
 *
 * `userMessages` is accepted for parameter parity with the tree builder and
 * because the contract ships both signatures as `(messages, userMessages)`,
 * but the current flat path does not interleave user records into the table.
 * Behavior intentionally matches pre-task: subagent spend is NOT included
 * (the flat path only sees parent-session assistant messages), so cumulative
 * undercounts by exactly the subagent spend. The tree path is the fix.
 */
export function buildTokenRows(
  assistantMessages: AssistantRecord[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _userMessages: UserRecord[],
): TokenRow[] {
  let cumulative = 0;
  return assistantMessages.map((m, i) => {
    cumulative += m.usage.inputTokens + m.usage.outputTokens;
    return {
      index: i,
      role: "assistant",
      inputTokens: m.usage.inputTokens,
      outputTokens: m.usage.outputTokens,
      cacheReadTokens: m.usage.cacheReadTokens,
      cacheCreationTokens: m.usage.cacheCreationTokens,
      model: m.model,
      timestamp: m.timestamp ?? "",
      cumulativeTotal: cumulative,
      // Flat path has no tree to resolve against; the owner is always the
      // neutral parent. The Agent column is hidden entirely in flat mode, so
      // this value is never read by the renderer — it exists only so the row
      // shape stays uniform between the two builders.
      owner: { kind: "session-root", agentId: null },
    };
  });
}

/**
 * Tree-aware row builder. Walks `tree.nodesById` for every `assistant-turn`
 * node (parent + every subagent), sorts by timestamp ascending, and computes
 * a running cumulative total across the unified list. The result includes
 * subagent spend, fixing the flat path's known undercount.
 *
 * Each row is stamped with the owner of its issuing turn via
 * `resolveAssistantTurnOwner`. Parent-session turns get
 * `{ kind: "session-root", agentId: null }`; subagent-owned turns get
 * `{ kind: "subagent-root", agentId }`. The renderer uses `colorClassForOwner`
 * to map the owner to a palette class for the new Agent column.
 *
 * `userMessages` is accepted for parameter parity with the flat builder; the
 * tree builder does not interleave user records (assistant turns carry all
 * the token usage data we need).
 */
export function buildTokenRowsFromTree(
  tree: SerializedSessionTreeForClient,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _userMessages: UserRecord[],
): TokenRow[] {
  // Collect every assistant-turn node from nodesById. The serialized tree's
  // nodesById is a plain Record after the Map → Object conversion the
  // sessions route applies, so Object.values is the safe traversal.
  const assistantTurns: AssistantTurnNode[] = [];
  for (const node of Object.values(tree.nodesById)) {
    if (node && (node as SessionTreeNode).kind === "assistant-turn") {
      assistantTurns.push(node as AssistantTurnNode);
    }
  }
  // Sort by timestamp ascending. String compare is fine for ISO 8601 — the
  // format is lexicographically sortable up to millisecond precision.
  assistantTurns.sort((a, b) => {
    const ta = a.timestamp ?? "";
    const tb = b.timestamp ?? "";
    if (ta < tb) return -1;
    if (ta > tb) return 1;
    return 0;
  });
  let cumulative = 0;
  return assistantTurns.map((turn, i) => {
    const inputTokens = turn.usage?.inputTokens ?? 0;
    const outputTokens = turn.usage?.outputTokens ?? 0;
    cumulative += inputTokens + outputTokens;
    return {
      index: i,
      role: "assistant",
      inputTokens,
      outputTokens,
      cacheReadTokens: turn.usage?.cacheReadTokens ?? 0,
      cacheCreationTokens: turn.usage?.cacheCreationTokens ?? 0,
      model: turn.model ?? "",
      timestamp: turn.timestamp ?? "",
      cumulativeTotal: cumulative,
      owner: resolveAssistantTurnOwner(tree, turn.id),
    };
  });
}

function formatK(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

/**
 * Cheap 4-5-character abbreviation of an `agentType` string for the Agent
 * column cell. We resolve the subagent root for the row's `agentId` from the
 * tree's `subagentsByAgentId` map. Returns an empty string if the lookup
 * fails (defensive).
 */
function abbreviateAgentType(
  tree: SerializedSessionTreeForClient,
  agentId: string | null,
): string {
  if (!agentId) return "";
  const sub = tree.subagentsByAgentId?.[agentId] as SubagentRootNode | undefined;
  if (!sub || sub.kind !== "subagent-root") return "";
  const t = sub.agentType ?? "";
  return t.slice(0, 5);
}

/**
 * Render the human-readable role label for a token row. Tree-aware: when the
 * row's owner is a subagent-root, returns `Subagent: <agentType>` (falling
 * back to `Subagent: subagent` when the lookup fails). Otherwise returns
 * `Assistant` or `User` based on the row's role. Replaces the cryptic
 * single-letter `A`/`U`/`sA` badges from the pre-makeover layout.
 */
export function roleLabel(
  row: { role: "user" | "assistant"; owner: { kind: string; agentId: string | null } },
  tree: SerializedSessionTreeForClient | null | undefined,
): string {
  if (row.role === "user") return "User";
  if (tree && row.owner.kind === "subagent-root" && row.owner.agentId) {
    const sub = tree.subagentsByAgentId?.[row.owner.agentId] as
      | { agentType?: string }
      | undefined;
    const type = sub?.agentType ?? "subagent";
    return `Subagent: ${type}`;
  }
  return "Assistant";
}

interface TokenBreakdownProps {
  assistantMessages: AssistantRecord[];
  userMessages: UserRecord[];
  /**
   * Optional session tree from `?include=tree`. When present, rows are built
   * from `tree.nodesById` so subagent assistant turns are included in the
   * sparkline and table, and the cumulative total reflects the full spend
   * across parent + subagents. When null/undefined, the component falls back
   * to the flat builder and renders byte-identically to pre-task.
   */
  tree?: SerializedSessionTreeForClient | null;
}

export function TokenBreakdown({ assistantMessages, userMessages, tree }: TokenBreakdownProps) {
  const rows = tree
    ? buildTokenRowsFromTree(tree, userMessages)
    : buildTokenRows(assistantMessages, userMessages);

  if (rows.length === 0) {
    return <div className="p-4 text-sm text-muted-foreground">No token data available</div>;
  }

  // Simple sparkline: bar chart of input+output per row.
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

      {/* Table — viewport-constrained with sticky header so long sessions
          don't blow out the section height. The header background must be
          solid (bg-card) so rows don't bleed through during scroll. */}
      <div
        data-token-table-scroll
        className="max-h-[60vh] overflow-auto rounded border border-border/30"
      >
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-card z-10">
            <tr className="text-muted-foreground border-b border-border/30">
              <th className="text-left py-1 px-1">#</th>
              <th className="text-left py-1 px-1">Role</th>
              <th className="text-right py-1 px-1">Input</th>
              <th className="text-right py-1 px-1">Cache R</th>
              <th className="text-right py-1 px-1">Output</th>
              <th className="text-right py-1 px-1">Cache W</th>
              <th className="text-left py-1 px-1">Model</th>
              <th className="text-right py-1 px-1">Cumulative</th>
              {tree && <th className="text-left py-1 px-1">Agent</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const colorClass = tree ? colorClassForOwner(row.owner) : "";
              const agentLabel = tree && row.owner.kind === "subagent-root"
                ? abbreviateAgentType(tree, row.owner.agentId)
                : "";
              return (
                <tr key={row.index} className="border-b border-border/10 hover:bg-muted/20">
                  <td className="py-1 px-1 text-muted-foreground">{row.index}</td>
                  <td className="py-1 px-1">
                    <Badge variant={row.role === "assistant" ? "default" : "outline"} className="text-[9px] px-1 py-0">
                      {roleLabel(row, tree)}
                    </Badge>
                  </td>
                  <td className="py-1 px-1 text-right">{formatK(row.inputTokens)}</td>
                  <td className="py-1 px-1 text-right text-emerald-500">{row.cacheReadTokens > 0 ? formatK(row.cacheReadTokens) : "-"}</td>
                  <td className="py-1 px-1 text-right">{formatK(row.outputTokens)}</td>
                  <td className="py-1 px-1 text-right text-amber-500">{row.cacheCreationTokens > 0 ? formatK(row.cacheCreationTokens) : "-"}</td>
                  <td className="py-1 px-1">{shortModel(row.model)}</td>
                  <td className="py-1 px-1 text-right text-muted-foreground">{formatK(row.cumulativeTotal)}</td>
                  {tree && (
                    <td className="py-1 px-1">
                      {colorClass ? (
                        <span className="inline-flex items-center gap-1">
                          <span className={`inline-block h-2 w-2 rounded-full border ${colorClass}`} />
                          <span className="text-[10px] text-muted-foreground">{agentLabel}</span>
                        </span>
                      ) : null}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
