# Layout System Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change the app layout from a scroll wrapper to a fixed shell so pages get a constrained viewport box with independent panel scrolling.

**Architecture:** One change in layout.tsx switches the content wrapper from `overflow-y-auto` (scroll canvas) to `overflow-hidden` (fixed box). PageContainer gets a scroll-page variant. Each page either scrolls within its box or subdivides into independently scrollable panels.

**Tech Stack:** React, Tailwind CSS, existing layout/page components

**Spec:** `docs/superpowers/specs/2026-04-10-layout-system-design.md`

---

### Task 1: Layout shell — remove scroll wrapper, create fixed viewport

**Files:**
- Modify: `client/src/components/layout.tsx:280-283`
- Test: `tests/layout-viewport.test.ts` (create)

- [ ] **Step 1: Write failing test — layout renders page content in a fixed viewport box**

```typescript
// tests/layout-viewport.test.ts
import { describe, it, expect } from "vitest";

describe("layout viewport contract", () => {
  it("content wrapper uses overflow-hidden not overflow-y-auto", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("client/src/components/layout.tsx", "utf-8");
    // The main content wrapper must not use overflow-y-auto
    // It should use overflow-hidden to create a fixed viewport box
    const mainContentMatch = src.match(/className="flex-1\s+([^"]+)"/g) || [];
    const contentWrappers = mainContentMatch.filter(m => m.includes("flex-1"));
    const hasScrollWrapper = contentWrappers.some(m => m.includes("overflow-y-auto"));
    expect(hasScrollWrapper, "layout.tsx should not have overflow-y-auto on the content wrapper — pages manage their own scrolling").toBe(false);
  });

  it("page-enter wrapper passes height to children", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("client/src/components/layout.tsx", "utf-8");
    expect(src).toContain("page-enter h-full");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/layout-viewport.test.ts`
Expected: FAIL — layout.tsx still has `overflow-y-auto` and `page-enter` without `h-full`

- [ ] **Step 3: Apply the layout change**

In `client/src/components/layout.tsx`, change line 280 from:

```tsx
<div className="flex-1 overflow-y-auto overflow-x-hidden">
  <div className="page-enter">
```

To:

```tsx
<div className="flex-1 overflow-hidden">
  <div className="page-enter h-full">
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/layout-viewport.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/components/layout.tsx tests/layout-viewport.test.ts
git commit -m "feat: layout shell — fixed viewport box instead of scroll wrapper"
```

---

### Task 2: PageContainer — add scroll-page support

**Files:**
- Modify: `client/src/components/page-container.tsx`
- Test: `tests/layout-viewport.test.ts` (append)

- [ ] **Step 1: Write failing test — PageContainer supports h-full and overflow-y-auto**

Append to `tests/layout-viewport.test.ts`:

```typescript
describe("PageContainer scroll support", () => {
  it("PageContainer renders with h-full and overflow-y-auto by default", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("client/src/components/page-container.tsx", "utf-8");
    // Root div should have h-full and overflow-y-auto for scroll pages
    expect(src).toMatch(/h-full/);
    expect(src).toMatch(/overflow-y-auto/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/layout-viewport.test.ts`
Expected: FAIL — PageContainer has no height or overflow classes

- [ ] **Step 3: Update PageContainer**

In `client/src/components/page-container.tsx`, change the root div from:

```tsx
<div
  className={`w-full ${className ?? ""}`}
  style={{ padding: "var(--page-padding)" }}
>
```

To:

```tsx
<div
  className={`w-full h-full overflow-y-auto ${className ?? ""}`}
  style={{ padding: "var(--page-padding)" }}
>
```

This makes PageContainer fill its viewport box and scroll its content. Pages that want panel behavior (like Board) don't use PageContainer — they manage their own layout.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/layout-viewport.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/components/page-container.tsx tests/layout-viewport.test.ts
git commit -m "feat: PageContainer — fill viewport box with scroll support"
```

---

### Task 3: Dashboard — active sessions fills width, centered, scrolls within viewport

**Files:**
- Modify: `client/src/pages/dashboard.tsx:158-354`
- Test: `tests/dashboard-layout.test.ts` (check if exists, create or append)

- [ ] **Step 1: Write failing test — dashboard uses overflow-hidden on PageContainer and active sessions area scrolls independently**

```typescript
// tests/dashboard-viewport.test.ts
import { describe, it, expect } from "vitest";

describe("dashboard viewport layout", () => {
  it("dashboard PageContainer uses overflow-hidden to prevent double scroll", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("client/src/pages/dashboard.tsx", "utf-8");
    // Dashboard should override PageContainer's default scroll with overflow-hidden
    // so it can manage its own scroll regions (status bar pinned, sessions scroll)
    expect(src).toMatch(/PageContainer[\s\S]*?overflow-hidden/);
  });

  it("active sessions area is centered and fills most of the width", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("client/src/pages/dashboard.tsx", "utf-8");
    // Should use mx-auto for centering
    expect(src).toMatch(/mx-auto/);
    // Should NOT be a narrow fixed box — needs generous width
    // w-[70%] or similar percentage-based width, or max-w with w-full
  });

  it("active sessions area has its own scroll", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("client/src/pages/dashboard.tsx", "utf-8");
    // The sessions container should be scrollable
    expect(src).toMatch(/overflow-y-auto/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/dashboard-viewport.test.ts`
Expected: FAIL — dashboard doesn't have the right overflow structure yet

- [ ] **Step 3: Update dashboard layout**

In `client/src/pages/dashboard.tsx`, restructure the return JSX. The Dashboard needs to be a panel page: status bar pinned at top, sessions area scrollable below.

Change the PageContainer usage to:

```tsx
<PageContainer
  className="overflow-hidden flex flex-col"
  title="Dashboard"
  actions={/* existing actions unchanged */}
>
```

Note: PageContainer already has `h-full overflow-y-auto` from Task 2. The `overflow-hidden` in className will override the default `overflow-y-auto`, making Dashboard a panel page.

Then wrap the content below the status bar. Change:

```tsx
{/* Active Sessions */}
<div className="w-[70%] mx-auto space-y-3">
```

To:

```tsx
{/* Active Sessions — scrollable area */}
<div className="flex-1 min-h-0 overflow-y-auto">
  <div className="w-[85%] max-w-[1400px] mx-auto space-y-3 py-2">
```

And close the new wrapper div after the sessions grid (before the closing `</PageContainer>`):

```tsx
  </div>
</div>
```

The `w-[85%] max-w-[1400px] mx-auto` gives sessions most of the width, centered, with a cap so it doesn't stretch absurdly on ultra-wide monitors. The `flex-1 min-h-0 overflow-y-auto` wrapper makes the sessions area take remaining space and scroll independently while the status bar stays pinned.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/dashboard-viewport.test.ts`
Expected: PASS

- [ ] **Step 5: Visual verification**

Run: `npm run dev`
Open `http://localhost:5100` in browser. Check:
- Status bar stays at top when scrolling sessions
- Active sessions cards fill most of the width, centered
- Terminal panel stays at bottom
- Expanding terminal shrinks the sessions area

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/dashboard.tsx tests/dashboard-viewport.test.ts
git commit -m "feat: dashboard — active sessions fills viewport, centered, independent scroll"
```

---

### Task 4: Board — height constraints flow to all 3 panels

**Files:**
- Modify: `client/src/pages/board.tsx`
- Modify: `client/src/components/board/project-zone.tsx` (if needed)
- Modify: `client/src/components/board/completed-milestones-zone.tsx` (if needed)
- Test: `tests/board-viewport.test.ts` (create)

- [ ] **Step 1: Write failing test — board panels are height-constrained**

```typescript
// tests/board-viewport.test.ts
import { describe, it, expect } from "vitest";

describe("board viewport layout", () => {
  it("board root uses h-full and overflow-hidden", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("client/src/pages/board.tsx", "utf-8");
    expect(src).toMatch(/flex flex-col h-full overflow-hidden/);
  });

  it("3-zone row uses min-h-0 to allow height constraint", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("client/src/pages/board.tsx", "utf-8");
    // The flex row containing the 3 zones needs min-h-0 so flex-1 constrains height
    expect(src).toMatch(/min-h-0 flex-1/);
  });

  it("sidebar wrappers use h-full for height constraint", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("client/src/pages/board.tsx", "utf-8");
    // Both sidebar wrappers (projects and completed) need h-full
    const hFullSidebarCount = (src.match(/shrink-0 overflow-hidden h-full/g) || []).length;
    expect(hFullSidebarCount).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails or passes**

Run: `npx vitest run tests/board-viewport.test.ts`

The board already has `h-full overflow-hidden` on its root and `h-full` on the sidebar wrappers (from the unstaged change). This test may already pass. If it does, move to visual verification.

- [ ] **Step 3: Check ProjectZone and CompletedMilestonesZone for overflow-y-auto**

Read `client/src/components/board/project-zone.tsx` and `client/src/components/board/completed-milestones-zone.tsx`. Each component's content area needs `overflow-y-auto` and `flex-1 min-h-0` so it scrolls within its panel. If missing, add it.

ProjectZone should have a structure like:
```tsx
<div className="h-full flex flex-col">
  {/* header — flex-shrink-0 */}
  <div className="flex-1 min-h-0 overflow-y-auto">
    {/* scrollable project list */}
  </div>
</div>
```

CompletedMilestonesZone should follow the same pattern.

- [ ] **Step 4: Visual verification**

Run: `npm run dev`
Open `http://localhost:5100/projects` in browser. Check:
- All 3 panels (projects, kanban columns, completed) are constrained to viewport height
- Scrolling the completed milestones list does NOT scroll the projects list or kanban columns
- Scrolling a kanban column does NOT scroll other columns
- Terminal stays at bottom
- Expanding terminal shrinks all 3 panels equally

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/board.tsx client/src/components/board/project-zone.tsx client/src/components/board/completed-milestones-zone.tsx tests/board-viewport.test.ts
git commit -m "feat: board — independent panel scrolling with viewport constraint"
```

---

### Task 5: Scroll pages — Library, Sessions, Analytics, Settings

**Files:**
- Modify: `client/src/pages/library.tsx`
- Modify: `client/src/pages/sessions.tsx`
- Modify: `client/src/pages/stats.tsx`
- Modify: `client/src/pages/settings.tsx`
- Test: `tests/layout-viewport.test.ts` (append)

- [ ] **Step 1: Write failing test — all scroll pages work within viewport**

Append to `tests/layout-viewport.test.ts`:

```typescript
describe("scroll pages use PageContainer defaults", () => {
  const scrollPages = [
    "client/src/pages/library.tsx",
    "client/src/pages/stats.tsx",
    "client/src/pages/settings.tsx",
  ];

  for (const page of scrollPages) {
    it(`${page} uses PageContainer`, async () => {
      const fs = await import("fs");
      const src = fs.readFileSync(page, "utf-8");
      expect(src).toMatch(/PageContainer/);
    });
  }

  it("sessions.tsx removes hardcoded calc(100vh - 220px) height", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("client/src/pages/sessions.tsx", "utf-8");
    // The old calc-based height is a hack — the viewport box handles this now
    expect(src).not.toMatch(/100vh\s*-\s*220px/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/layout-viewport.test.ts`
Expected: FAIL — sessions.tsx still has the calc hack

- [ ] **Step 3: Fix sessions.tsx — remove calc(100vh - 220px) hack**

In `client/src/pages/sessions.tsx`, find the messages tab container that uses:
```tsx
style={{ height: "calc(100vh - 220px)" }}
```

Remove the inline style and replace with flex-based sizing:
```tsx
className="flex-1 min-h-0"
```

This works because PageContainer now fills the viewport box and the messages tab content can use flex to take remaining space.

- [ ] **Step 4: Verify Library, Stats, Settings need no changes**

These pages use PageContainer with no special overflow handling. Since PageContainer now has `h-full overflow-y-auto`, they should just work — their content scrolls within the viewport box.

Open each page in the browser and confirm:
- Content scrolls within the page area
- Nav sidebar stays fixed
- Terminal stays at bottom
- No double scrollbars

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/layout-viewport.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/sessions.tsx tests/layout-viewport.test.ts
git commit -m "feat: scroll pages — remove viewport hacks, use fixed shell model"
```

---

### Task 6: Full regression check

**Files:** None (verification only)

- [ ] **Step 1: Run all existing tests**

Run: `npm test`
Expected: All tests pass. Fix any failures caused by the layout changes.

- [ ] **Step 2: Run safety tests**

Run: `npx vitest run tests/new-user-safety.test.ts`
Expected: PASS

- [ ] **Step 3: Visual regression — check every page in browser**

Run: `npm run dev`
Open `http://localhost:5100` and check each page:

| Page | What to verify |
|------|---------------|
| Dashboard | Status bar pinned, sessions centered and wide, scrolls independently, terminal stays |
| Projects/Board | 3 panels scroll independently, terminal stays, resize handles work |
| Library | Content scrolls within viewport, tabs work, terminal stays |
| Sessions | Session list scrolls, messages tab scrolls, no double scrollbars, terminal stays |
| Analytics | Tab content scrolls within viewport, terminal stays |
| Settings | Tab content scrolls within viewport, terminal stays |

- [ ] **Step 4: Test terminal interaction on every page**

On each page, expand the terminal panel by dragging. Verify:
- Page viewport shrinks
- Content remains usable
- Collapsing terminal restores the viewport

- [ ] **Step 5: Test responsive breakpoints**

Resize browser to check:
- **Mobile (< 640px):** Hamburger nav, pages stack vertically, board columns tab-switch
- **Tablet (640-1024px):** Collapsed nav, pages still work within viewport
- **Desktop (> 1024px):** Full nav, all panel layouts work

- [ ] **Step 6: Commit any regression fixes**

```bash
git add -A
git commit -m "fix: layout system regression fixes"
```

Only commit this if there were fixes needed. Skip if everything passed.
