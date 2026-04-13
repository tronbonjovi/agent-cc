/**
 * Tree-aware turn walkers used by the cost scanners during the flat-to-tree
 * migration (wave 3: token-anatomy / cache-efficiency / model-intelligence).
 *
 * Both walkers provide a "TurnSlim" projection that carries just the fields the
 * cost scanners read — usage, model, hasToolCalls, hasThinking, timestamp — so
 * the legacy loops over `AssistantRecord[]` can become loops over `TurnSlim[]`
 * with minimal churn.
 *
 * - `turnSubSessions` groups turns into sub-sessions: the parent session plus
 *   one sub-session per subagent. This is the right shape for scanners whose
 *   math is per-session (system-prompt estimation, first-vs-steady-state,
 *   per-message-index curves) — each subagent gets its own "first message".
 *
 * - `walkAllTurns` flattens every assistant-turn in the tree (parent +
 *   subagents) into a single list. This is the right shape for scanners that
 *   only need per-message sums with no ordering — e.g. per-model aggregation.
 *
 * Flat fallback: when no tree is cached the functions return the legacy
 * parent-only projection so subagent spend stays invisible (graceful
 * degradation matches the wave 1/2 migration contract).
 */

import type {
  ParsedSession,
  SessionTree,
  SessionTreeNode,
  TokenUsage,
} from "@shared/session-types";

/** Minimal per-turn shape consumed by the migrated scanners. */
export interface TurnSlim {
  usage: TokenUsage;
  model: string;
  hasToolCalls: boolean;
  hasThinking: boolean;
  timestamp: string;
}

function turnFromAssistantRecord(m: ParsedSession["assistantMessages"][number]): TurnSlim {
  return {
    usage: m.usage,
    model: m.model,
    hasToolCalls: m.toolCalls.length > 0,
    hasThinking: m.hasThinking,
    timestamp: m.timestamp,
  };
}

function collectAssistantTurnsUnder(node: SessionTreeNode, out: TurnSlim[]): void {
  for (const child of node.children) {
    // Stop at nested subagent roots — the builder doesn't recurse into them
    // either, so their descendants would be empty anyway.
    if (child.kind === "subagent-root") continue;
    if (child.kind === "assistant-turn") {
      out.push({
        usage: child.usage,
        model: child.model,
        hasToolCalls: child.children.some((c) => c.kind === "tool-call"),
        hasThinking: child.hasThinking,
        timestamp: child.timestamp,
      });
    }
    collectAssistantTurnsUnder(child, out);
  }
}

/**
 * Split a session's turns into sub-sessions: index 0 is the parent session
 * (sourced from `session.assistantMessages` to preserve exact parent-only
 * ordering and parity with the flat path), indices 1..N are the subagent
 * sub-sessions from the tree, each sorted by timestamp.
 *
 * When `tree` is null the result is a single sub-session containing only the
 * parent messages — the legacy flat path.
 */
export function turnSubSessions(
  session: ParsedSession,
  tree: SessionTree | null,
): TurnSlim[][] {
  const parentTurns = session.assistantMessages.map(turnFromAssistantRecord);
  const subSessions: TurnSlim[][] = [parentTurns];
  if (!tree) return subSessions;

  for (const subRoot of Array.from(tree.subagentsByAgentId.values())) {
    const turns: TurnSlim[] = [];
    collectAssistantTurnsUnder(subRoot, turns);
    turns.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    subSessions.push(turns);
  }
  return subSessions;
}

/**
 * Flatten every assistant turn in a session — parent + subagents — into a
 * single list. Used by scanners that only need per-turn sums with no ordering.
 *
 * When `tree` is null, returns the parent's flat messages only.
 */
export function walkAllTurns(
  session: ParsedSession,
  tree: SessionTree | null,
): TurnSlim[] {
  const subs = turnSubSessions(session, tree);
  const out: TurnSlim[] = [];
  for (const sub of subs) for (const t of sub) out.push(t);
  return out;
}
