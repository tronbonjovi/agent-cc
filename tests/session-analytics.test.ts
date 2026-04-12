// tests/session-analytics.test.ts
//
// Tests for the SessionTree-based migration in `session-analytics.ts`
// (flat-to-tree wave 1 task001).
//
// These tests prove that cost / token / health aggregation now reads from the
// hierarchical SessionTree (so subagent costs are included), and that the
// flat-array fallback still runs when the tree is missing from the cache.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import type { SessionData } from "../shared/types";
import type {
  SessionTree,
  AssistantTurnNode,
  ToolCallNode,
} from "../shared/session-types";

const FIXTURE_DIR = path.resolve(__dirname, "fixtures/session-hierarchy");
const SUB_IDS = [
  "b1111111111111111",
  "b2222222222222222",
  "b3333333333333333",
  "b4444444444444444",
  "b5555555555555555",
];

/**
 * Copy the multi-subagent fixture into a temporary project dir so the parser
 * can read it without touching `~/.claude/projects/`. Returns the parent JSONL
 * path. Optional `mutateSubagent` callback rewrites a single subagent file
 * before copy so individual tests can inject errors / different models.
 */
function copyFixtureInto(
  destProjectDir: string,
  mutateSubagent?: (agentId: string, content: string) => string,
): string {
  const subagentsDest = path.join(destProjectDir, "parent", "subagents");
  fs.mkdirSync(subagentsDest, { recursive: true });
  fs.copyFileSync(
    path.join(FIXTURE_DIR, "parent.jsonl"),
    path.join(destProjectDir, "parent.jsonl"),
  );
  for (const id of SUB_IDS) {
    const srcJsonl = path.join(FIXTURE_DIR, "parent", "subagents", `agent-${id}.jsonl`);
    const destJsonl = path.join(subagentsDest, `agent-${id}.jsonl`);
    if (mutateSubagent) {
      const original = fs.readFileSync(srcJsonl, "utf-8");
      fs.writeFileSync(destJsonl, mutateSubagent(id, original));
    } else {
      fs.copyFileSync(srcJsonl, destJsonl);
    }
    fs.copyFileSync(
      path.join(FIXTURE_DIR, "parent", "subagents", `agent-${id}.meta.json`),
      path.join(subagentsDest, `agent-${id}.meta.json`),
    );
  }
  return path.join(destProjectDir, "parent.jsonl");
}

/**
 * Build a `SessionData` row that matches what the file scanner would produce
 * for the parent JSONL — analytics only reads a few fields off it.
 */
function makeSessionData(parentFilePath: string, projectKey: string): SessionData {
  const stat = fs.statSync(parentFilePath);
  return {
    id: "parent",
    slug: "parent",
    firstMessage: "demo",
    firstTs: "2026-04-09T01:00:00.000Z",
    lastTs: "2026-04-09T02:00:00.000Z",
    messageCount: 17,
    sizeBytes: stat.size,
    isEmpty: false,
    isActive: false,
    filePath: parentFilePath,
    projectKey,
    cwd: "",
    version: "",
    gitBranch: "",
  };
}

/**
 * Re-import the analytics + scanner modules with a clean module registry so
 * each test gets a fresh `sessionParseCache` singleton AND a fresh analytics
 * cache. Both modules import from the same `session-cache.ts` path so vitest's
 * module dedup keeps them sharing one cache instance per call.
 */
async function freshImports() {
  vi.resetModules();
  const scanner = await import("../server/scanner/session-scanner");
  const analytics = await import("../server/scanner/session-analytics");
  const cacheMod = await import("../server/scanner/session-cache");
  return { scanner, analytics, cacheMod };
}

describe("session-analytics with SessionTree (flat-to-tree wave1 task001)", () => {
  let tmpRoot: string;
  let projectDir: string;
  let projectKey: string;
  let parentFilePath: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "acc-session-analytics-"));
    projectKey = "-home-user-projects-demo";
    projectDir = path.join(tmpRoot, projectKey);
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("computeSessionAnalytics includes subagent cost for multi-subagent session", async () => {
    parentFilePath = copyFixtureInto(projectDir);
    const { scanner, analytics } = await freshImports();
    scanner.sessionParseCache.invalidateAll();
    const parsed = scanner.parseSessionAndBuildTree(parentFilePath, projectKey);
    expect(parsed).not.toBeNull();

    // Compute the parent-only flat cost — what the legacy code path would
    // produce by summing only `parsed.assistantMessages[].usage`.
    const { computeCost, getPricing } = await import("../server/scanner/pricing");
    const parentOnlyCost = parsed!.assistantMessages.reduce((sum, msg) => {
      const u = msg.usage;
      const pricing = getPricing(msg.model || "unknown");
      return sum + computeCost(pricing, u.inputTokens, u.outputTokens, u.cacheReadTokens, u.cacheCreationTokens);
    }, 0);
    expect(parentOnlyCost).toBeGreaterThan(0);

    const sessionData = makeSessionData(parentFilePath, projectKey);
    const cost = analytics.getSessionCost([sessionData], "parent");
    expect(cost).not.toBeNull();
    // Tree cost rolls in subagent assistant turns, so it must outpace the
    // parent-only sum (subagents add ~40k input tokens on the same model).
    expect(cost!.estimatedCostUsd).toBeGreaterThan(parentOnlyCost);

    // Token totals should also include subagent contributions.
    const tree = scanner.sessionParseCache.getTreeById("parent")!;
    expect(cost!.inputTokens).toBe(tree.totals.inputTokens);
    expect(cost!.outputTokens).toBe(tree.totals.outputTokens);
    expect(cost!.cacheReadTokens).toBe(tree.totals.cacheReadTokens);
    expect(cost!.cacheCreationTokens).toBe(tree.totals.cacheCreationTokens);
  });

  it("computeSessionAnalytics per-model breakdown includes subagent models", async () => {
    // Rewrite the first subagent to use a distinct model name so we can prove
    // the per-model walk visits subagent assistant-turn nodes, not just
    // parent.assistantMessages[].
    parentFilePath = copyFixtureInto(projectDir, (agentId, content) => {
      if (agentId !== SUB_IDS[0]) return content;
      return content.replace(/"claude-opus-4-6"/g, '"claude-sonnet-4-5"');
    });

    const { scanner, analytics } = await freshImports();
    scanner.sessionParseCache.invalidateAll();
    scanner.parseSessionAndBuildTree(parentFilePath, projectKey);

    const sessionData = makeSessionData(parentFilePath, projectKey);
    const cost = analytics.getSessionCost([sessionData], "parent");
    expect(cost).not.toBeNull();

    // Parent JSONL never references claude-sonnet-4-5; it appears only in the
    // first subagent. The breakdown must surface it as a row.
    expect(cost!.models).toContain("claude-sonnet-4-5");
    expect(cost!.modelBreakdown["claude-sonnet-4-5"]).toBeDefined();
    expect(cost!.modelBreakdown["claude-sonnet-4-5"].input).toBeGreaterThan(0);
    expect(cost!.modelBreakdown["claude-sonnet-4-5"].cost).toBeGreaterThan(0);

    // The original opus row must still exist for parent + the other 4 subagents.
    expect(cost!.modelBreakdown["claude-opus-4-6"]).toBeDefined();
    expect(cost!.modelBreakdown["claude-opus-4-6"].input).toBeGreaterThan(0);

    // Sanity check: every breakdown row's tokens equal the sum of selfCost
    // tokens for assistant-turn nodes carrying that model in the tree.
    const tree = scanner.sessionParseCache.getTreeById("parent")!;
    const expected: Record<string, { input: number; output: number; cost: number }> = {};
    Array.from(tree.nodesById.values()).forEach((node) => {
      if (node.kind !== "assistant-turn") return;
      const turn = node as AssistantTurnNode;
      const model = turn.model || "unknown";
      if (!expected[model]) expected[model] = { input: 0, output: 0, cost: 0 };
      expected[model].input += turn.usage.inputTokens;
      expected[model].output += turn.usage.outputTokens;
      expected[model].cost += turn.selfCost.costUsd;
    });
    for (const [model, e] of Object.entries(expected)) {
      const row = cost!.modelBreakdown[model];
      expect(row, `breakdown row missing for ${model}`).toBeDefined();
      expect(row.input).toBe(e.input);
      expect(row.output).toBe(e.output);
      // Per-model cost is rounded to 4 decimals at the end of computation.
      expect(row.cost).toBeCloseTo(e.cost, 3);
    }
  });

  it("computeSessionAnalytics health inputs use tree counts", async () => {
    // Inject an `is_error: true` tool_result into one subagent so the tree's
    // toolErrors total is strictly greater than the parent-only count (which
    // is 0). This proves health scoring sees the subagent's failure.
    parentFilePath = copyFixtureInto(projectDir, (agentId, content) => {
      if (agentId !== SUB_IDS[0]) return content;
      // Flip the first tool_result `is_error` flag from false to true.
      return content.replace(/"is_error":\s*false/, '"is_error":true');
    });

    const { scanner, analytics } = await freshImports();
    scanner.sessionParseCache.invalidateAll();
    const parsed = scanner.parseSessionAndBuildTree(parentFilePath, projectKey);
    expect(parsed).not.toBeNull();

    const tree = scanner.sessionParseCache.getTreeById("parent")!;
    expect(tree.totals.toolErrors).toBeGreaterThan(parsed!.counts.toolErrors);
    expect(tree.totals.toolCalls).toBeGreaterThan(parsed!.counts.toolCalls);

    const sessionData = makeSessionData(parentFilePath, projectKey);
    const health = analytics.getSessionHealth([sessionData], "parent");
    expect(health).not.toBeNull();

    // The persisted SessionHealth carries the counts that were fed into
    // computeHealthReasons — they must match the tree totals (NOT parsed.counts).
    expect(health!.totalToolCalls).toBe(tree.totals.toolCalls);
    expect(health!.toolErrors).toBe(tree.totals.toolErrors);
    expect(health!.toolErrors).toBeGreaterThan(0);
  });

  it("computeSessionAnalytics falls back gracefully when tree is null", async () => {
    parentFilePath = copyFixtureInto(projectDir);
    const { scanner, analytics, cacheMod } = await freshImports();
    scanner.sessionParseCache.invalidateAll();
    // Prime the parsed-session side of the cache without ever populating a
    // tree, so getTreeById returns null and the fallback path runs.
    cacheMod.sessionParseCache.getOrParse(parentFilePath, projectKey);
    expect(cacheMod.sessionParseCache.getTreeById("parent")).toBeNull();

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const sessionData = makeSessionData(parentFilePath, projectKey);
    expect(() => analytics.getCostAnalytics([sessionData])).not.toThrow();
    const cost = analytics.getSessionCost([sessionData], "parent");
    expect(cost).not.toBeNull();
    // Fallback uses parent-only assistant messages — still positive cost,
    // just lower than the tree-aware path.
    expect(cost!.estimatedCostUsd).toBeGreaterThan(0);

    // Warn should have been emitted for the missing tree.
    const calls = warnSpy.mock.calls.map((c) => c.join(" "));
    const matched = calls.find(
      (msg) =>
        msg.includes("session-analytics: tree missing, falling back to flat arrays") &&
        msg.includes("parent"),
    );
    expect(matched, `expected fallback warn, got: ${JSON.stringify(calls)}`).toBeDefined();
  });
});
