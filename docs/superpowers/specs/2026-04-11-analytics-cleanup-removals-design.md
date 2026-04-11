# Analytics Cleanup — Removals & Relocations Design

**Date:** 2026-04-11
**Status:** Draft
**Scope:** Remove Decisions, relocate Workflows to Settings, relocate Prompt Templates, nav cleanup

---

## Removals

### Decisions Tab & Backend

Remove entirely. The implementation is half-baked and the user will design their own system if needed.

**Delete:**
- `DecisionLogPanel` component
- `/api/decisions` endpoint and route handler
- Decision storage/persistence logic in backend
- Any decision-related types in shared/types

**Verify:** No other features depend on the decisions API or data.

---

## Relocations

### Workflows → Settings

Move the workflow configuration panel from Nerve Center subtab to the Settings page as a new section/tab.

- Move `WorkflowConfigPanel` component to Settings
- Update Settings page to include a "Workflows" section (auto-summarize, stale session flags, cost alerts)
- Remove from Nerve Center subtab list

### Prompt Templates → Library or Settings

The prompt templates panel currently lives on the Messages page (right side panel). It doesn't belong in a conversation viewer.

- Relocate to Library (as a tab or subtab) or Settings
- Library is the natural home — it already manages skills, plugins, MCPs, agents. Prompts fit that pattern.
- Remove from Messages page layout

---

## Navigation Cleanup

### Remove from sidebar:
- **Sessions** — now lives under Analytics > Sessions tab
- **Activity** — absorbed into Nerve Center

### Route redirects:
- `/sessions` → `/analytics?tab=sessions`
- `/activity` → `/analytics?tab=nerve-center`

### Resulting sidebar (7 items):
Dashboard, Projects, Library, Live, Analytics, APIs, Settings

Note: Live and APIs are currently hidden. Future candidates for further consolidation but not in this scope.

---

## Implementation Notes

- Removals should happen first (clean the slate before rebuilding)
- Workflow relocation is independent of the Nerve Center rebuild
- Prompt template relocation is independent of the Messages redesign
- Route redirects should be added when the new Analytics tabs are ready, not before (avoid broken redirects to tabs that don't exist yet)
