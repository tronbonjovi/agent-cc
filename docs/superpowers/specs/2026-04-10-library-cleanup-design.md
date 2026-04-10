# Library Cleanup Design

## Status

Spec finalized April 10, 2026. All brainstorm items resolved. Cross-referenced against current codebase. Library redesign milestone is complete (tabs, entity cards, three-tier layout, file editor migration). This spec covers remaining cleanup, plus incoming tabs from the Analytics overhaul.

## Overview

Four areas: fix section navigation within tabs, compact the card layout, clean up the File Editor tab, and accommodate incoming components from Analytics.

---

## 1. Section Navigation — Vertical Sections to Tabs

### Current State

- Skills, Plugins, MCP Servers tabs use **vertical sections** with `TierHeading` components (e.g., Installed → Saved → Marketplace stacked vertically with section headings)
- Agents tab already has **internal sub-tabs** (Definitions, History, Stats) — this is the pattern that works
- File Editor tab has **horizontal category tabs** (All, CLAUDE.md, Memory, Skill, README, Other) via Radix UI Tabs

### What's Needed

- [IMPLEMENT] **Replace vertical sections with tabs** in Skills, Plugins, and MCP Servers. Follow the Agents tab pattern — horizontal sub-tabs (e.g., Installed | Saved | Marketplace) instead of scrolling through stacked sections.

---

## 2. Card Compaction

### Current State

- `EntityCard` component shows: icon, name (truncated), description (2-line clamp), status badge, health dot, tags, action buttons
- Cards are oversized for their content — big padded blocks with lots of whitespace, feels bulky

### What's Needed

- [IMPLEMENT] **Compact card style.** Reduce padding, tighten text sizes, improve density. Consider a list/row layout option for tabs with many items (e.g., Skills could have dozens). Same data, packed denser so the page isn't 80% whitespace and borders.

---

## 3. File Editor Tab → "Info" Tab

### Current State

The File Editor tab contains 11 modules including informational panels (memory health, budget meter, dependency graph, context summary) and file listings.

### What's Needed

- [IMPLEMENT] **Rename tab** from "File Editor" to **"Info"**
- [IMPLEMENT] **Remove file listings** (the file cards grid) from this tab
- [IMPLEMENT] **Reorganize the insight/info modules** into a clean layout — memory health, budget meter, dependency graph, context summary. Good data, just needs better visual organization.
- [IMPLEMENT] **Remove neon/gradient styling** across all library components:
  - `gradient-border` class on Agents stat cards
  - Gradient progress bars in Agents tab (`bg-gradient-to-r from-blue-500 to-cyan-500`)
  - Glow shadows (`shadow-[0_0_6px_rgba(...)]`)
  - `card-hover` lift/glow effect in File Editor
  - CSS utilities in `index.css`: `.neon-glow-*`, `.gradient-border::before`, glow CSS variables
  - Replace all with solid colors

---

## 4. Incoming Tabs from Analytics Overhaul

These components are moving from Analytics to Library (per the analytics-overhaul spec):

- [IMPLEMENT] **Discover tab** — GitHub repo search/marketplace. Component: `DiscoverTab()` from `stats.tsx`. Add as a new Library tab.
- [IMPLEMENT] **Prompts tab** — Prompt template CRUD. Component: `PromptLibraryPanel()` from `session-analytics-panel.tsx`. Also remove duplicate from Sessions page. Add as a new Library tab.
- [IMPLEMENT] **Bash KB** (possibly) — Searchable bash command knowledge base. Component: `BashKnowledgePanel()`. Could be a Library tab or a section within another page. Final placement TBD during implementation.

---

## Post-Overhaul Library Tabs

| Tab | Source | Notes |
|-----|--------|-------|
| Skills | Existing | Sub-tabs replace vertical sections |
| Plugins | Existing | Sub-tabs replace vertical sections |
| MCP Servers | Existing | Sub-tabs replace vertical sections |
| Agents | Existing | Already has sub-tabs, keep as-is |
| Info | Renamed from File Editor | Insight modules only, no file listings |
| Discover | From Analytics | GitHub search/marketplace |
| Prompts | From Analytics | Template CRUD |
| [Bash KB?] | From Analytics | Placement TBD |

---

## Terminology Note

As part of the broader shift from "entity scanning" to "configuration scanning and management," the term "entity" should be phased out in user-facing UI. Internal code can keep using `EntityCard` etc. for now, but labels, headings, and descriptions should use specific names (skills, plugins, MCPs, agents, memory, config files) instead of the generic "entity."

---

## Dependencies

- Analytics overhaul determines which components move to Library and when — coordinate timing
- Section navigation change (item 1) is independent per-tab
- Card compaction (item 2) is a single pass across all tabs
- File Editor rename + reorganization (item 3) is one unit of work
- Neon removal can be done as a sweep across library components + global CSS
