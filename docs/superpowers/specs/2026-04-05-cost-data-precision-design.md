# Cost Data Precision — Design Spec

**Goal:** Make financial data in Agent CC trustworthy and precise. Every cost number traceable to exact tokens, models, and agents. One source of truth, many views.

**Problem:** Two independent JSONL parsers calculate costs differently, token counts don't explain costs, model versions are collapsed, no subagent awareness, and pricing was wrong for months without anyone noticing because there's no verification layer.

---

## Architecture

### Current (broken)

```
JSONL files → session-analytics.ts (parse all, no date window)  → nerve center, sessions page
JSONL files → cost-analytics.ts   (parse all, date windowed)    → stats/costs page
```

Two parsers, two caches, two truths. Token counts differ between them. Neither tracks subagents or exact model versions.

### New

```
JSONL files → cost-indexer (parse once, incremental) → cost records in agent-cc.json
                                                              ↓
                                              query/aggregate for any view
                                              (costs page, nerve center, sessions, projects)
```

One parser. One store. Many views.

---

## Data Model

### Cost Record (one per assistant message)

```typescript
interface CostRecord {
  // Identity
  id: string;                    // hash of sessionId + timestamp + model (dedup key)
  sessionId: string;             // session that generated this cost
  parentSessionId: string | null; // if subagent, the parent session ID
  projectKey: string;            // encoded project key

  // Model (exact)
  model: string;                 // exact string from API: "claude-opus-4-6", "claude-sonnet-4-6"
  modelFamily: string;           // derived: "opus-4-6", "sonnet", "haiku-4-5"

  // Tokens (raw counts — never lose this data)
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;

  // Cost (computed at record time with pricing active at that moment)
  cost: number;                  // USD, computed at indexing time
  pricingSnapshot: {             // rates used to compute this cost
    input: number;
    output: number;
    cacheRead: number;
    cacheCreation: number;
  };

  // Time
  timestamp: string;             // ISO 8601 from the JSONL record
  indexedAt: string;             // when we processed this record
}
```

### Cost Index Metadata (tracking parse progress)

```typescript
interface CostIndexState {
  // Per-file tracking for incremental parsing
  files: Record<string, {
    filePath: string;
    lastOffset: number;        // byte offset where we stopped reading
    lastTimestamp: string;     // last record timestamp processed
    recordCount: number;       // records extracted from this file
  }>;

  // Global stats
  totalRecords: number;
  lastFullScanAt: string;
  version: number;              // schema version for future migrations
}
```

### Storage

Cost records and index state stored in `~/.agent-cc/agent-cc.json` via the existing `storage.ts` abstraction. Records keyed by ID for dedup. Typical size: ~200 bytes per record, ~10K records for heavy usage = ~2MB. Well within JSON file limits.

---

## Cost Indexer

New module: `server/scanner/cost-indexer.ts`

### Responsibilities

1. **Incremental JSONL parsing** — For each session file, read from the last known offset. Extract assistant messages with usage data. Store as CostRecords.

2. **Subagent detection** — JSONL files under `subagents/agent-*.jsonl` within a session directory are subagents. Extract parent session ID from the directory path.

3. **Pricing at record time** — When creating a CostRecord, snapshot the current pricing from `pricing.ts`. This freezes the cost at the rate that was active when we indexed it.

4. **Dedup** — Use the record ID (hash of sessionId + timestamp + model) to avoid double-counting if we re-index.

5. **Triggered by session scanner** — Run after each session scan cycle (the existing scan infrastructure already detects new/changed JSONL files).

### API

```typescript
// Run incremental indexing — called after session scan
function indexCosts(sessions: SessionData[]): void;

// Query cost records with filters
function queryCosts(filter: {
  days?: number;              // date window (7, 30, 90)
  projectKey?: string;
  sessionId?: string;
  modelFamily?: string;
}): CostRecord[];

// Aggregated views (built from queryCosts)
function getCostSummary(days: number): CostSummary;
function getSessionCostDetail(sessionId: string): SessionCostDetail;
```

### Aggregation Types

```typescript
interface CostSummary {
  // Totals for the period
  totalCost: number;
  totalTokens: { input: number; output: number; cacheRead: number; cacheCreation: number };
  
  // Weekly comparison
  weeklyComparison: { thisWeek: number; lastWeek: number; changePct: number };
  
  // Monthly total (always 30d, for plan limits)
  monthlyTotalCost: number;

  // Breakdowns
  byModel: Record<string, {            // keyed by exact model string
    cost: number;
    tokens: { input: number; output: number; cacheRead: number; cacheCreation: number };
    sessions: number;
  }>;
  byProject: Array<{
    projectKey: string;
    projectName: string;
    cost: number;
    sessions: number;
  }>;
  byDay: Array<{
    date: string;
    cost: number;
    costBreakdown: { compute: number; cache: number };  // input+output vs cacheRead+cacheCreation
  }>;

  // Top sessions
  topSessions: Array<{
    sessionId: string;
    firstMessage: string;
    model: string;                      // primary model
    cost: number;
    subagentCount: number;
    subagentCost: number;               // cost from subagents (included in cost total)
    tokens: { input: number; output: number; cacheRead: number; cacheCreation: number };
  }>;

  // Plan limits
  planLimits: {
    pro: { limit: number; label: string };
    max5x: { limit: number; label: string };
    max20x: { limit: number; label: string };
  };
}

interface SessionCostDetail {
  sessionId: string;
  firstMessage: string;
  totalCost: number;
  
  // Parent session cost (excluding subagents)
  directCost: number;
  directTokens: { input: number; output: number; cacheRead: number; cacheCreation: number };
  directModel: string;

  // Subagents
  subagents: Array<{
    sessionId: string;
    model: string;
    cost: number;
    tokens: { input: number; output: number; cacheRead: number; cacheCreation: number };
  }>;

  // Cost explanation — rates applied
  ratesApplied: {
    model: string;
    input: number;
    output: number;
    cacheRead: number;
    cacheCreation: number;
  };
}
```

---

## API Changes

### Replace: `/api/analytics/costs`

Same route, new implementation backed by cost-indexer instead of JSONL parsing.

```
GET /api/analytics/costs?days=30
```

Returns `CostSummary`. No JSONL parsing at request time — just queries stored records.

### New: `/api/analytics/costs/session/:id`

```
GET /api/analytics/costs/session/:id
```

Returns `SessionCostDetail` — the full cost story for one session including subagent breakdown.

### Deprecate: `/api/sessions/analytics/costs`

Once the costs page is migrated, this endpoint is redundant. Keep it temporarily for backwards compat, then remove.

---

## Costs Page Redesign

### Level 1: Dashboard (default view)

**Period selector:** 7d / 30d / 90d pills (existing, keep)

**Summary cards:**
- Total cost for period (with compute vs cache split underneath)
- Weekly comparison (existing, keep)
- Tokens processed (with breakdown tooltip)
- Active sessions count

**Daily cost chart:** 
- Stacked bars: compute cost (input+output) in one color, cache cost (read+write) in another
- Hover shows exact breakdown

**By-model breakdown:**
- Exact model versions as rows: `claude-opus-4-6`, `claude-sonnet-4-6`, `claude-haiku-4-5`
- Columns: sessions, input tokens, output tokens, cache read, cache write, cost
- Color-coded by model family (orange=opus, blue=sonnet, green=haiku)

**By-project breakdown:**
- Rows: project name, sessions, cost
- Clickable to filter (existing behavior, keep)

### Level 2: Top Sessions table

- Session first message (truncated), primary model badge, total cost
- **Subagent indicator:** if session has subagents, show count + their combined cost
  - e.g. "3 agents (+$45.20)" next to the session row
- Token breakdown columns: input, output, cache read, cache write
- Click row to drill into Level 3

### Level 3: Session Cost Detail (new)

Reached by clicking a session row. Shows:

**Session header:** first message, total cost, model

**Cost explanation box:**
- "This session used claude-opus-4-6 at $5/MTok input, $25/MTok output, $0.50/MTok cache read, $6.25/MTok cache write"
- Token breakdown with math: "12K input x $5/MTok = $0.06"
- Each line item so the total is traceable

**Subagent table (if any):**
- Each subagent: model, tokens, cost, first message
- Sum row showing total subagent cost

**Back link** to return to Level 1

---

## Migration Path

### Milestone 1: Foundation + Costs Page (this spec)

1. Build `cost-indexer.ts` — incremental parser, record storage, query API
2. Wire it into the session scan cycle
3. Replace `/api/analytics/costs` implementation to use cost-indexer
4. Add `/api/analytics/costs/session/:id` endpoint
5. Update costs page to show exact models, cache breakdown, subagent awareness
6. Add session cost detail drill-down view

### Milestone 2: Migrate Other Views (future)

7. Nerve center costPacing reads from cost-indexer
8. Sessions page cost display reads from cost-indexer
9. Project dashboards read from cost-indexer
10. Remove `session-analytics.ts` cost calculation code (keep file heatmap + health)
11. Remove `cost-analytics.ts` JSONL parsing (now just a thin query layer)
12. Weekly digest reads from cost-indexer

### Milestone 3: Sessions Rebuild (future)

Separate spec — rebuild sessions page with cost-aware hierarchy, subagent tree view, etc. The cost foundation from Milestones 1-2 makes this possible.

---

## What This Doesn't Change

- `pricing.ts` remains the single source of pricing rates
- JSONL files remain the source of truth (we never modify them)
- The session scanner infrastructure stays the same
- File heatmap and health scoring stay in session-analytics (unrelated to costs)
- No changes to how Claude Code writes session data

## Non-Goals

- Real-time cost streaming (polling every 30s from stored records is fine)
- Multi-currency support
- Billing/invoicing features
- Modifying JSONL files or Claude Code behavior
