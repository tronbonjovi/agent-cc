# Spec 1: Navigation Restructure + Board Cleanup

## Summary

Simplify Agent CC's navigation from 10 items (3 sections) to 6 items (flat list) and clean up the Kanban board by removing the Ready column, renaming Backlog to Queue, and removing the archive zone. This sets the structural skeleton for subsequent specs (Library redesign, responsive foundation, analytics overhaul).

## Navigation Changes

### New Sidebar (6 items, flat list)

| Nav Item | Route | Icon | Count Badge |
|----------|-------|------|-------------|
| Dashboard | `/` | LayoutDashboard | — |
| Projects | `/projects` | Kanban | — |
| Library | `/library` | BookOpen (or similar) | — |
| Sessions | `/sessions` | MessageSquare | session count |
| Analytics | `/analytics` | BarChart3 | — |
| Settings | `/settings` | SlidersHorizontal | — |

Section headers (Overview, Entities, Tools) are removed — 6 items don't need grouping.

### Route Changes

| Current Route | New Route | Action |
|---------------|-----------|--------|
| `/` | `/` | Keep |
| `/board` | `/projects` | Rename. Old `/board` redirects to `/projects` |
| `/stats` | `/analytics` | Rename. Old `/stats` redirects to `/analytics` |
| `/sessions` | `/sessions` | Keep |
| `/settings` | `/settings` | Keep |
| `/library` | `/library` | New route — placeholder redirect until Spec 2 |
| `/projects/:id` | `/projects/:id` | Keep (project detail page) |
| `/markdown`, `/markdown/:id` | Keep routes | Remove from nav, routes stay accessible |
| `/mcps`, `/skills`, `/plugins`, `/agents` | Keep routes | Remove from nav, routes stay accessible |
| `/activity` | `/analytics?tab=activity` | Update redirect target |
| `/prompts` | `/sessions` | Keep existing redirect |

### Entity Pages During Transition

MCP Servers, Skills, Plugins, Agents, and Markdown pages keep their routes but are removed from the sidebar. They remain accessible via direct URL until Spec 2 (Library redesign) absorbs them into the Library page with tabs. No page code is deleted in this spec.

### Library Placeholder

The `/library` route is created with a simple placeholder page that shows a message like "Library — coming soon" or redirects to the first entity page (`/skills`). The real Library page is built in Spec 2.

## Board Changes

### Column Simplification

**Current (5 columns):** Backlog | Ready | In Progress | Review | Done

**New (4 columns):** Queue | In Progress | Review | Done

The Ready column is removed because nothing moves into it — tasks go straight from backlog to in-progress. Backlog is renamed to Queue to better reflect its purpose ("waiting to be worked").

### BOARD_COLUMNS Update

```typescript
// client/src/lib/board-columns.ts
export const BOARD_COLUMNS: BoardColumnDef[] = [
  { id: "queue",       label: "Queue",       color: "bg-slate-400" },
  { id: "in-progress", label: "In Progress", color: "bg-amber-400" },
  { id: "review",      label: "Review",      color: "bg-purple-400" },
  { id: "done",        label: "Done",        color: "bg-emerald-400" },
];
```

### Status Mapping Update (statusToColumn)

```
Workflow Status    → Board Column
──────────────────────────────────
pending            → queue
planned            → queue
todo               → queue
ready              → queue
in_progress        → in-progress
in-progress        → in-progress
blocked            → in-progress
review             → review
completed          → done
done               → done
cancelled          → done
(unknown/default)  → queue
```

All statuses that previously mapped to either `backlog` or `ready` now map to `queue`.

### Reverse Mapping Update (columnToWorkflowStatus)

```
Board Column → Workflow Status
──────────────────────────────
queue        → pending
in-progress  → in_progress
review       → review
done         → completed
```

The `queue` column maps back to `pending` (absorbs both old `backlog → pending` and `ready → pending` mappings).

### Archive Zone Removal

The archive zone (right-side panel showing completed milestones) is removed entirely:

- Remove `archive-zone.tsx` component
- Remove archive-related hooks (`useArchiveMilestone`)
- Remove archive API endpoint if dedicated
- Board layout changes from 3-zone (Projects 35% | Board 35% | Archive 30%) to 2-zone (Projects ~25% | Board ~75%)
- Completed milestones simply disappear from the board view

## Files to Modify

### Client

| File | Change |
|------|--------|
| `client/src/components/layout.tsx` | Replace `navSections` with flat 6-item list, remove section headers |
| `client/src/App.tsx` | Update route paths, add redirects |
| `client/src/lib/board-columns.ts` | Update `BOARD_COLUMNS` (remove ready, rename backlog→queue) |
| `client/src/pages/board.tsx` | Remove archive zone rendering, update to 2-zone layout. Keep the file as-is — route in App.tsx changes to serve it at `/projects` |
| `client/src/pages/projects.tsx` | Currently redirects to `/board` — update to redirect from `/board` to `/projects` (swap direction) |
| `client/src/pages/activity.tsx` | Update redirect target to `/analytics?tab=activity` |
| `client/src/components/board/archive-zone.tsx` | Delete |
| Any board components referencing `backlog` or `ready` column IDs | Update to `queue` |

### Server

| File | Change |
|------|--------|
| `server/board/aggregator.ts` | Update `statusToColumn()` — remove `ready` case, rename `backlog` to `queue` |
| `server/task-io.ts` | Update `columnToWorkflowStatus()` — `queue → pending`, remove `ready` case |
| `server/board/` routes (if any archive endpoints) | Remove archive-specific endpoints |

### Tests

| File | Change |
|------|--------|
| `tests/workflow-bridge.test.ts` | Update expected column names (`backlog` → `queue`, remove `ready`) |
| `tests/workspace-layout.test.ts` | Remove archive zone assertions |
| Board-related test files | Update column references |
| `tests/new-user-safety.test.ts` | Should pass without changes (no PII impact) |

### Docs

| File | Change |
|------|--------|
| `CLAUDE.md` | Update status mapping tables, nav docs, board column references |

## Out of Scope

- Library page implementation (Spec 2)
- Entity page consolidation into Library tabs (Spec 2)
- Responsive redesign (Spec 3)
- Analytics tab overhaul (Spec 4)
- Projects zone redesign (future)
- Session Health improvements (future)
- Dashboard changes (none)
- Workflow-framework integration page (future)

## CLAUDE.md Updates Required

After implementation, update the following CLAUDE.md sections:
- Status mapping tables (both directions) — replace `backlog` with `queue`, remove `ready`
- Any references to board columns or archive zone
- File structure section if files are renamed/deleted
