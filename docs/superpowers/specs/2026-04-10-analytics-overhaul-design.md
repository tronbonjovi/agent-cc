# Analytics Overhaul Design

## Status

Spec finalized April 10, 2026. All brainstorm items resolved. Cross-referenced against current codebase and prior work. Items marked [DONE] are already implemented. Items marked [IMPLEMENT] are ready for planning. Items marked [PARKED] are deferred to a future cycle.

## Prior Work Already Completed

- [DONE] `nav-consolidation` milestone moved Session Analytics and Graph into the Analytics page as tabs
- [DONE] Sessions page restructured to Sessions/Messages/Prompts tabs
- [DONE] SessionHealthPanel removed from sessions page
- [DONE] Graph moved from sidebar into Analytics page
- [DONE] Sidebar cleaned up (Messages, Graph links removed)

---

## Current Structure

**Main tabs (6):** Sessions, Usage, Costs, Activity, Graph, Discover

**Sessions sub-tabs (10):** Nerve Center, Usage Analytics, File Heatmap, Session Health, Projects, Weekly Digest, Prompts, Workflows, Bash KB, Decisions

**Total surfaces: 16**

---

## Decided Changes — Ready to Implement

### [IMPLEMENT] Nerve Center → First-Class Main Tab

- **Promote** Nerve Center from Sessions subtab to the **first main tab** in Analytics
- **Replaces "Sessions" as the container tab** — "Sessions" is confusing as an analytics container when there's already a Sessions page in the main nav
- Nerve Center is the operational pulse of Agent CC — service health + scanning/intelligence system status at a glance
- Current modules stay: service health, cost pacing, attention items, overnight activity, uncommitted work
- Surviving subtabs (File Heatmap, Session Health, Decisions) nest under Nerve Center as its subtabs
- Weekly Digest demoted to a section within Nerve Center (not its own subtab)

### [IMPLEMENT] Costs → Promoted Main Tab

- **Remove** the main "Costs" tab (redundant with the subtab — nearly identical content)
- **Remove** the main "Usage" tab (generic, not helpful, covered by Costs)
- **Promote** Sessions > "Usage Analytics" sub-tab to a **main tab**, renamed to **"Costs"**
- This becomes the single cost surface in Analytics
- Vet and fix the modules within (real data from `/api/sessions/analytics/costs`)

### [IMPLEMENT] Graph → Charts/Trends

- **Replace** the ReactFlow entity-relationship graph with **time-series data visualizations**
- Cost over time, session frequency, project velocity, token usage trends, error rates
- Use a charting library (e.g., Recharts) instead of ReactFlow
- The old entity graph concept doesn't fit analytics — it was mapping markdown config files, which is more of a Library/exploration concern
- **Future possibility (not this cycle):** repurpose entity graph as a per-project relationship map in Library/Board, scoped to one project's skills/MCPs/agents/memory

### [IMPLEMENT] Session Health Rework

- Currently shows useless aggregates ("30 poor", "21 errors") with no drill-down
- **Replace with a drill-down table** of poor/fair sessions — session ID, project, when, error count, cost
- Each session gets a **"why" tag** explaining the health rating: "high error rate", "excessive retries", "context overflow", "long idle gaps", etc.
- Click a row → navigate to that session
- The "why" tags enable pattern recognition at a glance without clicking into every session
- Lives as a subtab under Nerve Center

### [IMPLEMENT] Move "Discover" to Library

- Remove from Analytics main nav
- Add as a new tab in Library — GitHub repo search/marketplace tool, not analytics
- Component: `DiscoverTab()` in `stats.tsx`, uses GitHub API with local caching
- **Coordinate with Library cleanup spec** — adds a tab to Library

### [IMPLEMENT] Move "Prompts" to Library

- Remove from Sessions sub-tabs in Analytics
- Also remove the Prompts tab from the Sessions page (duplicated there)
- Add as a new tab in Library — prompt template CRUD tool, not analytics
- Component: `PromptLibraryPanel()` in `session-analytics-panel.tsx`
- **Coordinate with Library cleanup spec** — adds a tab to Library

### [IMPLEMENT] Remove "Projects" Sub-tab

- No value beyond what project cards show elsewhere
- Tags look bad (broken tagging system), no drill-down
- Component: `ProjectDashboardPanel()` — delete

### [IMPLEMENT] Demote "Weekly Digest"

- Good data, doesn't warrant its own tab
- Relocate as a section within Nerve Center
- Component: `WeeklyDigestPanel()` — relocate, don't delete

### [IMPLEMENT] Demote "Bash KB"

- Searchable bash command knowledge base — useful but niche
- Move to a section within another page, or into Library as a reference tool
- Component: `BashKnowledgePanel()` — relocate, don't delete

### [IMPLEMENT] Keep "Activity" Tab (as-is)

- Basic changelog — functional, not broken
- Future rework candidate but not blocking this cycle

---

## Parked Items

### [PARKED] Decisions System

- AI-powered decision extraction from sessions (uses Claude Haiku). Currently returns no data — pipeline may not have been triggered or thresholds are too high. The concept (auto-ADRs from conversations) has value but needs debugging and quality assessment.
- **Not ready for a decision.** Don't delete, don't invest time this cycle. Revisit later.
- Lives under Nerve Center subtabs for now.

### [PARKED] Workflows Tab

- Auto-workflow config toggles (auto-summarize, flag stale, cost alerts) that were never used.
- Deeply tied to the cross-project vision of how Agent CC and workflow-framework integrate. Requires brainstorming on both projects — how to make this informative/instructional for the framework, surface superpowers interactions, and serve as a configuration surface.
- **Parked until the workflow-framework project catches up.** Don't delete, don't invest time this cycle.

---

## Target Structure (Post-Overhaul)

### Main Tabs (4)

| Tab | Source | Notes |
|-----|--------|-------|
| **Nerve Center** | Promoted from subtab | First tab. Operational dashboard. Has its own subtabs. |
| **Costs** | Promoted from Usage Analytics subtab | Single cost surface. Replaces both old Costs and Usage tabs. |
| **Activity** | Existing | Keep as-is. |
| **Charts** | Replaces Graph | Time-series visualizations (cost, sessions, tokens, velocity). |

### Nerve Center Sub-tabs

| Sub-tab | Source | Notes |
|---------|--------|-------|
| **Overview** | Existing Nerve Center content | Service health, cost pacing, attention items, overnight activity, uncommitted work. Weekly Digest as a section here. |
| **File Heatmap** | Existing | Keep as-is |
| **Session Health** | Existing, reworked | Drill-down table with "why" tags |
| **Decisions** | Existing | Parked — shows current state, revisit later |
| **Workflows** | Existing | Parked — shows current state, revisit later |

### Moved to Library

| Component | Source |
|-----------|--------|
| Discover | Analytics main tab |
| Prompts | Sessions sub-tab + Sessions page |
| Bash KB | Sessions sub-tab (or section elsewhere) |

### Removed

| Component | Reason |
|-----------|--------|
| Usage (main tab) | Redundant with Costs |
| Costs (main tab) | Replaced by promoted sub-tab |
| Sessions (container tab) | Replaced by Nerve Center |
| Projects (sub-tab) | No value |

---

## Dependencies

- Library cleanup spec covers the receiving end for Discover, Prompts, and possibly Bash KB
- Prompts also needs removal from the Sessions page (separate from Analytics)
- Session Health rework touches scanner (health reason extraction), API, and frontend
- Charts tab requires adding a charting library (e.g., Recharts) and new API endpoints or data aggregation for time-series
- "Entity" terminology should be phased out across the codebase as work touches these areas — shift to specific names (skills, plugins, MCPs, agents, memory, config files)
