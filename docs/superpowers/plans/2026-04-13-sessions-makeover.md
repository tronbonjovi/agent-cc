# Sessions Tab Makeover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Sessions tab detail view to mirror the Messages tab — clean picker on the left, structured detail on the right driven by a top filter bar — and fix the broken Overview metrics (Cost / Cache Hit / Sidechains report 0 because the upstream prop chain was never wired).

**Architecture:** Four sequenced PRs. PR1 fixes the Overview / TokenBreakdown bugs in place via self-compute helpers (no layout disturbance). PR2 introduces SessionFilterBar and rewires SessionDetail from collapsibles to filter-pill-driven sections. PR3 replaces the bespoke ToolTimeline with a thin wrapper around the Messages tool renderer registry. PR4 deletes dead sections (FileImpact, HealthDetails, LifecycleEvents) and folds salvageable bits into Overview as Activity row + inline health badge.

**Tech Stack:** TypeScript, React, React Query, Vitest, Tailwind. All work in `client/src/components/analytics/sessions/` and `tests/`. No backend changes — `/api/sessions/:id?include=tree` and `/api/sessions/:id/messages?include=tree` already return everything we need.

**Spec:** `docs/superpowers/specs/2026-04-13-sessions-makeover-design.md`

---

## File Structure

### Files created

| Path | Purpose |
|---|---|
| `client/src/components/analytics/sessions/SessionFilterBar.tsx` | Pill toggles + mode presets, mirroring `messages/FilterBar.tsx`. Exports pure helpers (`applyPreset`, `togglePillGroup`, `isPillActive`, `SessionFilterState`, `SessionFilterPill`, `SessionFilterPreset`). |
| `client/src/components/analytics/sessions/SessionToolTimeline.tsx` | Thin wrapper that fetches `/api/sessions/:id/messages?include=tree&types=tool_call,tool_result`, groups messages by `subagentContext.agentId`, and renders each `tool_call` via the Messages `ToolCallBlock` registry. Errors-only filter applied here. |
| `client/src/components/analytics/sessions/activity-summary.ts` | Pure helper `buildActivitySummary(parsed)` that returns `{ durationLabel, modelSwitches, firstErrorTs }`. Consumed by `SessionOverview` to render the Activity one-liner. |
| `tests/sessions-overview-helpers.test.ts` | Coverage for `computeCostFromTree`, `computeSidechainCount`, `computeCacheStatsFromTree`, `buildActivitySummary`. |
| `tests/session-filter-bar.test.ts` | Coverage for pill toggle, preset application, preset-clears-on-manual-toggle, errorsOnly propagation. |
| `tests/session-tool-timeline.test.ts` | Coverage for chronological order, owner grouping by `subagentContext.agentId`, errors-only filter, fallback rendering for unknown tool kind, tree-null degradation. |

### Files modified

| Path | Change |
|---|---|
| `client/src/components/analytics/sessions/SessionOverview.tsx` | Add three self-compute helpers; remove `costUsd`/`inputTokens`/`outputTokens`/`cacheReadTokens`/`cacheCreationTokens` props; render Activity row; render inline Health badge folded from HealthDetails. |
| `client/src/components/analytics/sessions/TokenBreakdown.tsx` | Fix Role label (User/Assistant/Subagent: type), wrap table in `max-h-[60vh] overflow-auto` + sticky header with solid `bg-card` background. |
| `client/src/components/analytics/sessions/SessionDetail.tsx` | Drop dead cost/cache/health/lifecycle props; wire `SessionFilterBar`; switch sections from collapsibles to filter-pill-driven; swap `ToolTimeline` → `SessionToolTimeline`. |
| `client/src/components/analytics/sessions/SessionsTab.tsx` | Drop hardcoded `costUsd: 0` enrichment; stop forwarding cost/cache props to `SessionDetail`. |
| `client/src/components/analytics/sessions/SessionList.tsx` | Strip `applyFilters` health/status branches; stop accepting `health`/`status`/`hasErrors` from `SessionFilterState`; keep search/sort/project/model. |
| `client/src/components/analytics/sessions/SessionFilters.tsx` | Remove health pills, status pills, hasErrors toggle; keep search input, sort dropdown, project dropdown, model dropdown. |
| `tests/session-list-filters.test.ts` (existing) | Drop health/status assertions; add model-dropdown coverage. |
| `tests/session-overview.test.ts` (existing) | Replace prop-driven assertions with self-compute assertions; drop `costUsd` prop expectations. |

### Files deleted

| Path | Reason |
|---|---|
| `client/src/components/analytics/sessions/ToolTimeline.tsx` | Replaced by `SessionToolTimeline`. |
| `client/src/components/analytics/sessions/FileImpact.tsx` | Section dropped per spec — read/write counts are noise. |
| `client/src/components/analytics/sessions/HealthDetails.tsx` | Folded into Overview as inline badge. |
| `client/src/components/analytics/sessions/LifecycleEvents.tsx` | Salvaged into Overview Activity row. |
| Test files for the four deletions above (whichever exist) | Coverage moves to the new locations. |

---

## PR 1 — Overview metrics + TokenBreakdown bug fixes

**Branch:** `feature/sessions-makeover-pr1-bugfixes`

**Why first:** Visible improvement immediately. Users see correct Cost / Cache / Sidechain numbers in the next deploy without any layout change.

**Step 0 — Branch:**

```bash
git checkout main
git pull
git checkout -b feature/sessions-makeover-pr1-bugfixes
```

---

### Task 1.1: Helper — `computeCostFromTree`

**Files:**
- Modify: `client/src/components/analytics/sessions/SessionOverview.tsx` (add helper near top, alongside `computeModelBreakdownFromTree`)
- Test: `tests/sessions-overview-helpers.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/sessions-overview-helpers.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { computeCostFromTree } from "@/components/analytics/sessions/SessionOverview";
import type {
  ParsedSession,
  SerializedSessionTreeForClient,
} from "@shared/session-types";

function makeParsed(overrides: Partial<ParsedSession> = {}): ParsedSession {
  return {
    meta: {} as ParsedSession["meta"],
    assistantMessages: [],
    userMessages: [],
    systemEvents: { turnDurations: [], hookSummaries: [], localCommands: [], bridgeEvents: [] },
    toolTimeline: [],
    fileSnapshots: [],
    lifecycle: [],
    conversationTree: [],
    counts: {
      totalRecords: 0, assistantMessages: 0, userMessages: 0, systemEvents: 0,
      toolCalls: 0, toolErrors: 0, fileSnapshots: 0, sidechainMessages: 0,
    },
    ...overrides,
  };
}

describe("computeCostFromTree", () => {
  it("prefers tree.totals when tree is present", () => {
    const tree = {
      root: { kind: "session-root", id: "root" } as any,
      nodesById: {},
      subagentsByAgentId: {},
      totals: {
        assistantTurns: 0, userTurns: 0, toolCalls: 0, toolErrors: 0, subagents: 0,
        inputTokens: 1000, outputTokens: 500,
        cacheReadTokens: 200, cacheCreationTokens: 100,
        costUsd: 1.23, durationMs: 0,
      },
      warnings: [],
    } as unknown as SerializedSessionTreeForClient;

    const parsed = makeParsed();
    const result = computeCostFromTree(tree, parsed);
    expect(result.costUsd).toBe(1.23);
    expect(result.inputTokens).toBe(1000);
    expect(result.outputTokens).toBe(500);
    expect(result.cacheReadTokens).toBe(200);
    expect(result.cacheCreationTokens).toBe(100);
  });

  it("falls back to summing parsed.assistantMessages when tree is null", () => {
    const parsed = makeParsed({
      assistantMessages: [
        { uuid: "1", parentUuid: "", timestamp: "", requestId: "", isSidechain: false,
          model: "claude-sonnet", stopReason: "end_turn", toolCalls: [], hasThinking: false, textPreview: "",
          usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 20, cacheCreationTokens: 10,
                   serviceTier: "", inferenceGeo: "", speed: "",
                   serverToolUse: { webSearchRequests: 0, webFetchRequests: 0 } } },
        { uuid: "2", parentUuid: "1", timestamp: "", requestId: "", isSidechain: false,
          model: "claude-sonnet", stopReason: "end_turn", toolCalls: [], hasThinking: false, textPreview: "",
          usage: { inputTokens: 200, outputTokens: 75, cacheReadTokens: 40, cacheCreationTokens: 0,
                   serviceTier: "", inferenceGeo: "", speed: "",
                   serverToolUse: { webSearchRequests: 0, webFetchRequests: 0 } } },
      ] as ParsedSession["assistantMessages"],
    });
    const result = computeCostFromTree(null, parsed);
    expect(result.inputTokens).toBe(300);
    expect(result.outputTokens).toBe(125);
    expect(result.cacheReadTokens).toBe(60);
    expect(result.cacheCreationTokens).toBe(10);
    // Flat path returns 0 cost — no per-message cost field on AssistantRecord.
    expect(result.costUsd).toBe(0);
  });

  it("returns zeros for empty input", () => {
    const result = computeCostFromTree(null, makeParsed());
    expect(result).toEqual({
      costUsd: 0, inputTokens: 0, outputTokens: 0,
      cacheReadTokens: 0, cacheCreationTokens: 0,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/tron/dev/projects/agent-cc
npx vitest run tests/sessions-overview-helpers.test.ts -t "computeCostFromTree" --reporter=dot
```

Expected: FAIL — "computeCostFromTree is not a function" (the helper doesn't exist yet).

- [ ] **Step 3: Implement the helper**

In `client/src/components/analytics/sessions/SessionOverview.tsx`, add this export near the top (after `computeModelBreakdownFromTree` at line 51):

```typescript
/**
 * Total cost + token totals for the session. Prefers `tree.totals` (which
 * includes subagent rollup from the post-order pass) when the tree is
 * available; falls back to summing `parsed.assistantMessages[].usage` when
 * the tree is null. The flat fallback cannot compute cost (per-message cost
 * isn't stored on AssistantRecord), so it returns 0 for cost — same as
 * today's broken display, but at least the token totals are real.
 */
export function computeCostFromTree(
  tree: SerializedSessionTreeForClient | null | undefined,
  parsed: ParsedSession,
): {
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
} {
  if (tree && tree.totals) {
    return {
      costUsd: tree.totals.costUsd ?? 0,
      inputTokens: tree.totals.inputTokens ?? 0,
      outputTokens: tree.totals.outputTokens ?? 0,
      cacheReadTokens: tree.totals.cacheReadTokens ?? 0,
      cacheCreationTokens: tree.totals.cacheCreationTokens ?? 0,
    };
  }
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheCreationTokens = 0;
  for (const m of parsed.assistantMessages) {
    inputTokens += m.usage?.inputTokens ?? 0;
    outputTokens += m.usage?.outputTokens ?? 0;
    cacheReadTokens += m.usage?.cacheReadTokens ?? 0;
    cacheCreationTokens += m.usage?.cacheCreationTokens ?? 0;
  }
  return { costUsd: 0, inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/sessions-overview-helpers.test.ts -t "computeCostFromTree" --reporter=dot
```

Expected: PASS — three tests green.

- [ ] **Step 5: Commit**

```bash
git add tests/sessions-overview-helpers.test.ts client/src/components/analytics/sessions/SessionOverview.tsx
git commit -m "$(cat <<'EOF'
fix(sessions): add computeCostFromTree helper for Overview metrics

Reads tree.totals when present (includes subagent rollup), falls back to
summing parsed.assistantMessages[].usage when tree is null. Pure helper,
not yet wired into the SessionOverview render path — task 1.5.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 1.2: Helper — `computeSidechainCount`

**Files:**
- Modify: `client/src/components/analytics/sessions/SessionOverview.tsx`
- Test: `tests/sessions-overview-helpers.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

Append to `tests/sessions-overview-helpers.test.ts`:

```typescript
import { computeSidechainCount } from "@/components/analytics/sessions/SessionOverview";

describe("computeSidechainCount", () => {
  it("returns subagentsByAgentId size when tree is present", () => {
    const tree = {
      root: {} as any,
      nodesById: {},
      subagentsByAgentId: {
        "abc123": {} as any,
        "def456": {} as any,
        "ghi789": {} as any,
      },
      totals: {} as any,
      warnings: [],
    } as unknown as SerializedSessionTreeForClient;
    expect(computeSidechainCount(tree, makeParsed())).toBe(3);
  });

  it("falls back to parsed.counts.sidechainMessages when tree is null", () => {
    const parsed = makeParsed();
    parsed.counts.sidechainMessages = 7;
    expect(computeSidechainCount(null, parsed)).toBe(7);
  });

  it("returns 0 when both tree and counts are absent", () => {
    expect(computeSidechainCount(null, makeParsed())).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/sessions-overview-helpers.test.ts -t "computeSidechainCount" --reporter=dot
```

Expected: FAIL — "computeSidechainCount is not a function".

- [ ] **Step 3: Implement the helper**

Add after `computeCostFromTree` in `SessionOverview.tsx`:

```typescript
/**
 * Subagent count for the Sidechains metric. Prefers `tree.subagentsByAgentId`
 * size — same source the working Subagents chip strip already reads, so the
 * two displays will always agree. Falls back to `parsed.counts.sidechainMessages`
 * (which historically undercounts because sidechain JSONL records live in
 * separate files and the flat counter doesn't see them) when the tree isn't
 * available.
 */
export function computeSidechainCount(
  tree: SerializedSessionTreeForClient | null | undefined,
  parsed: ParsedSession,
): number {
  if (tree && tree.subagentsByAgentId) {
    return Object.keys(tree.subagentsByAgentId).length;
  }
  return parsed.counts?.sidechainMessages ?? 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/sessions-overview-helpers.test.ts -t "computeSidechainCount" --reporter=dot
```

Expected: PASS — three new tests green.

- [ ] **Step 5: Commit**

```bash
git add tests/sessions-overview-helpers.test.ts client/src/components/analytics/sessions/SessionOverview.tsx
git commit -m "$(cat <<'EOF'
fix(sessions): add computeSidechainCount helper

Reads tree.subagentsByAgentId size when present (matches the source the
Subagents chip strip already uses, so the two displays will always
agree). Falls back to parsed.counts.sidechainMessages when tree is null.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 1.3: Helper — `computeCacheStatsFromTree`

**Files:**
- Modify: `client/src/components/analytics/sessions/SessionOverview.tsx`
- Test: `tests/sessions-overview-helpers.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

Append:

```typescript
import { computeCacheStatsFromTree } from "@/components/analytics/sessions/SessionOverview";

describe("computeCacheStatsFromTree", () => {
  it("returns hit rate from tree totals", () => {
    const tree = {
      root: {} as any, nodesById: {}, subagentsByAgentId: {},
      totals: {
        assistantTurns: 0, userTurns: 0, toolCalls: 0, toolErrors: 0, subagents: 0,
        inputTokens: 0, outputTokens: 0,
        cacheReadTokens: 800, cacheCreationTokens: 200,
        costUsd: 0, durationMs: 0,
      },
      warnings: [],
    } as unknown as SerializedSessionTreeForClient;
    const result = computeCacheStatsFromTree(tree, makeParsed());
    expect(result.cacheReadTokens).toBe(800);
    expect(result.cacheCreationTokens).toBe(200);
    expect(result.cacheHitRate).toBeCloseTo(0.8, 5);
  });

  it("returns null hit rate when cache total is zero", () => {
    const result = computeCacheStatsFromTree(null, makeParsed());
    expect(result.cacheHitRate).toBeNull();
    expect(result.cacheReadTokens).toBe(0);
    expect(result.cacheCreationTokens).toBe(0);
  });

  it("falls back to summing parsed.assistantMessages when tree is null", () => {
    const parsed = makeParsed({
      assistantMessages: [
        { uuid: "1", parentUuid: "", timestamp: "", requestId: "", isSidechain: false,
          model: "x", stopReason: "end_turn", toolCalls: [], hasThinking: false, textPreview: "",
          usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 600, cacheCreationTokens: 400,
                   serviceTier: "", inferenceGeo: "", speed: "",
                   serverToolUse: { webSearchRequests: 0, webFetchRequests: 0 } } },
      ] as ParsedSession["assistantMessages"],
    });
    const result = computeCacheStatsFromTree(null, parsed);
    expect(result.cacheReadTokens).toBe(600);
    expect(result.cacheCreationTokens).toBe(400);
    expect(result.cacheHitRate).toBeCloseTo(0.6, 5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/sessions-overview-helpers.test.ts -t "computeCacheStatsFromTree" --reporter=dot
```

Expected: FAIL — "computeCacheStatsFromTree is not a function".

- [ ] **Step 3: Implement the helper**

Add after `computeSidechainCount` in `SessionOverview.tsx`:

```typescript
/**
 * Cache read/creation tokens + hit rate. Prefers tree.totals when present.
 * Hit rate is `cacheRead / (cacheRead + cacheCreation)`; returns null when
 * the denominator is zero so the renderer shows "-" instead of "0%".
 */
export function computeCacheStatsFromTree(
  tree: SerializedSessionTreeForClient | null | undefined,
  parsed: ParsedSession,
): {
  cacheReadTokens: number;
  cacheCreationTokens: number;
  cacheHitRate: number | null;
} {
  let cacheReadTokens = 0;
  let cacheCreationTokens = 0;
  if (tree && tree.totals) {
    cacheReadTokens = tree.totals.cacheReadTokens ?? 0;
    cacheCreationTokens = tree.totals.cacheCreationTokens ?? 0;
  } else {
    for (const m of parsed.assistantMessages) {
      cacheReadTokens += m.usage?.cacheReadTokens ?? 0;
      cacheCreationTokens += m.usage?.cacheCreationTokens ?? 0;
    }
  }
  const total = cacheReadTokens + cacheCreationTokens;
  const cacheHitRate = total > 0 ? cacheReadTokens / total : null;
  return { cacheReadTokens, cacheCreationTokens, cacheHitRate };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/sessions-overview-helpers.test.ts --reporter=dot
```

Expected: PASS — all nine helper tests green.

- [ ] **Step 5: Commit**

```bash
git add tests/sessions-overview-helpers.test.ts client/src/components/analytics/sessions/SessionOverview.tsx
git commit -m "$(cat <<'EOF'
fix(sessions): add computeCacheStatsFromTree helper

Returns cacheReadTokens, cacheCreationTokens, and cacheHitRate from
tree.totals when present. Hit rate is null when denominator is zero so
the renderer shows '-' instead of '0%'.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 1.4: Wire helpers into `SessionOverview` render path

**Files:**
- Modify: `client/src/components/analytics/sessions/SessionOverview.tsx`
- Test: `tests/session-overview.test.ts` (existing — update assertions)

- [ ] **Step 1: Read the existing render path**

Read `client/src/components/analytics/sessions/SessionOverview.tsx` lines 158–242. Identify the lines that read the broken props:

- Line 193: `const cacheRead = cacheReadTokens ?? 0;`
- Line 194: `const cacheCreate = cacheCreationTokens ?? 0;`
- Line 196: `const cacheHitRate = cacheTotal > 0 ? cacheRead / cacheTotal : null;`
- Line 198: `const totalInput = inputTokens ?? 0;`
- Line 199: `const totalOutput = outputTokens ?? 0;`
- Line 220: `value={formatMetric(costUsd, "cost")}`
- Line 235: `value={String(counts.sidechainMessages)}`

These are the seven sites that need to switch to the helpers.

- [ ] **Step 2: Write the failing test**

Update `tests/session-overview.test.ts`. Replace the cost/cache/sidechain assertions with:

```typescript
import { render, screen } from "@testing-library/react";
import { SessionOverview } from "@/components/analytics/sessions/SessionOverview";
import type { ParsedSession, SerializedSessionTreeForClient } from "@shared/session-types";

function makeParsedFixture(): ParsedSession {
  return {
    meta: {
      sessionId: "s1", slug: "test", firstMessage: "", firstTs: "2026-04-13T10:00:00Z",
      lastTs: "2026-04-13T10:30:00Z", sizeBytes: 0, filePath: "", projectKey: "p",
      cwd: "", version: "1.0.0", gitBranch: "", entrypoint: "",
    },
    assistantMessages: [],
    userMessages: [],
    systemEvents: { turnDurations: [], hookSummaries: [], localCommands: [], bridgeEvents: [] },
    toolTimeline: [], fileSnapshots: [], lifecycle: [], conversationTree: [],
    counts: {
      totalRecords: 0, assistantMessages: 5, userMessages: 4, systemEvents: 0,
      toolCalls: 12, toolErrors: 0, fileSnapshots: 0, sidechainMessages: 0,
    },
  };
}

describe("SessionOverview metrics from tree", () => {
  it("renders cost from tree.totals.costUsd", () => {
    const parsed = makeParsedFixture();
    const tree = {
      root: {} as any, nodesById: {}, subagentsByAgentId: {},
      totals: {
        assistantTurns: 0, userTurns: 0, toolCalls: 0, toolErrors: 0, subagents: 0,
        inputTokens: 1000, outputTokens: 500,
        cacheReadTokens: 800, cacheCreationTokens: 200,
        costUsd: 4.56, durationMs: 0,
      },
      warnings: [],
    } as unknown as SerializedSessionTreeForClient;
    render(<SessionOverview parsed={parsed} tree={tree} />);
    expect(screen.getByText("$4.56")).toBeTruthy();
    expect(screen.getByText("80%")).toBeTruthy(); // cache hit rate
  });

  it("renders sidechains from tree.subagentsByAgentId size", () => {
    const parsed = makeParsedFixture();
    const tree = {
      root: {} as any, nodesById: {},
      subagentsByAgentId: { a: {} as any, b: {} as any, c: {} as any },
      totals: {} as any, warnings: [],
    } as unknown as SerializedSessionTreeForClient;
    render(<SessionOverview parsed={parsed} tree={tree} />);
    // Sidechains metric cell — find by label "SIDECHAINS" + sibling value
    const label = screen.getByText("SIDECHAINS");
    const cell = label.closest("div");
    expect(cell?.textContent).toContain("3");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npx vitest run tests/session-overview.test.ts -t "metrics from tree" --reporter=dot
```

Expected: FAIL — "$4.56" not found; sidechain cell shows "0".

- [ ] **Step 4: Update the render path**

In `client/src/components/analytics/sessions/SessionOverview.tsx`, replace lines 192–199 with:

```typescript
  // Self-compute cost / cache / sidechain from parsed + tree. Avoids the
  // upstream prop-drilling chain that historically delivered zeros.
  const costData = computeCostFromTree(tree, parsed);
  const cacheStats = computeCacheStatsFromTree(tree, parsed);
  const sidechainCount = computeSidechainCount(tree, parsed);
  const cacheHitRate = cacheStats.cacheHitRate;
  const cacheRead = cacheStats.cacheReadTokens;
  const cacheTotal = cacheStats.cacheReadTokens + cacheStats.cacheCreationTokens;
  const totalInput = costData.inputTokens;
  const totalOutput = costData.outputTokens;
```

Replace line 220 (`value={formatMetric(costUsd, "cost")}`) with:

```typescript
          value={formatMetric(costData.costUsd, "cost")}
```

Replace line 235 (`value={String(counts.sidechainMessages)}`) with:

```typescript
          value={String(sidechainCount)}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npx vitest run tests/session-overview.test.ts -t "metrics from tree" --reporter=dot
```

Expected: PASS — both new tests green.

- [ ] **Step 6: Run full overview test file to catch regressions**

```bash
npx vitest run tests/session-overview.test.ts --reporter=dot
```

Expected: PASS — entire file green. If old tests fail because they asserted the old prop-driven behavior, update them to use the new tree-driven behavior with the same fixture pattern.

- [ ] **Step 7: Commit**

```bash
git add client/src/components/analytics/sessions/SessionOverview.tsx tests/session-overview.test.ts
git commit -m "$(cat <<'EOF'
fix(sessions): wire Overview metrics to self-compute helpers

Cost / Cache Hit / Sidechains now derive from parsed + tree rather than
the broken upstream prop chain (SessionsTab hardcoded costUsd: 0 and
never set cache fields). Tree-aware path includes subagent rollup;
flat fallback uses parsed.assistantMessages[].usage.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 1.5: Drop dead props from `SessionDetail` and `SessionsTab`

**Files:**
- Modify: `client/src/components/analytics/sessions/SessionDetail.tsx`
- Modify: `client/src/components/analytics/sessions/SessionsTab.tsx`
- Modify: `client/src/components/analytics/sessions/SessionOverview.tsx` (interface)

- [ ] **Step 1: Remove the props from SessionOverview's interface**

In `SessionOverview.tsx`, edit `SessionOverviewProps` (lines 139–156). Remove:

- `costUsd?: number;`
- `inputTokens?: number;`
- `outputTokens?: number;`
- `cacheReadTokens?: number;`
- `cacheCreationTokens?: number;`

Also remove them from the destructure on line 158. The component should now look like:

```typescript
interface SessionOverviewProps {
  parsed: ParsedSession | null;
  healthScore?: SessionHealthScore;
  healthReasons?: string[];
  durationMinutes?: number | null;
  tree?: SerializedSessionTreeForClient | null;
}

export function SessionOverview({
  parsed,
  healthScore, healthReasons, durationMinutes,
  tree,
}: SessionOverviewProps) {
```

- [ ] **Step 2: Update SessionDetail to stop passing the dead props**

In `SessionDetail.tsx`, remove from `SessionDetailProps` (lines 17–42):

- `costUsd?: number;`
- `inputTokens?: number;`
- `outputTokens?: number;`
- `cacheReadTokens?: number;`
- `cacheCreationTokens?: number;`

Remove from the function destructure (lines 44–51).

Update the `<SessionOverview>` call (lines 167–178) to remove the five dead props:

```tsx
        {openSections.has("overview") && (
          <SessionOverview
            parsed={resolvedParsed}
            healthScore={healthScore}
            healthReasons={healthReasons}
            durationMinutes={durationMinutes}
            tree={session.tree}
          />
        )}
```

- [ ] **Step 3: Update SessionsTab to stop passing the dead props**

In `SessionsTab.tsx`:

Remove `costUsd: 0,` from the enrichment object (line 42).

Remove the `costUsd={selectedSession?.costUsd}` line from the `<SessionDetail>` call (line 83).

The enrichment object now only sets `healthScore`, `model`, `durationMinutes`, `displayName`.

- [ ] **Step 4: Type-check**

```bash
cd /home/tron/dev/projects/agent-cc
npm run check
```

Expected: PASS — TypeScript clean. If `EnrichedSession` interface in `SessionList.tsx` still has a required `costUsd: number` field that breaks the build, leave that field in the interface for now (it's still consumed by `SessionRow`'s cost badge — that's a separate concern from the broken Overview); just stop passing `costUsd: 0` from SessionsTab. If the interface requires it, set it to `0` inline at the call site or change the interface to `costUsd?: number`. Whichever the existing types prefer.

- [ ] **Step 5: Run all sessions tests**

```bash
npx vitest run tests/session-overview.test.ts tests/sessions-overview-helpers.test.ts --reporter=dot
```

Expected: PASS — clean.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/analytics/sessions/SessionOverview.tsx \
        client/src/components/analytics/sessions/SessionDetail.tsx \
        client/src/components/analytics/sessions/SessionsTab.tsx
git commit -m "$(cat <<'EOF'
refactor(sessions): drop dead cost/cache prop chain

SessionOverview now self-computes cost/cache from parsed + tree. The
upstream prop chain (SessionsTab → SessionDetail → SessionOverview)
delivered hardcoded zeros and undefineds; removing it eliminates the
foot-gun and shrinks the SessionDetailProps interface.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 1.6: TokenBreakdown — fix Role labels (User / Assistant / Subagent: type)

**Files:**
- Modify: `client/src/components/analytics/sessions/TokenBreakdown.tsx`
- Test: `tests/token-breakdown.test.ts` (existing or create)

- [ ] **Step 1: Write the failing test**

Create or update `tests/token-breakdown.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TokenBreakdown } from "@/components/analytics/sessions/TokenBreakdown";
import type {
  AssistantRecord, UserRecord,
  SerializedSessionTreeForClient,
} from "@shared/session-types";

function makeAssistant(uuid: string, model = "claude-sonnet-4-6"): AssistantRecord {
  return {
    uuid, parentUuid: "", timestamp: "2026-04-13T10:00:00Z", requestId: "",
    isSidechain: false, model, stopReason: "end_turn", toolCalls: [],
    hasThinking: false, textPreview: "",
    usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheCreationTokens: 0,
             serviceTier: "", inferenceGeo: "", speed: "",
             serverToolUse: { webSearchRequests: 0, webFetchRequests: 0 } },
  };
}

describe("TokenBreakdown role labels", () => {
  it("shows 'Assistant' label, not 'A' or 'sA'", () => {
    const messages: AssistantRecord[] = [makeAssistant("1")];
    render(<TokenBreakdown assistantMessages={messages} userMessages={[]} />);
    // The Role column should contain 'Assistant', not 'sA' or 'A'
    expect(screen.queryByText("sA")).toBeNull();
    expect(screen.getByText("Assistant")).toBeTruthy();
  });

  it("shows 'Subagent: <type>' label for subagent rows when tree present", () => {
    const tree = {
      root: { kind: "session-root", id: "root", parentId: null, children: [], timestamp: "",
              selfCost: {} as any, rollupCost: {} as any, sessionId: "", slug: "",
              firstMessage: "", firstTs: "", lastTs: "", filePath: "", projectKey: "",
              gitBranch: "" } as any,
      nodesById: {
        "asst:turn1": {
          kind: "assistant-turn", id: "asst:turn1", parentId: "sub:agent1",
          children: [], timestamp: "2026-04-13T10:00:00Z",
          selfCost: {} as any, rollupCost: {} as any,
          uuid: "turn1", model: "claude-sonnet-4-6", stopReason: "end_turn",
          usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheCreationTokens: 0,
                   serviceTier: "", inferenceGeo: "", speed: "",
                   serverToolUse: { webSearchRequests: 0, webFetchRequests: 0 } },
          textPreview: "", hasThinking: false, isSidechain: false,
        } as any,
        "sub:agent1": {
          kind: "subagent-root", id: "sub:agent1", parentId: "root", children: [],
          timestamp: "2026-04-13T10:00:00Z", selfCost: {} as any, rollupCost: {} as any,
          agentId: "agent1", agentType: "Explore", description: "", prompt: "",
          sessionId: "", filePath: "", dispatchedByTurnId: null,
          dispatchedByToolCallId: null, linkage: { method: "orphan", confidence: "none", reason: "" },
        } as any,
      },
      subagentsByAgentId: {
        "agent1": { agentType: "Explore" } as any,
      },
      totals: {} as any, warnings: [],
    } as unknown as SerializedSessionTreeForClient;

    render(<TokenBreakdown assistantMessages={[]} userMessages={[]} tree={tree} />);
    expect(screen.getByText("Subagent: Explore")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/token-breakdown.test.ts -t "role labels" --reporter=dot
```

Expected: FAIL — current code renders `<Badge>A</Badge>` (line 229), no "Assistant" or "Subagent: Explore" text exists.

- [ ] **Step 3: Add a role-label helper and use it in the renderer**

In `TokenBreakdown.tsx`, add this helper after `abbreviateAgentType` (around line 158):

```typescript
/**
 * Render the human-readable role label for a token row. Tree-aware: when
 * the row's owner is a subagent, returns `Subagent: <type>`; otherwise
 * returns `Assistant` or `User` based on the row's role. Replaces the
 * cryptic single-letter `A`/`U` badges from the pre-makeover layout.
 */
function roleLabel(
  row: { role: "user" | "assistant"; owner: { kind: string; agentId: string | null } },
  tree: SerializedSessionTreeForClient | null | undefined,
): string {
  if (row.role === "user") return "User";
  if (tree && row.owner.kind === "subagent-root" && row.owner.agentId) {
    const sub = tree.subagentsByAgentId?.[row.owner.agentId] as { agentType?: string } | undefined;
    const type = sub?.agentType ?? "subagent";
    return `Subagent: ${type}`;
  }
  return "Assistant";
}
```

Replace the role cell rendering in the table body (lines 227–231):

```tsx
                  <td className="py-1 px-1">
                    <Badge variant={row.role === "assistant" ? "default" : "outline"} className="text-[9px] px-1 py-0">
                      {roleLabel(row, tree)}
                    </Badge>
                  </td>
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/token-breakdown.test.ts -t "role labels" --reporter=dot
```

Expected: PASS — both role-label tests green.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/analytics/sessions/TokenBreakdown.tsx tests/token-breakdown.test.ts
git commit -m "$(cat <<'EOF'
fix(sessions): TokenBreakdown role labels — Assistant / Subagent: <type>

Replaces the cryptic single-letter A/U badges with full labels. Tree-aware
rows show 'Subagent: Explore' etc. for subagent-owned turns.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 1.7: TokenBreakdown — sticky header + max-h-[60vh] scroll + solid background

**Files:**
- Modify: `client/src/components/analytics/sessions/TokenBreakdown.tsx`
- Test: `tests/token-breakdown.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

Append to `tests/token-breakdown.test.ts`:

```typescript
describe("TokenBreakdown viewport constraint", () => {
  it("wraps the table in a max-h-[60vh] overflow-auto container", () => {
    const messages = [makeAssistant("1")];
    const { container } = render(
      <TokenBreakdown assistantMessages={messages} userMessages={[]} />,
    );
    const scrollContainer = container.querySelector("[data-token-table-scroll]");
    expect(scrollContainer).toBeTruthy();
    expect(scrollContainer?.className).toContain("max-h-[60vh]");
    expect(scrollContainer?.className).toContain("overflow-auto");
  });

  it("uses sticky header with solid bg-card background, not transparent", () => {
    const messages = [makeAssistant("1")];
    const { container } = render(
      <TokenBreakdown assistantMessages={messages} userMessages={[]} />,
    );
    const thead = container.querySelector("thead");
    expect(thead?.className).toContain("sticky");
    expect(thead?.className).toContain("top-0");
    // Solid background — must NOT be `bg-transparent` or absent
    expect(thead?.className).toMatch(/bg-(card|background)/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/token-breakdown.test.ts -t "viewport constraint" --reporter=dot
```

Expected: FAIL — no `data-token-table-scroll` attribute, no sticky thead.

- [ ] **Step 3: Apply the layout changes**

In `TokenBreakdown.tsx`, replace lines 203–253 (the `<div className="overflow-x-auto">` table wrapper) with:

```tsx
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/token-breakdown.test.ts --reporter=dot
```

Expected: PASS — viewport tests + role-label tests all green.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/analytics/sessions/TokenBreakdown.tsx tests/token-breakdown.test.ts
git commit -m "$(cat <<'EOF'
fix(sessions): TokenBreakdown viewport constraint + sticky header

Wraps the table in max-h-[60vh] overflow-auto so long sessions stay
section-sized. Header is sticky with solid bg-card background — never
transparent, otherwise scrolling rows bleed through.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 1.8: Note on TokenBreakdown Model column

The Model column is **already correctly tree-aware** — `buildTokenRowsFromTree` (lines 93–134) walks `tree.nodesById` for each `assistant-turn` node and reads `turn.model` (line 128). The user's report ("Model always says Opus 4.6") is most likely cosmetic: `shortModel(row.model)` (line 236) abbreviates aggressively and may collapse multiple models to the same short string. **No code change required for the underlying logic** — but verify in the running app that subagent rows show different abbreviated names than the parent. If the abbreviation is too lossy, file a follow-up issue rather than expanding scope here.

- [ ] **Step 1: Verify in dev server**

```bash
cd /home/tron/dev/projects/agent-cc
npm run dev
```

Open `http://localhost:5100/analytics?tab=sessions`, pick a session that had subagents, expand Token Breakdown, scroll. Confirm:
- Role column shows "Assistant" / "Subagent: <type>", never "sA" or "A"
- Section is height-constrained, scrolls with sticky header
- Header has a solid background (no row bleed-through)
- Model column shows per-row models (may be aggressively abbreviated — note that for follow-up if needed)

Stop the dev server with Ctrl-C when done.

- [ ] **Step 2: Run full pre-PR test pass**

```bash
npm run check && npx vitest run tests/sessions-overview-helpers.test.ts tests/session-overview.test.ts tests/token-breakdown.test.ts tests/new-user-safety.test.ts --reporter=dot
```

Expected: PASS across the board.

- [ ] **Step 3: Push and open PR**

```bash
git push -u origin feature/sessions-makeover-pr1-bugfixes
gh pr create --title "fix(sessions): Overview metrics + TokenBreakdown viewport — PR 1 of 4" --body "$(cat <<'EOF'
## Summary
- Add three self-compute helpers to SessionOverview (computeCostFromTree, computeSidechainCount, computeCacheStatsFromTree)
- Wire them into the render path; drop dead cost/cache prop chain from SessionsTab → SessionDetail → SessionOverview
- TokenBreakdown: replace cryptic A/U role badges with Assistant / Subagent: <type> labels
- TokenBreakdown: max-h-[60vh] + sticky header with solid bg-card background

Root cause for the broken Overview metrics is documented in the design spec: the upstream prop chain hardcoded zeros and never set cache fields. Fix is architectural — make SessionOverview self-compute from the data already in scope (parsed + tree).

Part 1 of 4 in the sessions makeover. Layout reshuffle, tool-timeline replacement, and section cleanup land in PR 2 / 3 / 4.

## Test plan
- [x] vitest tests/sessions-overview-helpers.test.ts (9 new tests)
- [x] vitest tests/session-overview.test.ts (cost/cache/sidechain from tree)
- [x] vitest tests/token-breakdown.test.ts (role labels + viewport constraint)
- [x] npm run check
- [x] manual: open /analytics?tab=sessions, pick a session with subagents, confirm Cost / Cache Hit / Sidechains all show real values
- [x] new-user-safety guardrail passes (pre-commit hook)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## PR 2 — Layout pass: SessionFilterBar + filter-pill-driven sections

**Branch:** `feature/sessions-makeover-pr2-layout`

**Step 0 — Branch from main (after PR 1 merges):**

```bash
git checkout main
git pull
git checkout -b feature/sessions-makeover-pr2-layout
```

---

### Task 2.1: `SessionFilterBar` — pure helpers + state shape

**Files:**
- Create: `client/src/components/analytics/sessions/SessionFilterBar.tsx`
- Test: `tests/session-filter-bar.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/session-filter-bar.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  applySessionPreset,
  toggleSessionPill,
  isSessionPillActive,
  type SessionFilterBarState,
} from "@/components/analytics/sessions/SessionFilterBar";

describe("SessionFilterBar pure helpers", () => {
  it("applySessionPreset: default — Overview, Tools, Tokens, LinkedTask on, errorsOnly off", () => {
    const state = applySessionPreset("default");
    expect(state.overview).toBe(true);
    expect(state.tools).toBe(true);
    expect(state.tokens).toBe(true);
    expect(state.linkedTask).toBe(true);
    expect(state.errorsOnly).toBe(false);
  });

  it("applySessionPreset: deep-dive — every pill on, errorsOnly off", () => {
    const state = applySessionPreset("deep-dive");
    expect(state.overview).toBe(true);
    expect(state.tools).toBe(true);
    expect(state.tokens).toBe(true);
    expect(state.linkedTask).toBe(true);
    expect(state.errorsOnly).toBe(false);
  });

  it("applySessionPreset: errors — Overview + Tools on, errorsOnly on", () => {
    const state = applySessionPreset("errors");
    expect(state.overview).toBe(true);
    expect(state.tools).toBe(true);
    expect(state.tokens).toBe(false);
    expect(state.linkedTask).toBe(false);
    expect(state.errorsOnly).toBe(true);
  });

  it("toggleSessionPill: flips a single pill", () => {
    const start = applySessionPreset("default");
    const next = toggleSessionPill(start, "tokens");
    expect(next.tokens).toBe(false);
    expect(next.overview).toBe(true); // unchanged
    const back = toggleSessionPill(next, "tokens");
    expect(back.tokens).toBe(true);
  });

  it("isSessionPillActive: reads the matching key", () => {
    const state: SessionFilterBarState = {
      overview: true, tools: false, tokens: true, linkedTask: false, errorsOnly: true,
    };
    expect(isSessionPillActive(state, "overview")).toBe(true);
    expect(isSessionPillActive(state, "tools")).toBe(false);
    expect(isSessionPillActive(state, "tokens")).toBe(true);
    expect(isSessionPillActive(state, "linkedTask")).toBe(false);
    expect(isSessionPillActive(state, "errorsOnly")).toBe(true);
  });

  it("preset visually activates the pills it contains", () => {
    // The render contract: after applying `deep-dive`, every pill key is true,
    // so `isSessionPillActive` returns true for each. This guarantees the JSX
    // pill buttons all render in their active style.
    const state = applySessionPreset("deep-dive");
    for (const pill of ["overview", "tools", "tokens", "linkedTask"] as const) {
      expect(isSessionPillActive(state, pill)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/session-filter-bar.test.ts --reporter=dot
```

Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Create SessionFilterBar.tsx (helpers only first)**

Create `client/src/components/analytics/sessions/SessionFilterBar.tsx`:

```typescript
// client/src/components/analytics/sessions/SessionFilterBar.tsx
//
// Filter pill bar for the Sessions tab detail panel. Mirrors the Messages
// tab FilterBar pattern (see messages/FilterBar.tsx) but operates at the
// section level: each pill toggles whether a section renders, and presets
// are quick combinations of pills. Presets visually activate the pills
// they contain — picking `deep-dive` lights up every pill, and the user
// can then click an individual pill to toggle it off without leaving the
// preset visually selected (the pills retain whatever combination the
// user lands on).
//
// The pure helpers (applySessionPreset, toggleSessionPill, isSessionPillActive)
// are exported so tests can drive them without a DOM. Matches the
// convention used by messages/FilterBar.tsx.

import { useCallback } from "react";
import {
  LayoutDashboard,
  Wrench,
  Hash,
  Link2,
  AlertOctagon,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SessionFilterPill =
  | "overview"
  | "tools"
  | "tokens"
  | "linkedTask"
  | "errorsOnly";

export type SessionFilterPreset = "default" | "deep-dive" | "errors";

export interface SessionFilterBarState {
  overview: boolean;
  tools: boolean;
  tokens: boolean;
  linkedTask: boolean;
  /** Cross-cutting modifier — when on, the Tools section filters to errors. */
  errorsOnly: boolean;
}

// ---------------------------------------------------------------------------
// Pure helpers — exported for tests
// ---------------------------------------------------------------------------

export function applySessionPreset(preset: SessionFilterPreset): SessionFilterBarState {
  switch (preset) {
    case "default":
      return { overview: true, tools: true, tokens: true, linkedTask: true, errorsOnly: false };
    case "deep-dive":
      return { overview: true, tools: true, tokens: true, linkedTask: true, errorsOnly: false };
    case "errors":
      return { overview: true, tools: true, tokens: false, linkedTask: false, errorsOnly: true };
  }
}

export function toggleSessionPill(
  state: SessionFilterBarState,
  pill: SessionFilterPill,
): SessionFilterBarState {
  return { ...state, [pill]: !state[pill] };
}

export function isSessionPillActive(
  state: SessionFilterBarState,
  pill: SessionFilterPill,
): boolean {
  return state[pill];
}

// ---------------------------------------------------------------------------
// Pill metadata
// ---------------------------------------------------------------------------

interface PillMeta {
  id: SessionFilterPill;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  activeBg: string;
  inactiveHover: string;
  title: string;
}

const PILLS: ReadonlyArray<PillMeta> = [
  {
    id: "overview", label: "Overview", Icon: LayoutDashboard,
    activeBg: "bg-blue-500 text-white border-blue-500",
    inactiveHover: "hover:bg-blue-500/10 hover:text-blue-400 hover:border-blue-500/40",
    title: "Session metric grid + models + subagents",
  },
  {
    id: "tools", label: "Tools", Icon: Wrench,
    activeBg: "bg-emerald-500 text-white border-emerald-500",
    inactiveHover: "hover:bg-emerald-500/10 hover:text-emerald-400 hover:border-emerald-500/40",
    title: "Tool execution timeline grouped by subagent",
  },
  {
    id: "tokens", label: "Tokens", Icon: Hash,
    activeBg: "bg-amber-500 text-white border-amber-500",
    inactiveHover: "hover:bg-amber-500/10 hover:text-amber-400 hover:border-amber-500/40",
    title: "Per-turn token growth table",
  },
  {
    id: "linkedTask", label: "Linked Task", Icon: Link2,
    activeBg: "bg-violet-500 text-white border-violet-500",
    inactiveHover: "hover:bg-violet-500/10 hover:text-violet-400 hover:border-violet-500/40",
    title: "Workflow task linkage (when present)",
  },
  {
    id: "errorsOnly", label: "Errors Only", Icon: AlertOctagon,
    activeBg: "bg-red-500 text-white border-red-500",
    inactiveHover: "hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/40",
    title: "Filter Tools section to errored tool results only",
  },
];

const PRESETS: ReadonlyArray<{ id: SessionFilterPreset; label: string; title: string }> = [
  { id: "default",   label: "Default",   title: "Overview + Tools + Tokens + Linked Task" },
  { id: "deep-dive", label: "Deep-dive", title: "Show every section" },
  { id: "errors",    label: "Errors",    title: "Overview + Tools, errored results only" },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface SessionFilterBarProps {
  state: SessionFilterBarState;
  onChange: (next: SessionFilterBarState) => void;
}

export function SessionFilterBar({ state, onChange }: SessionFilterBarProps) {
  const togglePill = useCallback(
    (pill: SessionFilterPill) => {
      onChange(toggleSessionPill(state, pill));
    },
    [state, onChange],
  );

  const setPreset = useCallback(
    (preset: SessionFilterPreset) => {
      onChange(applySessionPreset(preset));
    },
    [onChange],
  );

  return (
    <div
      className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-border/40 bg-background"
      data-testid="session-filter-bar"
      role="toolbar"
      aria-label="Session detail filter bar"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {PILLS.map((pill) => {
          const active = isSessionPillActive(state, pill.id);
          return (
            <button
              key={pill.id}
              type="button"
              onClick={() => togglePill(pill.id)}
              data-pill={pill.id}
              data-active={active}
              aria-pressed={active}
              title={pill.title}
              className={[
                "inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full",
                "text-[11px] font-medium border transition-colors",
                active
                  ? pill.activeBg
                  : `border-border/50 text-muted-foreground bg-background ${pill.inactiveHover}`,
              ].join(" ")}
            >
              <pill.Icon className="h-3 w-3" />
              {pill.label}
            </button>
          );
        })}
      </div>

      <div className="h-5 w-px bg-border/40 mx-1" aria-hidden="true" />

      <div className="flex items-center gap-1" role="group" aria-label="Filter presets">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 mr-1">
          Mode
        </span>
        {PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => setPreset(preset.id)}
            data-preset={preset.id}
            title={preset.title}
            className={[
              "inline-flex items-center h-7 px-2.5 rounded-md",
              "text-[11px] font-medium border border-border/40 bg-background",
              "text-muted-foreground hover:text-foreground hover:bg-muted/40",
              "transition-colors",
            ].join(" ")}
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/session-filter-bar.test.ts --reporter=dot
```

Expected: PASS — six tests green.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/analytics/sessions/SessionFilterBar.tsx tests/session-filter-bar.test.ts
git commit -m "$(cat <<'EOF'
feat(sessions): add SessionFilterBar component

Pill toggles + mode presets, mirroring messages/FilterBar.tsx. Pure
helpers (applySessionPreset, toggleSessionPill, isSessionPillActive)
exported for testing. Presets are quick-set combinations that visually
activate every pill they contain.

Not yet wired into SessionDetail — task 2.2.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2.2: Wire `SessionFilterBar` into `SessionDetail`, replace collapsibles

**Files:**
- Modify: `client/src/components/analytics/sessions/SessionDetail.tsx`

- [ ] **Step 1: Add filter state and import**

In `SessionDetail.tsx`, add the import at the top of the imports section:

```typescript
import { SessionFilterBar, applySessionPreset, type SessionFilterBarState } from "./SessionFilterBar";
```

- [ ] **Step 2: Replace `openSections` state with filter-bar state**

Replace the `openSections` useState (line 56) and its `toggleSection` handler (lines 62–69) with:

```typescript
  const [filterState, setFilterState] = useState<SessionFilterBarState>(
    () => applySessionPreset("default"),
  );
```

Delete the `toggleSection` function entirely.

- [ ] **Step 3: Replace SectionHeader+conditional pattern with filter-driven sections**

In the JSX (lines 158–273), replace the entire collapsible block (from `<div className="flex-1 overflow-y-auto">` through the end of the Lifecycle Events block) with:

```tsx
      {/* Filter bar */}
      <SessionFilterBar state={filterState} onChange={setFilterState} />

      {/* Sections — driven by filter pill state */}
      <div className="flex-1 overflow-y-auto">
        {filterState.overview && (
          <section data-section="overview" className="border-b border-border/20">
            <SessionOverview
              parsed={resolvedParsed}
              healthScore={healthScore}
              healthReasons={healthReasons}
              durationMinutes={durationMinutes}
              tree={session.tree}
            />
          </section>
        )}

        {filterState.linkedTask && linkedTaskId && (
          <section data-section="linked-task" className="border-b border-border/20">
            <LinkedTask
              taskId={linkedTaskId}
              taskTitle={linkedTaskTitle}
              milestone={linkedMilestone}
              isManualLink={isManualLink}
              linkScore={linkScore}
              linkSignals={linkSignals}
            />
          </section>
        )}

        {filterState.tools && (
          <section data-section="tools" className="border-b border-border/20">
            {resolvedParsed ? (
              <ToolTimeline
                tools={resolvedParsed.toolTimeline}
                sessionStartTs={resolvedParsed.meta.firstTs}
                tree={session.tree}
              />
            ) : (
              <div className="p-4 text-sm text-muted-foreground">Parsed session data not available</div>
            )}
          </section>
        )}

        {filterState.tokens && (
          <section data-section="tokens" className="border-b border-border/20">
            {resolvedParsed ? (
              <TokenBreakdown
                assistantMessages={resolvedParsed.assistantMessages}
                userMessages={resolvedParsed.userMessages}
                tree={session.tree}
              />
            ) : (
              <div className="p-4 text-sm text-muted-foreground">Parsed session data not available</div>
            )}
          </section>
        )}
      </div>
```

The `SectionHeader` component (lines 279–289) is now unused. Delete it too.

Also remove the imports for the now-dead components — keep `ToolTimeline`, `TokenBreakdown`, `LinkedTask`, `SessionOverview`. Remove `FileImpact`, `HealthDetails`, `LifecycleEvents`, `ChevronRight` (unless still used in the header). Actually leave the deletions for PR4 — for PR2 just stop calling them; the imports can stay until we delete the files in PR4.

- [ ] **Step 4: Type-check**

```bash
npm run check
```

Expected: PASS. If there are unused-import warnings, leave them — PR4 cleans up.

- [ ] **Step 5: Manual smoke test**

```bash
npm run dev
```

Open `http://localhost:5100/analytics?tab=sessions`, pick a session. Confirm:
- Filter bar appears at the top of the right pane with pills + presets
- Default preset has Overview / Tools / Tokens / Linked Task active
- Toggling a pill hides/shows the corresponding section
- Clicking "Deep-dive" preset visually activates all pills
- Clicking "Errors" preset hides Tokens and Linked Task
- After picking a preset, clicking an individual pill toggles it off without breaking the layout

Stop dev server.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/analytics/sessions/SessionDetail.tsx
git commit -m "$(cat <<'EOF'
feat(sessions): wire SessionFilterBar, replace collapsibles with pill-driven sections

Sections render based on filterState pills instead of openSections set.
SectionHeader component deleted. The four legacy components (FileImpact,
HealthDetails, LifecycleEvents) are no longer rendered — file deletion
follows in PR 4 along with the Activity row + inline health badge salvage.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2.3: Strip health/status pills from `SessionList` + `SessionFilters`

**Files:**
- Modify: `client/src/components/analytics/sessions/SessionList.tsx`
- Modify: `client/src/components/analytics/sessions/SessionFilters.tsx`
- Test: `tests/session-list-filters.test.ts` (existing — update)

- [ ] **Step 1: Update or write the failing test**

In `tests/session-list-filters.test.ts`, replace the health/status pill assertions with negative ones (the old controls should NOT be present) and keep the search/sort/project assertions. Add a model-dropdown assertion if it doesn't exist. The exact edits depend on the existing file — read it first, then make minimal changes that cover:

```typescript
import { describe, it, expect } from "vitest";
import { applyFilters, applySorting } from "@/components/analytics/sessions/SessionList";

describe("SessionList — health/status filters removed", () => {
  it("applyFilters ignores health filter (legacy field)", () => {
    const sessions = [
      { id: "1", isActive: true, healthScore: "good" as const, isEmpty: false },
      { id: "2", isActive: false, healthScore: "poor" as const, isEmpty: false },
    ];
    // After the strip, applyFilters is a passthrough (no health/status branches).
    const result = applyFilters(sessions, {});
    expect(result).toEqual(sessions);
  });
});
```

- [ ] **Step 2: Run test to verify it fails (or that the file shape matches)**

```bash
npx vitest run tests/session-list-filters.test.ts --reporter=dot
```

If it passes immediately because `applyFilters({})` already returns input unchanged, that's fine — proceed to step 3.

- [ ] **Step 3: Strip the filters in SessionList**

In `SessionList.tsx`, replace the `applyFilters` function (lines 14–38) with:

```typescript
/**
 * Filter passthrough — kept as an exported function for callsite stability
 * after the health/status pills were removed. The Sessions tab no longer
 * filters on those dimensions; search / sort / project / model do all the
 * filtering work now and live inline in the SessionList render path.
 */
export function applyFilters<T>(sessions: T[], _filters: unknown): T[] {
  return sessions;
}
```

- [ ] **Step 4: Strip the controls in SessionFilters**

In `SessionFilters.tsx`, find the JSX that renders health pills and status pills (look for `HealthFilter` / `StatusFilter` references). Delete those rendered controls and the `health` / `status` / `hasErrors` keys from the state passed back via `onChange`. Keep the search input, sort dropdown, project dropdown, model dropdown.

If the file is large, the minimum change is: remove the rendered pill JSX (the buttons). Leaving the type fields in `SessionFilterState` is fine — the cleanup of those types can be a follow-up.

- [ ] **Step 5: Type-check + run tests**

```bash
npm run check && npx vitest run tests/session-list-filters.test.ts --reporter=dot
```

Expected: PASS.

- [ ] **Step 6: Manual smoke test**

```bash
npm run dev
```

Open Sessions tab. Confirm:
- Left pane has only search + sort + project + model (no health pills, no status pills)
- Selecting a session still works
- Sort dropdown still works

Stop dev server.

- [ ] **Step 7: Commit**

```bash
git add client/src/components/analytics/sessions/SessionList.tsx \
        client/src/components/analytics/sessions/SessionFilters.tsx \
        tests/session-list-filters.test.ts
git commit -m "$(cat <<'EOF'
refactor(sessions): strip health/status pills from session list

Health is the wrong dimension for picking a session. Left pane is now
search + sort + project + model only. applyFilters becomes a passthrough
to keep the callsite stable; type field cleanup is deferred to a
follow-up so this PR stays tight on layout.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2.4: PR 2 final test pass and push

- [ ] **Step 1: Full type-check + safety + sessions tests**

```bash
npm run check && npx vitest run tests/session-filter-bar.test.ts tests/session-list-filters.test.ts tests/new-user-safety.test.ts --reporter=dot
```

Expected: PASS.

- [ ] **Step 2: Push and open PR**

```bash
git push -u origin feature/sessions-makeover-pr2-layout
gh pr create --title "feat(sessions): SessionFilterBar + filter-driven sections — PR 2 of 4" --body "$(cat <<'EOF'
## Summary
- New SessionFilterBar component with pills (Overview / Tools / Tokens / Linked Task / Errors Only) + mode presets (Default / Deep-dive / Errors)
- Presets visually activate the pills they contain — pills remain independently toggleable
- SessionDetail rewired from collapsibles to filter-pill-driven sections
- SessionList strips health pills + status pills + hasErrors toggle (left pane is search + sort + project + model only)

Layout pass; no behavior changes to the section contents themselves. PR 3 replaces the bespoke ToolTimeline; PR 4 deletes the orphaned section components.

## Test plan
- [x] vitest tests/session-filter-bar.test.ts (6 helper tests)
- [x] vitest tests/session-list-filters.test.ts (passthrough behavior)
- [x] npm run check
- [x] manual: pills toggle sections, presets visually activate pills, manual pill clicks work after preset
- [x] manual: left pane has only search/sort/project/model

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## PR 3 — Tool Timeline replacement

**Branch:** `feature/sessions-makeover-pr3-tool-timeline`

**Step 0 — Branch from main:**

```bash
git checkout main
git pull
git checkout -b feature/sessions-makeover-pr3-tool-timeline
```

---

### Task 3.1: `SessionToolTimeline` — fetch + group + render via Messages registry

**Files:**
- Create: `client/src/components/analytics/sessions/SessionToolTimeline.tsx`
- Test: `tests/session-tool-timeline.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/session-tool-timeline.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  groupTimelineByOwner,
  filterToolMessagesForErrorsOnly,
  type ToolGroup,
} from "@/components/analytics/sessions/SessionToolTimeline";
import type { TimelineMessage, ToolCallMessage, ToolResultMessage } from "@shared/session-types";

function makeToolCall(uuid: string, callId: string, name: string,
                     subagentId: string | null = null,
                     ts = "2026-04-13T10:00:00Z"): ToolCallMessage {
  return {
    type: "tool_call", uuid, callId, name, input: {},
    timestamp: ts,
    subagentContext: subagentId
      ? { agentId: subagentId, agentType: "Explore", description: "" }
      : null,
  };
}

function makeToolResult(uuid: string, toolUseId: string, isError = false,
                        ts = "2026-04-13T10:00:01Z"): ToolResultMessage {
  return {
    type: "tool_result", uuid, toolUseId, content: "ok", isError,
    timestamp: ts,
  };
}

describe("groupTimelineByOwner", () => {
  it("creates separate groups for parent-session vs subagent owners", () => {
    const messages: TimelineMessage[] = [
      makeToolCall("a", "c1", "Bash", null),
      makeToolCall("b", "c2", "Read", "agent1"),
      makeToolCall("c", "c3", "Grep", "agent1"),
      makeToolCall("d", "c4", "Edit", null),
    ];
    const groups = groupTimelineByOwner(messages);
    expect(groups).toHaveLength(3);
    expect(groups[0].agentId).toBeNull();
    expect(groups[0].toolCalls).toHaveLength(1);
    expect(groups[1].agentId).toBe("agent1");
    expect(groups[1].toolCalls).toHaveLength(2);
    expect(groups[2].agentId).toBeNull();
    expect(groups[2].toolCalls).toHaveLength(1);
  });

  it("preserves chronological order within and across groups", () => {
    const messages: TimelineMessage[] = [
      makeToolCall("a", "c1", "Read", null, "2026-04-13T10:00:00Z"),
      makeToolCall("b", "c2", "Read", null, "2026-04-13T10:00:05Z"),
      makeToolCall("c", "c3", "Read", null, "2026-04-13T10:00:02Z"),
    ];
    const groups = groupTimelineByOwner(messages);
    expect(groups[0].toolCalls.map(t => t.callId)).toEqual(["c1", "c3", "c2"]);
  });

  it("ignores non-tool_call message types", () => {
    const messages: TimelineMessage[] = [
      makeToolCall("a", "c1", "Bash", null),
      { type: "user_text", uuid: "x", text: "hi", isMeta: false, timestamp: "2026-04-13T10:00:00Z" },
      makeToolCall("b", "c2", "Read", null),
    ];
    const groups = groupTimelineByOwner(messages);
    expect(groups[0].toolCalls).toHaveLength(2);
  });
});

describe("filterToolMessagesForErrorsOnly", () => {
  it("keeps only tool_calls whose paired tool_result has isError true", () => {
    const messages: TimelineMessage[] = [
      makeToolCall("a", "c1", "Bash"),
      makeToolResult("ar", "c1", false),
      makeToolCall("b", "c2", "Read"),
      makeToolResult("br", "c2", true),
      makeToolCall("c", "c3", "Grep"),
      makeToolResult("cr", "c3", true),
    ];
    const filtered = filterToolMessagesForErrorsOnly(messages);
    const callIds = filtered
      .filter((m): m is ToolCallMessage => m.type === "tool_call")
      .map(m => m.callId);
    expect(callIds).toEqual(["c2", "c3"]);
  });

  it("keeps results so the renderer can pair them", () => {
    const messages: TimelineMessage[] = [
      makeToolCall("b", "c2", "Read"),
      makeToolResult("br", "c2", true),
    ];
    const filtered = filterToolMessagesForErrorsOnly(messages);
    expect(filtered.find(m => m.type === "tool_result")).toBeTruthy();
  });

  it("returns empty array when nothing errored", () => {
    const messages: TimelineMessage[] = [
      makeToolCall("a", "c1", "Bash"),
      makeToolResult("ar", "c1", false),
    ];
    expect(filterToolMessagesForErrorsOnly(messages)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/session-tool-timeline.test.ts --reporter=dot
```

Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Create SessionToolTimeline.tsx**

Create `client/src/components/analytics/sessions/SessionToolTimeline.tsx`:

```typescript
// client/src/components/analytics/sessions/SessionToolTimeline.tsx
//
// Tool timeline for the Sessions detail panel. Reuses the Messages tab's
// per-tool renderer registry directly (option A — no extraction to a shared
// module yet; if a third consumer ever appears, refactor then). Fetches
// /api/sessions/:id/messages?include=tree&types=tool_call,tool_result and
// renders the result via the existing ToolCallBlock / ToolResultBlock
// components, grouped by subagent owner using subagentContext.agentId.
//
// This replaces the bespoke ~860-LOC ToolTimeline.tsx that did its own
// chronological grouping with hand-rolled tool rendering. The Messages
// renderers are battle-tested by messages-redesign and shipping them here
// is strictly less code to maintain.

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  TimelineMessage,
  ToolCallMessage,
  ToolResultMessage,
  MessageTimelineResponse,
} from "@shared/session-types";
import { ToolCallBlock } from "../messages/bubbles/ToolCallBlock";
import { ToolResultBlock } from "../messages/bubbles/ToolResultBlock";
import {
  PALETTE,
  type ToolOwner,
  colorClassForOwner,
} from "./subagent-colors";

// ---------------------------------------------------------------------------
// Pure helpers — exported for tests
// ---------------------------------------------------------------------------

export interface ToolGroup {
  agentId: string | null;
  agentType: string | null;
  toolCalls: ToolCallMessage[];
  /** Indexed by callId, for pairing tool_calls with their tool_results. */
  resultsByCallId: Map<string, ToolResultMessage>;
}

/**
 * Sort messages chronologically and split them into runs grouped by the
 * subagentContext.agentId of consecutive tool_calls. A null agentId means
 * the tool ran in the parent session (session-root). Non-tool_call messages
 * are dropped from the grouping but their tool_results (if any) are
 * collected into resultsByCallId for pairing inside the active group.
 *
 * The "consecutive runs" model matches how the user reads timelines:
 * "first the parent did X, then it dispatched a subagent that did Y and Z,
 * then the parent did W". Switching back to the same owner starts a new
 * group (we don't merge non-adjacent runs).
 */
export function groupTimelineByOwner(messages: TimelineMessage[]): ToolGroup[] {
  // Split into tool_calls (timeline backbone) and tool_results (pairing source).
  const sorted = [...messages].sort(
    (a, b) => (a.timestamp ?? "").localeCompare(b.timestamp ?? ""),
  );
  const resultsByCallId = new Map<string, ToolResultMessage>();
  for (const m of sorted) {
    if (m.type === "tool_result") {
      resultsByCallId.set(m.toolUseId, m);
    }
  }

  const groups: ToolGroup[] = [];
  let current: ToolGroup | null = null;

  for (const m of sorted) {
    if (m.type !== "tool_call") continue;
    const agentId = m.subagentContext?.agentId ?? null;
    const agentType = m.subagentContext?.agentType ?? null;
    if (!current || current.agentId !== agentId) {
      current = { agentId, agentType, toolCalls: [], resultsByCallId };
      groups.push(current);
    }
    current.toolCalls.push(m);
  }
  return groups;
}

/**
 * For errors-only mode: keep only tool_calls whose paired tool_result has
 * isError true, plus the matching tool_results so the renderer can still
 * pair them. Other message types are dropped.
 */
export function filterToolMessagesForErrorsOnly(
  messages: TimelineMessage[],
): TimelineMessage[] {
  const erroredCallIds = new Set<string>();
  for (const m of messages) {
    if (m.type === "tool_result" && m.isError) {
      erroredCallIds.add(m.toolUseId);
    }
  }
  return messages.filter((m) => {
    if (m.type === "tool_call") return erroredCallIds.has(m.callId);
    if (m.type === "tool_result") return erroredCallIds.has(m.toolUseId);
    return false;
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface SessionToolTimelineProps {
  sessionId: string;
  errorsOnly: boolean;
}

export function SessionToolTimeline({ sessionId, errorsOnly }: SessionToolTimelineProps) {
  const url = `/api/sessions/${sessionId}/messages?include=tree&types=tool_call,tool_result`;
  const { data, isLoading, isError } = useQuery<MessageTimelineResponse>({
    queryKey: [url],
    enabled: !!sessionId,
  });

  const groups = useMemo(() => {
    if (!data?.messages) return [];
    const filtered = errorsOnly
      ? filterToolMessagesForErrorsOnly(data.messages)
      : data.messages;
    return groupTimelineByOwner(filtered);
  }, [data?.messages, errorsOnly]);

  if (isLoading) {
    return <div className="p-4 text-sm text-muted-foreground">Loading tool timeline...</div>;
  }
  if (isError) {
    return <div className="p-4 text-sm text-red-500">Failed to load tool timeline</div>;
  }
  if (groups.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        {errorsOnly ? "No errored tool calls in this session" : "No tool calls in this session"}
      </div>
    );
  }

  return (
    <div className="p-3 space-y-3">
      {groups.map((group, idx) => {
        const owner: ToolOwner = group.agentId
          ? { kind: "subagent-root", agentId: group.agentId }
          : { kind: "session-root", agentId: null };
        const colorClass = colorClassForOwner(owner);
        return (
          <div key={`${group.agentId ?? "root"}-${idx}`} className="space-y-1">
            {/* Group header — only for subagent runs; parent runs render flat. */}
            {group.agentId && (
              <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-medium border ${colorClass}`}>
                <span>Subagent: {group.agentType ?? "subagent"}</span>
                <span className="text-muted-foreground">({group.toolCalls.length} tools)</span>
              </div>
            )}
            <div className="space-y-1">
              {group.toolCalls.map((tc) => {
                const result = group.resultsByCallId.get(tc.callId);
                return (
                  <div key={tc.uuid} className="space-y-0.5">
                    <ToolCallBlock message={tc} />
                    {result && <ToolResultBlock message={result} />}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/session-tool-timeline.test.ts --reporter=dot
```

Expected: PASS — six tests green.

- [ ] **Step 5: Type-check**

```bash
npm run check
```

Expected: PASS. If `ToolResultBlock` doesn't accept the exact `message` prop name, look at the existing component (`client/src/components/analytics/messages/bubbles/ToolResultBlock.tsx`) and adjust the call to match its real prop interface. Same for `ToolCallBlock`.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/analytics/sessions/SessionToolTimeline.tsx tests/session-tool-timeline.test.ts
git commit -m "$(cat <<'EOF'
feat(sessions): add SessionToolTimeline using Messages tool registry

Thin wrapper that fetches /api/sessions/:id/messages?include=tree filtered
to tool_call + tool_result, groups by subagentContext.agentId, and renders
each tool_call via the existing ToolCallBlock + ToolResultBlock from the
Messages tab. Owner color comes from the shared subagent-colors palette.

Pure helpers (groupTimelineByOwner, filterToolMessagesForErrorsOnly)
exported for testing. Not yet wired into SessionDetail — task 3.2.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3.2: Swap `ToolTimeline` → `SessionToolTimeline` in `SessionDetail`

**Files:**
- Modify: `client/src/components/analytics/sessions/SessionDetail.tsx`

- [ ] **Step 1: Update import**

In `SessionDetail.tsx`, replace:

```typescript
import { ToolTimeline } from "./ToolTimeline";
```

with:

```typescript
import { SessionToolTimeline } from "./SessionToolTimeline";
```

- [ ] **Step 2: Replace the Tools section render**

Replace the Tools section block (the one set up in task 2.2):

```tsx
        {filterState.tools && (
          <section data-section="tools" className="border-b border-border/20">
            {resolvedParsed ? (
              <ToolTimeline
                tools={resolvedParsed.toolTimeline}
                sessionStartTs={resolvedParsed.meta.firstTs}
                tree={session.tree}
              />
            ) : (
              <div className="p-4 text-sm text-muted-foreground">Parsed session data not available</div>
            )}
          </section>
        )}
```

with:

```tsx
        {filterState.tools && (
          <section data-section="tools" className="border-b border-border/20">
            <SessionToolTimeline
              sessionId={sessionId}
              errorsOnly={filterState.errorsOnly}
            />
          </section>
        )}
```

(SessionToolTimeline does its own data fetch — no `resolvedParsed` guard needed at the call site.)

- [ ] **Step 3: Type-check**

```bash
npm run check
```

Expected: PASS.

- [ ] **Step 4: Manual smoke test**

```bash
npm run dev
```

Open Sessions tab, pick a session with subagents. Expand Tools section. Confirm:
- Tool calls render with the Messages tab's tool renderer style (compact summary, expandable, owner color stripe)
- Subagent runs are visually grouped under a header showing "Subagent: <type> (N tools)"
- Toggling Errors Only filters the timeline to only errored tool calls
- Toggling Tools pill off hides the section

Stop dev server.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/analytics/sessions/SessionDetail.tsx
git commit -m "$(cat <<'EOF'
feat(sessions): swap bespoke ToolTimeline for SessionToolTimeline

SessionDetail's Tools section now uses the messages-registry-based
wrapper. Errors-only filter is plumbed through from filterState. The
old ToolTimeline.tsx is now orphaned; deletion lands in PR 4 alongside
the other section cleanups.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3.3: PR 3 final test pass and push

- [ ] **Step 1: Full test pass**

```bash
npm run check && npx vitest run tests/session-tool-timeline.test.ts tests/new-user-safety.test.ts --reporter=dot
```

Expected: PASS.

- [ ] **Step 2: Push and open PR**

```bash
git push -u origin feature/sessions-makeover-pr3-tool-timeline
gh pr create --title "feat(sessions): Tool Timeline rewritten on Messages registry — PR 3 of 4" --body "$(cat <<'EOF'
## Summary
- New SessionToolTimeline component fetches /api/sessions/:id/messages?include=tree filtered to tool_call + tool_result
- Renders each tool via the existing ToolCallBlock / ToolResultBlock from the Messages tab — no duplicated tool renderer code
- Groups consecutive tools by subagentContext.agentId with owner colors from the shared subagent-colors palette
- Errors-only mode filters to tool calls whose paired result is errored
- SessionDetail now imports SessionToolTimeline; bespoke ToolTimeline.tsx is orphaned (file deletion in PR 4)

## Test plan
- [x] vitest tests/session-tool-timeline.test.ts (6 helper tests)
- [x] npm run check
- [x] manual: open a session with subagents, expand Tools, confirm Messages-style tool rendering with owner-grouped subagent headers
- [x] manual: toggle Errors Only — only errored tool calls remain visible

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## PR 4 — Cleanup: Activity row, inline health badge, delete dead sections

**Branch:** `feature/sessions-makeover-pr4-cleanup`

**Step 0 — Branch from main:**

```bash
git checkout main
git pull
git checkout -b feature/sessions-makeover-pr4-cleanup
```

---

### Task 4.1: `buildActivitySummary` helper — duration + model switches + first error

**Files:**
- Create: `client/src/components/analytics/sessions/activity-summary.ts`
- Test: `tests/sessions-overview-helpers.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

Append to `tests/sessions-overview-helpers.test.ts`:

```typescript
import { buildActivitySummary } from "@/components/analytics/sessions/activity-summary";

describe("buildActivitySummary", () => {
  it("returns duration label from firstTs/lastTs", () => {
    const parsed = makeParsed();
    parsed.meta.firstTs = "2026-04-13T10:00:00Z";
    parsed.meta.lastTs = "2026-04-13T10:08:30Z";
    const summary = buildActivitySummary(parsed);
    expect(summary.durationLabel).toBe("8m");
  });

  it("returns hours+minutes for sessions over an hour", () => {
    const parsed = makeParsed();
    parsed.meta.firstTs = "2026-04-13T10:00:00Z";
    parsed.meta.lastTs = "2026-04-13T11:30:00Z";
    expect(buildActivitySummary(parsed).durationLabel).toBe("1h 30m");
  });

  it("detects model switches between adjacent assistant records", () => {
    const parsed = makeParsed({
      assistantMessages: [
        { uuid: "1", parentUuid: "", timestamp: "2026-04-13T10:00:00Z", requestId: "",
          isSidechain: false, model: "claude-sonnet-4-6", stopReason: "end_turn",
          toolCalls: [], hasThinking: false, textPreview: "",
          usage: {} as any },
        { uuid: "2", parentUuid: "1", timestamp: "2026-04-13T10:05:00Z", requestId: "",
          isSidechain: false, model: "claude-opus-4-6", stopReason: "end_turn",
          toolCalls: [], hasThinking: false, textPreview: "",
          usage: {} as any },
        { uuid: "3", parentUuid: "2", timestamp: "2026-04-13T10:10:00Z", requestId: "",
          isSidechain: false, model: "claude-opus-4-6", stopReason: "end_turn",
          toolCalls: [], hasThinking: false, textPreview: "",
          usage: {} as any },
      ] as any,
    });
    const summary = buildActivitySummary(parsed);
    expect(summary.modelSwitches).toEqual([
      { fromModel: "claude-sonnet-4-6", toModel: "claude-opus-4-6", at: "2026-04-13T10:05:00Z" },
    ]);
  });

  it("returns first error timestamp from toolTimeline", () => {
    const parsed = makeParsed({
      toolTimeline: [
        { callId: "c1", name: "Bash", filePath: null, command: null, pattern: null,
          timestamp: "2026-04-13T10:01:00Z", resultTimestamp: "", durationMs: null,
          isError: false, isSidechain: false, issuedByAssistantUuid: "" },
        { callId: "c2", name: "Read", filePath: null, command: null, pattern: null,
          timestamp: "2026-04-13T10:02:00Z", resultTimestamp: "", durationMs: null,
          isError: true, isSidechain: false, issuedByAssistantUuid: "" },
        { callId: "c3", name: "Edit", filePath: null, command: null, pattern: null,
          timestamp: "2026-04-13T10:03:00Z", resultTimestamp: "", durationMs: null,
          isError: true, isSidechain: false, issuedByAssistantUuid: "" },
      ] as any,
    });
    expect(buildActivitySummary(parsed).firstErrorTs).toBe("2026-04-13T10:02:00Z");
  });

  it("returns null fields when data is absent", () => {
    const summary = buildActivitySummary(makeParsed());
    expect(summary.durationLabel).toBeNull();
    expect(summary.modelSwitches).toEqual([]);
    expect(summary.firstErrorTs).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/sessions-overview-helpers.test.ts -t "buildActivitySummary" --reporter=dot
```

Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Create the helper**

Create `client/src/components/analytics/sessions/activity-summary.ts`:

```typescript
// client/src/components/analytics/sessions/activity-summary.ts
//
// Pure helper that derives the Activity row shown in SessionOverview after
// LifecycleEvents was deleted. Three salvaged facts: active duration,
// model switches between adjacent assistant turns, and the first errored
// tool call. Each is computed from data SessionOverview already has —
// no new endpoints, no new state.

import type { ParsedSession } from "@shared/session-types";

export interface ModelSwitch {
  fromModel: string;
  toModel: string;
  at: string;
}

export interface ActivitySummary {
  /** "8m" / "1h 30m" / null when timestamps absent. */
  durationLabel: string | null;
  /** Empty array when the session never switched models. */
  modelSwitches: ModelSwitch[];
  /** ISO timestamp of the first errored tool call, or null. */
  firstErrorTs: string | null;
}

export function buildActivitySummary(parsed: ParsedSession): ActivitySummary {
  const durationLabel = computeDurationLabel(parsed.meta?.firstTs, parsed.meta?.lastTs);
  const modelSwitches = computeModelSwitches(parsed.assistantMessages);
  const firstErrorTs = computeFirstErrorTs(parsed.toolTimeline);
  return { durationLabel, modelSwitches, firstErrorTs };
}

function computeDurationLabel(firstTs: string | null, lastTs: string | null): string | null {
  if (!firstTs || !lastTs) return null;
  const start = new Date(firstTs).getTime();
  const end = new Date(lastTs).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  const totalMinutes = Math.round((end - start) / 60_000);
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${m}m`;
}

function computeModelSwitches(
  assistantMessages: ParsedSession["assistantMessages"],
): ModelSwitch[] {
  const switches: ModelSwitch[] = [];
  for (let i = 1; i < assistantMessages.length; i++) {
    const prev = assistantMessages[i - 1];
    const cur = assistantMessages[i];
    if (prev.model && cur.model && prev.model !== cur.model) {
      switches.push({ fromModel: prev.model, toModel: cur.model, at: cur.timestamp ?? "" });
    }
  }
  return switches;
}

function computeFirstErrorTs(toolTimeline: ParsedSession["toolTimeline"]): string | null {
  for (const t of toolTimeline) {
    if (t.isError) return t.timestamp;
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/sessions-overview-helpers.test.ts -t "buildActivitySummary" --reporter=dot
```

Expected: PASS — five tests green.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/analytics/sessions/activity-summary.ts tests/sessions-overview-helpers.test.ts
git commit -m "$(cat <<'EOF'
feat(sessions): add buildActivitySummary helper

Pure helper that computes the salvaged Activity row facts: duration
label, adjacent-record model switches, first errored tool timestamp.
Replaces the standalone LifecycleEvents section per the makeover spec.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4.2: Render Activity row + inline Health badge in `SessionOverview`

**Files:**
- Modify: `client/src/components/analytics/sessions/SessionOverview.tsx`

- [ ] **Step 1: Add the imports**

In `SessionOverview.tsx`, add at the top:

```typescript
import { buildActivitySummary } from "./activity-summary";
```

The health badge already uses `sessionHealthBadgeVariant` (line 3) — no new import needed.

- [ ] **Step 2: Render the Activity row**

In the JSX, add a new section between Stop Reasons and Health (around line 289). Insert this block:

```tsx
      {/* Activity (salvaged from LifecycleEvents) */}
      {(() => {
        const activity = buildActivitySummary(parsed);
        const parts: string[] = [];
        if (activity.durationLabel) parts.push(`Active ${activity.durationLabel}`);
        if (activity.modelSwitches.length > 0) {
          const last = activity.modelSwitches[activity.modelSwitches.length - 1];
          const shortName = last.toModel.split("-").slice(-2).join(" ");
          parts.push(`Switched to ${shortName} at ${formatTimeShort(last.at)}`);
        }
        if (activity.firstErrorTs) {
          parts.push(`First error at ${formatTimeShort(activity.firstErrorTs)}`);
        }
        if (parts.length === 0) return null;
        return (
          <div className="px-4 space-y-1" data-section="activity">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Activity</span>
            <div
              className="text-xs text-muted-foreground"
              title={JSON.stringify(activity, null, 2)}
            >
              {parts.join(" · ")}
            </div>
          </div>
        );
      })()}
```

Add the `formatTimeShort` helper just below `formatMetric` (around line 38):

```typescript
function formatTimeShort(iso: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}
```

- [ ] **Step 3: Inline health badge — already present**

The Health row is already rendered inline at lines 290–303 of SessionOverview.tsx. After PR4 deletes `HealthDetails.tsx`, the Overview's existing Health row IS the inline badge — no further code change needed in this task. (The standalone `HealthDetails` section that was in `SessionDetail.tsx` was already removed in PR2 task 2.2 when the collapsibles were replaced.)

- [ ] **Step 4: Type-check + run sessions tests**

```bash
npm run check && npx vitest run tests/session-overview.test.ts tests/sessions-overview-helpers.test.ts --reporter=dot
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/analytics/sessions/SessionOverview.tsx
git commit -m "$(cat <<'EOF'
feat(sessions): render Activity row in SessionOverview

Compact one-liner derived from buildActivitySummary — duration, latest
model switch, first errored tool. Tooltip carries the full structured
summary for power users. Replaces the deleted LifecycleEvents section.

The inline health badge (existing Overview Health row) absorbs the
deleted HealthDetails section's role.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4.3: Delete the four orphaned section files

**Files:**
- Delete: `client/src/components/analytics/sessions/ToolTimeline.tsx`
- Delete: `client/src/components/analytics/sessions/FileImpact.tsx`
- Delete: `client/src/components/analytics/sessions/HealthDetails.tsx`
- Delete: `client/src/components/analytics/sessions/LifecycleEvents.tsx`
- Delete: any matching `tests/*.test.ts` / `tests/*.test.tsx` for those four files

- [ ] **Step 1: Confirm no remaining imports**

```bash
cd /home/tron/dev/projects/agent-cc
```

Use Grep to confirm:

```
Pattern: from \"\\./(ToolTimeline|FileImpact|HealthDetails|LifecycleEvents)\"
```

Run via the Grep tool over `client/src/`. Expected: zero matches (the only consumer was `SessionDetail.tsx`, which switched to `SessionToolTimeline` in PR3 and dropped FileImpact/HealthDetails/LifecycleEvents in PR2).

If any match remains, fix that file first before deleting.

- [ ] **Step 2: Locate the corresponding test files**

```bash
ls tests/ | grep -iE "tool-timeline|file-impact|health-details|lifecycle-events"
```

Note the matches. They will be deleted in step 3.

- [ ] **Step 3: Delete the files**

```bash
git rm client/src/components/analytics/sessions/ToolTimeline.tsx \
       client/src/components/analytics/sessions/FileImpact.tsx \
       client/src/components/analytics/sessions/HealthDetails.tsx \
       client/src/components/analytics/sessions/LifecycleEvents.tsx
```

For each test file found in step 2, also `git rm` it. (Skip if there are none.)

- [ ] **Step 4: Type-check**

```bash
npm run check
```

Expected: PASS. If TypeScript complains about imports that still reference the deleted files, fix them — those should already be cleaned up from PR2 / PR3, but stale imports sometimes survive.

- [ ] **Step 5: Run full sessions tests + safety**

```bash
npx vitest run tests/sessions-overview-helpers.test.ts \
                tests/session-overview.test.ts \
                tests/session-filter-bar.test.ts \
                tests/session-list-filters.test.ts \
                tests/session-tool-timeline.test.ts \
                tests/token-breakdown.test.ts \
                tests/new-user-safety.test.ts \
                --reporter=dot
```

Expected: PASS across the board.

- [ ] **Step 6: Commit**

```bash
git commit -m "$(cat <<'EOF'
chore(sessions): delete orphaned section components

Deletes ToolTimeline (replaced by SessionToolTimeline in PR3),
FileImpact (dropped per spec — read/write counts are noise),
HealthDetails (folded into Overview as inline badge), and
LifecycleEvents (salvaged into Overview Activity row in PR4 task 1).

Plus matching tests for the deleted components.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4.4: PR 4 final test pass and push

- [ ] **Step 1: Full test pass + safety**

```bash
npm run check && npm test --reporter=dot
```

Expected: PASS — no regressions across the entire suite.

- [ ] **Step 2: Manual end-to-end smoke test**

```bash
npm run dev
```

Open `http://localhost:5100/analytics?tab=sessions`. For at least two sessions (one simple, one with subagents):

- Pick the session from the cleaned left pane (search/sort/project/model only)
- Right pane shows the SessionFilterBar at the top
- Default preset shows Overview + Tools + Tokens + Linked Task (when present)
- Overview metrics: Cost / Cache Hit / Sidechains all show real values, not 0/-
- Overview has an Activity row with `Active Xm · Switched to Y at H:M · First error at H:M` (when applicable)
- Inline Health badge below the metric grid
- No standalone Health Details section, no Lifecycle Events section, no File Impact section
- Tools section renders Messages-style tool blocks grouped by subagent owner
- Tokens section is height-constrained, scrolls with sticky header, shows "Assistant" / "Subagent: <type>" labels
- Errors-only mode filters Tools to errored calls only
- Deep-dive preset visually activates every pill
- Manual pill toggle after a preset works correctly

Stop dev server.

- [ ] **Step 3: Push and open PR**

```bash
git push -u origin feature/sessions-makeover-pr4-cleanup
gh pr create --title "chore(sessions): Activity row, inline health, delete dead sections — PR 4 of 4" --body "$(cat <<'EOF'
## Summary
- Add buildActivitySummary helper (duration + model switches + first errored tool)
- Render Activity row in SessionOverview as compact one-liner with structured tooltip
- Inline health badge (existing Overview Health row) absorbs deleted HealthDetails role
- Delete ToolTimeline.tsx, FileImpact.tsx, HealthDetails.tsx, LifecycleEvents.tsx and their test files
- Final PR in the sessions makeover series — closes the spec

## Test plan
- [x] vitest tests/sessions-overview-helpers.test.ts (buildActivitySummary 5 tests)
- [x] full vitest pass — no regressions
- [x] npm run check
- [x] manual: end-to-end smoke for both simple and subagent-rich sessions
- [x] confirmed Overview metrics, Activity row, filter bar, tools rendering, tokens scroll all correct

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review

**Spec coverage check:**

- Overview metrics fix (Cost / Cache Hit / Sidechains) — Tasks 1.1, 1.2, 1.3, 1.4 ✓
- Drop dead prop chain — Task 1.5 ✓
- TokenBreakdown role labels — Task 1.6 ✓
- TokenBreakdown sticky header + max-height + solid bg — Task 1.7 ✓
- TokenBreakdown Model column note — Task 1.8 (verify only, no code) ✓
- SessionFilterBar with pills + presets, presets activate pills — Task 2.1 ✓
- SessionDetail rewire to filter-driven sections — Task 2.2 ✓
- SessionList strip health/status/hasErrors — Task 2.3 ✓
- SessionToolTimeline using Messages registry directly (option A) — Task 3.1 ✓
- SessionDetail swap — Task 3.2 ✓
- buildActivitySummary salvage helper — Task 4.1 ✓
- Activity row render in Overview — Task 4.2 ✓
- Inline health badge — Task 4.2 (relies on existing Overview Health row) ✓
- Delete dead components — Task 4.3 ✓

**Placeholder scan:** No `TBD`, no `implement later`, no "similar to Task N", no vague "add error handling". Every code step has an actual code block. Every test step has an actual test. ✓

**Type consistency:**
- `SessionFilterBarState` shape matches between Task 2.1 (definition) and Task 2.2 (consumption in SessionDetail) ✓
- `computeCostFromTree`, `computeSidechainCount`, `computeCacheStatsFromTree` signatures match between Task 1.1–1.3 (definition) and Task 1.4 (call sites) ✓
- `groupTimelineByOwner` / `filterToolMessagesForErrorsOnly` signatures match between Task 3.1 (definition) and Task 3.1 (consumption inside SessionToolTimeline) ✓
- `buildActivitySummary` return shape (`durationLabel`, `modelSwitches`, `firstErrorTs`) matches between Task 4.1 (definition) and Task 4.2 (render in Overview) ✓
- `SessionToolTimelineProps` (`sessionId`, `errorsOnly`) matches between Task 3.1 (definition) and Task 3.2 (call site in SessionDetail) ✓

**Test count delta:** ~24 new tests across 4 files (helpers ×9 + overview ×2 + filter-bar ×6 + tool-timeline ×6 + activity-summary ×5), plus ~10 dropped along with the deleted components. Net positive.

No issues found.
