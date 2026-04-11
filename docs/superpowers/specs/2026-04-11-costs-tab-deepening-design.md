# Costs Tab Deepening Design

**Date:** 2026-04-11
**Status:** Draft
**Scope:** Costs tab overhaul leveraging deep parser data, focus on token intelligence over budget tracking

---

## Problem

The current Costs tab shows basic aggregates (total cost, tokens by model, daily spend chart, top sessions). With the new session parser extracting per-message token breakdowns including cache metrics, model per message, and tool-level detail, we can surface much richer intelligence. The user has a max subscription (flat rate), so the goal isn't budget tracking — it's understanding where tokens go and how efficiently the system operates.

## Core Principle

**Value-per-token intelligence, not budget management.** The question isn't "how much am I spending" but "where are my tokens going, how efficiently, and what's the overhead of my configuration."

---

## Design

### Primary Sections

#### 1. Token Anatomy — "Where Do My Tokens Go?"

The central view. Breaks down total token usage into meaningful categories:

- **System prompt overhead** — tokens consumed by autoloaded content (CLAUDE.md, skills, plugins, MCP instructions, memory files). Derived from first-message input tokens vs steady-state input tokens per session. The delta approximates autoloaded cost.
- **Conversation** — tokens from actual human ↔ assistant dialogue (user messages + assistant text responses).
- **Tool execution** — tokens consumed by tool calls and their results (Bash output, file reads, grep results, etc.).
- **Thinking** — tokens used in extended thinking blocks.
- **Cache overhead** — cache creation tokens (the cost of writing to prompt cache).

Visual: proportional breakdown (treemap, stacked bar, or segmented ring). Each segment clickable to drill into detail.

#### 2. Model Intelligence — "What's Each Model Doing?"

Per-model breakdown with API-equivalent cost calculation:

| Column | Description |
|--------|-------------|
| Model | Exact model name (claude-opus-4-6, claude-sonnet-4-6, etc.) |
| Sessions | How many sessions used this model |
| Input tokens | Total input (excluding cache) |
| Cache read | Tokens served from cache (90% cheaper at API rates) |
| Cache creation | Tokens written to cache |
| Output tokens | Total output |
| API-equivalent cost | What this usage would cost at current API pricing |
| Cache savings | How much the cache saved vs uncached equivalent |

This lets the user see the true value of their subscription by comparing flat-rate cost to what API usage would actually cost.

#### 3. Cache Efficiency — "How Well Is Caching Working?"

- **Cache hit rate** — percentage of input tokens served from cache across all sessions
- **First-message vs steady-state** — shows the cache miss on session start (full system prompt load) vs subsequent messages (cached)
- **Cache ROI** — creation cost vs read savings over time
- **Per-session cache curve** — how quickly cache kicks in within a session (usually message 2+)

This section helps understand whether the system prompt configuration is cache-friendly. Fragmented or frequently-changing autoloaded content reduces cache efficiency.

#### 4. System Prompt Overhead — "What's My Configuration Costing?"

Connects to Library management. Shows the token cost of the autoloaded stack:

- **Estimated system prompt size** — derived from first-message input tokens (averaged across recent sessions)
- **Trend** — is the system prompt growing or shrinking over time? (as skills/plugins are added/removed)
- **Comparison** — system prompt tokens vs conversation tokens per session. What percentage of every session is just loading the configuration?
- **Link to Library** — "Manage your loaded skills, plugins, and prompts" direct navigation

This gives the user a feedback loop: change Library config → see system prompt overhead change in Costs.

#### 5. Session & Project Value — "Where Am I Getting the Most Value?"

- **Per-session token efficiency** — tokens per turn, output-to-input ratio (are sessions productive or spinning?)
- **Per-project breakdown** — total tokens, session count, average session depth per project
- **Most expensive sessions** — ranked by total tokens with first-message preview, model used, health score
- **Cheapest productive sessions** — high message count but low token usage (efficient work)

#### 6. Historical Lookup — "Let Me Find Something"

Low-prominence but accessible. Not a central pane — a collapsible or secondary section:

- Daily/weekly/monthly token usage timeline
- Filterable by project, model, date range
- Exportable for external analysis if needed

---

## Data Sources

All derived from `ParsedSession` via the session parser:

| Data point | Source field |
|-----------|-------------|
| Input tokens | `assistantMessages[].usage.inputTokens` |
| Output tokens | `assistantMessages[].usage.outputTokens` |
| Cache read | `assistantMessages[].usage.cacheReadTokens` |
| Cache creation | `assistantMessages[].usage.cacheCreationTokens` |
| Model | `assistantMessages[].model` |
| Service tier | `assistantMessages[].usage.serviceTier` |
| Tool calls | `assistantMessages[].toolCalls[]` |
| Tool results | `userMessages[].toolResults[]` |
| System prompt estimate | First message `inputTokens` - `cacheReadTokens` delta |
| Session timing | `meta.firstTs`, `meta.lastTs` |
| Project | `meta.projectKey` |

### API Pricing Reference

For API-equivalent cost calculation, maintain a pricing table (hardcoded or configurable):

| Model | Input (per 1M) | Output (per 1M) | Cache read (per 1M) | Cache write (per 1M) |
|-------|----------------|-----------------|---------------------|---------------------|
| claude-opus-4-6 | $15.00 | $75.00 | $1.50 | $18.75 |
| claude-sonnet-4-6 | $3.00 | $15.00 | $0.30 | $3.75 |
| claude-haiku-4-5 | $0.80 | $4.00 | $0.08 | $1.00 |

These rates change — should be a config file or settings value, not buried in code.

---

## Implementation Notes

### New Backend
- Token anatomy aggregation endpoint (category breakdown across sessions)
- Cache efficiency metrics endpoint
- System prompt overhead estimation logic
- API-equivalent cost calculator with configurable pricing table

### Frontend
- Token anatomy visualization (treemap or segmented breakdown)
- Model intelligence table with computed columns
- Cache efficiency charts
- System prompt overhead section with Library link
- Collapsible historical lookup section

---

## Cost Indexer Migration

### Current State: Two Systems

There are currently two independent systems computing cost data from the same JSONL files:

| System | Read strategy | Persistence | Purpose |
|--------|--------------|-------------|---------|
| **Cost indexer** (`cost-indexer.ts`) | Byte-offset incremental — only reads new bytes since last scan | Persistent DB (`agent-cc.json`) | Historical queries (7/30/90 day views), subagent attribution |
| **Session analytics** (`session-analytics.ts`) | Full-file read via parser cache | Transient 5-minute TTL | Health scores, board card enrichment, current-session metrics |

Both extract token usage from assistant messages. Both compute per-model cost breakdowns. They produce overlapping but not identical outputs — the cost indexer has richer subagent tracking and persistent history, while session analytics has health scoring and file heatmap data.

### Migration Strategy

**Don't merge them — unify the source, keep the roles separate.**

The cost indexer's byte-offset incremental reading is genuinely valuable for performance — it avoids re-reading gigabytes of JSONL data on every scan. The session parser's full-file approach is appropriate for its use case (cache-based, infrequent). Forcing the cost indexer onto the parser cache would lose its incremental efficiency.

Instead:

1. **Shared pricing table**: Both systems hardcode model pricing. Extract to a single configurable pricing source (JSON config file or settings). The Costs tab API-equivalent calculations, cost indexer's `cost` field, and session analytics' `estimatedCostUsd` should all use the same rates.

2. **Cost indexer feeds the Costs tab**: The persistent, historically-queryable cost indexer is the natural backend for the Costs tab's historical lookup, daily/weekly trends, and project-level breakdowns. Session analytics feeds the real-time/current-session views.

3. **Cache efficiency metrics from parser**: Cache hit rate, system prompt overhead estimation, and token destination breakdowns come from the session parser (which captures per-message `cacheReadTokens` and `cacheCreationTokens`). The cost indexer already stores these fields per record — surface them in query results.

4. **Subagent cost rollup**: The cost indexer already tracks `parentSessionId` for subagent attribution. Surface this in the Costs tab as "session cost including subagents" vs "session cost alone."

### Implementation

- Extract pricing table to `server/scanner/pricing.ts` (shared config)
- Add cache efficiency aggregation to cost indexer query functions
- Add subagent rollup view to cost summary endpoint
- Costs tab frontend consumes cost indexer for historical data, session analytics for live/current data
- No architectural merge — they stay as separate systems with a shared pricing source

---

### Connects To
- **Library page** — system prompt overhead links to skill/plugin management
- **Nerve Center** — Cost Nerves module shows summary from this data
- **Sessions tab** — per-session cost detail links back here
