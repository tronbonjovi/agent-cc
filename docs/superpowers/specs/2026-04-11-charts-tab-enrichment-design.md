# Charts Tab Enrichment Design

**Date:** 2026-04-11
**Status:** Draft
**Scope:** Expand Charts tab into a rich visualization playground powered by deep parser data

---

## Problem

The current Charts tab has 3 basic charts (cost over time, session frequency, token usage trends) with a time-range selector. The session parser now captures 100+ data points per session — tool usage, cache metrics, model distribution, turn durations, error rates, conversation structure, and more. Charts should be the place to explore all of this visually.

## Core Principle

**All the data is already collected — Charts is just the lens.** Go broad on visualization variety, make switching views and filtering fast and intuitive. This is the "play with the data" tab.

---

## Design

### Layout

**Top bar:** Global controls that apply across all charts
- **Time range**: 7d / 30d / 90d / All / Custom date picker
- **Project filter**: All projects or select specific ones
- **Model filter**: All models or select specific ones

**Body:** Chart grid — responsive columns (1-2-3 depending on viewport). Each chart is a card with its own title and optional local controls (sort, breakdown toggle, etc.).

Charts are organized into thematic groups with subtle section headers. Not tabs-within-tabs — just a scrollable page with grouped sections.

### Chart Groups

#### Token Economics

**Token Usage Over Time** (line chart)
- Total tokens per day/week
- Breakdown toggle: input vs output vs cache read vs cache creation
- Stacked area variant option

**Cache Efficiency Over Time** (line chart + area)
- Cache hit rate as percentage line
- Stacked area showing cached vs uncached input tokens
- Shows how cache performance evolves as system prompt stabilizes

**Token Destination Breakdown** (treemap or donut)
- System prompt overhead vs conversation vs tool results vs thinking
- Proportional visualization — where tokens actually go
- Aggregated across filtered time range

**Model Distribution** (stacked bar or donut)
- Token usage by model over time
- Shows model mix shifts (e.g., switching from Sonnet to Opus)

**API-Equivalent Value** (bar chart)
- What your token usage would cost at API rates per week/month
- Stacked by model — shows subscription value

#### Session Patterns

**Session Frequency** (bar chart)
- Sessions per day/week
- Color-coded by health score (green/amber/red segments)

**Session Depth Distribution** (histogram)
- Message count per session distribution
- Reveals usage patterns — quick questions vs deep work sessions
- Median and mean markers

**Session Duration Distribution** (histogram)
- Time from first to last message
- Complements depth — a 5-message session might be 2 minutes or 2 hours

**Session Health Over Time** (stacked area)
- Good / fair / poor counts per day/week
- Trend line — is session quality improving?

**Stop Reason Distribution** (horizontal bar)
- end_turn vs max_tokens vs tool_use vs other
- max_tokens stops often indicate context pressure — useful signal

#### Tool Usage

**Tool Frequency** (horizontal bar, sorted)
- Which tools get used most: Read, Edit, Bash, Grep, Glob, Write, Agent, etc.
- Total invocations across filtered range

**Tool Error Rate** (grouped bar)
- Per-tool success vs failure count
- Highlights which tools are most error-prone

**Tool Duration Distribution** (box plot or violin)
- Execution time distribution per tool
- Identifies slow tools (Bash commands, large file reads)

**Tool Usage Over Time** (stacked area)
- Tool mix per day/week
- Shows workflow shifts (more Bash lately? more Agent delegation?)

#### File & Codebase

**File Heatmap** (horizontal bar, sorted by touch count — extended version)
- Top 25-50 most-touched files
- Segmented by operation type (read/write/edit)
- Complements the compact Nerve Center version with more depth

**File Churn Rate** (line chart)
- Unique files touched per day/week
- High churn = active development, low churn = maintenance/review mode

#### Activity & Workflow

**Activity Timeline** (event scatter or timeline)
- Events plotted on timeline — sessions, commits, file changes
- Density view — when are you most active?

**Project Activity Comparison** (grouped bar)
- Sessions, tokens, files touched per project
- Side-by-side comparison of where effort goes

**Sidechain Usage** (line chart)
- Sidechain (subagent) message count over time
- Percentage of total messages that are sidechain
- Shows delegation patterns

---

## Interactions

**Every chart supports:**
- Hover tooltips with exact values
- Click-through to relevant detail (e.g., click a session bar → Sessions tab filtered to that day)
- Responsive sizing — charts reflow from 3-column to 1-column on narrow viewports

**Global filter behavior:**
- Changing time range, project, or model filter updates ALL charts simultaneously
- Filter state persists in URL params (shareable, bookmarkable)
- Loading states per-chart (not full-page loader)

**Chart card controls:**
- Some charts have local toggles (breakdown mode, sort order, chart type variant)
- Expand button to view chart full-width (modal or inline expand)

---

## Visual Standards

- Consistent color palette across all charts (model colors, health colors, tool colors stay the same everywhere)
- Solid colors, no gradients on fills or text
- Clean typography — chart titles, axis labels, legend entries all legible at default size
- Recharts library (already in use) for all chart types
- Dark theme compatible (current app theme)

---

## Data Sources

All data derived from `ParsedSession` via existing parser and cache:

| Chart data | Parser source |
|-----------|---------------|
| Token counts | `assistantMessages[].usage.*` |
| Cache metrics | `usage.cacheReadTokens`, `usage.cacheCreationTokens` |
| Model | `assistantMessages[].model` |
| Tool usage | `toolTimeline[]` (name, duration, isError) |
| Stop reasons | `assistantMessages[].stopReason` |
| Session timing | `meta.firstTs`, `meta.lastTs` |
| Message counts | `counts.*` |
| Sidechain | `counts.sidechainMessages`, `isSidechain` flags |
| File operations | `toolTimeline[].filePath` filtered by tool name |
| Health scores | Derived via `session-analytics.ts` health computation |

### New Backend

- Aggregate endpoints for chart data (or extend existing analytics endpoints with more breakdowns)
- Tool usage aggregation endpoint
- Stop reason aggregation
- Sidechain metrics
- Most existing data just needs reshaping — the parser already extracts it

### Frontend

- Chart card component (reusable wrapper with title, controls, expand)
- Global filter bar component
- ~15-20 chart components using Recharts
- Section grouping layout
- URL param sync for filter state

---

## Implementation Notes

- Start with the highest-value charts first (token economics + session patterns), add tool/file/activity charts incrementally
- Each chart is independent — can be added one at a time without blocking others
- Chart data endpoints can be cached server-side (5-minute TTL like existing analytics)
- Consider lazy-loading chart sections below the fold for performance
