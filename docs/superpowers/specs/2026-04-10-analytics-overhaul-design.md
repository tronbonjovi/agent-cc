# Spec 4: Analytics Overhaul (Draft — Needs Full Brainstorm)

## Status

This is a rough design captured during the April 10, 2026 brainstorm session. It documents the problems, known overlaps, and directional thinking but has NOT been through a full brainstorm cycle. A dedicated brainstorm session should flesh out the consolidation strategy, tab structure, and session health improvements before implementation planning.

## Problem

The Analytics page has grown into an information architecture mess. There are 6 main tabs, and the first tab (Sessions) alone has 10 sub-tabs. Many sub-tabs overlap with main tabs or show data that belongs on other pages entirely. The user sees two levels of navigation with 16 total surfaces, many of which present different angles on the same underlying data.

## Current Structure

**Main tabs (6):** Sessions, Usage, Costs, Activity, Graph, Discover

**Sessions sub-tabs (10):** Nerve Center, Usage Analytics, File Heatmap, Session Health, Projects, Weekly Digest, Prompts, Workflows, Bash KB, Decisions

Total surfaces: 16

## Known Overlaps and Misplacements

| Sessions Sub-tab | Problem | Likely Resolution |
|---|---|---|
| Usage Analytics | Overlaps with main Usage tab — showing similar data in two places | Merge into main Usage tab |
| Session Health | Belongs closer to session browsing, not analytics | Move to Sessions page or make actionable within Analytics |
| Projects | Duplicates data available on the Projects/Board page | Remove or replace with a cross-link |
| Weekly Digest | Related to Costs/Usage aggregate data | Merge into Costs or make a standalone periodic report |
| Prompts | Already exists as a tab on the Sessions page | Remove the duplicate |
| Workflows | Dead feature — auto-summarize, flag stale, cost alerts toggles that were never used | Repurpose or remove entirely |

## Unique Features Needing Homes

These sub-tabs are genuinely unique and need to be preserved somewhere:

| Sub-tab | What It Does | Possible Home |
|---|---|---|
| Nerve Center | Live monitoring / overview | Dashboard (it's real-time data) or stays in Analytics |
| File Heatmap | Visualization of which files are touched most | Stays in Analytics (unique viz) |
| Bash KB | Knowledge base of bash commands/patterns from sessions | Library (it's a reference resource) or stays |
| Decisions | ADR-like decision tracking from sessions | Needs its own deeper plan — currently underbuilt |

## Session Health Improvements

The Session Health view is the most specifically criticized feature. Current problems:

1. **Health rating is a black box** — shows "poor"/"fair"/"good" with no breakdown of what contributed to the score
2. **Errors are just counts** — "3 errors" with no access to the actual error messages
3. **No drill-down** — can't click into a session to see what happened
4. **No pattern recognition** — doesn't surface recurring issues across sessions
5. **Truncated session IDs** — hard to identify which session is which

What it needs:
- **Score breakdown** — which health factors (errors, retries, context overflow, cost, runtime) contributed to the rating, with weights visible
- **Error detail** — actual error messages from the JSONL, not just counts
- **Clickable sessions** — click a session to navigate to its detail view (on the Sessions page)
- **Pattern detection** — "5 sessions this week hit the same tool error" or "project X consistently overflows context"
- **Remediation hints** — when possible, suggest what to do about common issues

This is a significant feature that touches:
- Scanner (extracting error details from JSONL session files)
- API (serving richer health data with error messages)
- Frontend (drill-down UI, score breakdown visualization)

## Workflow-Framework Integration

The Workflows sub-tab currently has unused auto-workflow toggles. Options for repurposing:

1. **Plugin management** — install, configure, check status of the workflow-framework plugin. This might belong in Library instead.
2. **Workflow viewer** — visual representation of active roadmaps, milestones, task flow. This is the "interact" use case.
3. **Educational** — explain how workflow-framework works, link to docs. Lightweight but useful for onboarding.

Decision needed: is workflow-framework integration a configure thing (Library), an interact thing (its own view), or an educate thing (docs)? This needs separate discussion.

## Design Direction

The same consolidation pattern used for Library (Spec 2) should apply here: find natural groupings, layer related data, eliminate duplication. The goal is fewer surfaces showing more coherent information.

Rough direction:
- Merge overlapping tabs (Usage + Usage Analytics, remove duplicate Prompts/Projects)
- Elevate unique features (File Heatmap, Bash KB) to main tabs or integrate into relevant main tabs
- Make Session Health actionable (the biggest feature improvement)
- Decide on Nerve Center's home (Dashboard vs Analytics)
- Decide on Decisions' future (standalone feature or part of something larger)

## Dependencies

- Independent of Specs 1-3 structurally
- Session Health improvements may benefit from Responsive Foundation (Spec 3) for the drill-down UI
- If Nerve Center moves to Dashboard, that's a Dashboard change not covered by other specs

## Next Steps

1. Dedicated brainstorm session to work through the consolidation strategy
2. Decide on the new tab structure (how many main tabs, what goes where)
3. Design the Session Health drill-down in detail
4. Decide on Workflows/Decisions/Nerve Center placement
5. Write full spec and implementation plan
