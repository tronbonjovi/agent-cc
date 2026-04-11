# Kanban Card Enrichment & Auto Session-Task Linking — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface the new session parser data on kanban cards via an inline expandable detail section, and automatically link unlinked tasks to sessions using behavioral signals.

**Architecture:** Extend `SessionEnrichment` and `LastSessionSnapshot` with new fields populated from the parsed session cache and analytics. Add a client-side accordion component that renders health tags and a stats grid. Add an `autoLinkSession()` function to the enricher that matches tasks to sessions by git branch, file paths, and timing.

**Tech Stack:** TypeScript, React, Vitest, existing session-parser/cache/analytics modules

---

## File Structure

**New files:**
- `client/src/components/board/session-detail-accordion.tsx` — expandable inline detail panel for board cards
- `tests/board-session-detail.test.ts` — tests for the accordion component and its data sources
- `tests/auto-link-session.test.ts` — tests for auto session-task linking logic

**Modified files:**
- `shared/board-types.ts` — extend `SessionEnrichment` and `LastSessionSnapshot` with new fields
- `server/board/session-enricher.ts` — populate new fields from parsed cache + analytics, add `autoLinkSession()`
- `client/src/components/board/board-task-card.tsx` — render the accordion component
- `client/src/components/board/session-indicators.tsx` — add `HealthReasonTag` component

---

### Task 1: Extend Type Definitions

**Files:**
- Modify: `shared/board-types.ts:7-15` (LastSessionSnapshot)
- Modify: `shared/board-types.ts:42-56` (SessionEnrichment)
- Test: `tests/board-session-detail.test.ts` (new)

- [ ] **Step 1: Write failing tests for new type fields**

Create `tests/board-session-detail.test.ts`:

```typescript
// tests/board-session-detail.test.ts
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const BOARD_TYPES_SRC = fs.readFileSync(
  path.join(__dirname, "../shared/board-types.ts"),
  "utf-8"
);

describe("SessionEnrichment extended fields", () => {
  it("has healthReasons array field", () => {
    expect(BOARD_TYPES_SRC).toMatch(/healthReasons\s*:\s*string\[\]/);
  });

  it("has totalToolCalls number field", () => {
    expect(BOARD_TYPES_SRC).toMatch(/totalToolCalls\s*:\s*number/);
  });

  it("has retries number field", () => {
    expect(BOARD_TYPES_SRC).toMatch(/retries\s*:\s*number/);
  });

  it("has cacheHitRate nullable number field", () => {
    expect(BOARD_TYPES_SRC).toMatch(/cacheHitRate\s*:\s*number\s*\|\s*null/);
  });

  it("has maxTokensStops number field", () => {
    expect(BOARD_TYPES_SRC).toMatch(/maxTokensStops\s*:\s*number/);
  });

  it("has webRequests number field", () => {
    expect(BOARD_TYPES_SRC).toMatch(/webRequests\s*:\s*number/);
  });

  it("has sidechainCount number field", () => {
    expect(BOARD_TYPES_SRC).toMatch(/sidechainCount\s*:\s*number/);
  });

  it("has turnCount number field", () => {
    expect(BOARD_TYPES_SRC).toMatch(/turnCount\s*:\s*number/);
  });
});

describe("LastSessionSnapshot extended fields", () => {
  // LastSessionSnapshot should mirror the new enrichment fields
  // so completed tasks retain session detail data
  const snapshotMatch = BOARD_TYPES_SRC.match(
    /export interface LastSessionSnapshot\s*\{([^}]+)\}/
  );

  it("has healthReasons field", () => {
    expect(snapshotMatch?.[1]).toMatch(/healthReasons/);
  });

  it("has totalToolCalls field", () => {
    expect(snapshotMatch?.[1]).toMatch(/totalToolCalls/);
  });

  it("has cacheHitRate field", () => {
    expect(snapshotMatch?.[1]).toMatch(/cacheHitRate/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/board-session-detail.test.ts --reporter=dot`
Expected: FAIL — fields don't exist yet

- [ ] **Step 3: Add new fields to SessionEnrichment**

In `shared/board-types.ts`, add these fields to the `SessionEnrichment` interface after the existing `agentRole` field:

```typescript
  // Session detail (expandable section)
  healthReasons: string[];
  totalToolCalls: number;
  retries: number;
  cacheHitRate: number | null;
  maxTokensStops: number;
  webRequests: number;
  sidechainCount: number;
  turnCount: number;
```

- [ ] **Step 4: Add new fields to LastSessionSnapshot**

In `shared/board-types.ts`, add these fields to the `LastSessionSnapshot` interface after the existing `costUsd` field:

```typescript
  healthReasons: string[];
  totalToolCalls: number;
  retries: number;
  cacheHitRate: number | null;
  maxTokensStops: number;
  webRequests: number;
  sidechainCount: number;
  turnCount: number;
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/board-session-detail.test.ts --reporter=dot`
Expected: PASS

- [ ] **Step 6: Fix TypeScript compilation**

Run: `npm run check`
Expected: Type errors in `session-enricher.ts` and `board-task-card.tsx` because the new required fields are missing from return values. This is expected — we'll fix these in the next tasks.

- [ ] **Step 7: Commit**

```bash
git add shared/board-types.ts tests/board-session-detail.test.ts
git commit -m "feat: extend SessionEnrichment and LastSessionSnapshot with detail fields"
```

---

### Task 2: Populate New Enrichment Fields

**Files:**
- Modify: `server/board/session-enricher.ts:77-131` (enrichTaskSession)
- Modify: `server/board/session-enricher.ts:44-54` (buildSessionSnapshot)
- Test: `tests/board-session-enricher.test.ts` (existing, add new tests)

- [ ] **Step 1: Write failing tests for new enrichment fields**

Add to `tests/board-session-enricher.test.ts`. First, add the session-cache mock at the top with the other mocks:

```typescript
vi.mock("../server/scanner/session-cache", () => ({
  sessionParseCache: {
    getById: vi.fn(),
  },
}));
```

And the import + typed mock:

```typescript
import { sessionParseCache } from "../server/scanner/session-cache";
const mockGetById = vi.mocked(sessionParseCache.getById);
```

Add a `makeParsedSession` helper:

```typescript
const makeParsedSession = (overrides: Record<string, any> = {}) => ({
  meta: {
    sessionId: "sess-abc123",
    slug: "test-session",
    firstMessage: "Hello",
    firstTs: "2026-04-01T10:00:00.000Z",
    lastTs: "2026-04-01T10:30:00.000Z",
    sizeBytes: 1024,
    filePath: "/tmp/fake.jsonl",
    projectKey: "my-project",
    cwd: "/home/user/project",
    version: "1.0.0",
    gitBranch: "main",
    entrypoint: "cli",
  },
  assistantMessages: [
    {
      uuid: "a1", parentUuid: "", timestamp: "2026-04-01T10:00:00.000Z",
      requestId: "r1", isSidechain: false, model: "claude-sonnet-4-5",
      stopReason: "end_turn",
      usage: {
        inputTokens: 5000, outputTokens: 2000,
        cacheReadTokens: 3000, cacheCreationTokens: 1000,
        serviceTier: "standard", inferenceGeo: "us", speed: "standard",
        serverToolUse: { webSearchRequests: 2, webFetchRequests: 3 },
      },
      toolCalls: [], hasThinking: false, textPreview: "Hello",
    },
    {
      uuid: "a2", parentUuid: "a1", timestamp: "2026-04-01T10:05:00.000Z",
      requestId: "r2", isSidechain: false, model: "claude-sonnet-4-5",
      stopReason: "max_tokens",
      usage: {
        inputTokens: 4000, outputTokens: 1500,
        cacheReadTokens: 2000, cacheCreationTokens: 500,
        serviceTier: "standard", inferenceGeo: "us", speed: "standard",
        serverToolUse: { webSearchRequests: 0, webFetchRequests: 1 },
      },
      toolCalls: [], hasThinking: false, textPreview: "World",
    },
  ],
  userMessages: [],
  systemEvents: {
    turnDurations: [
      { timestamp: "2026-04-01T10:01:00.000Z", durationMs: 5000, messageCount: 2, parentUuid: "" },
      { timestamp: "2026-04-01T10:06:00.000Z", durationMs: 3000, messageCount: 1, parentUuid: "" },
      { timestamp: "2026-04-01T10:10:00.000Z", durationMs: 7000, messageCount: 3, parentUuid: "" },
    ],
    hookSummaries: [],
    localCommands: [],
    bridgeEvents: [],
  },
  toolTimeline: [],
  fileSnapshots: [],
  lifecycle: [],
  conversationTree: [],
  counts: {
    totalRecords: 10,
    assistantMessages: 2,
    userMessages: 3,
    systemEvents: 3,
    toolCalls: 15,
    toolErrors: 2,
    fileSnapshots: 0,
    sidechainMessages: 4,
  },
  ...overrides,
});
```

Then add the new test cases inside the existing `describe("enrichTaskSession")`:

```typescript
  it("populates new detail fields from parsed session cache", () => {
    const session = makeSession();
    const cost = makeCost({
      cacheReadTokens: 3000,
      cacheCreationTokens: 1000,
    });
    const health = makeHealth({
      healthReasons: ["high error rate", "context overflow"],
      retries: 5,
      totalToolCalls: 15,
    });
    const parsed = makeParsedSession();

    mockGetCachedSessions.mockReturnValue([session] as any);
    mockGetSessionCost.mockReturnValue(cost as any);
    mockGetSessionHealth.mockReturnValue(health as any);
    mockGetById.mockReturnValue(parsed as any);

    const result = enrichTaskSession("sess-abc123");

    expect(result!.healthReasons).toEqual(["high error rate", "context overflow"]);
    expect(result!.totalToolCalls).toBe(15);
    expect(result!.retries).toBe(5);
    expect(result!.cacheHitRate).toBeCloseTo(0.75); // 3000 / (3000 + 1000)
    expect(result!.maxTokensStops).toBe(1); // one assistant message with stopReason "max_tokens"
    expect(result!.webRequests).toBe(6); // 2+3 + 0+1
    expect(result!.sidechainCount).toBe(4);
    expect(result!.turnCount).toBe(3);
  });

  it("returns zero/empty for detail fields when parsed session not found", () => {
    const session = makeSession();
    const cost = makeCost();
    const health = makeHealth();

    mockGetCachedSessions.mockReturnValue([session] as any);
    mockGetSessionCost.mockReturnValue(cost as any);
    mockGetSessionHealth.mockReturnValue(health as any);
    mockGetById.mockReturnValue(null);

    const result = enrichTaskSession("sess-abc123");

    expect(result!.healthReasons).toEqual([]);
    expect(result!.totalToolCalls).toBe(0);
    expect(result!.retries).toBe(0);
    expect(result!.cacheHitRate).toBeNull();
    expect(result!.maxTokensStops).toBe(0);
    expect(result!.webRequests).toBe(0);
    expect(result!.sidechainCount).toBe(0);
    expect(result!.turnCount).toBe(0);
  });

  it("computes cacheHitRate as null when no cache tokens exist", () => {
    const session = makeSession();
    const cost = makeCost({ cacheReadTokens: 0, cacheCreationTokens: 0 });
    const health = makeHealth();
    const parsed = makeParsedSession({
      assistantMessages: [{
        uuid: "a1", parentUuid: "", timestamp: "2026-04-01T10:00:00.000Z",
        requestId: "r1", isSidechain: false, model: "claude-sonnet-4-5",
        stopReason: "end_turn",
        usage: {
          inputTokens: 5000, outputTokens: 2000,
          cacheReadTokens: 0, cacheCreationTokens: 0,
          serviceTier: "standard", inferenceGeo: "us", speed: "standard",
          serverToolUse: { webSearchRequests: 0, webFetchRequests: 0 },
        },
        toolCalls: [], hasThinking: false, textPreview: "Hello",
      }],
    });

    mockGetCachedSessions.mockReturnValue([session] as any);
    mockGetSessionCost.mockReturnValue(cost as any);
    mockGetSessionHealth.mockReturnValue(health as any);
    mockGetById.mockReturnValue(parsed as any);

    const result = enrichTaskSession("sess-abc123");
    expect(result!.cacheHitRate).toBeNull();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/board-session-enricher.test.ts --reporter=dot`
Expected: FAIL — new fields don't exist on the return value yet

- [ ] **Step 3: Update enrichTaskSession to populate new fields**

In `server/board/session-enricher.ts`, add the import for the session parse cache:

```typescript
import { sessionParseCache } from "../scanner/session-cache";
import type { ParsedSession } from "@shared/session-types";
```

Then in `enrichTaskSession()`, after the existing `agentRole` line, add computation of the new fields. Replace the return statement with:

```typescript
  // --- New detail fields from parsed cache ---
  const parsed = sessionParseCache.getById(sessionId);

  let healthReasons: string[] = [];
  let totalToolCalls = 0;
  let retries = 0;
  let cacheHitRate: number | null = null;
  let maxTokensStops = 0;
  let webRequests = 0;
  let sidechainCount = 0;
  let turnCount = 0;

  if (health?.healthReasons) {
    healthReasons = health.healthReasons;
  }
  if (health) {
    retries = health.retries;
    totalToolCalls = health.totalToolCalls;
  }

  if (parsed) {
    // Cache hit rate from cost data
    const totalCacheTokens = (cost?.cacheReadTokens ?? 0) + (cost?.cacheCreationTokens ?? 0);
    if (totalCacheTokens > 0) {
      cacheHitRate = (cost?.cacheReadTokens ?? 0) / totalCacheTokens;
    }

    // max_tokens stops
    maxTokensStops = parsed.assistantMessages.filter(m => m.stopReason === "max_tokens").length;

    // Web requests: sum across all assistant messages
    webRequests = parsed.assistantMessages.reduce((sum, m) => {
      return sum + m.usage.serverToolUse.webSearchRequests + m.usage.serverToolUse.webFetchRequests;
    }, 0);

    // Sidechain count and turn count from parsed data
    sidechainCount = parsed.counts.sidechainMessages;
    turnCount = parsed.systemEvents.turnDurations.length;
  }

  return {
    sessionId,
    isActive: session.isActive,
    model: primaryModel,
    lastActivity: null,
    lastActivityTs: session.lastTs,
    messageCount: session.messageCount,
    costUsd: cost?.estimatedCostUsd ?? 0,
    inputTokens: cost?.inputTokens ?? 0,
    outputTokens: cost?.outputTokens ?? 0,
    healthScore: health?.healthScore ?? null,
    toolErrors: health?.toolErrors ?? 0,
    durationMinutes,
    agentRole,
    healthReasons,
    totalToolCalls,
    retries,
    cacheHitRate,
    maxTokensStops,
    webRequests,
    sidechainCount,
    turnCount,
  };
```

- [ ] **Step 4: Update buildSessionSnapshot to include new fields**

In `server/board/session-enricher.ts`, update `buildSessionSnapshot()`:

```typescript
export function buildSessionSnapshot(enrichment: SessionEnrichment): LastSessionSnapshot {
  return {
    model: enrichment.model,
    agentRole: enrichment.agentRole,
    messageCount: enrichment.messageCount,
    durationMinutes: enrichment.durationMinutes,
    inputTokens: enrichment.inputTokens,
    outputTokens: enrichment.outputTokens,
    costUsd: enrichment.costUsd,
    healthReasons: enrichment.healthReasons,
    totalToolCalls: enrichment.totalToolCalls,
    retries: enrichment.retries,
    cacheHitRate: enrichment.cacheHitRate,
    maxTokensStops: enrichment.maxTokensStops,
    webRequests: enrichment.webRequests,
    sidechainCount: enrichment.sidechainCount,
    turnCount: enrichment.turnCount,
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/board-session-enricher.test.ts --reporter=dot`
Expected: PASS

- [ ] **Step 6: Run full type check**

Run: `npm run check`
Expected: PASS (or only client-side errors from the card component, which we fix in Task 4)

- [ ] **Step 7: Commit**

```bash
git add server/board/session-enricher.ts tests/board-session-enricher.test.ts
git commit -m "feat: populate new session detail fields from parsed cache"
```

---

### Task 3: Auto Session-Task Linking

**Files:**
- Modify: `server/board/session-enricher.ts` (add `autoLinkSession()`)
- Modify: `server/board/session-enricher.ts:77` (call auto-link in `enrichTaskSession()`)
- Test: `tests/auto-link-session.test.ts` (new)

- [ ] **Step 1: Write failing tests for auto-link logic**

Create `tests/auto-link-session.test.ts`:

```typescript
// tests/auto-link-session.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../server/scanner/session-scanner", () => ({
  getCachedSessions: vi.fn(),
}));

vi.mock("../server/scanner/session-analytics", () => ({
  getSessionCost: vi.fn(),
  getSessionHealth: vi.fn(),
}));

vi.mock("../server/scanner/agent-scanner", () => ({
  getCachedExecutions: vi.fn(),
}));

vi.mock("../server/scanner/session-cache", () => ({
  sessionParseCache: {
    getById: vi.fn(),
    entries: new Map(),
  },
}));

import { autoLinkSession } from "../server/board/session-enricher";
import { sessionParseCache } from "../server/scanner/session-cache";
import type { TaskItem } from "@shared/task-types";
import type { ParsedSession } from "@shared/session-types";

const mockGetById = vi.mocked(sessionParseCache.getById);

const makeTask = (overrides: Partial<TaskItem> = {}): TaskItem => ({
  id: "TASK-042",
  title: "Implement parser cache",
  type: "task",
  status: "in_progress",
  created: "2026-04-01T09:00:00.000Z",
  updated: "2026-04-01T10:00:00.000Z",
  body: "",
  filePath: "/tmp/task.md",
  labels: ["touches:server/scanner/session-parser.ts", "touches:server/scanner/session-cache.ts"],
  ...overrides,
});

const makeParsedForAutoLink = (overrides: Record<string, any> = {}): ParsedSession => ({
  meta: {
    sessionId: "sess-auto-1",
    slug: "test",
    firstMessage: "Hello",
    firstTs: "2026-04-01T09:55:00.000Z",
    lastTs: "2026-04-01T10:30:00.000Z",
    sizeBytes: 1024,
    filePath: "/tmp/fake.jsonl",
    projectKey: "my-project",
    cwd: "/home/user/project",
    version: "1.0.0",
    gitBranch: "TASK-042-implement-parser",
    entrypoint: "cli",
  },
  assistantMessages: [],
  userMessages: [],
  systemEvents: { turnDurations: [], hookSummaries: [], localCommands: [], bridgeEvents: [] },
  toolTimeline: [
    {
      callId: "c1", name: "Edit", filePath: "server/scanner/session-parser.ts",
      command: null, pattern: null, timestamp: "2026-04-01T10:00:00.000Z",
      resultTimestamp: "2026-04-01T10:00:01.000Z", durationMs: 100,
      isError: false, isSidechain: false,
    },
  ],
  fileSnapshots: [],
  lifecycle: [],
  conversationTree: [],
  counts: { totalRecords: 5, assistantMessages: 1, userMessages: 1, systemEvents: 0, toolCalls: 1, toolErrors: 0, fileSnapshots: 0, sidechainMessages: 0 },
  ...overrides,
} as ParsedSession);

describe("autoLinkSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("matches by git branch containing task ID (score >= 0.5)", () => {
    const task = makeTask();
    const parsed = makeParsedForAutoLink();
    const sessions = new Map([["sess-auto-1", parsed]]);

    const result = autoLinkSession(task, sessions);
    expect(result).toBe("sess-auto-1");
  });

  it("returns null when no sessions match above threshold", () => {
    const task = makeTask({ id: "TASK-999" });
    const parsed = makeParsedForAutoLink({
      meta: { ...makeParsedForAutoLink().meta, gitBranch: "main" },
      toolTimeline: [],
    });
    const sessions = new Map([["sess-auto-1", parsed]]);

    const result = autoLinkSession(task, sessions);
    expect(result).toBeNull();
  });

  it("matches by file path overlap + timing when branch doesn't match", () => {
    const task = makeTask({ id: "TASK-999" }); // no branch match
    const parsed = makeParsedForAutoLink({
      meta: { ...makeParsedForAutoLink().meta, gitBranch: "feature/unrelated" },
      toolTimeline: [
        {
          callId: "c1", name: "Edit", filePath: "server/scanner/session-parser.ts",
          command: null, pattern: null, timestamp: "2026-04-01T10:00:00.000Z",
          resultTimestamp: "2026-04-01T10:00:01.000Z", durationMs: 100,
          isError: false, isSidechain: false,
        },
        {
          callId: "c2", name: "Edit", filePath: "server/scanner/session-cache.ts",
          command: null, pattern: null, timestamp: "2026-04-01T10:01:00.000Z",
          resultTimestamp: "2026-04-01T10:01:01.000Z", durationMs: 100,
          isError: false, isSidechain: false,
        },
      ],
    });
    // File overlap: 2/2 = 1.0 → score 0.3
    // Timing: session started within 10min of task update → score 0.2
    // Total: 0.5 → matches
    const sessions = new Map([["sess-auto-1", parsed]]);

    const result = autoLinkSession(task, sessions);
    expect(result).toBe("sess-auto-1");
  });

  it("picks highest-scoring session when multiple match", () => {
    const task = makeTask();
    const strong = makeParsedForAutoLink(); // branch match = 0.5
    const weak = makeParsedForAutoLink({
      meta: { ...makeParsedForAutoLink().meta, sessionId: "sess-auto-2", gitBranch: "feature/other" },
    });
    const sessions = new Map([
      ["sess-auto-1", strong],
      ["sess-auto-2", weak],
    ]);

    const result = autoLinkSession(task, sessions);
    expect(result).toBe("sess-auto-1");
  });

  it("returns null when task has no labels (no file overlap possible) and no branch match", () => {
    const task = makeTask({ id: "TASK-999", labels: [] });
    const parsed = makeParsedForAutoLink({
      meta: { ...makeParsedForAutoLink().meta, gitBranch: "main" },
    });
    const sessions = new Map([["sess-auto-1", parsed]]);

    const result = autoLinkSession(task, sessions);
    expect(result).toBeNull();
  });

  it("matches milestone name in branch as weak signal (score 0.2)", () => {
    const task = makeTask({ id: "TASK-999", parent: "scanner-deepening" });
    const parsed = makeParsedForAutoLink({
      meta: { ...makeParsedForAutoLink().meta, gitBranch: "scanner-deepening/cache-layer" },
      toolTimeline: [
        {
          callId: "c1", name: "Edit", filePath: "server/scanner/session-parser.ts",
          command: null, pattern: null, timestamp: "2026-04-01T10:00:00.000Z",
          resultTimestamp: "2026-04-01T10:00:01.000Z", durationMs: 100,
          isError: false, isSidechain: false,
        },
        {
          callId: "c2", name: "Edit", filePath: "server/scanner/session-cache.ts",
          command: null, pattern: null, timestamp: "2026-04-01T10:01:00.000Z",
          resultTimestamp: "2026-04-01T10:01:01.000Z", durationMs: 100,
          isError: false, isSidechain: false,
        },
      ],
    });
    // Milestone branch match: 0.2
    // File overlap: 2/2 → 0.3
    // Total: 0.5 → matches
    const sessions = new Map([["sess-auto-1", parsed]]);

    const result = autoLinkSession(task, sessions);
    expect(result).toBe("sess-auto-1");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/auto-link-session.test.ts --reporter=dot`
Expected: FAIL — `autoLinkSession` is not exported

- [ ] **Step 3: Implement autoLinkSession**

In `server/board/session-enricher.ts`, add this exported function:

```typescript
import type { TaskItem } from "@shared/task-types";

/**
 * Attempt to auto-match a task to a session using behavioral signals.
 * Returns the best-matching sessionId or null if no match meets threshold.
 * Only called when task has no manual sessionId.
 *
 * Signals:
 *  - Git branch contains task ID (weight 0.5) or milestone name (weight 0.2)
 *  - Tool file paths overlap with task's "touches:" labels (weight 0.3)
 *  - Session timing overlaps with task's updated timestamp (weight 0.2)
 *
 * Minimum combined score: 0.4
 */
export function autoLinkSession(
  task: TaskItem,
  parsedSessions: Map<string, ParsedSession>,
): string | null {
  const THRESHOLD = 0.4;
  let bestId: string | null = null;
  let bestScore = 0;

  // Extract "touches:" file paths from task labels
  const touchPaths = (task.labels ?? [])
    .filter(l => l.startsWith("touches:"))
    .map(l => l.slice("touches:".length));

  const taskUpdatedMs = new Date(task.updated).getTime();

  for (const [sessionId, parsed] of parsedSessions) {
    let score = 0;
    const branch = parsed.meta.gitBranch || "";

    // Signal 1: Git branch match
    if (branch && branch.includes(task.id)) {
      score += 0.5;
    } else if (branch && task.parent && branch.includes(task.parent)) {
      score += 0.2;
    }

    // Signal 2: File path overlap
    if (touchPaths.length > 0) {
      const sessionFiles = new Set(
        parsed.toolTimeline
          .map(t => t.filePath)
          .filter((fp): fp is string => fp !== null)
      );
      const matchedFiles = touchPaths.filter(tp =>
        Array.from(sessionFiles).some(sf => sf.endsWith(tp) || tp.endsWith(sf))
      );
      const overlapRatio = matchedFiles.length / touchPaths.length;
      score += 0.3 * overlapRatio;
    }

    // Signal 3: Timing correlation
    const sessionStartMs = parsed.meta.firstTs
      ? new Date(parsed.meta.firstTs).getTime()
      : 0;
    if (sessionStartMs > 0 && taskUpdatedMs > 0) {
      const TEN_MINUTES = 10 * 60 * 1000;
      if (Math.abs(sessionStartMs - taskUpdatedMs) <= TEN_MINUTES) {
        score += 0.2;
      }
    }

    if (score >= THRESHOLD) {
      if (score > bestScore) {
        bestScore = score;
        bestId = sessionId;
      } else if (score === bestScore && bestId) {
        // Tie-break: pick the most recent session (latest lastTs)
        const currentLastTs = parsed.meta.lastTs ?? "";
        const bestParsed = parsedSessions.get(bestId);
        const bestLastTs = bestParsed?.meta.lastTs ?? "";
        if (currentLastTs > bestLastTs) {
          bestId = sessionId;
        }
      }
    }
  }

  return bestId;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/auto-link-session.test.ts --reporter=dot`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/board/session-enricher.ts tests/auto-link-session.test.ts
git commit -m "feat: auto session-task linking by branch, files, and timing"
```

---

### Task 4: Wire Auto-Link into Enrichment Flow

**Files:**
- Modify: `server/board/session-enricher.ts:77` (enrichTaskSession signature and early return)
- Modify: `server/board/aggregator.ts:119-120` (pass task to enricher)
- Test: `tests/board-session-enricher.test.ts` (add auto-link integration test)

- [ ] **Step 1: Write failing test for auto-link fallback in enrichTaskSession**

Add to `tests/board-session-enricher.test.ts`:

```typescript
  it("auto-links session when no manual sessionId and branch matches task ID", () => {
    const session = makeSession({ id: "sess-auto" });
    const cost = makeCost({ sessionId: "sess-auto" });
    const health = makeHealth({ sessionId: "sess-auto" });
    const parsed = makeParsedSession({
      meta: {
        ...makeParsedSession().meta,
        sessionId: "sess-auto",
        gitBranch: "TASK-042-implement-parser",
      },
    });

    mockGetCachedSessions.mockReturnValue([session] as any);
    mockGetSessionCost.mockReturnValue(cost as any);
    mockGetSessionHealth.mockReturnValue(health as any);
    mockGetById.mockReturnValue(parsed as any);

    // Mock sessionParseCache to have an iterable entries for autoLinkSession
    Object.defineProperty(sessionParseCache, "entries", {
      get: () => new Map([["sess-auto", parsed]]),
      configurable: true,
    });

    const task = {
      id: "TASK-042",
      title: "Implement parser",
      type: "task",
      status: "in_progress",
      created: "2026-04-01T09:00:00.000Z",
      updated: "2026-04-01T10:00:00.000Z",
      body: "",
      filePath: "/tmp/task.md",
    };

    // No sessionId passed — should auto-link
    const result = enrichTaskSession(undefined, [session] as any, task as any);

    expect(result).not.toBeNull();
    expect(result!.sessionId).toBe("sess-auto");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/board-session-enricher.test.ts -t "auto-links" --reporter=dot`
Expected: FAIL — enrichTaskSession doesn't accept a task parameter yet

- [ ] **Step 3: Update enrichTaskSession signature to accept optional task**

In `server/board/session-enricher.ts`, change the signature:

```typescript
export function enrichTaskSession(
  sessionId: string | undefined,
  sessions?: SessionData[],
  task?: TaskItem,
): SessionEnrichment | null {
```

At the top of the function, before `return null`, add the auto-link fallback:

```typescript
  if (!sessionId && task) {
    // Attempt auto-link using behavioral signals
    const allParsed = getAllParsedSessions();
    const autoLinkedId = autoLinkSession(task, allParsed);
    if (autoLinkedId) {
      sessionId = autoLinkedId;
    }
  }

  if (!sessionId) return null;
```

Add a helper to get all parsed sessions from the cache:

```typescript
/** Get all parsed sessions from the cache as a Map<sessionId, ParsedSession>. */
function getAllParsedSessions(): Map<string, ParsedSession> {
  // The sessionParseCache stores entries by file path.
  // We need to iterate and build a sessionId-keyed map.
  const result = new Map<string, ParsedSession>();
  // Access the internal entries via the cache's public API
  // We iterate cached sessions from the scanner's session list
  const sessions = getCachedSessions();
  for (const s of sessions) {
    const parsed = sessionParseCache.getOrParse(s.filePath, s.projectKey);
    if (parsed) {
      result.set(parsed.meta.sessionId, parsed);
    }
  }
  return result;
}
```

- [ ] **Step 4: Update aggregator to pass task to enricher**

In `server/board/aggregator.ts`, update the `mapTaskToBoard` function. Change line 120:

```typescript
  const enrichment = enrichTaskSession(linkedSessionId, sessions, task);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/board-session-enricher.test.ts --reporter=dot`
Expected: PASS (existing tests still pass since the new `task` parameter is optional)

- [ ] **Step 6: Run full test suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add server/board/session-enricher.ts server/board/aggregator.ts tests/board-session-enricher.test.ts
git commit -m "feat: wire auto-link into enrichment flow — fallback when no manual sessionId"
```

---

### Task 5: HealthReasonTag Component

**Files:**
- Modify: `client/src/components/board/session-indicators.tsx` (add component)
- Test: `tests/board-session-detail.test.ts` (add rendering tests)

- [ ] **Step 1: Write failing tests for HealthReasonTag**

Add to `tests/board-session-detail.test.ts`:

```typescript
import fs from "fs";
import path from "path";

const INDICATORS_SRC = fs.readFileSync(
  path.join(__dirname, "../client/src/components/board/session-indicators.tsx"),
  "utf-8"
);

describe("HealthReasonTag component", () => {
  it("exports HealthReasonTag function", () => {
    expect(INDICATORS_SRC).toMatch(/export function HealthReasonTag/);
  });

  it("maps 'high error rate' to red color scheme", () => {
    expect(INDICATORS_SRC).toMatch(/high error rate/);
  });

  it("maps 'context overflow' to red color scheme", () => {
    expect(INDICATORS_SRC).toMatch(/context overflow/);
  });

  it("maps 'excessive retries' to amber color scheme", () => {
    expect(INDICATORS_SRC).toMatch(/excessive retries/);
  });

  it("maps 'long idle gaps' to amber color scheme", () => {
    expect(INDICATORS_SRC).toMatch(/long idle gaps/);
  });

  it("maps 'high cost' to amber color scheme", () => {
    expect(INDICATORS_SRC).toMatch(/high cost/);
  });

  it("maps 'short session' to muted color scheme", () => {
    expect(INDICATORS_SRC).toMatch(/short session/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/board-session-detail.test.ts --reporter=dot`
Expected: FAIL — HealthReasonTag doesn't exist yet

- [ ] **Step 3: Implement HealthReasonTag**

Add to `client/src/components/board/session-indicators.tsx`:

```typescript
const REASON_COLORS: Record<string, string> = {
  "high error rate": "bg-red-500/10 text-red-400 border-red-500/20",
  "context overflow": "bg-red-500/10 text-red-400 border-red-500/20",
  "excessive retries": "bg-amber-500/10 text-amber-400 border-amber-500/20",
  "long idle gaps": "bg-amber-500/10 text-amber-400 border-amber-500/20",
  "high cost": "bg-amber-500/10 text-amber-400 border-amber-500/20",
  "short session": "bg-slate-500/10 text-slate-400 border-slate-500/20",
};

/** Color-coded pill for a health reason tag. */
export function HealthReasonTag({ reason }: { reason: string }) {
  const colors = REASON_COLORS[reason] ?? "bg-slate-500/10 text-slate-400 border-slate-500/20";
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] leading-none border ${colors}`}>
      {reason}
    </span>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/board-session-detail.test.ts --reporter=dot`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/components/board/session-indicators.tsx tests/board-session-detail.test.ts
git commit -m "feat: HealthReasonTag component with color mapping"
```

---

### Task 6: SessionDetailAccordion Component

**Files:**
- Create: `client/src/components/board/session-detail-accordion.tsx`
- Test: `tests/board-session-detail.test.ts` (add structure tests)

- [ ] **Step 1: Write failing tests for accordion structure**

Add to `tests/board-session-detail.test.ts`:

```typescript
const ACCORDION_PATH = path.join(
  __dirname,
  "../client/src/components/board/session-detail-accordion.tsx"
);

describe("SessionDetailAccordion component", () => {
  it("file exists", () => {
    expect(fs.existsSync(ACCORDION_PATH)).toBe(true);
  });

  const getSrc = () => fs.readFileSync(ACCORDION_PATH, "utf-8");

  it("exports SessionDetailAccordion function", () => {
    expect(getSrc()).toMatch(/export function SessionDetailAccordion/);
  });

  it("imports HealthReasonTag from session-indicators", () => {
    expect(getSrc()).toMatch(/import.*HealthReasonTag.*from.*session-indicators/);
  });

  it("renders expand/collapse toggle", () => {
    const src = getSrc();
    expect(src).toMatch(/Session details/);
  });

  it("renders stats grid with expected stat labels", () => {
    const src = getSrc();
    expect(src).toMatch(/Tool calls/);
    expect(src).toMatch(/Errors/);
    expect(src).toMatch(/Retries/);
    expect(src).toMatch(/Cache hit/);
    expect(src).toMatch(/Max tokens/);
    expect(src).toMatch(/Web requests/);
    expect(src).toMatch(/Sidechains/);
    expect(src).toMatch(/Turns/);
  });

  it("uses local state for expanded toggle", () => {
    expect(getSrc()).toMatch(/useState.*false/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/board-session-detail.test.ts --reporter=dot`
Expected: FAIL — file doesn't exist

- [ ] **Step 3: Implement SessionDetailAccordion**

Create `client/src/components/board/session-detail-accordion.tsx`:

```typescript
// client/src/components/board/session-detail-accordion.tsx
//
// Inline expandable detail panel for kanban board cards.
// Shows health reason tags and a 2-column stats grid.
// Collapsed by default — click toggle to reveal.

import { useState } from "react";
import { ChevronRight, ChevronDown, Globe } from "lucide-react";
import { HealthReasonTag } from "./session-indicators";
import type { SessionEnrichment, LastSessionSnapshot } from "@shared/board-types";

interface SessionDetailAccordionProps {
  /** Active session enrichment or cached snapshot — either provides the data. */
  data: SessionEnrichment | LastSessionSnapshot;
  /** Called when this accordion expands. Parent can collapse other cards. */
  onExpand?: () => void;
  /** Controlled expanded state (for one-at-a-time behavior). */
  expanded?: boolean;
}

/** Format cache hit rate as a percentage string. */
function formatCacheHit(rate: number | null): string {
  if (rate === null) return "—";
  return `${Math.round(rate * 100)}%`;
}

/** Color class for cache hit rate. */
function cacheHitColor(rate: number | null): string {
  if (rate === null) return "text-muted-foreground";
  if (rate > 0.6) return "text-green-400";
  if (rate > 0.3) return "text-amber-400";
  return "text-red-400";
}

export function SessionDetailAccordion({
  data,
  onExpand,
  expanded: controlledExpanded,
}: SessionDetailAccordionProps) {
  const [localExpanded, setLocalExpanded] = useState(false);
  const expanded = controlledExpanded ?? localExpanded;

  const hasHealthReasons = data.healthReasons.length > 0;
  const hasAnyDetail =
    hasHealthReasons ||
    data.totalToolCalls > 0 ||
    data.turnCount > 0;

  // Don't render the toggle if there's nothing to show
  if (!hasAnyDetail) return null;

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation(); // Don't trigger the card's onClick
    if (!expanded && onExpand) {
      onExpand();
    }
    setLocalExpanded(!localExpanded);
  };

  return (
    <div className="mt-1.5">
      {/* Toggle */}
      <button
        onClick={handleToggle}
        className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors w-full border-t border-border pt-1.5"
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        Session details
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="mt-1.5 pt-1.5 border-t border-dashed border-border">
          {/* Health reason tags */}
          {hasHealthReasons && (
            <div className="flex flex-wrap gap-1 mb-2">
              {data.healthReasons.map((reason) => (
                <HealthReasonTag key={reason} reason={reason} />
              ))}
            </div>
          )}

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px]">
            <div className="flex justify-between text-muted-foreground">
              <span>Tool calls</span>
              <span className="text-foreground">{data.totalToolCalls}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Errors</span>
              <span className={data.retries > 0 ? "text-red-400" : "text-foreground"}>
                {("toolErrors" in data ? data.toolErrors : 0)}
              </span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Retries</span>
              <span className="text-foreground">{data.retries}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Cache hit</span>
              <span className={cacheHitColor(data.cacheHitRate)}>
                {formatCacheHit(data.cacheHitRate)}
              </span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Max tokens</span>
              <span className={data.maxTokensStops > 0 ? "text-amber-400" : "text-foreground"}>
                {data.maxTokensStops > 0 ? `${data.maxTokensStops}×` : "0"}
              </span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Web requests</span>
              <span className="text-foreground">
                {data.webRequests > 0 && <Globe className="inline h-2.5 w-2.5 mr-0.5" />}
                {data.webRequests}
              </span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Sidechains</span>
              <span className="text-foreground">{data.sidechainCount}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Turns</span>
              <span className="text-foreground">{data.turnCount}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/board-session-detail.test.ts --reporter=dot`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/components/board/session-detail-accordion.tsx tests/board-session-detail.test.ts
git commit -m "feat: SessionDetailAccordion component — expandable card detail"
```

---

### Task 7: Wire Accordion into Board Card

**Files:**
- Modify: `client/src/components/board/board-task-card.tsx` (add accordion)
- Test: `tests/board-session-detail.test.ts` (add integration test)

- [ ] **Step 1: Write failing test for accordion in card**

Add to `tests/board-session-detail.test.ts`:

```typescript
const CARD_SRC = fs.readFileSync(
  path.join(__dirname, "../client/src/components/board/board-task-card.tsx"),
  "utf-8"
);

describe("BoardTaskCard accordion integration", () => {
  it("imports SessionDetailAccordion", () => {
    expect(CARD_SRC).toMatch(/import.*SessionDetailAccordion.*from.*session-detail-accordion/);
  });

  it("renders SessionDetailAccordion when session or snapshot data exists", () => {
    expect(CARD_SRC).toMatch(/SessionDetailAccordion/);
  });

  it("resolves detail data from session or snapshot", () => {
    // The card should pass session data or snapshot data to the accordion
    expect(CARD_SRC).toMatch(/data=\{/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/board-session-detail.test.ts --reporter=dot`
Expected: FAIL — card doesn't import the accordion yet

- [ ] **Step 3: Add accordion to board-task-card.tsx**

In `client/src/components/board/board-task-card.tsx`, add the import:

```typescript
import { SessionDetailAccordion } from "./session-detail-accordion";
```

Then add the accordion after the stats row (Row 4), before the assignee row (Row 5). After the closing `</div>` of the stats row and before `{/* Row 5: Assignee + flag */}`, add:

```typescript
      {/* Row 4.5: Expandable session detail */}
      {(task.session || snap) && (
        <SessionDetailAccordion
          data={(task.session ?? snap)!}
        />
      )}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/board-session-detail.test.ts --reporter=dot`
Expected: PASS

- [ ] **Step 5: Run full type check**

Run: `npm run check`
Expected: PASS

- [ ] **Step 6: Run full test suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add client/src/components/board/board-task-card.tsx tests/board-session-detail.test.ts
git commit -m "feat: wire SessionDetailAccordion into board cards"
```

---

### Task 8: Visual Verification & Safety

**Files:**
- Test: `tests/new-user-safety.test.ts` (existing — just run it)

- [ ] **Step 1: Run safety tests**

Run: `npx vitest run tests/new-user-safety.test.ts --reporter=dot`
Expected: PASS — no PII, no hardcoded paths in new code

- [ ] **Step 2: Run full test suite**

Run: `npm test`
Expected: PASS — all 20,000+ tests pass

- [ ] **Step 3: Start dev server and verify visually**

Run: `npm run dev`

Open `http://localhost:5100` in browser. Navigate to the Board page. Check:
- Cards with linked sessions show "Session details" toggle
- Clicking the toggle expands the detail section inline
- Health reason tags appear with correct colors
- Stats grid shows tool calls, errors, retries, cache %, max tokens, web requests, sidechains, turns
- Collapsing works correctly
- Cards without sessions don't show the toggle
- Status light colors correctly reflect health score (green/amber/red)

- [ ] **Step 4: Build for production**

Run: `npm run build`
Expected: Clean build, no errors

- [ ] **Step 5: Final commit if any visual fixes were needed**

If any adjustments were made during visual testing:

```bash
git add -u
git commit -m "fix: visual polish for session detail accordion"
```

- [ ] **Step 6: Deploy**

Run: `scripts/deploy.sh`
Expected: Build succeeds, service restarts, verify at `acc.devbox`
