# Analytics Overhaul Design

## Status

Partially decided, partially needs brainstorm. User notes captured April 10, 2026. Items marked [DECIDED] can go straight to implementation planning. Items marked [BRAINSTORM] need investigation and a short design session before speccing.

## Current Structure

**Main Navigation (top bar):** Sessions, Usage, Costs, Activity, Graph, Discover

**Sessions sub-tabs (10):** Nerve Center, Usage Analytics, File Heatmap, Session Health, Projects, Weekly Digest, Prompts, Workflows, Bash KB, Decisions

Total surfaces: 16

---

## Decided Changes

### [DECIDED] Costs Consolidation

- **Remove** the main "Costs" tab
- **Rename** Sessions > "Usage Analytics" sub-tab to **"Costs"**
- This becomes the single source of truth for cost data
- Modules within need to be vetted and fixed but the structural decision is made

### [DECIDED] Move Discover to Library

- **Remove** "Discover" from Analytics main nav
- **Move** to Library page — this is a search/marketplace tool, not analytics
- May need refinement after the move, but it belongs in Library

### [DECIDED] Move Prompts to Library

- **Remove** "Prompts" from Sessions sub-tabs
- **Move** to Library page
- Already exists as a tab on the Sessions page — remove the duplicate in Analytics entirely

### [DECIDED] Remove Projects Sub-tab

- **Remove** Sessions > "Projects" sub-tab
- Doesn't do much beyond showing card info available elsewhere
- Tags look bad (part of a broken tagging system that needs fixing)
- No deeper menus or details to justify a dedicated tab

### [DECIDED] Demote Weekly Digest

- **Remove** as a dedicated Sessions sub-tab
- **Relocate** as a section within another page (specific page TBD — minor decision)

### [DECIDED] Demote Bash KB

- **Remove** as a dedicated Sessions sub-tab
- **Relocate** as a section within another page (specific page TBD — minor decision)

### [DECIDED] Remove/Replace Usage Main Tab

- The main "Usage" tab feels generic and not very helpful
- Replaced by the consolidated Costs tab (see above)

### [DECIDED] Activity Tab

- Currently a basic changelog
- Keep for now, but it's a candidate for future rework

---

## Needs Brainstorm

### [BRAINSTORM] Nerve Center Repurposing

**Current state:** Not serving a clear purpose.
**Direction:** Could be repurposed as a real-time "analytics dashboard" — live nerve-center info like active sessions, current spend rate, running agents, system health.
**Needs:** Investigation into what real-time data we have access to, what would be actionable, and what layout makes sense.

### [BRAINSTORM] Session Health Rework

**Current state:** Shows useless aggregates like "30 poor" or "21 errors" with no way to investigate or act.
**Direction:** Needs real intelligence — drill-down into what's wrong, pattern recognition, actionable remediation.
**Needs:** Investigation into what health data the scanner currently extracts, what's possible to surface, and UI design for drill-down.

### [BRAINSTORM] Graph Page

**Current state:** Confusing and appears broken. Shows some kind of entity mapping.
**Direction:** Could be useful for actual analytic insights presented as charts/graphs, not entity relationship mapping.
**Needs:** Investigation into what it currently does, then brainstorm on what graphing would actually provide value (cost trends? session patterns? project velocity?).

### [BRAINSTORM] Decisions System

**Current state:** Appears to be leftover vibe-code that may be broken.
**Needs:** Investigation first. Might just be a "delete it" outcome, or might have a kernel worth salvaging.

### [BRAINSTORM] Workflows Tab Rework

**Current state:** Has unused auto-workflow toggles (auto-summarize, flag stale, cost alerts) that were never used.
**Direction:** Should be reworked, but undecided. Parking for now.
**Options from prior spec:** Plugin management, workflow viewer, educational content — needs its own discussion.

---

## Proposed New Structure (Post-Overhaul)

Pending brainstorm outcomes, but directionally:

**Main tabs:** Sessions, Costs, Activity, [Graph — reworked or removed], [Nerve Center — if kept here]

**Sessions sub-tabs (reduced):** [Nerve Center — if moved here], File Heatmap, Session Health (reworked), Workflows (reworked), [Weekly Digest section], [Bash KB section]

**Moved to Library:** Discover, Prompts

**Removed entirely:** Projects sub-tab, Usage main tab, Costs main tab (replaced by promoted sub-tab)

---

## Dependencies

- Library cleanup spec covers the receiving end for Discover and Prompts moves
- Session Health rework touches scanner, API, and frontend
- Nerve Center repurposing may affect Dashboard if it moves there
- Independent of responsive-foundation but may benefit from it
