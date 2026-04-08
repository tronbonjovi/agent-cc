# Board + Session Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire board cards to real Claude session data so cards act as info radiators — showing live session status, agent activity, model, cost, progress, and health at a glance.

**Architecture:** Extend `BoardTask` with session-enrichment fields populated by a new server-side enrichment layer that bridges the task scanner and session scanner. A new API endpoint returns session details for a board task. The card UI is redesigned as an info radiator with status lights, progress bars, model badges, and agent/session visibility. SSE events propagate session updates to the board in real-time.

**Tech Stack:** Express.js, React, React Query, Zustand (existing), xterm session scanner, Vitest

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `server/board/session-enricher.ts` | Bridges task scanner + session scanner — looks up sessions by ID, returns enrichment data |
| `client/src/components/board/session-indicators.tsx` | Reusable sub-components: status light, progress ring, model badge, agent badge, cost pill |
| `tests/board-session-enricher.test.ts` | Tests for session enrichment logic |
| `tests/board-session-card.test.ts` | Tests for enriched card rendering and indicator components |

### Modified Files
| File | Changes |
|------|---------|
| `shared/board-types.ts` | Add `SessionEnrichment` type, extend `BoardTask` with enrichment fields |
| `server/task-io.ts` | Persist `pipelineSessionIds` in read/write |
| `server/board/aggregator.ts` | Call session enricher to populate enrichment fields on `BoardTask` |
| `server/routes/board.ts` | Add `GET /api/board/tasks/:id/session` endpoint |
| `client/src/hooks/use-board.ts` | Add `useTaskSession()` hook for session detail fetch |
| `client/src/components/board/board-task-card.tsx` | Redesign as info radiator with session indicators |
| `client/src/components/board/board-side-panel.tsx` | Add session detail section (messages, cost breakdown, model breakdown) |
| `tests/task-io.test.ts` | Add pipelineSessionIds round-trip test |
| `tests/board-aggregator.test.ts` | Test enrichment flow |

---

### Task 1: Fix pipelineSessionIds Persistence

**Files:**
- Modify: `server/task-io.ts:36-75` (parseTaskFile) and `server/task-io.ts:83-111` (writeTaskFile)
- Test: `tests/task-io.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/task-io.test.ts` inside the existing `describe("parseTaskFile")` block:

```typescript
it("round-trips pipelineSessionIds", () => {
  const filePath = path.join(tmpDir, "task-session-ids.md");
  const task: TaskItem = {
    id: "itm-sess0001",
    title: "Session ID Test",
    type: "task",
    status: "in-progress",
    created: "2026-04-08",
    updated: "2026-04-08",
    body: "",
    filePath,
    pipelineSessionIds: ["abc-123-def", "ghi-456-jkl"],
  };
  writeTaskFile(filePath, task);
  const parsed = parseTaskFile(filePath);
  expect(parsed).not.toBeNull();
  expect(parsed!.pipelineSessionIds).toEqual(["abc-123-def", "ghi-456-jkl"]);
});

it("omits pipelineSessionIds when empty", () => {
  const filePath = path.join(tmpDir, "task-no-session-ids.md");
  const task: TaskItem = {
    id: "itm-sess0002",
    title: "No Session ID Test",
    type: "task",
    status: "backlog",
    created: "2026-04-08",
    updated: "2026-04-08",
    body: "",
    filePath,
  };
  writeTaskFile(filePath, task);
  const parsed = parseTaskFile(filePath);
  expect(parsed!.pipelineSessionIds).toBeUndefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/task-io.test.ts -t "pipelineSessionIds" --reporter=verbose`
Expected: FAIL — `pipelineSessionIds` comes back `undefined` even when written

- [ ] **Step 3: Add pipelineSessionIds to parseTaskFile**

In `server/task-io.ts`, inside `parseTaskFile()`, after line 62 (`pipelineActivity`), add:

```typescript
pipelineSessionIds: Array.isArray(d.pipelineSessionIds) ? d.pipelineSessionIds.map(String) : undefined,
```

- [ ] **Step 4: Add pipelineSessionIds to writeTaskFile**

In `server/task-io.ts`, inside `writeTaskFile()`, after line 99 (`pipelineActivity`), add:

```typescript
if (task.pipelineSessionIds && task.pipelineSessionIds.length > 0) frontmatter.pipelineSessionIds = task.pipelineSessionIds;
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/task-io.test.ts -t "pipelineSessionIds" --reporter=verbose`
Expected: PASS

- [ ] **Step 6: Also add pipelineSummary to persistence (same gap)**

`pipelineSummary` is also on `TaskItem` but not persisted. Add read (after pipelineSessionIds):

```typescript
pipelineSummary: d.pipelineSummary ? String(d.pipelineSummary) : undefined,
```

Add write (after pipelineSessionIds):

```typescript
if (task.pipelineSummary) frontmatter.pipelineSummary = task.pipelineSummary;
```

- [ ] **Step 7: Run full task-io tests**

Run: `npx vitest run tests/task-io.test.ts --reporter=verbose`
Expected: All pass

- [ ] **Step 8: Commit**

```bash
git add server/task-io.ts tests/task-io.test.ts
git commit -m "fix: persist pipelineSessionIds and pipelineSummary in task files"
```

---

### Task 2: Define SessionEnrichment Type

**Files:**
- Modify: `shared/board-types.ts`
- Test: `tests/board-types.test.ts`

- [ ] **Step 1: Write the failing type test**

Add to `tests/board-types.test.ts`:

```typescript
describe("SessionEnrichment", () => {
  it("has expected shape", () => {
    const enrichment: SessionEnrichment = {
      sessionId: "abc-123",
      isActive: true,
      model: "claude-sonnet-4-6",
      lastActivity: "writing auth middleware...",
      lastActivityTs: "2026-04-08T14:30:00Z",
      messageCount: 42,
      costUsd: 1.23,
      inputTokens: 50000,
      outputTokens: 12000,
      healthScore: "good",
      toolErrors: 0,
      durationMinutes: 15,
    };
    expect(enrichment.sessionId).toBe("abc-123");
    expect(enrichment.isActive).toBe(true);
    expect(enrichment.model).toBe("claude-sonnet-4-6");
    expect(enrichment.healthScore).toBe("good");
  });

  it("allows null enrichment on BoardTask", () => {
    const task: BoardTask = {
      id: "itm-test0001",
      title: "Test",
      description: "",
      column: "in-progress",
      project: "proj-1",
      projectName: "Test Project",
      projectColor: "#3b82f6",
      priority: "medium",
      dependsOn: [],
      tags: [],
      flagged: false,
      createdAt: "2026-04-08",
      updatedAt: "2026-04-08",
      session: null,
    };
    expect(task.session).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/board-types.test.ts -t "SessionEnrichment" --reporter=verbose`
Expected: FAIL — `SessionEnrichment` type not found

- [ ] **Step 3: Add types to shared/board-types.ts**

Add after the `BoardTask` interface:

```typescript
export interface SessionEnrichment {
  sessionId: string;
  isActive: boolean;
  model: string | null;            // primary model used (most tokens)
  lastActivity: string | null;     // latest activity text from session
  lastActivityTs: string | null;   // ISO timestamp of last message
  messageCount: number;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  healthScore: "good" | "fair" | "poor" | null;
  toolErrors: number;
  durationMinutes: number | null;  // time from first to last message
}
```

Add to `BoardTask` interface, after `cost?: number;`:

```typescript
session: SessionEnrichment | null;
```

- [ ] **Step 4: Fix existing BoardTask usages**

The new `session` field needs to be set in `aggregator.ts` `mapTaskToBoard()`. For now, set it to `null` — Task 3 will populate it. Add `session: null,` in the return object after `cost: task.pipelineCost,`.

Also update `board-task-card.tsx` and `board-side-panel.tsx` — they don't reference `session` yet so they'll compile, but verify with type-check.

- [ ] **Step 5: Run type-check and tests**

Run: `npm run check && npx vitest run tests/board-types.test.ts --reporter=verbose`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add shared/board-types.ts server/board/aggregator.ts tests/board-types.test.ts
git commit -m "feat: add SessionEnrichment type to board types"
```

---

### Task 3: Session Enricher Module

**Files:**
- Create: `server/board/session-enricher.ts`
- Test: `tests/board-session-enricher.test.ts`

This module looks up session data for a task's `sessionId` and returns a `SessionEnrichment` object. It calls into the existing session scanner and analytics modules.

- [ ] **Step 1: Write the failing tests**

Create `tests/board-session-enricher.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock session scanner and analytics
vi.mock("../server/scanner/session-scanner", () => ({
  getCachedSessions: vi.fn(() => []),
}));
vi.mock("../server/scanner/session-analytics", () => ({
  getSessionCost: vi.fn(() => null),
  getSessionHealth: vi.fn(() => null),
}));

import { enrichTaskSession } from "../server/board/session-enricher";
import { getCachedSessions } from "../server/scanner/session-scanner";
import { getSessionCost, getSessionHealth } from "../server/scanner/session-analytics";

describe("session-enricher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when no sessionId provided", () => {
    const result = enrichTaskSession(undefined);
    expect(result).toBeNull();
  });

  it("returns null when session not found in cache", () => {
    vi.mocked(getCachedSessions).mockReturnValue([]);
    const result = enrichTaskSession("nonexistent-id");
    expect(result).toBeNull();
  });

  it("returns enrichment with session data, cost, and health", () => {
    const mockSession = {
      id: "sess-abc",
      slug: "test-session",
      firstMessage: "Build the auth system",
      firstTs: "2026-04-08T14:00:00Z",
      lastTs: "2026-04-08T14:15:00Z",
      messageCount: 42,
      sizeBytes: 50000,
      tags: [],
      isEmpty: false,
      isActive: true,
      filePath: "/tmp/sessions/sess-abc.jsonl",
      projectKey: "proj-1",
      cwd: "/home/user/project",
      version: "1.0.0",
      gitBranch: "feat/auth",
    };
    vi.mocked(getCachedSessions).mockReturnValue([mockSession] as any);

    vi.mocked(getSessionCost).mockReturnValue({
      sessionId: "sess-abc",
      inputTokens: 50000,
      outputTokens: 12000,
      cacheReadTokens: 5000,
      cacheCreationTokens: 1000,
      estimatedCostUsd: 1.23,
      models: ["claude-sonnet-4-6", "claude-haiku-4-5"],
      modelBreakdown: {
        "claude-sonnet-4-6": { input: 40000, output: 10000, cacheRead: 5000, cacheCreation: 1000, cost: 1.10 },
        "claude-haiku-4-5": { input: 10000, output: 2000, cacheRead: 0, cacheCreation: 0, cost: 0.13 },
      },
    });

    vi.mocked(getSessionHealth).mockReturnValue({
      sessionId: "sess-abc",
      toolErrors: 2,
      retries: 1,
      totalToolCalls: 30,
      healthScore: "good",
    });

    const result = enrichTaskSession("sess-abc");

    expect(result).not.toBeNull();
    expect(result!.sessionId).toBe("sess-abc");
    expect(result!.isActive).toBe(true);
    expect(result!.model).toBe("claude-sonnet-4-6");
    expect(result!.messageCount).toBe(42);
    expect(result!.costUsd).toBe(1.23);
    expect(result!.inputTokens).toBe(50000);
    expect(result!.outputTokens).toBe(12000);
    expect(result!.healthScore).toBe("good");
    expect(result!.toolErrors).toBe(2);
    expect(result!.durationMinutes).toBe(15);
  });

  it("handles missing cost data gracefully", () => {
    const mockSession = {
      id: "sess-nocost",
      slug: "no-cost",
      firstMessage: "Hello",
      firstTs: "2026-04-08T14:00:00Z",
      lastTs: "2026-04-08T14:00:00Z",
      messageCount: 1,
      sizeBytes: 100,
      tags: [],
      isEmpty: false,
      isActive: false,
      filePath: "/tmp/sessions/sess-nocost.jsonl",
      projectKey: "proj-1",
      cwd: "/tmp",
      version: "1.0.0",
      gitBranch: "main",
    };
    vi.mocked(getCachedSessions).mockReturnValue([mockSession] as any);
    vi.mocked(getSessionCost).mockReturnValue(null);
    vi.mocked(getSessionHealth).mockReturnValue(null);

    const result = enrichTaskSession("sess-nocost");

    expect(result).not.toBeNull();
    expect(result!.costUsd).toBe(0);
    expect(result!.model).toBeNull();
    expect(result!.healthScore).toBeNull();
    expect(result!.toolErrors).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/board-session-enricher.test.ts --reporter=verbose`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the enricher**

Create `server/board/session-enricher.ts`:

```typescript
// server/board/session-enricher.ts

import { getCachedSessions } from "../scanner/session-scanner";
import { getSessionCost, getSessionHealth } from "../scanner/session-analytics";
import type { SessionEnrichment } from "@shared/board-types";

/**
 * Look up session data for a task and return enrichment fields.
 * Returns null if no sessionId or session not found.
 */
export function enrichTaskSession(sessionId: string | undefined): SessionEnrichment | null {
  if (!sessionId) return null;

  const sessions = getCachedSessions();
  const session = sessions.find(s => s.id === sessionId);
  if (!session) return null;

  const cost = getSessionCost(sessions, sessionId);
  const health = getSessionHealth(sessions, sessionId);

  // Pick the model with the highest token count
  let primaryModel: string | null = null;
  if (cost?.modelBreakdown) {
    let maxTokens = 0;
    for (const [model, breakdown] of Object.entries(cost.modelBreakdown)) {
      const total = breakdown.input + breakdown.output;
      if (total > maxTokens) {
        maxTokens = total;
        primaryModel = model;
      }
    }
  }

  // Duration in minutes between first and last message
  let durationMinutes: number | null = null;
  if (session.firstTs && session.lastTs) {
    const diff = new Date(session.lastTs).getTime() - new Date(session.firstTs).getTime();
    if (diff > 0) {
      durationMinutes = Math.round(diff / 60000);
    }
  }

  return {
    sessionId,
    isActive: session.isActive,
    model: primaryModel,
    lastActivity: null,  // populated from pipeline activity, not session scanner
    lastActivityTs: session.lastTs,
    messageCount: session.messageCount,
    costUsd: cost?.estimatedCostUsd ?? 0,
    inputTokens: cost?.inputTokens ?? 0,
    outputTokens: cost?.outputTokens ?? 0,
    healthScore: health?.healthScore ?? null,
    toolErrors: health?.toolErrors ?? 0,
    durationMinutes,
  };
}
```

- [ ] **Step 4: Verify getSessionHealth exists**

Check that `getSessionHealth` is exported from `server/scanner/session-analytics.ts`. If it doesn't exist (only `getSessionCost` does), you'll need to add it. It should follow the same pattern as `getSessionCost` — look up by session ID in the cached health data. If the function doesn't exist, create it:

```typescript
export function getSessionHealth(sessions: SessionData[], sessionId: string): SessionHealth | null {
  ensureAnalytics(sessions);
  return healthCache.get(sessionId) ?? null;
}
```

Add it next to `getSessionCost` in the file.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/board-session-enricher.test.ts --reporter=verbose`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add server/board/session-enricher.ts tests/board-session-enricher.test.ts
git commit -m "feat: session enricher bridges task scanner to session data"
```

---

### Task 4: Wire Enricher into Aggregator

**Files:**
- Modify: `server/board/aggregator.ts:65-101` (mapTaskToBoard)
- Test: `tests/board-aggregator.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/board-aggregator.test.ts`. First, add the mock for the enricher at the top with the other mocks:

```typescript
vi.mock("../server/board/session-enricher", () => ({
  enrichTaskSession: vi.fn(() => null),
}));
```

Then add the import:

```typescript
import { enrichTaskSession } from "../server/board/session-enricher";
```

Then add the test:

```typescript
it("populates session enrichment when sessionId exists", () => {
  const mockEnrichment = {
    sessionId: "sess-abc",
    isActive: true,
    model: "claude-sonnet-4-6",
    lastActivity: null,
    lastActivityTs: "2026-04-08T14:15:00Z",
    messageCount: 42,
    costUsd: 1.23,
    inputTokens: 50000,
    outputTokens: 12000,
    healthScore: "good" as const,
    toolErrors: 0,
    durationMinutes: 15,
  };
  vi.mocked(enrichTaskSession).mockReturnValue(mockEnrichment);

  const task: TaskItem = {
    id: "itm-enriched1",
    title: "Enriched Task",
    type: "task",
    status: "in-progress",
    created: "2026-04-08",
    updated: "2026-04-08",
    body: "",
    filePath: "/tmp/tasks/task-enriched.md",
    pipelineSessionIds: ["sess-abc"],
    pipelineActivity: "writing tests...",
  };

  const result = mapTaskToBoard(task, "proj-1", "Test", "#3b82f6", []);
  expect(result!.session).not.toBeNull();
  expect(result!.session!.sessionId).toBe("sess-abc");
  expect(result!.session!.isActive).toBe(true);
  expect(result!.session!.model).toBe("claude-sonnet-4-6");
});

it("sets session to null when no sessionId", () => {
  vi.mocked(enrichTaskSession).mockReturnValue(null);

  const task: TaskItem = {
    id: "itm-noenrich",
    title: "No Session",
    type: "task",
    status: "backlog",
    created: "2026-04-08",
    updated: "2026-04-08",
    body: "",
    filePath: "/tmp/tasks/task-nosess.md",
  };

  const result = mapTaskToBoard(task, "proj-1", "Test", "#3b82f6", []);
  expect(result!.session).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/board-aggregator.test.ts -t "session enrichment" --reporter=verbose`
Expected: FAIL — `session` property not being set from enricher

- [ ] **Step 3: Wire enricher into mapTaskToBoard**

In `server/board/aggregator.ts`, add import:

```typescript
import { enrichTaskSession } from "./session-enricher";
```

In `mapTaskToBoard()`, replace `session: null,` with:

```typescript
session: enrichTaskSession(task.pipelineSessionIds?.[0]),
```

If enrichment returns data and task has `pipelineActivity`, also set `lastActivity`:

```typescript
const enrichment = enrichTaskSession(task.pipelineSessionIds?.[0]);
if (enrichment && task.pipelineActivity) {
  enrichment.lastActivity = task.pipelineActivity;
}
```

Then use `session: enrichment,` in the return object.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/board-aggregator.test.ts --reporter=verbose`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add server/board/aggregator.ts tests/board-aggregator.test.ts
git commit -m "feat: wire session enricher into board aggregation"
```

---

### Task 5: Session Detail API Endpoint

**Files:**
- Modify: `server/routes/board.ts`
- Test: `tests/board-routes.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/board-routes.test.ts`:

```typescript
describe("GET /api/board/tasks/:id/session", () => {
  it("returns 404 when task has no session", async () => {
    // Mock aggregateBoardState to return a task with no session
    vi.mocked(aggregateBoardState).mockReturnValue({
      tasks: [{
        id: "itm-nosess",
        title: "No Session",
        description: "",
        column: "backlog",
        project: "proj-1",
        projectName: "Test",
        projectColor: "#3b82f6",
        priority: "medium",
        dependsOn: [],
        tags: [],
        flagged: false,
        createdAt: "2026-04-08",
        updatedAt: "2026-04-08",
        session: null,
      }],
      columns: ["backlog", "ready", "in-progress", "review", "done"],
      projects: [],
      milestones: [],
    });

    const res = await request(app).get("/api/board/tasks/itm-nosess/session");
    expect(res.status).toBe(404);
  });

  it("returns session enrichment + cost breakdown for task with session", async () => {
    vi.mocked(aggregateBoardState).mockReturnValue({
      tasks: [{
        id: "itm-withsess",
        title: "With Session",
        description: "",
        column: "in-progress",
        project: "proj-1",
        projectName: "Test",
        projectColor: "#3b82f6",
        priority: "medium",
        dependsOn: [],
        tags: [],
        flagged: false,
        createdAt: "2026-04-08",
        updatedAt: "2026-04-08",
        session: {
          sessionId: "sess-xyz",
          isActive: true,
          model: "claude-sonnet-4-6",
          lastActivity: "writing tests...",
          lastActivityTs: "2026-04-08T14:15:00Z",
          messageCount: 42,
          costUsd: 1.23,
          inputTokens: 50000,
          outputTokens: 12000,
          healthScore: "good",
          toolErrors: 0,
          durationMinutes: 15,
        },
      }],
      columns: ["backlog", "ready", "in-progress", "review", "done"],
      projects: [],
      milestones: [],
    });

    const res = await request(app).get("/api/board/tasks/itm-withsess/session");
    expect(res.status).toBe(200);
    expect(res.body.sessionId).toBe("sess-xyz");
    expect(res.body.isActive).toBe(true);
    expect(res.body.model).toBe("claude-sonnet-4-6");
  });

  it("returns 404 when task not found", async () => {
    vi.mocked(aggregateBoardState).mockReturnValue({
      tasks: [],
      columns: ["backlog", "ready", "in-progress", "review", "done"],
      projects: [],
      milestones: [],
    });

    const res = await request(app).get("/api/board/tasks/itm-nonexistent/session");
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/board-routes.test.ts -t "session" --reporter=verbose`
Expected: FAIL — 404 for all (route doesn't exist)

- [ ] **Step 3: Implement the endpoint**

In `server/routes/board.ts`, add after the existing unflag route:

```typescript
/** GET /api/board/tasks/:id/session — Get session enrichment for a board task */
router.get("/api/board/tasks/:id/session", (req: Request, res: Response) => {
  try {
    const state = aggregateBoardState();
    const task = state.tasks.find(t => t.id === req.params.id);
    if (!task) return res.status(404).json({ error: "Task not found" });
    if (!task.session) return res.status(404).json({ error: "No session linked to this task" });
    res.json(task.session);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to fetch session data" });
  }
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/board-routes.test.ts -t "session" --reporter=verbose`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/routes/board.ts tests/board-routes.test.ts
git commit -m "feat: add GET /api/board/tasks/:id/session endpoint"
```

---

### Task 6: Client Hook for Session Data

**Files:**
- Modify: `client/src/hooks/use-board.ts`

- [ ] **Step 1: Add useTaskSession hook**

In `client/src/hooks/use-board.ts`, add after the existing hooks:

```typescript
import type { SessionEnrichment } from "@shared/board-types";

/** Fetch full session data for a board task. Only fetches when sessionId is present. */
export function useTaskSession(taskId: string | null) {
  return useQuery<SessionEnrichment>({
    queryKey: ["/api/board/tasks", taskId, "session"],
    queryFn: () => apiFetch(`/api/board/tasks/${taskId}/session`),
    enabled: !!taskId,
    refetchInterval: 5_000,  // poll while panel is open — session data changes fast
  });
}
```

- [ ] **Step 2: Run type-check**

Run: `npm run check`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add client/src/hooks/use-board.ts
git commit -m "feat: add useTaskSession hook for board session data"
```

---

### Task 7: Info Radiator Sub-Components

**Files:**
- Create: `client/src/components/board/session-indicators.tsx`
- Test: `tests/board-session-card.test.ts`

These are small, focused sub-components that render session data as visual indicators on the card.

- [ ] **Step 1: Write tests for the indicator components**

Create `tests/board-session-card.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import type { SessionEnrichment } from "../shared/board-types";

// Test the formatting/logic functions, not React rendering
// (React component tests would need jsdom — test the logic layer)

describe("session indicator logic", () => {
  it("formats cost as dollars with 2 decimal places", () => {
    expect(formatCost(0)).toBe("$0.00");
    expect(formatCost(1.5)).toBe("$1.50");
    expect(formatCost(12.345)).toBe("$12.35");
  });

  it("formats duration as human-readable", () => {
    expect(formatDuration(null)).toBe("");
    expect(formatDuration(0)).toBe("<1m");
    expect(formatDuration(5)).toBe("5m");
    expect(formatDuration(65)).toBe("1h 5m");
    expect(formatDuration(120)).toBe("2h 0m");
  });

  it("formats token counts as compact numbers", () => {
    expect(formatTokens(500)).toBe("500");
    expect(formatTokens(1500)).toBe("1.5k");
    expect(formatTokens(50000)).toBe("50k");
    expect(formatTokens(1200000)).toBe("1.2M");
  });

  it("picks correct status light color", () => {
    expect(statusLightColor(true, "good")).toBe("bg-green-500");    // active + healthy
    expect(statusLightColor(true, "fair")).toBe("bg-amber-500");    // active + fair
    expect(statusLightColor(true, "poor")).toBe("bg-red-500");      // active + poor
    expect(statusLightColor(false, "good")).toBe("bg-slate-500");   // inactive
    expect(statusLightColor(true, null)).toBe("bg-green-500");      // active, no health data
  });

  it("shortens model name for badge display", () => {
    expect(shortenModel("claude-sonnet-4-6")).toBe("Sonnet 4.6");
    expect(shortenModel("claude-opus-4-6")).toBe("Opus 4.6");
    expect(shortenModel("claude-haiku-4-5-20251001")).toBe("Haiku 4.5");
    expect(shortenModel(null)).toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/board-session-card.test.ts --reporter=verbose`
Expected: FAIL — functions not found

- [ ] **Step 3: Implement the indicator components and formatting functions**

Create `client/src/components/board/session-indicators.tsx`:

```tsx
// client/src/components/board/session-indicators.tsx

import { Badge } from "@/components/ui/badge";
import { Activity, Bot, Cpu, DollarSign, MessageSquare, Clock } from "lucide-react";
import type { SessionEnrichment } from "@shared/board-types";

// --- Formatting functions (exported for testing) ---

export function formatCost(usd: number): string {
  return `$${usd.toFixed(2)}`;
}

export function formatDuration(minutes: number | null): string {
  if (minutes === null) return "";
  if (minutes === 0) return "<1m";
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

export function formatTokens(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(count >= 10_000 ? 0 : 1)}k`;
  return String(count);
}

export function statusLightColor(isActive: boolean, healthScore: "good" | "fair" | "poor" | null): string {
  if (!isActive) return "bg-slate-500";
  if (healthScore === "poor") return "bg-red-500";
  if (healthScore === "fair") return "bg-amber-500";
  return "bg-green-500";
}

export function shortenModel(model: string | null): string {
  if (!model) return "";
  const match = model.match(/claude-(\w+)-(\d+)-(\d+)/);
  if (!match) return model;
  const [, family, major, minor] = match;
  return `${family.charAt(0).toUpperCase() + family.slice(1)} ${major}.${minor}`;
}

// --- React sub-components ---

/** Small colored dot indicating session status. Pulses when active. */
export function StatusLight({ session }: { session: SessionEnrichment }) {
  const color = statusLightColor(session.isActive, session.healthScore);
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${color} ${session.isActive ? "animate-pulse" : ""}`}
      title={session.isActive ? "Session active" : "Session inactive"}
    />
  );
}

/** Small badge showing the primary model. */
export function ModelBadge({ model }: { model: string | null }) {
  const label = shortenModel(model);
  if (!label) return null;
  return (
    <Badge variant="outline" className="text-[9px] px-1.5 py-0 font-mono">
      <Cpu className="h-2.5 w-2.5 mr-0.5" />
      {label}
    </Badge>
  );
}

/** Cost pill with dollar icon. */
export function CostPill({ costUsd }: { costUsd: number }) {
  if (costUsd === 0) return null;
  return (
    <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
      <DollarSign className="h-3 w-3" />
      {formatCost(costUsd).slice(1)}
    </span>
  );
}

/** Agent activity indicator — shows what the session is doing. */
export function AgentActivity({ session }: { session: SessionEnrichment }) {
  if (!session.lastActivity && !session.isActive) return null;
  return (
    <div className="flex items-center gap-1 text-[10px] text-blue-400 truncate">
      <Bot className="h-3 w-3 flex-shrink-0" />
      <span className="truncate">
        {session.lastActivity || (session.isActive ? "Working..." : "Idle")}
      </span>
    </div>
  );
}

/** Compact session stats row: messages, duration, tokens. */
export function SessionStats({ session }: { session: SessionEnrichment }) {
  return (
    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
      <span className="flex items-center gap-0.5" title="Messages">
        <MessageSquare className="h-3 w-3" />
        {session.messageCount}
      </span>
      {session.durationMinutes != null && (
        <span className="flex items-center gap-0.5" title="Duration">
          <Clock className="h-3 w-3" />
          {formatDuration(session.durationMinutes)}
        </span>
      )}
      <span className="flex items-center gap-0.5" title={`${formatTokens(session.inputTokens)} in / ${formatTokens(session.outputTokens)} out`}>
        <Activity className="h-3 w-3" />
        {formatTokens(session.inputTokens + session.outputTokens)}
      </span>
    </div>
  );
}
```

- [ ] **Step 4: Export formatting functions for test import**

The test file needs to import from the component file. Update the test imports:

```typescript
import { formatCost, formatDuration, formatTokens, statusLightColor, shortenModel } from "../client/src/components/board/session-indicators";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/board-session-card.test.ts --reporter=verbose`
Expected: PASS

- [ ] **Step 6: Run type-check**

Run: `npm run check`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add client/src/components/board/session-indicators.tsx tests/board-session-card.test.ts
git commit -m "feat: session indicator sub-components for board cards"
```

---

### Task 8: Redesign Board Card as Info Radiator

**Files:**
- Modify: `client/src/components/board/board-task-card.tsx`

The card becomes a rich info radiator. The layout:

```
┌─────────────────────────────┐
│ ● Title of the task         │  ← status light (green/amber/red/gray) + title
│   Project · Milestone       │  ← project + milestone (unchanged)
│                             │
│ [Sonnet 4.6] [high]        │  ← model badge + priority badge + tags
│                             │
│ 🤖 writing auth tests...   │  ← agent activity line (what's happening now)
│                             │
│ 💬 42  ⏱ 15m  ⚡ 62k      │  ← messages, duration, token count
│ 🤖 AI            $1.23     │  ← assignee + cost (right-aligned)
└─────────────────────────────┘
```

Cards without a session fall back to the current minimal layout (title, priority, tags, activity text).

- [ ] **Step 1: Redesign the card component**

Replace the contents of `client/src/components/board/board-task-card.tsx`:

```tsx
// client/src/components/board/board-task-card.tsx

import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Bot, User, DollarSign } from "lucide-react";
import {
  StatusLight,
  ModelBadge,
  CostPill,
  AgentActivity,
  SessionStats,
} from "./session-indicators";
import type { BoardTask } from "@shared/board-types";

interface BoardTaskCardProps {
  task: BoardTask;
  onClick: (task: BoardTask) => void;
}

const priorityColors: Record<string, string> = {
  high: "bg-red-500/10 text-red-500 border-red-500/20",
  medium: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  low: "bg-slate-500/10 text-slate-400 border-slate-500/20",
};

export function BoardTaskCard({ task, onClick }: BoardTaskCardProps) {
  const hasSession = task.session !== null;

  return (
    <div
      onClick={() => onClick(task)}
      className="bg-card border rounded-md p-3 cursor-pointer hover:border-foreground/20 hover:shadow-sm transition-all group"
    >
      {/* Row 1: Status light + title */}
      <div className="flex items-start gap-2">
        {hasSession ? (
          <div className="mt-1.5 flex-shrink-0">
            <StatusLight session={task.session!} />
          </div>
        ) : (
          <div
            className="w-1 h-full min-h-[1.5rem] rounded-full flex-shrink-0 mt-0.5"
            style={{ backgroundColor: task.projectColor }}
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium leading-tight truncate">{task.title}</div>
          <div className="flex items-center gap-1.5 mt-1 text-[10px] text-muted-foreground">
            <span>{task.projectName}</span>
            {task.milestone && (
              <>
                <span className="opacity-40">&middot;</span>
                <span>{task.milestone}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Row 2: Badges — model, priority, tags */}
      <div className="flex items-center gap-1 mt-2 flex-wrap">
        {hasSession && <ModelBadge model={task.session!.model} />}
        {task.priority !== "medium" && (
          <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${priorityColors[task.priority]}`}>
            {task.priority}
          </Badge>
        )}
        {task.tags.slice(0, 2).map(tag => (
          <Badge key={tag} variant="outline" className="text-[9px] px-1.5 py-0">
            {tag}
          </Badge>
        ))}
      </div>

      {/* Row 3: Agent activity (session) or plain activity text (no session) */}
      {hasSession ? (
        <div className="mt-2">
          <AgentActivity session={task.session!} />
        </div>
      ) : task.activity ? (
        <div className="mt-2 text-[10px] text-blue-400 truncate">
          {task.activity}
        </div>
      ) : null}

      {/* Row 4: Session stats (only when session exists) */}
      {hasSession && (
        <div className="mt-2">
          <SessionStats session={task.session!} />
        </div>
      )}

      {/* Row 5: Assignee + cost + flag */}
      <div className="flex items-center gap-2 mt-2">
        {task.assignee && (
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            {task.assignee === "ai" ? <Bot className="h-3 w-3" /> : <User className="h-3 w-3" />}
            {task.assignee === "ai" ? "AI" : task.assignee}
          </span>
        )}
        {hasSession ? (
          <span className="ml-auto">
            <CostPill costUsd={task.session!.costUsd} />
          </span>
        ) : task.cost != null && task.cost > 0 ? (
          <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground ml-auto">
            <DollarSign className="h-3 w-3" />
            {task.cost.toFixed(2)}
          </span>
        ) : null}
        {task.flagged && (
          <span className="flex items-center gap-1 text-[10px] text-amber-500 ml-auto" title={task.flagReason}>
            <AlertTriangle className="h-3 w-3" />
            Flagged
          </span>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run type-check**

Run: `npm run check`
Expected: PASS

- [ ] **Step 3: Run existing board UI tests**

Run: `npx vitest run tests/board-ui.test.ts --reporter=verbose`
Expected: PASS (may need minor updates if tests check card structure)

- [ ] **Step 4: Commit**

```bash
git add client/src/components/board/board-task-card.tsx
git commit -m "feat: redesign board card as info radiator with session indicators"
```

---

### Task 9: Enrich Side Panel with Session Detail

**Files:**
- Modify: `client/src/components/board/board-side-panel.tsx`

When a card with a session is opened, the side panel shows a dedicated session section with model breakdown, cost per model, health indicators, and a link to the full session view.

- [ ] **Step 1: Add session section to the side panel**

In `client/src/components/board/board-side-panel.tsx`, add imports:

```typescript
import { useTaskSession } from "@/hooks/use-board";
import {
  StatusLight,
  ModelBadge,
  formatCost,
  formatDuration,
  formatTokens,
  shortenModel,
  statusLightColor,
} from "./session-indicators";
import { Activity, Clock, MessageSquare, Cpu, Heart } from "lucide-react";
```

After the existing Activity section (line 175), add a new session section. This section only renders when `task.session` is not null:

```tsx
{/* Session detail */}
{task.session && (
  <>
    <Separator />
    <div>
      <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-2">
        Session
        <StatusLight session={task.session} />
        <span className="text-[10px] font-normal">
          {task.session.isActive ? "Active" : "Inactive"}
        </span>
      </div>

      {/* Session stats grid */}
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <span className="text-muted-foreground">Model</span>
          <div className="mt-0.5 font-medium">{shortenModel(task.session.model) || "Unknown"}</div>
        </div>
        <div>
          <span className="text-muted-foreground">Health</span>
          <div className="mt-0.5 font-medium flex items-center gap-1">
            <span className={`inline-block w-2 h-2 rounded-full ${statusLightColor(true, task.session.healthScore)}`} />
            {task.session.healthScore ?? "—"}
            {task.session.toolErrors > 0 && (
              <span className="text-red-400 text-[10px]">({task.session.toolErrors} errors)</span>
            )}
          </div>
        </div>
        <div>
          <span className="text-muted-foreground">Messages</span>
          <div className="mt-0.5 font-medium">{task.session.messageCount}</div>
        </div>
        <div>
          <span className="text-muted-foreground">Duration</span>
          <div className="mt-0.5 font-medium">{formatDuration(task.session.durationMinutes) || "—"}</div>
        </div>
        <div>
          <span className="text-muted-foreground">Tokens</span>
          <div className="mt-0.5 font-medium">
            {formatTokens(task.session.inputTokens)} in / {formatTokens(task.session.outputTokens)} out
          </div>
        </div>
        <div>
          <span className="text-muted-foreground">Cost</span>
          <div className="mt-0.5 font-medium">{formatCost(task.session.costUsd)}</div>
        </div>
      </div>

      {/* Link to full session */}
      <Button variant="ghost" size="sm" className="mt-3 text-xs w-full justify-start" asChild>
        <a href={`/sessions?highlight=${task.session.sessionId}`}>
          <ExternalLink className="h-3 w-3 mr-2" />
          View Full Session
        </a>
      </Button>
    </div>
  </>
)}
```

- [ ] **Step 2: Run type-check**

Run: `npm run check`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add client/src/components/board/board-side-panel.tsx
git commit -m "feat: add session detail section to board side panel"
```

---

### Task 10: SSE Session Update Events

**Files:**
- Modify: `server/board/events.ts` (if it exists) or the board route SSE handler
- Modify: `client/src/hooks/use-board.ts`

When session data changes (new messages, cost updates), the board should refresh cards with active sessions more aggressively.

- [ ] **Step 1: Check current board events module**

Read `server/board/events.ts` to understand the event bus. The board SSE already invalidates queries on events. We need to add a `session-updated` event type.

- [ ] **Step 2: Add session-updated event type to the event bus**

In the board events module, add `"session-updated"` to the supported event types. The event payload should include `{ taskId: string, sessionId: string }`.

- [ ] **Step 3: Add session-updated to client event listener**

In `client/src/hooks/use-board.ts`, in the `useBoardEvents()` hook, add `"session-updated"` to the `eventTypes` array (line 101):

```typescript
const eventTypes = [
  "task-moved", "task-created", "task-updated", "task-deleted",
  "task-flagged", "task-unflagged", "board-refresh", "session-updated",
];
```

This ensures when a `session-updated` event fires, the board queries are invalidated and cards re-render with fresh enrichment data.

- [ ] **Step 4: Run type-check and existing board event tests**

Run: `npm run check && npx vitest run tests/board-events.test.ts --reporter=verbose`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/board/events.ts client/src/hooks/use-board.ts
git commit -m "feat: add session-updated SSE event to board event bus"
```

---

### Task 11: Final Integration Test + Safety Check

**Files:**
- Test: existing test suite

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: All pass, including new tests from tasks 1-10

- [ ] **Step 2: Run type-check**

Run: `npm run check`
Expected: PASS

- [ ] **Step 3: Run safety tests**

Run: `npx vitest run tests/new-user-safety.test.ts --reporter=verbose`
Expected: PASS — no hardcoded paths, PII, or user-specific strings

- [ ] **Step 4: Visual smoke test**

Run: `npm run dev`
- Open `http://localhost:5100/board`
- Verify cards render without errors
- Cards without sessions should look like the old minimal layout
- If any tasks have session IDs, verify enrichment data appears (status light, model badge, stats)

- [ ] **Step 5: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "test: board-session integration passes full suite"
```
