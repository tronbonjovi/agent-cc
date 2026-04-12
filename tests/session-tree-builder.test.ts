import { describe, it, expect } from 'vitest';
import {
  buildSessionTree,
  type SubagentInput,
} from '../server/scanner/session-tree-builder';
import type {
  AssistantRecord,
  AssistantTurnNode,
  ParsedSession,
  SessionMeta,
  SessionRootNode,
  SessionTreeNode,
  SubagentRootNode,
  ToolCallNode,
  ToolExecution,
  TokenUsage,
  UserRecord,
} from '../shared/session-types';
import type { DiscoveredSubagent } from '../server/scanner/subagent-discovery';

// ---------------------------------------------------------------------------
// Fixture builders — synthetic, no disk I/O
// ---------------------------------------------------------------------------

function emptyUsage(overrides: Partial<TokenUsage> = {}): TokenUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    serviceTier: '',
    inferenceGeo: '',
    speed: '',
    serverToolUse: { webSearchRequests: 0, webFetchRequests: 0 },
    ...overrides,
  };
}

function meta(overrides: Partial<SessionMeta> = {}): SessionMeta {
  return {
    sessionId: 'parent-session-id',
    slug: 'parent',
    firstMessage: '',
    firstTs: '2026-04-12T00:00:00.000Z',
    lastTs: '2026-04-12T00:00:10.000Z',
    sizeBytes: 0,
    filePath: '/fake/parent.jsonl',
    projectKey: 'project-x',
    cwd: '/fake',
    version: '1.0.0',
    gitBranch: 'main',
    entrypoint: 'cli',
    ...overrides,
  };
}

function asst(
  uuid: string,
  parentUuid: string,
  ts: string,
  opts: Partial<AssistantRecord> = {},
): AssistantRecord {
  return {
    uuid,
    parentUuid,
    timestamp: ts,
    requestId: `req-${uuid}`,
    isSidechain: false,
    model: 'claude-opus-4-6',
    stopReason: 'end_turn',
    usage: emptyUsage(),
    toolCalls: [],
    hasThinking: false,
    textPreview: '',
    ...opts,
  };
}

function user(
  uuid: string,
  parentUuid: string,
  ts: string,
  opts: Partial<UserRecord> = {},
): UserRecord {
  return {
    uuid,
    parentUuid,
    timestamp: ts,
    isSidechain: false,
    isMeta: false,
    permissionMode: null,
    toolResults: [],
    textPreview: '',
    ...opts,
  };
}

function tool(
  callId: string,
  name: string,
  issuedByAssistantUuid: string,
  ts: string,
  opts: Partial<ToolExecution> = {},
): ToolExecution {
  return {
    callId,
    name,
    filePath: null,
    command: null,
    pattern: null,
    timestamp: ts,
    resultTimestamp: ts,
    durationMs: null,
    isError: false,
    isSidechain: false,
    issuedByAssistantUuid,
    ...opts,
  };
}

function parsed(overrides: Partial<ParsedSession> = {}): ParsedSession {
  return {
    meta: meta(),
    assistantMessages: [],
    userMessages: [],
    systemEvents: { turnDurations: [], hookSummaries: [], localCommands: [], bridgeEvents: [] },
    toolTimeline: [],
    fileSnapshots: [],
    lifecycle: [],
    conversationTree: [],
    counts: {
      totalRecords: 0,
      assistantMessages: 0,
      userMessages: 0,
      systemEvents: 0,
      toolCalls: 0,
      toolErrors: 0,
      fileSnapshots: 0,
      sidechainMessages: 0,
    },
    ...overrides,
  };
}

function sub(
  agentId: string,
  parsedSession: ParsedSession,
  metaOverride: Partial<DiscoveredSubagent> = {},
): SubagentInput {
  const discovered: DiscoveredSubagent = {
    agentId,
    filePath: `/fake/parent/subagents/agent-${agentId}.jsonl`,
    metaFilePath: `/fake/parent/subagents/agent-${agentId}.meta.json`,
    meta: { agentType: 'Explore', description: `Subagent ${agentId}` },
    ...metaOverride,
  };
  return { parsed: parsedSession, meta: discovered };
}

// Walk the entire tree and collect every node.
function walk(node: SessionTreeNode): SessionTreeNode[] {
  const out: SessionTreeNode[] = [node];
  for (const c of node.children) out.push(...walk(c));
  return out;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildSessionTree', () => {
  it('1. linear session, no subagents — assistant + user attach to root', () => {
    const a1 = asst('a1', '', '2026-04-12T00:00:01.000Z');
    const u1 = user('u1', 'a1', '2026-04-12T00:00:02.000Z');
    const session = parsed({ assistantMessages: [a1], userMessages: [u1] });

    const tree = buildSessionTree(session, []);

    expect(tree.root.kind).toBe('session-root');
    // a1 has empty parentUuid → orphans onto session-root.
    // u1 has parentUuid 'a1' → attaches under a1.
    const root = tree.root as SessionRootNode;
    expect(root.children).toHaveLength(1);
    expect(root.children[0].kind).toBe('assistant-turn');
    expect(root.children[0].children).toHaveLength(1);
    expect(root.children[0].children[0].kind).toBe('user-turn');
    expect(tree.warnings).toHaveLength(0);
    expect(tree.totals.subagents).toBe(0);
    expect(tree.totals.assistantTurns).toBe(1);
    expect(tree.totals.userTurns).toBe(1);
  });

  it('2. tool-call attaches to issuing assistant turn, not session-root', () => {
    const a1 = asst('a1', '', '2026-04-12T00:00:01.000Z');
    const t1 = tool('call-1', 'Bash', 'a1', '2026-04-12T00:00:01.500Z');
    const session = parsed({ assistantMessages: [a1], toolTimeline: [t1] });

    const tree = buildSessionTree(session, []);

    const root = tree.root as SessionRootNode;
    const a1Node = root.children.find((c) => c.kind === 'assistant-turn')!;
    expect(a1Node.children).toHaveLength(1);
    expect(a1Node.children[0].kind).toBe('tool-call');
    expect((a1Node.children[0] as ToolCallNode).callId).toBe('call-1');
    expect(tree.warnings.find((w) => w.kind === 'orphan-tool-call')).toBeUndefined();
  });

  it('3. tool-call with unknown issuer becomes orphan-tool-call', () => {
    const a1 = asst('a1', '', '2026-04-12T00:00:01.000Z');
    const t1 = tool('call-1', 'Bash', 'unknown-asst', '2026-04-12T00:00:01.500Z');
    const session = parsed({ assistantMessages: [a1], toolTimeline: [t1] });

    const tree = buildSessionTree(session, []);

    const root = tree.root as SessionRootNode;
    const orphanTool = root.children.find((c) => c.kind === 'tool-call');
    expect(orphanTool).toBeDefined();
    expect(tree.warnings.some((w) => w.kind === 'orphan-tool-call')).toBe(true);
  });

  it('4. out-of-order parentUuid is resolved on pass 2', () => {
    // a2 references a1, but a2 appears first in the iteration order.
    const a2 = asst('a2', 'a1', '2026-04-12T00:00:01.000Z');
    const a1 = asst('a1', '', '2026-04-12T00:00:02.000Z');
    const session = parsed({ assistantMessages: [a2, a1] });

    const tree = buildSessionTree(session, []);

    const root = tree.root as SessionRootNode;
    // a1 attaches to root (no parent). a2 attaches under a1.
    expect(root.children).toHaveLength(1);
    expect(root.children[0].kind).toBe('assistant-turn');
    expect((root.children[0] as AssistantTurnNode).uuid).toBe('a1');
    expect(root.children[0].children).toHaveLength(1);
    expect((root.children[0].children[0] as AssistantTurnNode).uuid).toBe('a2');
    expect(tree.warnings).toHaveLength(0);
  });

  it('5. broken parentUuid chain attaches to root with warning', () => {
    const a1 = asst('a1', 'unknown-parent', '2026-04-12T00:00:01.000Z');
    const session = parsed({ assistantMessages: [a1] });

    const tree = buildSessionTree(session, []);

    const root = tree.root as SessionRootNode;
    expect(root.children).toHaveLength(1);
    expect(root.children[0].kind).toBe('assistant-turn');
    expect(tree.warnings.some((w) => w.kind === 'orphan-assistant-turn')).toBe(true);
  });

  it('6. subagent linked via agentid-in-result (tier 1)', () => {
    const a1 = asst('a1', '', '2026-04-12T00:00:01.000Z');
    const agentCall = tool('agent-call-1', 'Agent', 'a1', '2026-04-12T00:00:02.000Z');
    const u1 = user('u1', 'a1', '2026-04-12T00:00:03.000Z', {
      toolResults: [{ toolUseId: 'agent-call-1', isError: false, durationMs: null, success: true }],
      textPreview: 'agent dispatched: agentId="aaa" completed successfully',
    });
    const parent = parsed({
      assistantMessages: [a1],
      userMessages: [u1],
      toolTimeline: [agentCall],
    });

    const subParsed = parsed({
      meta: meta({ sessionId: 'sub-aaa', firstTs: '2026-04-12T00:05:00.000Z' }),
    });
    const subagents = [sub('aaa', subParsed)];

    const tree = buildSessionTree(parent, subagents);

    const subRoot = tree.subagentsByAgentId.get('aaa') as SubagentRootNode;
    expect(subRoot).toBeDefined();
    expect(subRoot.linkage.method).toBe('agentid-in-result');
    // Subagent attached as child of the tool-call node, not session root.
    const toolNode = tree.nodesById.get('tool:agent-call-1') as ToolCallNode;
    expect(toolNode.children.some((c) => c.kind === 'subagent-root')).toBe(true);
    expect(subRoot.parentId).toBe('tool:agent-call-1');
    expect(subRoot.dispatchedByToolCallId).toBe('tool:agent-call-1');
    expect(subRoot.dispatchedByTurnId).toBe('asst:a1');
  });

  it('7. subagent linked via timestamp-match (tier 2)', () => {
    const a1 = asst('a1', '', '2026-04-12T00:00:01.000Z');
    const agentCall = tool('agent-call-1', 'Agent', 'a1', '2026-04-12T00:00:02.000Z');
    const u1 = user('u1', 'a1', '2026-04-12T00:00:03.000Z', {
      toolResults: [{ toolUseId: 'agent-call-1', isError: false, durationMs: null, success: true }],
      textPreview: 'no agentId mentioned here',
    });
    const parent = parsed({
      assistantMessages: [a1],
      userMessages: [u1],
      toolTimeline: [agentCall],
    });

    // Subagent firstTs = agentCall.timestamp + 3ms → tier 2 should hit
    const subParsed = parsed({
      meta: meta({ sessionId: 'sub-bbb', firstTs: '2026-04-12T00:00:02.003Z' }),
    });
    const subagents = [sub('bbb', subParsed)];

    const tree = buildSessionTree(parent, subagents);

    const subRoot = tree.subagentsByAgentId.get('bbb') as SubagentRootNode;
    expect(subRoot.linkage.method).toBe('timestamp-match');
    if (subRoot.linkage.method === 'timestamp-match') {
      expect(subRoot.linkage.deltaMs).toBe(3);
    }
    expect(subRoot.parentId).toBe('tool:agent-call-1');
  });

  it('8. tier precedence — both tiers match, tier 1 wins', () => {
    const a1 = asst('a1', '', '2026-04-12T00:00:01.000Z');
    const agentCall = tool('agent-call-1', 'Agent', 'a1', '2026-04-12T00:00:02.000Z');
    const u1 = user('u1', 'a1', '2026-04-12T00:00:03.000Z', {
      toolResults: [{ toolUseId: 'agent-call-1', isError: false, durationMs: null, success: true }],
      textPreview: 'agent ccc finished',
    });
    const parent = parsed({
      assistantMessages: [a1],
      userMessages: [u1],
      toolTimeline: [agentCall],
    });

    // Both tier 1 (agentId in textPreview) AND tier 2 (Δ=3ms) would match.
    const subParsed = parsed({
      meta: meta({ sessionId: 'sub-ccc', firstTs: '2026-04-12T00:00:02.003Z' }),
    });
    const subagents = [sub('ccc', subParsed)];

    const tree = buildSessionTree(parent, subagents);

    const subRoot = tree.subagentsByAgentId.get('ccc') as SubagentRootNode;
    expect(subRoot.linkage.method).toBe('agentid-in-result');
  });

  it('9. orphan subagent — no result match, no timestamp within 10ms', () => {
    const a1 = asst('a1', '', '2026-04-12T00:00:01.000Z');
    const agentCall = tool('agent-call-1', 'Agent', 'a1', '2026-04-12T00:00:02.000Z');
    const u1 = user('u1', 'a1', '2026-04-12T00:00:03.000Z', {
      toolResults: [{ toolUseId: 'agent-call-1', isError: false, durationMs: null, success: true }],
      textPreview: 'no agentId here',
    });
    const parent = parsed({
      assistantMessages: [a1],
      userMessages: [u1],
      toolTimeline: [agentCall],
    });

    // 100ms apart — beyond the 10ms tier-2 window
    const subParsed = parsed({
      meta: meta({ sessionId: 'sub-zzz', firstTs: '2026-04-12T00:00:02.100Z' }),
    });
    const subagents = [sub('zzz', subParsed)];

    const tree = buildSessionTree(parent, subagents);

    const subRoot = tree.subagentsByAgentId.get('zzz') as SubagentRootNode;
    expect(subRoot.linkage.method).toBe('orphan');
    expect(subRoot.parentId).toBe(`session:${parent.meta.sessionId}`);
    expect(subRoot.dispatchedByToolCallId).toBeNull();
    expect(subRoot.dispatchedByTurnId).toBeNull();
    expect(tree.warnings.some((w) => w.kind === 'orphan-subagent')).toBe(true);
  });

  it('10. missing .meta.json — agentType=unknown, no warning', () => {
    const subParsed = parsed({
      meta: meta({ sessionId: 'sub-mmm', firstTs: '2026-04-12T00:00:00.000Z' }),
    });
    const subagents = [sub('mmm', subParsed, { meta: null })];
    const parent = parsed();

    const tree = buildSessionTree(parent, subagents);

    const subRoot = tree.subagentsByAgentId.get('mmm') as SubagentRootNode;
    expect(subRoot.agentType).toBe('unknown');
    expect(subRoot.description).toBe('');
    expect(tree.warnings.some((w) => w.kind === 'subagent-parse-failed')).toBe(false);
  });

  it('11. nested subagent skipped — Agent tool_use inside subagent emits warning', () => {
    const subA1 = asst('s-a1', '', '2026-04-12T00:00:05.000Z');
    const nestedAgentCall = tool('nested-1', 'Agent', 's-a1', '2026-04-12T00:00:06.000Z');
    const subParsed = parsed({
      meta: meta({ sessionId: 'sub-nnn', firstTs: '2026-04-12T00:00:05.000Z' }),
      assistantMessages: [subA1],
      toolTimeline: [nestedAgentCall],
    });
    const parent = parsed();
    const subagents = [sub('nnn', subParsed)];

    const tree = buildSessionTree(parent, subagents);

    expect(tree.warnings.some((w) => w.kind === 'nested-subagent-skipped')).toBe(true);
    // The nested call still appears as an ordinary tool-call node in the subagent subtree.
    const nestedNode = tree.nodesById.get('tool:nested-1');
    expect(nestedNode).toBeDefined();
    expect(nestedNode!.kind).toBe('tool-call');
  });

  it('12. cost rollup across three levels — root sums children', () => {
    // Outer parent: assistant turn with 20000 input tokens on opus-4-6 → $0.10
    const outerAsst = asst('a1', '', '2026-04-12T00:00:01.000Z', {
      model: 'claude-opus-4-6',
      usage: emptyUsage({ inputTokens: 20000 }),
    });
    const agentCall = tool('agent-call-1', 'Agent', 'a1', '2026-04-12T00:00:02.000Z');
    const u1 = user('u1', 'a1', '2026-04-12T00:00:03.000Z', {
      toolResults: [{ toolUseId: 'agent-call-1', isError: false, durationMs: null, success: true }],
      textPreview: 'subagent ddd done',
    });
    const parent = parsed({
      assistantMessages: [outerAsst],
      userMessages: [u1],
      toolTimeline: [agentCall],
    });

    // Subagent: assistant turn with 40000 input tokens on opus-4-6 → $0.20
    const innerAsst = asst('s-a1', '', '2026-04-12T00:00:05.000Z', {
      model: 'claude-opus-4-6',
      usage: emptyUsage({ inputTokens: 40000 }),
    });
    const subParsed = parsed({
      meta: meta({ sessionId: 'sub-ddd', firstTs: '2026-04-12T00:00:05.000Z' }),
      assistantMessages: [innerAsst],
    });
    const subagents = [sub('ddd', subParsed)];

    const tree = buildSessionTree(parent, subagents);

    const root = tree.root as SessionRootNode;
    expect(root.selfCost.costUsd).toBe(0);
    expect(root.rollupCost.costUsd).toBeCloseTo(0.30, 6);

    const subRoot = tree.subagentsByAgentId.get('ddd') as SubagentRootNode;
    expect(subRoot.rollupCost.costUsd).toBeCloseTo(0.20, 6);
    expect(subRoot.selfCost.costUsd).toBe(0);

    // Outer assistant turn rollup includes its own selfCost ($0.10) + everything beneath
    // it (the agent-call → subagent at $0.20) = $0.30.
    const outerNode = tree.nodesById.get('asst:a1') as AssistantTurnNode;
    expect(outerNode.selfCost.costUsd).toBeCloseTo(0.10, 6);
    expect(outerNode.rollupCost.costUsd).toBeCloseTo(0.30, 6);
  });

  it('13. SessionTree.totals consistency with rollup and counts', () => {
    const outerAsst = asst('a1', '', '2026-04-12T00:00:01.000Z', {
      model: 'claude-opus-4-6',
      usage: emptyUsage({ inputTokens: 20000 }),
    });
    const u1 = user('u1', 'a1', '2026-04-12T00:00:02.000Z');
    const agentCall = tool('agent-call-1', 'Agent', 'a1', '2026-04-12T00:00:03.000Z');
    const u2 = user('u2', 'a1', '2026-04-12T00:00:04.000Z', {
      toolResults: [{ toolUseId: 'agent-call-1', isError: false, durationMs: null, success: true }],
      textPreview: 'subagent eee done',
    });
    const parent = parsed({
      assistantMessages: [outerAsst],
      userMessages: [u1, u2],
      toolTimeline: [agentCall],
    });

    const innerAsst = asst('s-a1', '', '2026-04-12T00:00:05.000Z', {
      model: 'claude-opus-4-6',
      usage: emptyUsage({ inputTokens: 40000 }),
    });
    const subParsed = parsed({
      meta: meta({ sessionId: 'sub-eee', firstTs: '2026-04-12T00:00:05.000Z' }),
      assistantMessages: [innerAsst],
    });
    const subagents = [sub('eee', subParsed)];

    const tree = buildSessionTree(parent, subagents);

    expect(tree.totals.costUsd).toBeCloseTo(tree.root.rollupCost.costUsd, 6);
    expect(tree.totals.assistantTurns).toBe(2); // outer + inner
    expect(tree.totals.userTurns).toBe(2);
    expect(tree.totals.subagents).toBe(1);
    expect(tree.totals.toolCalls).toBe(1);
  });

  it('14. nodesById contains every node reachable from root', () => {
    const a1 = asst('a1', '', '2026-04-12T00:00:01.000Z');
    const u1 = user('u1', 'a1', '2026-04-12T00:00:02.000Z');
    const t1 = tool('call-1', 'Bash', 'a1', '2026-04-12T00:00:01.500Z');
    const parent = parsed({
      assistantMessages: [a1],
      userMessages: [u1],
      toolTimeline: [t1],
    });

    const tree = buildSessionTree(parent, []);

    const reachable = walk(tree.root);
    for (const node of reachable) {
      expect(tree.nodesById.get(node.id)).toBe(node);
    }
    expect(tree.nodesById.size).toBe(reachable.length);
  });

  it('15. subagentsByAgentId contains exactly the subagent roots', () => {
    const subParsed1 = parsed({ meta: meta({ sessionId: 'sub-1', firstTs: '2026-04-12T00:00:00.000Z' }) });
    const subParsed2 = parsed({ meta: meta({ sessionId: 'sub-2', firstTs: '2026-04-12T00:00:00.000Z' }) });
    const parent = parsed();
    const subagents = [sub('one', subParsed1), sub('two', subParsed2)];

    const tree = buildSessionTree(parent, subagents);

    expect(tree.subagentsByAgentId.size).toBe(2);
    expect(tree.subagentsByAgentId.get('one')!.kind).toBe('subagent-root');
    expect(tree.subagentsByAgentId.get('two')!.kind).toBe('subagent-root');
  });

  it('16. empty session — root only, totals all zero, no warnings', () => {
    const parent = parsed();

    const tree = buildSessionTree(parent, []);

    expect(tree.root.children).toHaveLength(0);
    expect(tree.warnings).toHaveLength(0);
    expect(tree.totals.assistantTurns).toBe(0);
    expect(tree.totals.userTurns).toBe(0);
    expect(tree.totals.toolCalls).toBe(0);
    expect(tree.totals.subagents).toBe(0);
    expect(tree.totals.costUsd).toBe(0);
    expect(tree.totals.inputTokens).toBe(0);
  });
});
