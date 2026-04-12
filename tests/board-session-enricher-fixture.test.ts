// tests/board-session-enricher-fixture.test.ts
//
// End-to-end test for session-enricher tree integration. Unlike the
// mocked sibling file, this one runs the real parser, real tree builder,
// and real session-cache against the synthetic session-hierarchy fixture
// to prove that costs / tool counts / turn counts on a board card pick
// up subagent contributions, not just the parent session.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import {
  parseSessionAndBuildTree,
  sessionParseCache,
} from "../server/scanner/session-scanner";
import { enrichTaskSession } from "../server/board/session-enricher";
import type { SessionData } from "@shared/types";

// Stub the analytics + agent-scanner deps the enricher pulls in. The
// fixture only feeds the parser/tree pipeline; analytics + agent
// executions are out of scope for this test and would otherwise reach
// into ~/.claude global state.
vi.mock("../server/scanner/session-analytics", () => ({
  getSessionCost: vi.fn(() => null),
  getSessionHealth: vi.fn(() => null),
}));
vi.mock("../server/scanner/agent-scanner", () => ({
  getCachedExecutions: vi.fn(() => []),
}));

const FIXTURE_DIR = path.resolve(__dirname, "fixtures/session-hierarchy");
const SUB_IDS = [
  "b1111111111111111",
  "b2222222222222222",
  "b3333333333333333",
  "b4444444444444444",
  "b5555555555555555",
];
const PROJECT_KEY = "-home-user-projects-demo";
const SESSION_ID = "parent";

function copyFixtureInto(destProjectDir: string): string {
  const subagentsDest = path.join(destProjectDir, "parent", "subagents");
  fs.mkdirSync(subagentsDest, { recursive: true });
  fs.copyFileSync(
    path.join(FIXTURE_DIR, "parent.jsonl"),
    path.join(destProjectDir, "parent.jsonl"),
  );
  for (const id of SUB_IDS) {
    fs.copyFileSync(
      path.join(FIXTURE_DIR, "parent", "subagents", `agent-${id}.jsonl`),
      path.join(subagentsDest, `agent-${id}.jsonl`),
    );
    fs.copyFileSync(
      path.join(FIXTURE_DIR, "parent", "subagents", `agent-${id}.meta.json`),
      path.join(subagentsDest, `agent-${id}.meta.json`),
    );
  }
  return path.join(destProjectDir, "parent.jsonl");
}

function fakeSession(filePath: string): SessionData {
  return {
    id: SESSION_ID,
    projectKey: PROJECT_KEY,
    filePath,
    firstTs: "2026-04-09T00:00:00.000Z",
    lastTs: "2026-04-09T01:00:00.000Z",
    firstMessage: "demo",
    messageCount: 1,
    isActive: false,
    isEmpty: false,
    sizeBytes: fs.statSync(filePath).size,
  };
}

describe("enrichTaskSession (fixture-driven SessionTree)", () => {
  let tmpRoot: string;
  let parentFilePath: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "acc-enricher-fixture-"));
    const projectDir = path.join(tmpRoot, PROJECT_KEY);
    parentFilePath = copyFixtureInto(projectDir);
    sessionParseCache.invalidateAll();
    parseSessionAndBuildTree(parentFilePath, PROJECT_KEY);
  });

  afterEach(() => {
    sessionParseCache.invalidateAll();
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("cost includes subagent spend (rollup beats parent-only)", () => {
    const tree = sessionParseCache.getTreeById(SESSION_ID)!;
    expect(tree).not.toBeNull();
    // Sanity: rollup > parent self-cost is what makes this test interesting.
    expect(tree.root.rollupCost.costUsd).toBeGreaterThan(tree.root.selfCost.costUsd);

    const result = enrichTaskSession(SESSION_ID, [fakeSession(parentFilePath)]);

    expect(result).not.toBeNull();
    expect(result!.costUsd).toBe(tree.totals.costUsd);
    expect(result!.costUsd).toBeGreaterThan(tree.root.selfCost.costUsd);
  });

  it("tool count includes subagent tool calls", () => {
    const tree = sessionParseCache.getTreeById(SESSION_ID)!;
    const parsed = sessionParseCache.getById(SESSION_ID)!;

    const result = enrichTaskSession(SESSION_ID, [fakeSession(parentFilePath)]);

    expect(result).not.toBeNull();
    expect(result!.totalToolCalls).toBe(tree.totals.toolCalls);
    // Subagent tool-calls roll up — strictly more than parent-only count.
    expect(result!.totalToolCalls).toBeGreaterThan(parsed.counts.toolCalls);
  });

  it("turn count includes subagent assistant turns", () => {
    const tree = sessionParseCache.getTreeById(SESSION_ID)!;
    const parsed = sessionParseCache.getById(SESSION_ID)!;

    const result = enrichTaskSession(SESSION_ID, [fakeSession(parentFilePath)]);

    expect(result).not.toBeNull();
    expect(result!.turnCount).toBe(tree.totals.assistantTurns);
    expect(result!.turnCount).toBeGreaterThan(parsed.counts.assistantMessages);
  });
});
