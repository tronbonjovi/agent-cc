# Session Health Indicators — Design Spec

## Purpose

Surface active session health metrics (context usage, cost, message count) in a dedicated panel on the Sessions & Agents page. Helps build habits around session length management by providing glanceable, color-coded indicators with configurable thresholds.

## Context

The data pipeline already exists. `ActiveSession` (via the live scanner) provides `contextUsage` (tokensUsed, maxTokens, percentage), `costEstimate`, message count, and status. This feature surfaces that data in a useful, actionable way — no new server-side computation required.

## Health Panel

### Placement

Top of the Sessions page (currently "Sessions", planned rename to "Sessions & Agents" in future UI rework). Shows only when active sessions exist — disappears entirely when nothing is running.

### Layout (per session row)

```
[dot] Session name (first message)          $cost  msgs  [status badge]
      [==============                    ] context progress bar
```

- **Status dot** (left) — 8px circle, color = worst metric across all three thresholds
- **Session name** — first message text, truncated as needed
- **Cost** (top-right) — USD value, independently color-coded
- **Message count** (top-right) — count with "msgs" suffix, independently color-coded
- **Status badge** (top-right) — thinking/waiting/idle/stale, pill-shaped, color matches dot
- **Progress bar** — thin (4px), indented past dot, shows context usage %, color follows context threshold

### Empty State

Panel is not rendered when no active sessions exist. No "no active sessions" message — it simply isn't there.

## Threshold System

### Default Thresholds

| Metric | Green | Yellow | Red |
|--------|-------|--------|-----|
| Context % | < 20% | 20–50% | > 50% |
| Cost (USD) | < $3 | $3–5 | > $5 |
| Messages | < 30 | 30–60 | > 60 |

### Color Logic

- Each metric is independently color-coded against its own thresholds
- The status dot reflects the worst (highest severity) color across all three metrics
- The progress bar color follows the context threshold specifically
- Colors: green (#22c55e), yellow (#eab308), red (#ef4444)

### Threshold Crossing Animation

When a metric crosses a threshold boundary for the first time (detected by comparing current state to previous poll), the metric value briefly pulses via CSS animation. This draws attention to the change without being intrusive. Steady-state metrics do not animate.

Crossing detection uses a React ref to track previous threshold levels per session per metric.

## Polling Strategy

### Smart Polling

- **Active mode (5s interval)** — when at least one active session is detected
- **Idle mode (30s interval)** — when no active sessions exist, polling to detect new ones
- **Suspended** — when the page is not visible (React Query `refetchOnWindowFocus` handles resume)

### Implementation

- React Query hook wrapping `GET /api/live/sessions`
- `refetchInterval` dynamically set based on whether active sessions exist in the current data
- No new server endpoints — existing live scanner response has all required fields

### Data Source

`GET /api/live/sessions` already returns per-session:
- `contextUsage.percentage` — context window usage (0–100)
- `contextUsage.tokensUsed`, `contextUsage.maxTokens` — raw token counts
- `costEstimate` — USD cost estimate from JSONL tail sampling
- `messageCount` — user + assistant message count
- `status` — thinking / waiting / idle / stale

No additional computation or endpoints needed.

## Settings

### Storage

Thresholds stored in `~/.agent-cc/agent-cc.json` alongside existing app settings.

Schema:
```typescript
interface SessionHealthThresholds {
  context: { yellow: number; red: number };  // percentages, defaults: 20, 50
  cost: { yellow: number; red: number };      // USD, defaults: 3, 5
  messages: { yellow: number; red: number };  // count, defaults: 30, 60
}
```

### Settings UI

A "Session Health" section on the existing settings page:
- Three groups (Context %, Cost, Messages)
- Each group has two number inputs: yellow threshold, red threshold
- "Reset to defaults" link restores original values
- Validation: yellow must be less than red, all values must be positive

## Scope Boundaries

### In Scope
- Health panel component on Sessions & Agents page
- Three-metric threshold system with color coding
- Smart polling with active/idle speeds
- Threshold crossing pulse animation
- Settings page section for configuring thresholds
- Threshold persistence in app database

### Out of Scope
- Toast/push notifications when thresholds are crossed
- Historical health data or trends
- SSE/WebSocket real-time updates (upgrade path if polling proves insufficient)
- Session recommendations ("you should wrap up")
- Global status bar visible on all pages
