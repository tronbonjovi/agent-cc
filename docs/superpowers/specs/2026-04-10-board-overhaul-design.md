# Board Overhaul Design

## Status

Spec finalized April 10, 2026. All brainstorm items resolved. Cross-referenced against current codebase. Items marked [DONE] are already implemented. Items marked [IMPLEMENT] are ready for planning.

## Overview

Improvements to the Board page covering completed task visibility, card info restoration, project sidebar cleanup, and layout/header polish.

---

## 1. Completed Task/Milestone Handling

### What's Already Done

- [DONE] 3-zone layout with completed milestones in right sidebar (`completed-milestones-zone.tsx`)
- [DONE] Completed milestone cards show color dot, "done" badge, task count, full green progress bar
- [DONE] Project cards only show active milestone progress bars (completed milestones filtered out via `activeMilestones()`)

### What's Still Needed

- [IMPLEMENT] **Completed milestones should absorb their Done tasks.** Currently completed tasks from finished milestones still show as cards in the Done column. The completed milestones zone (right sidebar) should "claim" those tasks — hide them from Done and make them accessible as collapsible children within each completed milestone card. Click a completed milestone → see its task cards.
- [IMPLEMENT] **Project popout roadmap list.** The popout currently shows aggregate numbers (e.g., "21 Milestones, 0 In Progress, 62 Done") but no milestone names. Replace with a named checklist — strikethrough or checkmarks indicating which milestones are completed vs. active. Full roadmap visibility.

---

## 2. Task Card Info Radiators

### What's Already Done

- [DONE] Cards with linked sessions show: model badge, agent role badge, message count, duration, token count, cost pill (with "session" qualifier), status light, agent activity
- [DONE] Tags, priority badges render when present
- [DONE] Cost labeled as session-level with tooltip

### What's Still Needed

- [IMPLEMENT] **Cards without sessions show almost nothing.** The `hasSession` guard means historical/completed tasks display only: title, project name, milestone name, tags. Need to surface task-level metadata (complexity, parallel-safe, model, agent, messages, time, tokens, cost) from the task's last-known session or from stored task metadata, even after the session ends.
- [IMPLEMENT] **Task name max-char truncation.** Currently `line-clamp-2` — need a character limit with ellipsis for size uniformity across cards.
- [IMPLEMENT] **Updated card layout (all cards, session or not):**

```
Task Name (truncated at max chars)
project name · milestone name
model · agent
complexity:___ · parallel-safe · [tags]
messages · time · tokens · cost
```

---

## 3. Project Sidebar Cleanup

### What's Already Done

- [DONE] Project cards are in a left sidebar (Zone 1) — resizable, default 260px, min 180px, max 400px
- [DONE] Shows: health dot, project name, milestone/task counts, overall progress bar, active milestone bars with colors, session count, total cost
- [DONE] Scrollable independently, adjustable width via drag handle
- [DONE] Card width adjusts dynamically with sidebar width

### What's Still Needed

- [IMPLEMENT] **Remove "Current" badge.** It's just the first project in the array — not user-selected, not meaningful. Remove the badge, remove the `isCurrent` logic, and allow delete on all projects equally.
- [IMPLEMENT] **Kanban center alignment.** The board (Zone 2) is left-aligned within its flex container. Should be center-aligned relative to the two sidebars so there's balanced whitespace.
- [IMPLEMENT] **Header rename.** Change "Board" to "Project Board" in `board-header.tsx`.

---

## 4. Filter System

- [IMPLEMENT] **Remove filters.** The current priority/flagged filter UI isn't earning its space — the board doesn't have enough cards to need filtering. Remove `board-filters.tsx` UI from the header. Backend filter support can stay (no cost to keeping it), but the UI goes away. If the board gets busier in the future, filters can be re-added with better context on what's actually needed.
- [IMPLEMENT] **Default hide completed milestone tasks.** This is not a filter — it's default behavior in the board aggregator. Tasks belonging to fully-completed milestones should not appear in kanban columns. The completed milestones zone handles their display (see item 1).

---

## Dependencies

- Card info for non-session tasks requires snapshotting session metadata onto the task record when a session ends (or reading from the last-known session). May need changes to session-enricher or task-scanner.
- Completed milestone task absorption requires changes to board aggregator (filter tasks by milestone completion status) and completed-milestones-zone (add expandable task lists).
- "Current" badge removal touches `project-card.tsx`, `use-board.ts`, and `project-popout.tsx` (which gates delete on `isCurrent`).
