import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  parseSessionAndBuildTree,
  sessionParseCache,
} from '../server/scanner/session-scanner';
import type {
  SessionRootNode,
  SubagentRootNode,
  AssistantTurnNode,
  ToolCallNode,
} from '../shared/session-types';

/**
 * End-to-end integration test for the session-hierarchy pipeline.
 *
 * Wires real code end-to-end against an anonymized fixture: the parser,
 * subagent discovery, tree builder, and cache all run unmocked. The fixture
 * at `tests/fixtures/session-hierarchy/` is a synthetic stand-in for the
 * 5-subagent reference session that motivated the milestone — see that
 * directory's README.md for provenance and invariants.
 *
 * The fixture's invariants are what the assertions below rely on: 5 subagents,
 * every one linkable via tier 1, non-zero subagent cost so rollup outgrows
 * self-cost, a clean warning-free build, and matching parsed/tree entries in
 * the cache.
 */

const FIXTURE_DIR = path.resolve(__dirname, 'fixtures/session-hierarchy');
const SUB_IDS = [
  'b1111111111111111',
  'b2222222222222222',
  'b3333333333333333',
  'b4444444444444444',
  'b5555555555555555',
];

function copyFixtureInto(destProjectDir: string): string {
  const subagentsDest = path.join(destProjectDir, 'parent', 'subagents');
  fs.mkdirSync(subagentsDest, { recursive: true });
  fs.copyFileSync(
    path.join(FIXTURE_DIR, 'parent.jsonl'),
    path.join(destProjectDir, 'parent.jsonl'),
  );
  for (const id of SUB_IDS) {
    fs.copyFileSync(
      path.join(FIXTURE_DIR, 'parent', 'subagents', `agent-${id}.jsonl`),
      path.join(subagentsDest, `agent-${id}.jsonl`),
    );
    fs.copyFileSync(
      path.join(FIXTURE_DIR, 'parent', 'subagents', `agent-${id}.meta.json`),
      path.join(subagentsDest, `agent-${id}.meta.json`),
    );
  }
  return path.join(destProjectDir, 'parent.jsonl');
}

describe('session-tree integration — scanner end-to-end against real-shaped fixture', () => {
  let tmpRoot: string;
  let parentFilePath: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'acc-session-tree-it-'));
    const projectDir = path.join(tmpRoot, '-home-user-projects-demo');
    parentFilePath = copyFixtureInto(projectDir);
    sessionParseCache.invalidateAll();
  });

  afterEach(() => {
    sessionParseCache.invalidateAll();
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('parses parent + 5 subagents and caches matched parsed/tree pair', () => {
    const parsed = parseSessionAndBuildTree(parentFilePath, '-home-user-projects-demo');
    expect(parsed).not.toBeNull();

    const cachedParsed = sessionParseCache.getByPath(parentFilePath);
    const cachedTree = sessionParseCache.getTreeByPath(parentFilePath);
    expect(cachedParsed).not.toBeNull();
    expect(cachedTree).not.toBeNull();
    expect(cachedParsed).toBe(parsed);
  });

  it('builds a single root with 5 subagent-roots underneath', () => {
    parseSessionAndBuildTree(parentFilePath, '-home-user-projects-demo');
    const tree = sessionParseCache.getTreeByPath(parentFilePath)!;

    expect(tree.root.kind).toBe('session-root');
    expect(tree.totals.subagents).toBe(5);
    expect(tree.subagentsByAgentId.size).toBe(5);
    for (const id of SUB_IDS) {
      const subRoot = tree.subagentsByAgentId.get(id);
      expect(subRoot, `missing subagent ${id}`).toBeDefined();
      expect(subRoot!.kind).toBe('subagent-root');
    }
  });

  it('resolves every subagent via tier-1 agentid-in-result', () => {
    parseSessionAndBuildTree(parentFilePath, '-home-user-projects-demo');
    const tree = sessionParseCache.getTreeByPath(parentFilePath)!;

    for (const id of SUB_IDS) {
      const subRoot = tree.subagentsByAgentId.get(id) as SubagentRootNode;
      expect(subRoot.linkage.method).toBe('agentid-in-result');
      expect(subRoot.dispatchedByTurnId).not.toBeNull();
      expect(subRoot.dispatchedByToolCallId).not.toBeNull();
      // Subagent hangs off the tool-call node, not session-root.
      const parentNode = tree.nodesById.get(subRoot.parentId!);
      expect(parentNode).toBeDefined();
      expect(parentNode!.kind).toBe('tool-call');
      expect((parentNode as ToolCallNode).name).toBe('Agent');
    }
  });

  it('rollup cost strictly exceeds root self-cost (subagents contribute)', () => {
    parseSessionAndBuildTree(parentFilePath, '-home-user-projects-demo');
    const tree = sessionParseCache.getTreeByPath(parentFilePath)!;
    const root = tree.root as SessionRootNode;

    // session-root itself has zero self-cost (cost lives on assistant turns),
    // so rollup equals the sum of all descendants' rollup.
    expect(root.selfCost.costUsd).toBe(0);
    expect(root.rollupCost.costUsd).toBeGreaterThan(0);
    // Rollup must include subagent cost: find the outer assistant turn that
    // dispatched the last Agent call and verify its rollup > its self cost.
    const dispatchingTurn = Array.from(tree.nodesById.values()).find(
      (n): n is AssistantTurnNode =>
        n.kind === 'assistant-turn' && n.children.some((c) => c.kind === 'tool-call' && (c as ToolCallNode).name === 'Agent'),
    );
    expect(dispatchingTurn, 'expected at least one assistant turn with Agent tool-call').toBeDefined();
    expect(dispatchingTurn!.rollupCost.costUsd).toBeGreaterThan(
      dispatchingTurn!.selfCost.costUsd,
    );
  });

  it('nodesById contains every node reachable from root', () => {
    parseSessionAndBuildTree(parentFilePath, '-home-user-projects-demo');
    const tree = sessionParseCache.getTreeByPath(parentFilePath)!;

    const seen = new Set<string>();
    const stack = [tree.root];
    while (stack.length) {
      const node = stack.pop()!;
      seen.add(node.id);
      stack.push(...node.children);
    }
    expect(tree.nodesById.size).toBe(seen.size);
    for (const id of seen) {
      expect(tree.nodesById.has(id)).toBe(true);
    }
  });

  it('emits no warnings for the clean fixture', () => {
    parseSessionAndBuildTree(parentFilePath, '-home-user-projects-demo');
    const tree = sessionParseCache.getTreeByPath(parentFilePath)!;
    expect(tree.warnings).toEqual([]);
  });

  it('sessions with zero subagents flow through the same code path', () => {
    const emptyProjectDir = path.join(tmpRoot, '-home-user-projects-empty');
    fs.mkdirSync(emptyProjectDir, { recursive: true });
    const emptyParent = path.join(emptyProjectDir, 'solo.jsonl');
    // Minimal one-record JSONL: a single user prompt, no subagents dir.
    fs.writeFileSync(
      emptyParent,
      JSON.stringify({
        type: 'user',
        uuid: 'solo-u-0000000000000000000001',
        parentUuid: '',
        timestamp: '2026-04-09T01:00:00.000Z',
        sessionId: 'solo',
        message: { role: 'user', content: 'demo solo session' },
      }) + '\n',
    );

    const parsed = parseSessionAndBuildTree(emptyParent, '-home-user-projects-empty');
    expect(parsed).not.toBeNull();
    const tree = sessionParseCache.getTreeByPath(emptyParent)!;
    expect(tree.totals.subagents).toBe(0);
    expect(tree.subagentsByAgentId.size).toBe(0);
    expect(tree.root.kind).toBe('session-root');
    expect(tree.warnings).toEqual([]);
  });

  it('returns null when the parent JSONL is missing and does not poison the cache', () => {
    const missing = path.join(tmpRoot, 'does-not-exist.jsonl');
    const parsed = parseSessionAndBuildTree(missing, '-home-user-projects-demo');
    expect(parsed).toBeNull();
    expect(sessionParseCache.getByPath(missing)).toBeNull();
    expect(sessionParseCache.getTreeByPath(missing)).toBeNull();
  });
});
