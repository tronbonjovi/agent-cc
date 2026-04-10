# Navigation Restructure + Board Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify navigation from 10 items to 6, rename Board to Projects, rename Backlog to Queue, remove the Ready column and archive zone from the Kanban board.

**Architecture:** Route renames with redirects for old paths. Board column changes flow through a shared type (`BoardColumn`) that's referenced by client components, server aggregator, task I/O, and tests. Archive removal deletes the component, server endpoints, hooks, and DB schema references.

**Tech Stack:** TypeScript, React (wouter router), Express.js, Vitest

---

### Task 1: Update BoardColumn Type and Constants

**Files:**
- Modify: `shared/board-types.ts:3`
- Modify: `client/src/lib/board-columns.ts:12-18`

- [ ] **Step 1: Update the BoardColumn type**

In `shared/board-types.ts`, change line 3:

```typescript
// Before:
export type BoardColumn = "backlog" | "ready" | "in-progress" | "review" | "done";

// After:
export type BoardColumn = "queue" | "in-progress" | "review" | "done";
```

- [ ] **Step 2: Update BOARD_COLUMNS constant**

In `client/src/lib/board-columns.ts`, replace lines 12-18:

```typescript
// Before:
export const BOARD_COLUMNS: BoardColumnDef[] = [
  { id: "backlog",     label: "Backlog",     color: "bg-slate-400",  description: "Known work, not yet prioritized" },
  { id: "ready",       label: "Ready",       color: "bg-blue-400",   description: "Prioritized, ready to pick up" },
  { id: "in-progress", label: "In Progress", color: "bg-amber-400",  description: "Someone is actively working" },
  { id: "review",      label: "Review",      color: "bg-purple-400", description: "Work done, needs human eyes" },
  { id: "done",        label: "Done",        color: "bg-emerald-400",description: "Approved and complete" },
];

// After:
export const BOARD_COLUMNS: BoardColumnDef[] = [
  { id: "queue",       label: "Queue",       color: "bg-slate-400",  description: "Waiting to be worked" },
  { id: "in-progress", label: "In Progress", color: "bg-amber-400",  description: "Someone is actively working" },
  { id: "review",      label: "Review",      color: "bg-purple-400", description: "Work done, needs human eyes" },
  { id: "done",        label: "Done",        color: "bg-emerald-400",description: "Approved and complete" },
];
```

- [ ] **Step 3: Run type check to see what breaks**

Run: `npm run check`
Expected: TypeScript errors in files still referencing `"backlog"` or `"ready"` — this is expected and will guide subsequent tasks.

- [ ] **Step 4: Commit**

```bash
git add shared/board-types.ts client/src/lib/board-columns.ts
git commit -m "refactor: rename BoardColumn backlog→queue, remove ready column"
```

---

### Task 2: Update Server Status Mappings

**Files:**
- Modify: `server/board/aggregator.ts:72-94`
- Modify: `server/task-io.ts:103-113`

- [ ] **Step 1: Update statusToColumn in aggregator.ts**

In `server/board/aggregator.ts`, replace the `statusToColumn` function (lines 72-94):

```typescript
/** Map a status string to a board column. Handles both regular task statuses and claude-workflow statuses. */
export function statusToColumn(status: string): BoardColumn {
  switch (status) {
    case "backlog":
    case "pending":
    case "planned":
    case "todo":
    case "ready":
      return "queue";
    case "in-progress":
    case "in_progress":
    case "blocked":
      return "in-progress";
    case "review":
      return "review";
    case "done":
    case "completed":
    case "cancelled":
      return "done";
    default:
      return "queue";
  }
}
```

- [ ] **Step 2: Update columnToWorkflowStatus in task-io.ts**

In `server/task-io.ts`, replace the `columnToWorkflowStatus` function (lines 103-113):

```typescript
/** Reverse-map board column names to claude-workflow status values. */
function columnToWorkflowStatus(column: string): string {
  switch (column) {
    case "queue": return "pending";
    case "in-progress": return "in_progress";
    case "review": return "review";
    case "done": return "completed";
    default: return column;
  }
}
```

- [ ] **Step 3: Run type check**

Run: `npm run check`
Expected: Fewer errors now — aggregator and task-io should be clean. Remaining errors will be in client components and tests.

- [ ] **Step 4: Commit**

```bash
git add server/board/aggregator.ts server/task-io.ts
git commit -m "refactor: update status mappings for queue column, remove ready/backlog"
```

---

### Task 3: Remove Archive Infrastructure

**Files:**
- Delete: `client/src/components/board/archive-zone.tsx`
- Modify: `client/src/pages/board.tsx` (remove archive imports and rendering)
- Modify: `client/src/hooks/use-board.ts` (remove archive hooks)
- Modify: `server/routes/board.ts` (remove archive endpoints)
- Modify: `server/board/aggregator.ts` (remove archive functions)
- Delete: `tests/archive-zone.test.ts`

- [ ] **Step 1: Remove archive imports and rendering from board.tsx**

In `client/src/pages/board.tsx`, remove the archive-related imports (lines 8-9):

```typescript
// Remove these lines:
import { ArchiveZone } from "@/components/board/archive-zone";
import type { ArchivedMilestone } from "@/components/board/archive-zone";
```

Remove archive hooks from the destructured imports on line 11. Change:

```typescript
// Before:
import { useBoardState, useBoardStats, useBoardEvents, applyBoardFilters, useBoardProjects, useArchivedMilestones, useArchiveMilestone } from "@/hooks/use-board";

// After:
import { useBoardState, useBoardStats, useBoardEvents, applyBoardFilters, useBoardProjects } from "@/hooks/use-board";
```

Remove the archive hook calls (around lines 44-45):

```typescript
// Remove these lines:
const { data: archivedMilestones } = useArchivedMilestones();
const archiveMilestone = useArchiveMilestone();
```

Remove the `<ArchiveZone>` component from the JSX. Find the three-zone layout (around line 156) and remove the archive zone div, converting from 3-zone to 2-zone layout. The exact JSX will vary, but look for the section rendering `<ArchiveZone milestones={...} />` and remove it. Adjust the remaining zones to fill the space (Projects ~25%, Board ~75%).

- [ ] **Step 2: Delete archive-zone.tsx**

```bash
rm client/src/components/board/archive-zone.tsx
```

- [ ] **Step 3: Remove archive hooks from use-board.ts**

In `client/src/hooks/use-board.ts`, find and remove:
- `useArchivedMilestones` hook (fetches `/api/board/milestones/archived`)
- `useArchiveMilestone` hook (posts to `/api/board/milestones/:id/archive`)

Also remove their exports.

- [ ] **Step 4: Remove archive endpoints from server routes**

In `server/routes/board.ts`, remove:
- The `POST /api/board/milestones/:id/archive` handler (around line 122-136)
- The `GET /api/board/milestones/archived` handler (around line 138-145)

- [ ] **Step 5: Remove archive functions from aggregator.ts**

In `server/board/aggregator.ts`, remove:
- `isArchived` function (lines 38-41)
- `setArchived` function (lines 43-53)
- `getArchivedMilestones` function (lines 68-70)

Check if `getBoardState()` uses `isArchived` to filter milestones — if so, remove that filter so all milestones show (completed ones just won't have an archive zone to go to).

- [ ] **Step 6: Delete archive-zone test file**

```bash
rm tests/archive-zone.test.ts
```

- [ ] **Step 7: Run type check and tests**

Run: `npm run check && npm test`
Expected: Type check should pass for archive removal. Some tests may fail due to column name changes (handled in Task 5).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor: remove archive zone, hooks, endpoints, and tests"
```

---

### Task 4: Update Navigation Sidebar

**Files:**
- Modify: `client/src/components/layout.tsx:13-70`

- [ ] **Step 1: Update imports**

In `client/src/components/layout.tsx`, replace the icon imports (lines 13-28):

```typescript
import {
  LayoutDashboard,
  Kanban,
  Library,
  MessageSquare,
  BarChart3,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
```

Remove unused icon imports: `Server`, `Wand2`, `Puzzle`, `FileText`, `Settings`, `Bot`.

- [ ] **Step 2: Replace nav structure**

Replace the `NavSection` interface and `navSections` array (lines 32-70) with a flat nav item list:

```typescript
interface NavItem {
  path: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  countKey: string | null;
}

const navItems: NavItem[] = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard, countKey: null },
  { path: "/projects", label: "Projects", icon: Kanban, countKey: null },
  { path: "/library", label: "Library", icon: Library, countKey: null },
  { path: "/sessions", label: "Sessions", icon: MessageSquare, countKey: "session" as const },
  { path: "/analytics", label: "Analytics", icon: BarChart3, countKey: null },
  { path: "/settings", label: "Settings", icon: SlidersHorizontal, countKey: null },
];
```

- [ ] **Step 3: Update sidebar rendering**

The current JSX iterates `navSections.map(section => ...)` with section headers. Replace with a flat `navItems.map(item => ...)` that removes the section header divs. The nav item rendering logic (active state, tooltips, collapsed state) stays the same — just remove the outer section loop and section labels.

Replace the nav section in the `<ScrollArea>` (around lines 123-214):

```tsx
<ScrollArea className="flex-1">
  <nav className="px-2 pb-2">
    <div className="space-y-0.5">
      {navItems.map((item) => {
        const isActive =
          item.path === "/"
            ? location === "/"
            : location.startsWith(item.path);
        const count = item.countKey === "session"
          ? (status as any)?.sessionCount
          : item.countKey ? counts[item.countKey] : null;

        const navContent = (
          <Link key={item.path} href={item.path}>
            <div
              className={cn(
                "flex items-center rounded-md px-3 py-2 text-sm transition-all duration-150 cursor-pointer group relative",
                collapsed ? "justify-center" : "gap-2.5",
                isActive
                  ? "bg-gradient-to-r from-brand-1/15 via-brand-2/10 to-transparent text-sidebar-accent-foreground font-medium"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground hover:translate-x-0.5 hover:shadow-[inset_0_0_12px_hsl(var(--nav-active)/0.06)]"
              )}
            >
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-gradient-to-b from-brand-1 to-brand-2 shadow-[0_0_8px_var(--glow-blue)]" />
              )}
              <item.icon className={cn("h-4 w-4 flex-shrink-0 transition-all duration-150", isActive && "text-nav-active", !isActive && "group-hover:scale-110 group-hover:text-nav-active/70")} />
              {!collapsed && (
                <>
                  <span className="flex-1">{item.label}</span>
                  {count != null && count > 0 && (
                    <span className="text-[10px] font-mono text-muted-foreground tabular-nums">
                      {count}
                    </span>
                  )}
                </>
              )}
              {collapsed && isActive && (
                <div className="absolute -right-0.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-nav-active" />
              )}
            </div>
          </Link>
        );

        if (collapsed) {
          return (
            <Tooltip key={item.path}>
              <TooltipTrigger asChild>
                {navContent}
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs">
                {item.label}
                {count != null && count > 0 && (
                  <span className="ml-1.5 font-mono text-muted-foreground">({count})</span>
                )}
              </TooltipContent>
            </Tooltip>
          );
        }

        return <React.Fragment key={item.path}>{navContent}</React.Fragment>;
      })}
    </div>
  </nav>
</ScrollArea>
```

Remove the `NavSection` interface and `children` property from `NavItem` since neither is used anymore.

- [ ] **Step 4: Run type check**

Run: `npm run check`
Expected: May show errors about missing `/library` and `/analytics` routes — those are created in Task 5.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/layout.tsx
git commit -m "refactor: flatten sidebar to 6 nav items, remove section headers"
```

---

### Task 5: Update Routes and Add Redirects

**Files:**
- Modify: `client/src/App.tsx`
- Modify: `client/src/pages/projects.tsx` (swap redirect direction)
- Modify: `client/src/pages/activity.tsx` (update redirect target)
- Create: `client/src/pages/library.tsx` (placeholder)

- [ ] **Step 1: Create library placeholder page**

Create `client/src/pages/library.tsx`:

```typescript
import { Redirect } from "wouter";

/** /library route — placeholder until Library redesign (Spec 2). Redirects to /skills. */
export default function LibraryPage() {
  return <Redirect to="/skills" />;
}
```

- [ ] **Step 2: Update projects.tsx redirect direction**

Replace `client/src/pages/projects.tsx`:

```typescript
import { Redirect } from "wouter";

/** /board route — redirects to /projects (renamed in nav restructure). */
export default function BoardRedirect() {
  return <Redirect to="/projects" />;
}
```

Wait — this file is currently `projects.tsx` redirecting to `/board`. We need it the other way: `/board` should redirect to `/projects`. The cleanest approach:

- `board.tsx` stays as the real board page, but is now served at `/projects`
- `projects.tsx` becomes unused as a redirect (it was redirecting to `/board`, which is now the real page served at `/projects`)

Actually, we need a new redirect file for `/board` → `/projects`. Repurpose `projects.tsx` since it's currently just a redirect:

Replace `client/src/pages/projects.tsx` — but wait, this will be the lazy import for the `/projects` route which now serves the board. Let's handle this in App.tsx routing instead.

- [ ] **Step 3: Update App.tsx routes**

In `client/src/App.tsx`, update the imports and routes:

Add the library import:
```typescript
const LibraryPage = lazy(() => import("@/pages/library"));
```

Update the route definitions inside `<Switch>`. The key changes:
- `/projects` now renders `BoardPage` (the actual board)
- `/board` now renders a redirect to `/projects`
- `/stats` now renders a redirect to `/analytics`
- `/analytics` renders `Stats`
- `/library` renders `LibraryPage`
- Remove the separate `Projects` lazy import (it was just a redirect)

```tsx
<Switch>
  <Route path="/">
    <ErrorBoundary pageName="Dashboard"><Dashboard /></ErrorBoundary>
  </Route>
  <Route path="/projects">
    <ErrorBoundary pageName="Projects"><BoardPage /></ErrorBoundary>
  </Route>
  <Route path="/projects/:id">
    <ErrorBoundary pageName="Project Detail"><ProjectDetail /></ErrorBoundary>
  </Route>
  <Route path="/library">
    <ErrorBoundary pageName="Library"><LibraryPage /></ErrorBoundary>
  </Route>
  <Route path="/sessions">
    <ErrorBoundary pageName="Sessions"><Sessions /></ErrorBoundary>
  </Route>
  <Route path="/analytics">
    <ErrorBoundary pageName="Analytics"><Stats /></ErrorBoundary>
  </Route>
  <Route path="/settings">
    <ErrorBoundary pageName="Settings"><SettingsPage /></ErrorBoundary>
  </Route>

  {/* Redirects for old routes */}
  <Route path="/board">
    <ErrorBoundary pageName="Board"><Projects /></ErrorBoundary>
  </Route>
  <Route path="/stats">
    <ErrorBoundary pageName="Stats"><ActivityPage /></ErrorBoundary>
  </Route>

  {/* Entity pages — kept for direct URL access until Library (Spec 2) */}
  <Route path="/mcps">
    <ErrorBoundary pageName="MCPs"><MCPs /></ErrorBoundary>
  </Route>
  <Route path="/skills">
    <ErrorBoundary pageName="Skills"><Skills /></ErrorBoundary>
  </Route>
  <Route path="/plugins">
    <ErrorBoundary pageName="Plugins"><Plugins /></ErrorBoundary>
  </Route>
  <Route path="/agents">
    <ErrorBoundary pageName="Agents"><Agents /></ErrorBoundary>
  </Route>
  <Route path="/markdown">
    <ErrorBoundary pageName="Markdown Files"><MarkdownFiles /></ErrorBoundary>
  </Route>
  <Route path="/markdown/:id">
    <ErrorBoundary pageName="Markdown Editor"><MarkdownEdit /></ErrorBoundary>
  </Route>
  <Route path="/activity">
    <ErrorBoundary pageName="Activity"><ActivityPage /></ErrorBoundary>
  </Route>
  <Route path="/live">
    <ErrorBoundary pageName="Live View"><Live /></ErrorBoundary>
  </Route>
  <Route path="/apis">
    <ErrorBoundary pageName="APIs"><APIs /></ErrorBoundary>
  </Route>
  <Route component={NotFound} />
</Switch>
```

- [ ] **Step 4: Update projects.tsx to redirect /board → /projects**

Replace `client/src/pages/projects.tsx`:

```typescript
import { Redirect } from "wouter";

/** /board redirect — board was renamed to /projects. */
export default function Projects() {
  return <Redirect to="/projects" />;
}
```

This component is now used by the `/board` route in App.tsx to redirect to `/projects`.

- [ ] **Step 5: Update activity.tsx redirect target**

In `client/src/pages/activity.tsx`, update the redirect:

```typescript
import { Redirect } from "wouter";

/** /activity route — redirects to /analytics (renamed from /stats). */
export default function ActivityPage() {
  return <Redirect to="/analytics?tab=activity" />;
}
```

- [ ] **Step 6: Create a /stats redirect page**

Create `client/src/pages/stats-redirect.tsx`:

```typescript
import { Redirect } from "wouter";

/** /stats redirect — analytics was renamed from /stats. */
export default function StatsRedirect() {
  return <Redirect to="/analytics" />;
}
```

Then in App.tsx, use this for the `/stats` route instead of reusing `ActivityPage`:

```typescript
const StatsRedirect = lazy(() => import("@/pages/stats-redirect"));
```

And update the `/stats` route:
```tsx
<Route path="/stats">
  <ErrorBoundary pageName="Stats"><StatsRedirect /></ErrorBoundary>
</Route>
```

- [ ] **Step 7: Run type check**

Run: `npm run check`
Expected: Should pass — all routes have components, all imports resolve.

- [ ] **Step 8: Commit**

```bash
git add client/src/App.tsx client/src/pages/projects.tsx client/src/pages/activity.tsx client/src/pages/library.tsx client/src/pages/stats-redirect.tsx
git commit -m "refactor: rename routes — /board→/projects, /stats→/analytics, add /library placeholder"
```

---

### Task 6: Fix Board Page Column References

**Files:**
- Modify: `client/src/pages/board.tsx`
- Modify: any board components referencing `"backlog"` or `"ready"` column IDs

- [ ] **Step 1: Search for stale column references in client code**

Run: `grep -rn '"backlog"\|"ready"' client/src/`

This will show every client file still referencing old column names. Update each one:
- `"backlog"` → `"queue"`
- `"ready"` → remove (or `"queue"` if it was a fallback)

- [ ] **Step 2: Fix each file found**

For each file from step 1, update the column references. Common patterns:
- Filter conditions: `column === "backlog"` → `column === "queue"`
- Default values: `column ?? "backlog"` → `column ?? "queue"`
- Object keys in `byColumn`: update key names

- [ ] **Step 3: Update BoardStats byColumn references**

In `shared/board-types.ts`, the `BoardStats` interface has `byColumn: Record<BoardColumn, number>`. Since `BoardColumn` was already updated in Task 1, this is already correct. But check any code that constructs `BoardStats` objects (in `server/board/aggregator.ts`) — it must use `"queue"` instead of `"backlog"` and not include `"ready"`.

- [ ] **Step 4: Run type check and dev server**

Run: `npm run check`
Expected: PASS — no more type errors.

Run: `npm run dev` and manually verify the board loads with 4 columns.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "fix: update all client column references from backlog/ready to queue"
```

---

### Task 7: Update Tests

**Files:**
- Modify: 16 test files (see list below)

The following test files reference `"backlog"`, `"ready"`, or archive functionality. Each needs updating.

**High-impact files (many references):**
- `tests/board-aggregator.test.ts` (48 refs)
- `tests/board-workspace.test.ts` (16 refs)
- `tests/board-routes.test.ts` (14 refs)

**Medium-impact:**
- `tests/board-types.test.ts` (7 refs)
- `tests/task-scanner.test.ts` (7 refs)
- `tests/board-validator.test.ts` (6 refs)
- `tests/board-integration.test.ts` (5 refs)
- `tests/task-io.test.ts` (4 refs)

**Low-impact (1-3 refs each):**
- `tests/board-ui.test.ts`
- `tests/board-delete.test.ts`
- `tests/board-events.test.ts`
- `tests/workflow-bridge.test.ts`
- `tests/stale-prune.test.ts`
- `tests/stale-edge-cases.test.ts`
- `tests/project-delete.test.ts`
- `tests/path-safety.test.ts`

- [ ] **Step 1: Bulk find-replace in test files**

In all test files under `tests/`:
- Replace `"backlog"` → `"queue"` (as a column ID)
- Replace `"ready"` → `"queue"` (as a column ID — be careful not to replace the word "ready" in descriptions/strings that aren't column references)
- Remove any test cases specifically testing the `"ready"` column as distinct from backlog
- Remove any archive-specific test assertions (archive zone rendering, archive milestone hooks, archive API calls)

- [ ] **Step 2: Handle archive-specific tests in remaining files**

In `tests/board-routes.test.ts` — remove tests for:
- `POST /api/board/milestones/:id/archive`
- `GET /api/board/milestones/archived`

In `tests/board-workspace.test.ts` — remove archive zone assertions.

In `tests/board-aggregator.test.ts` — remove tests for `isArchived`, `setArchived`, `getArchivedMilestones`.

- [ ] **Step 3: Run full test suite**

Run: `npm test`
Expected: All tests pass. If any fail, read the error and fix the specific assertion.

- [ ] **Step 4: Commit**

```bash
git add tests/
git commit -m "test: update all tests for queue column rename and archive removal"
```

---

### Task 8: Update CLAUDE.md and Documentation

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update status mapping tables in CLAUDE.md**

Find the status mapping section and update:

```markdown
### Status Mapping

\```
Workflow → Board                Board → Workflow
─────────────────               ─────────────────
pending    → queue              queue       → pending
todo       → queue              in-progress → in_progress
in_progress → in-progress       review      → review
review     → review             done        → completed
completed  → done
blocked    → in-progress
cancelled  → done
planned    → queue
(unknown)  → queue
\```
```

- [ ] **Step 2: Update board column references**

Search CLAUDE.md for any mentions of "backlog", "ready" (as column), "archive zone", "5 columns", "3-zone" and update them:
- "5 columns" → "4 columns"
- "3-zone" → "2-zone"
- Column list: Queue, In Progress, Review, Done
- Remove archive zone mentions

- [ ] **Step 3: Update file structure if any files were renamed/deleted**

Remove `archive-zone.tsx` from any file listings. Add `library.tsx` and `stats-redirect.tsx` if pages are listed.

- [ ] **Step 4: Update test count and descriptions**

Update the test description line to reflect archive-zone tests being removed and column changes.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for nav restructure and board cleanup"
```

---

### Task 9: Run Safety Checks and Final Verification

**Files:** None (verification only)

- [ ] **Step 1: Run safety tests**

Run: `npx vitest run tests/new-user-safety.test.ts --reporter=dot`
Expected: PASS — no PII, no hardcoded paths.

- [ ] **Step 2: Run full test suite**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 3: Run type check**

Run: `npm run check`
Expected: No errors.

- [ ] **Step 4: Manual smoke test**

Run: `npm run dev`

Verify:
- Sidebar shows 6 items: Dashboard, Projects, Library, Sessions, Analytics, Settings
- No section headers in sidebar
- Clicking Projects loads the board page with 4 columns: Queue, In Progress, Review, Done
- No archive zone visible
- `/board` redirects to `/projects`
- `/stats` redirects to `/analytics`
- `/library` redirects to `/skills` (placeholder)
- Entity pages (`/mcps`, `/skills`, `/plugins`, `/agents`, `/markdown`) still load via direct URL
- Board tasks appear in correct columns (pending/planned/todo/ready all in Queue)

- [ ] **Step 5: Commit any remaining fixes**

If any issues found during smoke test, fix and commit:

```bash
git add -A
git commit -m "fix: address smoke test findings from nav restructure"
```

- [ ] **Step 6: Deploy**

```bash
scripts/deploy.sh
```
