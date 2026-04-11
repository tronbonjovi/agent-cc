# Analytics Restructure & Nerve Center Design

**Date:** 2026-04-11
**Status:** Draft
**Scope:** Analytics page tab restructure, Nerve Center reimagination, nav consolidation

---

## Problem

The analytics page has a nested tab structure (4 main tabs, Nerve Center has 5 subtabs) that adds navigation friction without adding clarity. Several subtabs are half-baked (Decisions), misplaced (Workflows), or would be more useful absorbed into a cohesive overview (File Heatmap, Session Health, Activity). Sessions and Messages live as separate top-level nav items but are fundamentally analytics data.

## Design

### Tab Structure

Flatten to 5 main tabs, no subtabs anywhere:

| Tab | Purpose |
|-----|---------|
| **Nerve Center** | Scanner-as-nervous-system topology. The "how's everything feeling" overview |
| **Costs** | Token/dollar breakdowns. The "what am I spending" view |
| **Charts** | Time-series trends and distributions. The "what are the patterns" view |
| **Sessions** | Browse/search/inspect individual sessions. The "let me look at this one" view |
| **Messages** | Conversation-level viewer with filtering. The "what did we actually say" view |

### Removed / Relocated

- **Decisions tab** — Removed entirely. Delete component, route, API endpoint, and backend plumbing.
- **Workflows tab** — Relocated to Settings page as a section/tab.
- **Activity tab** — Absorbed into Nerve Center as the "Activity Reflexes" module.
- **File Heatmap subtab** — Absorbed into Nerve Center as the "File Sensors" module.
- **Session Health subtab** — Absorbed into Nerve Center as the "Session Vitals" module.

### Navigation Changes

Current sidebar (9 items): Dashboard, Projects, Library, Activity, Sessions, Live, Analytics, APIs, Settings

New sidebar (7 items): Dashboard, Projects, Library, Live, Analytics, APIs, Settings

- **Sessions** — removed from nav, lives under Analytics > Sessions tab
- **Activity** — removed from nav, absorbed into Nerve Center

Note: Live and APIs are hidden but retained for now. Future candidates for relocation (Live is an embeddable widget, APIs could move to Settings or Library).

Route redirects:
- `/sessions` → `/analytics?tab=sessions`
- `/activity` → `/analytics?tab=nerve-center`

---

## Nerve Center — Scanner as Central Nervous System

### Concept

The Nerve Center is a topology visualization where the scanner is the **brain** — the central processing node receiving sensory input from nerve clusters (modules). Each module is an organ reporting a different domain of system health. Connected by nerve pathways that show data flow.

Not a grid of dashboard cards. A living system diagram.

### Topology Layout

The scanner brain sits at the center. Nerve pathways radiate outward to 5 organ modules arranged around it. Each pathway subtly animates when data flows. Organs shift color/intensity based on their state.

```
                    ┌──────────────┐
                    │  Cost Nerves │
                    └──────┬───────┘
                           │
    ┌───────────────┐      │      ┌──────────────────┐
    │ Activity      ├──────┼──────┤  Session Vitals   │
    │ Reflexes      │      │      │                    │
    └───────────────┘      │      └──────────────────┘
                     ┌─────┴─────┐
                     │  Scanner  │
                     │   Brain   │
                     └─────┬─────┘
                           │
    ┌───────────────┐      │      ┌──────────────────┐
    │ Service       ├──────┼──────┤  File Sensors     │
    │ Synapses      │      │      │                    │
    └───────────────┘             └──────────────────┘
```

### Scanner Brain (Center Node)

The central processing node. Visual state reflects overall system health.

- Last scan timestamp
- Total sessions in memory
- Cache health (hit rate, size)
- Overall system state indicator (calm / busy / stressed)

### Organ Modules

**Cost Nerves** — Senses token spending and model usage
- This week's spend vs average (pacing)
- Trend direction (up/down/stable)
- Highest-cost session flag
- Tap to navigate directly to Costs tab for deep analysis

**Session Vitals** — Senses individual session health
- Good / fair / poor distribution (visual health readout)
- Count of flagged sessions with top health reasons
- Creative but professional visualization (not just numbers — think vital signs monitor, body scan readout, or similar)
- Tap a flagged session to jump to Sessions tab

**File Sensors** — Senses file system activity
- Most-active files as a temperature map (hot/warm/cool zones)
- Operation types: reads, writes, edits
- Session spread (how many sessions touch each file)
- Visual warmth indicates activity intensity

**Activity Reflexes** — Senses recent changes and events
- Latest signals: what just fired, what just changed
- Changelog-style feed (replaces current Activity tab)
- Compact, recent-first, time-grouped

**Service Synapses** — Senses external service connections
- Up/down/latency for configured services
- Response time indicators
- Carries forward existing Nerve Center service status functionality

### Visual Language

- **Nerve pathways**: Lines connecting brain to organs. Subtle pulse animation when data flows.
- **Organ state colors**: Green (healthy), amber (attention), red (alert). Intensity reflects severity.
- **Brain state**: Visual cue for overall system state — derived from worst organ status.
- **Professional tone**: System topology diagram aesthetic. No cartoon anatomy. Think network operations center meets data visualization.
- **Solid colors only**: No gradients on text or accents (user preference).

### Interaction

- Each organ module is tappable/clickable for quick context
- Cost Nerves links to Costs tab
- Session Vitals links to Sessions tab (filtered to unhealthy)
- File Sensors expands inline or links to a detail view
- Activity Reflexes scrolls/expands for more history

---

## Implementation Notes

### Removals
- Delete `DecisionLogPanel` component and `/api/decisions` endpoint + backend
- Move `WorkflowConfigPanel` to Settings page
- Remove Nerve Center subtab infrastructure

### Migrations
- `FileHeatmapPanel` → refactored as a Nerve Center organ module (compact form)
- `SessionHealthPanel` → refactored as a Nerve Center organ module (compact form with creative viz)
- `NerveCenterPanel` → rebuilt as the topology layout container
- Activity changelog → extracted from Activity tab into an organ module

### New Components
- Topology layout container (brain + pathways + organ slots)
- Scanner Brain module
- Individual organ module components (compact, color-reactive)
- Nerve pathway animation (CSS or lightweight SVG)

### Route Changes
- `/sessions` → redirect to `/analytics?tab=sessions`
- `/activity` → redirect to `/analytics?tab=nerve-center`
- Update nav sidebar to remove Sessions and Activity items
