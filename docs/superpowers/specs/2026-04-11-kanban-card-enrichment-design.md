# Kanban Card Enrichment & Auto Session-Task Linking

**Date:** 2026-04-11
**Status:** Draft
**Depends on:** Scanner deepening (completed 2026-04-11)

## Problem

The scanner deepening work built a comprehensive JSONL parser that extracts all 8 record types from session files. The parsed data is cached and available via `getParsedSessions()`. However, the kanban board cards only display a subset of what's now available — model, message count, duration, tokens, cost, agent role. Health score is computed but not shown on cards. Tool execution details, cache efficiency, stop reasons, web activity, and retry counts are all extracted but never surfaced.

Additionally, session-task linking is manual — workflow-framework writes a `sessionId` into task frontmatter when it dispatches work. Sessions started outside workflow-framework (ad-hoc Claude Code usage) never get linked to tasks, even when they're clearly working on the same files.

## Scope

Two features:

1. **Card enrichment** — surface new session data on kanban cards via an inline expandable detail section
2. **Auto session-task linking** — automatically match unlinked sessions to tasks using behavioral signals

## Feature 1: Card Enrichment

### Card Face Changes

The card face layout stays the same (5 rows, no new rows added). One change:

- **Status light** — already exists and pulses when active. Currently only distinguishes active/inactive. Change: when session health data is available, the status light color reflects the health score (green=good, amber=fair, red=poor). This is already implemented in `statusLightColor()` — the enrichment just needs to pass `healthScore` through, which it already does. The light already works correctly; the only gap was that health score wasn't being computed for all sessions. With the parsed cache, it now is.

### Expandable Detail Section

A new inline accordion below the card face, triggered by a "Session details" toggle. When expanded, it pushes cards below it down within the column (kanban columns already scroll).

**Toggle behavior:**
- Collapsed by default: shows `▸ Session details` as a subtle link below the stats row
- Expanded: shows `▾ Session details` and reveals the detail panel
- Only one card expanded at a time per column (expanding another collapses the previous) — keeps column height manageable
- Collapse on re-click of the toggle

**Expanded content — two sections:**

**1. Health reason tags** (top of expanded area)
Color-coded pills showing health flags computed by `getSessionHealth()`. Only shown when health reasons exist (healthy sessions show no tags).

| Reason | Color | Example |
|--------|-------|---------|
| `high error rate` | red | Tool error rate > 15% |
| `context overflow` | red | Token usage >= 80% of context limit |
| `excessive retries` | amber | High retry count relative to tool calls |
| `long idle gaps` | amber | Large gaps between turns |
| `high cost` | amber | Session cost > $2 |
| `short session` | muted | Very few messages |

**2. Stats grid** (below tags, 2-column layout)

| Stat | Source | Display | Color logic |
|------|--------|---------|-------------|
| Tool calls | `counts.toolCalls` from ParsedSession | `87` | Default |
| Errors | `counts.toolErrors` from ParsedSession | `3` | Red when > 0 |
| Retries | `health.retries` from analytics (same file edited within 60s) | `2` | Default |
| Cache hit | `cacheReadTokens / (cacheReadTokens + cacheCreationTokens)` from cost data | `72%` | Green > 60%, amber 30-60%, red < 30% |
| Max tokens | Count of `stopReason === "max_tokens"` in `ParsedSession.assistantMessages` | `1×` | Amber when > 0 |
| Web requests | Sum of `serverToolUse.webSearchRequests + webFetchRequests` across assistant messages | `5` | Default, with 🌐 icon |
| Sidechains | `counts.sidechainMessages` from ParsedSession | `4` | Default |
| Turns | `systemEvents.turnDurations.length` from ParsedSession | `12` | Default |

### Data Flow

The expandable section needs data beyond what `SessionEnrichment` currently provides. Two approaches:

**Approach: Extend SessionEnrichment** — add the new fields to the existing enrichment interface. The enricher already calls `getSessionHealth()` and has access to parsed session data. Add fields for the expandable section:

```typescript
// Added to SessionEnrichment
interface SessionEnrichment {
  // ... existing fields ...

  // New fields for expandable detail
  healthReasons: string[];          // from getSessionHealth()
  totalToolCalls: number;           // from parsed session counts
  retries: number;                  // computed from tool timeline
  cacheHitRate: number | null;      // computed from token usage
  maxTokensStops: number;           // count from assistant messages
  webRequests: number;              // from server tool use
  sidechainCount: number;           // from parsed session counts
  turnCount: number;                // from system events
}
```

These fields also need to be added to `LastSessionSnapshot` so completed tasks retain the detail data.

```typescript
// Added to LastSessionSnapshot
interface LastSessionSnapshot {
  // ... existing fields ...
  healthReasons: string[];
  totalToolCalls: number;
  retries: number;
  cacheHitRate: number | null;
  maxTokensStops: number;
  webRequests: number;
  sidechainCount: number;
  turnCount: number;
}
```

### Client Components

**New component: `SessionDetailAccordion`** in `client/src/components/board/session-detail-accordion.tsx`
- Receives `SessionEnrichment | LastSessionSnapshot`
- Renders the expand toggle, health tags, and stats grid
- Manages expanded/collapsed state locally

**Modified: `BoardTaskCard`** in `board-task-card.tsx`
- Add the accordion component below the stats row (Row 4)
- Only render when session or snapshot data exists

**New component: `HealthReasonTag`** in `session-indicators.tsx`
- Color-coded pill for a single health reason
- Maps reason string to color scheme

## Feature 2: Auto Session-Task Linking

### Concept

When a task has no `sessionId` in its frontmatter, the enricher attempts to auto-match it to an active or recent session using behavioral signals from the parsed session data.

Auto-linking is **read-only** — it never writes back to task frontmatter. The link exists only in memory during the aggregation cycle. Manual `sessionId` in frontmatter always takes priority.

### Priority Chain

1. **Manual link** — `sessionId` in task frontmatter (written by workflow-framework) → always wins
2. **Auto-link** — behavioral match from signals below → used when no manual link
3. **No link** — card shows without session data

### Matching Signals

Each signal produces a confidence score (0-1). Signals are combined and a match requires a minimum combined score.

**Signal 1: Git branch match (weight: 0.5)**
- ParsedSession.meta.gitBranch contains the task ID (e.g., branch `TASK-042-implement-parser` matches task `TASK-042`)
- Exact task ID substring match → 0.5
- Milestone name substring match → 0.2

**Signal 2: File path overlap (weight: 0.3)**
- Task's `filesTouch` labels (from frontmatter) compared against file paths in the session's tool timeline
- Overlap ratio = matched files / total filesTouch files
- Score = 0.3 × overlap ratio

**Signal 3: Timing correlation (weight: 0.2)**
- Task moved to `in-progress` (from `updatedAt` timestamp) within 10 minutes of session start
- Session active during the same window the task is in-progress
- Score = 0.2 if timing overlaps, 0 otherwise

### Minimum Threshold

A match requires a combined score ≥ 0.4. This means:
- Git branch alone (0.5) → match
- File overlap alone at 100% (0.3) → no match (needs another signal)
- File overlap (0.3) + timing (0.2) → match
- Weak branch match (0.2) + file overlap (0.2) + timing (0.2) → match

### Conflict Resolution

If multiple sessions match a single task, pick the one with the highest combined score. If tied, pick the most recent (latest `lastTs`).

If multiple tasks match a single session, allow it — one session can be linked to multiple tasks (workflow-framework already does this with parent sessions).

### Implementation Location

**New function in `session-enricher.ts`:**

```typescript
/**
 * Attempt to auto-match a task to a session using behavioral signals.
 * Returns the best-matching sessionId or null if no match meets threshold.
 * Only called when task has no manual sessionId.
 */
function autoLinkSession(
  task: TaskItem,
  parsedSessions: Map<string, ParsedSession>
): string | null;
```

**Called from `enrichTaskSession()`** — when `sessionId` is undefined, call `autoLinkSession()` before returning null.

### Data Sources

| Signal | Parsed Session Field | Task Field |
|--------|---------------------|------------|
| Git branch | `meta.gitBranch` | `id`, `parent` (milestone) |
| File paths | `toolTimeline[].filePath` | `labels` with `touches:` prefix |
| Timing | `meta.firstTs`, `meta.lastTs` | `updatedAt` |

## Files Created/Modified

**New files:**
- `client/src/components/board/session-detail-accordion.tsx` — expandable detail component

**Modified files:**
- `shared/board-types.ts` — extend `SessionEnrichment` and `LastSessionSnapshot` with new fields
- `server/board/session-enricher.ts` — populate new enrichment fields from parsed cache, add `autoLinkSession()`
- `client/src/components/board/board-task-card.tsx` — render accordion below stats row
- `client/src/components/board/session-indicators.tsx` — add `HealthReasonTag` component

**Not modified:**
- `server/scanner/session-parser.ts` — already extracts all needed data
- `server/scanner/session-analytics.ts` — already computes health reasons
- `server/scanner/session-cache.ts` — already caches parsed sessions
- `server/board/aggregator.ts` — enrichment flow unchanged, just richer data
- Workflow-framework files — no cross-project changes

## Testing Strategy

- **Enrichment tests:** verify new fields are populated from parsed session data, verify snapshot captures new fields
- **Auto-linking tests:** unit tests for each signal (branch match, file overlap, timing), combined scoring, threshold enforcement, conflict resolution, manual link priority
- **Card rendering tests:** accordion expand/collapse, health tag rendering, stats grid population, graceful degradation when fields are null
- **Safety tests:** existing `new-user-safety.test.ts` continues to pass
