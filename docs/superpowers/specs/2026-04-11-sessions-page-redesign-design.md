# Sessions Page Redesign Design

**Date:** 2026-04-11
**Status:** Draft
**Scope:** Sessions tab under Analytics — full redesign leveraging deep parser data

---

## Problem

The current Sessions page shows wide cards with data from the old scanner (basic metadata, message count, size). The session parser now extracts 100+ data points per session — tool timelines, per-message token breakdowns, cache metrics, health scores, stop reasons, git context, conversation threading, and more. The page needs to surface this richness without overwhelming.

## Core Principle

**List view for triage, detail view for investigation.** Browsing sessions should be fast and scannable. Drilling into one should reveal everything.

---

## Design

### Layout: List → Detail Panel

**Recommended approach: list + side panel** (not list → separate page).

Left side: scrollable session list with compact rows. Right side: detail panel that populates when a session is selected. Similar to an email client — scan the list, click to inspect, stay in context.

On narrow viewports, the detail panel becomes a full-screen overlay triggered by tap.

### Session List (Left Panel)

Compact rows, not tall cards. Each row shows at-a-glance triage info:

| Element | Source |
|---------|--------|
| **Health dot** | Green/amber/red indicator from health score |
| **First message** | Truncated title/first user message (primary text) |
| **Project** | Project name (secondary text, muted) |
| **Model badge** | Primary model used (small pill — "opus", "sonnet", "haiku") |
| **Message count** | Conversation depth indicator |
| **Duration** | firstTs → lastTs (human-readable: "23m", "2h 14m") |
| **API-equiv cost** | What this session would cost at API rates |
| **Time** | Relative timestamp ("2h ago", "yesterday") |
| **Active indicator** | Animated dot if session is currently live |

Rows are dense but scannable. Health dot on the left edge gives instant visual triage across the entire list.

#### List Controls

**Search**: Full-text search across first message, project name, and session metadata. Deep search option searches message content.

**Sort options**:
- Newest first (default)
- Oldest first
- Most messages
- Highest cost
- Worst health
- Longest duration
- Largest file size

**Filters** (toggleable pills above the list):
- Health: Good / Fair / Poor
- Status: Active / Inactive / Stale / Empty
- Project: dropdown or multi-select
- Model: filter by primary model
- Has errors: sessions with tool failures

**Bulk actions**: Multi-select with delete, pin, export.

### Session Detail (Right Panel)

When a session is selected, the right panel shows full detail organized in collapsible sections. Sections default open/closed based on information density.

#### Header

- Session title (first message, full text)
- Project name + git branch
- Time range: start → end with duration
- Health score badge with reason tags
- Pin / Delete / Export actions

#### Section: Overview (default open)

Key metrics in a compact grid:

| Metric | Value |
|--------|-------|
| Messages | total (user + assistant breakdown) |
| Turns | turn count from parser |
| Duration | wall clock time |
| Model(s) | list of models used with token share |
| API-equiv cost | total with input/output/cache breakdown |
| Cache hit rate | percentage of input tokens from cache |
| System prompt est. | estimated overhead from autoloaded content |
| Tool calls | total (success / error count) |
| Sidechain messages | subagent/bridge message count |
| Stop reasons | distribution (end_turn, max_tokens, etc.) |
| Claude Code version | from session metadata |
| Entry point | CLI entry (if available) |

#### Section: Tool Timeline (default open)

Chronological list of every tool execution in the session:

- Tool name (icon + label)
- File path or command (truncated, expandable)
- Duration (ms, color-coded: green < 1s, amber < 5s, red > 5s)
- Success/error indicator
- Sidechain badge if from subagent
- Timestamp

Filterable by tool type. Errors highlighted. Expandable rows show full command/path/pattern.

This is the "what actually happened" view — invaluable for understanding session behavior and debugging.

#### Section: Token Breakdown (default collapsed)

Per-message token usage table or chart:

- Message index (1, 2, 3...)
- Role (user/assistant)
- Input tokens (with cache read highlighted)
- Output tokens
- Cache creation tokens
- Model used
- Cumulative total

Sparkline at the top showing token usage curve across the session — typically spikes on first message (system prompt load) then stabilizes.

#### Section: File Impact (default collapsed)

Files this session touched, derived from tool timeline:

- File path
- Operations: read / write / edit counts
- First and last touch timestamps
- Grouped by directory for readability

#### Section: Health Details (default collapsed)

If session has fair/poor health:

- Health reason tags with explanations
- Specific metrics that triggered each reason (error rate %, retry count, token usage vs limit, idle gap duration)
- Actionable context — not just "high error rate" but "14 tool errors out of 42 calls (33%)"

#### Section: Lifecycle Events (default collapsed)

Chronological list of session state changes:

- Permission mode changes
- Queue events (enqueue/dequeue)
- Tools changed events
- Bridge events

Low-traffic section but useful for understanding session behavior edge cases.

---

## Interactions

- **List ↔ Detail sync**: Clicking a list row populates the detail panel. Arrow keys navigate the list.
- **Deep linking**: URL params encode selected session ID — `/analytics?tab=sessions&id=abc123`
- **Cross-tab links**: Health dot links to Health Details section. Cost links to Token Breakdown. File links could open in Library editor.
- **From other tabs**: Nerve Center session vitals and Charts session bars link here with session pre-selected.

---

## Data Sources

All from `ParsedSession` via parser cache:

| Section | Parser fields |
|---------|--------------|
| List row | `meta.*`, `counts.*`, health score, cost calculation |
| Overview | `meta.*`, `counts.*`, model aggregation, cost, cache rate |
| Tool Timeline | `toolTimeline[]` |
| Token Breakdown | `assistantMessages[].usage.*`, `userMessages[]` |
| File Impact | `toolTimeline[].filePath` grouped by file |
| Health Details | Health computation from `session-analytics.ts` |
| Lifecycle | `lifecycle[]` |

### Backend

- Session list endpoint with sort/filter params (extend existing `/api/sessions`)
- Session detail endpoint returning full ParsedSession (extend existing `/api/sessions/:id`)
- Most data already available — main work is frontend presentation

### Frontend

- List-detail split layout component
- Compact session row component
- Detail panel with collapsible sections
- Tool timeline component (chronological, filterable)
- Token breakdown sparkline + table
- File impact grouped list
- Filter pill bar component
- URL param sync for selected session + active filters

---

## Session-Task Auto-Linking Improvements

### Current State

Auto-linking uses 4 signals to score session-task matches (threshold 0.4):

| Signal | Weight | How it works |
|--------|--------|-------------|
| Git branch contains task ID | 0.5 | `branch.includes(taskId)` — most reliable |
| Git branch contains milestone name | 0.2 | `branch.includes(milestoneName)` — weaker, shared across tasks |
| File path overlap | 0.3 | Fractional: `(matched touches / total touches) × 0.3` |
| Timing correlation | 0.2 | Session started within ±10min of task update |

Maximum possible score: 1.2. Works well for sessions that follow naming conventions (branch = task ID). Weaker for ad-hoc sessions or tasks without `filesTouch` labels.

### Improvements

The session parser now provides richer signals that can improve matching accuracy:

**New signal candidates:**

| Signal | Weight | Rationale |
|--------|--------|-----------|
| **Skill/command invocations** | 0.15 | `systemEvents.localCommands` — if a session invoked `/work-task TASK-042`, that's a strong correlation |
| **Session message content** | 0.2 | If the task ID or title appears in user/assistant message text, likely related |
| **Tool diversity match** | 0.1 | Tasks with `complexity:high` that match sessions with many different tool types |
| **Sidechain presence** | 0.05 | Tasks with `parallel-safe` label matching sessions with high sidechain count |

**Existing signal refinements:**

- **File path matching**: Currently exact path or suffix only. Improve to support directory-level matching — if task touches `server/scanner/`, match any file under that directory.
- **Timing window**: Currently fixed 10 minutes. Scale based on session duration — a 3-hour session likely started well before the task was updated. Consider `session active during task update window` instead of `session started near task update`.
- **Milestone substring safety**: Current substring matching risks false positives with generic names. Add minimum length check or word-boundary matching.

**New detail panel section:**

Add a "Linked Task" section to the session detail panel:

- If auto-linked: show task title, milestone, link score breakdown (which signals matched and by how much), confidence indicator
- If manually linked: show task title, "manual link" badge
- If no link: show "No task linked" with option to manually associate

This surfaces the linking logic to the user — if a match feels wrong, you can see why it scored the way it did and override it.

### Implementation

- Add new scoring signals to `autoLinkSession()` in `session-enricher.ts`
- Improve file path matching with directory-level support
- Add score breakdown to `SessionEnrichment` return type (for detail panel transparency)
- Add "Linked Task" section to session detail panel component
- Update tests for new signals and edge cases
