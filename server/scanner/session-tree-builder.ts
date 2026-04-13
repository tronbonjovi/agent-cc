/**
 * SessionTree builder.
 *
 * Pure function: takes a parsed parent session plus a flat list of parsed
 * subagent sessions and produces a hierarchical SessionTree. No I/O, no
 * global state. Shipped in the `session-hierarchy` milestone; the spec that
 * accompanied the work is archived — use `git log` on this file for the
 * algorithm history.
 *
 * Pipeline:
 *   1. Build session-root from parent meta.
 *   2. Two-pass parent-tree construction (handles out-of-order parentUuid).
 *   3. Attach tool-calls to their issuing assistant turn (direct uuid lookup,
 *      no timestamp heuristics — task001 added `issuedByAssistantUuid`).
 *   4. Three-tier subagent linkage, strictly in order, first-match-wins:
 *        tier 1 — agentid-in-result (parent tool_result text contains agentId)
 *        tier 2 — timestamp-match (|agentCall.ts − subagent.firstTs| ≤ 10ms)
 *        tier 3 — orphan (attaches under session-root, warning emitted)
 *   5. Recurse the same parent-tree + tool-call algorithm into each subagent.
 *      Nested subagent discovery is intentionally skipped (warning emitted).
 *   6. Post-order cost rollup. Self-cost lives only on assistant-turns.
 *   7. Populate totals + lookup maps + warnings.
 */

import type {
  AssistantRecord,
  AssistantTurnNode,
  NodeCost,
  ParsedSession,
  SessionRootNode,
  SessionTree,
  SessionTreeNode,
  SessionTreeWarning,
  SubagentLinkage,
  SubagentRootNode,
  ToolCallNode,
  ToolExecution,
  UserRecord,
  UserTurnNode,
} from '../../shared/session-types.js';
import type { DiscoveredSubagent } from './subagent-discovery.js';
import { computeCost, getPricing } from './pricing.js';

/**
 * A discovered subagent plus the result of parsing its JSONL. `parsed` is null
 * when the subagent file was missing or malformed — the builder will emit a
 * `subagent-parse-failed` warning and still surface the subagent's linkage
 * metadata, so users never lose the fact that a subagent existed even if its
 * content couldn't be loaded.
 */
export interface SubagentInput {
  parsed: ParsedSession | null;
  meta: DiscoveredSubagent;
}

interface BuildState {
  warnings: SessionTreeWarning[];
  nodesById: Map<string, SessionTreeNode>;
  subagentsByAgentId: Map<string, SessionTreeNode>;
}

const TIMESTAMP_MATCH_WINDOW_MS = 10;

function zeroCost(): NodeCost {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    costUsd: 0,
    durationMs: 0,
  };
}

function assistantSelfCost(record: AssistantRecord): NodeCost {
  const pricing = getPricing(record.model);
  const u = record.usage;
  return {
    inputTokens: u.inputTokens,
    outputTokens: u.outputTokens,
    cacheReadTokens: u.cacheReadTokens,
    cacheCreationTokens: u.cacheCreationTokens,
    costUsd: computeCost(
      pricing,
      u.inputTokens,
      u.outputTokens,
      u.cacheReadTokens,
      u.cacheCreationTokens,
    ),
    durationMs: 0,
  };
}

function makeAssistantNode(record: AssistantRecord): AssistantTurnNode {
  return {
    kind: 'assistant-turn',
    id: `asst:${record.uuid}`,
    parentId: null,
    children: [],
    timestamp: record.timestamp,
    selfCost: assistantSelfCost(record),
    rollupCost: zeroCost(),
    uuid: record.uuid,
    model: record.model,
    stopReason: record.stopReason,
    usage: record.usage,
    textPreview: record.textPreview,
    hasThinking: record.hasThinking,
    isSidechain: record.isSidechain,
  };
}

function makeUserNode(record: UserRecord): UserTurnNode {
  return {
    kind: 'user-turn',
    id: `user:${record.uuid}`,
    parentId: null,
    children: [],
    timestamp: record.timestamp,
    selfCost: zeroCost(),
    rollupCost: zeroCost(),
    uuid: record.uuid,
    textPreview: record.textPreview,
    isMeta: record.isMeta,
    isSidechain: record.isSidechain,
  };
}

function makeToolNode(execution: ToolExecution): ToolCallNode {
  return {
    kind: 'tool-call',
    id: `tool:${execution.callId}`,
    parentId: null,
    children: [],
    timestamp: execution.timestamp,
    selfCost: zeroCost(),
    rollupCost: zeroCost(),
    callId: execution.callId,
    name: execution.name,
    filePath: execution.filePath,
    command: execution.command,
    pattern: execution.pattern,
    durationMs: execution.durationMs,
    isError: execution.isError,
    isSidechain: execution.isSidechain,
  };
}

function makeSubagentNode(
  agentId: string,
  parsed: ParsedSession,
  meta: DiscoveredSubagent,
  parentSessionId: string,
  prompt: string,
  linkage: SubagentLinkage,
  dispatchedByTurnId: string | null,
  dispatchedByToolCallId: string | null,
): SubagentRootNode {
  const m = meta.meta;
  return {
    kind: 'subagent-root',
    id: `agent:${agentId}`,
    parentId: null,
    children: [],
    timestamp: parsed.meta.firstTs ?? '',
    selfCost: zeroCost(),
    rollupCost: zeroCost(),
    agentId,
    agentType: m?.agentType ?? 'unknown',
    description: m?.description ?? '',
    prompt,
    sessionId: parentSessionId,
    filePath: meta.filePath,
    dispatchedByTurnId,
    dispatchedByToolCallId,
    linkage,
  };
}

function attachChild(parent: SessionTreeNode, child: SessionTreeNode): void {
  child.parentId = parent.id;
  parent.children.push(child);
}

function resolveMessageParent(
  parentUuid: string,
  state: BuildState,
): SessionTreeNode | null {
  if (!parentUuid) return null;
  return (
    state.nodesById.get(`asst:${parentUuid}`) ??
    state.nodesById.get(`user:${parentUuid}`) ??
    null
  );
}

interface MessageWithKind {
  kind: 'asst' | 'user';
  record: AssistantRecord | UserRecord;
  node: AssistantTurnNode | UserTurnNode;
}

/**
 * Build the in-tree structure (assistant-turns + user-turns + tool-calls)
 * for one ParsedSession underneath an existing root node. Used for both
 * the parent session (root = session-root) and each subagent (root = subagent-root).
 *
 * Two-pass parent-tree construction handles out-of-order parentUuid references
 * within a single session. Anything still unresolved after pass 2 attaches to
 * `sessionRoot` with an `orphan-*` warning. Tool calls hang off the assistant
 * turn that issued them via `issuedByAssistantUuid`.
 */
function buildSessionInTree(
  session: ParsedSession,
  sessionRoot: SessionTreeNode,
  state: BuildState,
): void {
  // Merge messages and sort by timestamp for deterministic iteration order.
  const merged: MessageWithKind[] = [
    ...session.assistantMessages.map((r) => ({
      kind: 'asst' as const,
      record: r,
      node: makeAssistantNode(r),
    })),
    ...session.userMessages.map((r) => ({
      kind: 'user' as const,
      record: r,
      node: makeUserNode(r),
    })),
  ];
  merged.sort((a, b) => a.record.timestamp.localeCompare(b.record.timestamp));

  // Pass 1: insert into id map and try to attach.
  const pending: MessageWithKind[] = [];
  for (const m of merged) {
    state.nodesById.set(m.node.id, m.node);
    const parentNode = resolveMessageParent(m.record.parentUuid, state);
    if (parentNode) {
      attachChild(parentNode, m.node);
    } else if (!m.record.parentUuid) {
      // No parent uuid at all → top-level under sessionRoot.
      attachChild(sessionRoot, m.node);
    } else {
      pending.push(m);
    }
  }

  // Pass 2: retry pending. Anything still unresolved orphans onto sessionRoot.
  for (const m of pending) {
    const parentNode = resolveMessageParent(m.record.parentUuid, state);
    if (parentNode) {
      attachChild(parentNode, m.node);
    } else {
      attachChild(sessionRoot, m.node);
      state.warnings.push({
        kind: m.kind === 'asst' ? 'orphan-assistant-turn' : 'orphan-user-turn',
        detail: `${m.node.id} parentUuid ${m.record.parentUuid} not found in session`,
      });
    }
  }

  // Tool-call attachment: each ToolExecution hangs off the assistant turn
  // that issued it. Direct id lookup, no timestamp heuristics.
  for (const exec of session.toolTimeline) {
    const toolNode = makeToolNode(exec);
    state.nodesById.set(toolNode.id, toolNode);
    const issuer = state.nodesById.get(`asst:${exec.issuedByAssistantUuid}`);
    if (issuer) {
      attachChild(issuer, toolNode);
    } else {
      attachChild(sessionRoot, toolNode);
      state.warnings.push({
        kind: 'orphan-tool-call',
        detail: `tool-call ${exec.callId} issuer asst:${exec.issuedByAssistantUuid} not found`,
      });
    }
  }
}

/**
 * Look up the subagent `agentId` that the parent's tool_result records against
 * a given Agent tool-call. Returns null when the parent has no result record
 * for that callId or when the result has no agentId (non-Agent tool call, or
 * Agent call whose envelope happened to be missing the field). The parser
 * lifts this from the record-level `toolUseResult.agentId` field so tier-1
 * linkage is an exact match, not a substring scan of surrounding text.
 */
function findToolResultAgentId(parent: ParsedSession, callId: string): string | null {
  for (const u of parent.userMessages) {
    for (const r of u.toolResults) {
      if (r.toolUseId === callId) return r.agentId;
    }
  }
  return null;
}

interface AgentCallCandidate {
  exec: ToolExecution;
  toolNode: ToolCallNode;
}

function collectAgentCallCandidates(
  parent: ParsedSession,
  state: BuildState,
): AgentCallCandidate[] {
  const out: AgentCallCandidate[] = [];
  for (const exec of parent.toolTimeline) {
    if (exec.name !== 'Agent') continue;
    const toolNode = state.nodesById.get(`tool:${exec.callId}`);
    if (!toolNode || toolNode.kind !== 'tool-call') continue;
    out.push({ exec, toolNode });
  }
  return out;
}

interface LinkageResult {
  linkage: SubagentLinkage;
  attachTo: SessionTreeNode;
  dispatchedByTurnId: string | null;
  dispatchedByToolCallId: string | null;
}

/**
 * Run the strict three-tier linkage algorithm for a single subagent. Tier 1
 * (agentid-in-result) is checked first against every Agent call; tier 2
 * (timestamp-match within 10ms) only runs when tier 1 found nothing; tier 3
 * (orphan) only when both tiers failed for every candidate. The first tier to
 * succeed wins — no later tier is consulted for that subagent.
 */
function resolveLinkage(
  parent: ParsedSession,
  parentSessionRoot: SessionTreeNode,
  agentCalls: AgentCallCandidate[],
  agentId: string,
  subFirstTs: string,
  state: BuildState,
): LinkageResult {
  // Tier 1: agentid-in-result
  for (const cand of agentCalls) {
    const resultAgentId = findToolResultAgentId(parent, cand.exec.callId);
    if (resultAgentId && resultAgentId === agentId) {
      return {
        linkage: { method: 'agentid-in-result', confidence: 'high' },
        attachTo: cand.toolNode,
        dispatchedByTurnId: `asst:${cand.exec.issuedByAssistantUuid}`,
        dispatchedByToolCallId: `tool:${cand.exec.callId}`,
      };
    }
  }

  // Tier 2: timestamp-match — only reached if tier 1 found no matches.
  if (subFirstTs && agentCalls.length > 0) {
    const subTs = Date.parse(subFirstTs);
    let best: { delta: number; cand: AgentCallCandidate } | null = null;
    for (const cand of agentCalls) {
      const callTs = Date.parse(cand.exec.timestamp);
      if (Number.isNaN(callTs) || Number.isNaN(subTs)) continue;
      const delta = Math.abs(callTs - subTs);
      if (best === null || delta < best.delta) best = { delta, cand };
    }
    if (best && best.delta <= TIMESTAMP_MATCH_WINDOW_MS) {
      return {
        linkage: { method: 'timestamp-match', confidence: 'high', deltaMs: best.delta },
        attachTo: best.cand.toolNode,
        dispatchedByTurnId: `asst:${best.cand.exec.issuedByAssistantUuid}`,
        dispatchedByToolCallId: `tool:${best.cand.exec.callId}`,
      };
    }
  }

  // Tier 3: orphan
  state.warnings.push({
    kind: 'orphan-subagent',
    detail: `subagent ${agentId}: no tool_result match and no timestamp within ${TIMESTAMP_MATCH_WINDOW_MS}ms`,
  });
  return {
    linkage: {
      method: 'orphan',
      confidence: 'none',
      reason: `no tool_result match and no timestamp within ${TIMESTAMP_MATCH_WINDOW_MS}ms`,
    },
    attachTo: parentSessionRoot,
    dispatchedByTurnId: null,
    dispatchedByToolCallId: null,
  };
}

/**
 * Post-order traversal: every node's rollup is its self cost plus the rollup
 * of every descendant. Pre-order rollup would zero out the root because the
 * children haven't been computed yet.
 */
function rollupPostOrder(node: SessionTreeNode): void {
  for (const c of node.children) rollupPostOrder(c);
  const total: NodeCost = { ...node.selfCost };
  for (const c of node.children) {
    total.inputTokens += c.rollupCost.inputTokens;
    total.outputTokens += c.rollupCost.outputTokens;
    total.cacheReadTokens += c.rollupCost.cacheReadTokens;
    total.cacheCreationTokens += c.rollupCost.cacheCreationTokens;
    total.costUsd += c.rollupCost.costUsd;
    total.durationMs += c.rollupCost.durationMs;
  }
  node.rollupCost = total;
}

interface CountsAccumulator {
  assistantTurns: number;
  userTurns: number;
  toolCalls: number;
  toolErrors: number;
  subagents: number;
}

function collectCounts(node: SessionTreeNode, acc: CountsAccumulator): void {
  switch (node.kind) {
    case 'assistant-turn':
      acc.assistantTurns += 1;
      break;
    case 'user-turn':
      acc.userTurns += 1;
      break;
    case 'tool-call':
      acc.toolCalls += 1;
      if (node.isError) acc.toolErrors += 1;
      break;
    case 'subagent-root':
      acc.subagents += 1;
      break;
  }
  for (const c of node.children) collectCounts(c, acc);
}

function computeDurationMs(parent: ParsedSession): number {
  const first = parent.meta.firstTs ? Date.parse(parent.meta.firstTs) : NaN;
  const last = parent.meta.lastTs ? Date.parse(parent.meta.lastTs) : NaN;
  if (Number.isNaN(first) || Number.isNaN(last)) return 0;
  return Math.max(0, last - first);
}

export function buildSessionTree(
  parent: ParsedSession,
  subagents: SubagentInput[],
): SessionTree {
  const state: BuildState = {
    warnings: [],
    nodesById: new Map(),
    subagentsByAgentId: new Map(),
  };

  // 1. Construct session-root.
  const root: SessionRootNode = {
    kind: 'session-root',
    id: `session:${parent.meta.sessionId}`,
    parentId: null,
    children: [],
    timestamp: parent.meta.firstTs ?? '',
    selfCost: zeroCost(),
    rollupCost: zeroCost(),
    sessionId: parent.meta.sessionId,
    slug: parent.meta.slug,
    firstMessage: parent.meta.firstMessage,
    firstTs: parent.meta.firstTs ?? '',
    lastTs: parent.meta.lastTs ?? '',
    filePath: parent.meta.filePath,
    projectKey: parent.meta.projectKey,
    gitBranch: parent.meta.gitBranch,
  };
  state.nodesById.set(root.id, root);

  // 2-3. Build the parent's in-tree structure (messages + tool-calls).
  buildSessionInTree(parent, root, state);

  // 4. Subagent linkage + recursive in-tree build.
  const agentCalls = collectAgentCallCandidates(parent, state);
  for (const sub of subagents) {
    if (!sub || !sub.parsed) {
      const id = sub?.meta?.agentId ?? 'unknown';
      state.warnings.push({
        kind: 'subagent-parse-failed',
        detail: `subagent ${id}: parsed session missing`,
      });
      continue;
    }

    const result = resolveLinkage(
      parent,
      root,
      agentCalls,
      sub.meta.agentId,
      sub.parsed.meta.firstTs ?? '',
      state,
    );

    const subRoot = makeSubagentNode(
      sub.meta.agentId,
      sub.parsed,
      sub.meta,
      parent.meta.sessionId,
      '', // prompt — parser doesn't surface Agent input.prompt yet
      result.linkage,
      result.dispatchedByTurnId,
      result.dispatchedByToolCallId,
    );
    state.nodesById.set(subRoot.id, subRoot);
    state.subagentsByAgentId.set(sub.meta.agentId, subRoot);
    attachChild(result.attachTo, subRoot);

    // Recurse: build the subagent's own message + tool-call tree under subRoot.
    buildSessionInTree(sub.parsed, subRoot, state);

    // Diagnostic: emit nested-subagent-skipped if subagent JSONL contained
    // any tool_use named 'Agent'. We do not recurse into nested subagents.
    if (sub.parsed.toolTimeline.some((t) => t.name === 'Agent')) {
      state.warnings.push({
        kind: 'nested-subagent-skipped',
        detail: `subagent ${sub.meta.agentId}: nested Agent tool_use detected, not recursing`,
      });
    }
  }

  // 5. Post-order cost rollup.
  rollupPostOrder(root);

  // 6. Counts + totals.
  const counts: CountsAccumulator = {
    assistantTurns: 0,
    userTurns: 0,
    toolCalls: 0,
    toolErrors: 0,
    subagents: 0,
  };
  collectCounts(root, counts);

  const totals = {
    assistantTurns: counts.assistantTurns,
    userTurns: counts.userTurns,
    toolCalls: counts.toolCalls,
    toolErrors: counts.toolErrors,
    subagents: counts.subagents,
    inputTokens: root.rollupCost.inputTokens,
    outputTokens: root.rollupCost.outputTokens,
    cacheReadTokens: root.rollupCost.cacheReadTokens,
    cacheCreationTokens: root.rollupCost.cacheCreationTokens,
    costUsd: root.rollupCost.costUsd,
    durationMs: computeDurationMs(parent),
  };

  return {
    root,
    nodesById: state.nodesById,
    subagentsByAgentId: state.subagentsByAgentId,
    totals,
    warnings: state.warnings,
  };
}
