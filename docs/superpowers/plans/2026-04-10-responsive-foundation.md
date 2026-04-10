# Responsive Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish a cohesive responsive design system so Agent CC looks intentional at any viewport size — desktop, laptop, tablet, mobile, split screen, and any zoom level.

**Architecture:** A useBreakpoint hook provides JavaScript-level breakpoint awareness. Sizing tokens (CSS custom properties) ensure consistent spacing. The sidebar becomes a mobile-friendly slide-over drawer at small viewports. Each page gets a responsive pass using a shared PageContainer component and consistent grid patterns.

**Tech Stack:** TypeScript, React, Tailwind CSS (existing breakpoints: sm 640, md 768, lg 1024, xl 1280), shadcn/ui Sheet component, CSS custom properties

**Depends on:** Spec 1 (Nav Restructure) should be complete so the sidebar has its final 6-item structure.

---

### Task 1: Create useBreakpoint Hook

**Files:**
- Create: `client/src/hooks/use-breakpoint.ts`

- [ ] **Step 1: Write the breakpoint hook**

Create `client/src/hooks/use-breakpoint.ts`:

```typescript
import { useState, useEffect } from "react";

export type Breakpoint = "xs" | "sm" | "md" | "lg" | "xl";

const BREAKPOINTS: { name: Breakpoint; minWidth: number }[] = [
  { name: "xl", minWidth: 1280 },
  { name: "lg", minWidth: 1024 },
  { name: "md", minWidth: 768 },
  { name: "sm", minWidth: 640 },
  { name: "xs", minWidth: 0 },
];

function getBreakpoint(width: number): Breakpoint {
  for (const bp of BREAKPOINTS) {
    if (width >= bp.minWidth) return bp.name;
  }
  return "xs";
}

export function useBreakpoint(): Breakpoint {
  const [breakpoint, setBreakpoint] = useState<Breakpoint>(() =>
    typeof window !== "undefined" ? getBreakpoint(window.innerWidth) : "lg"
  );

  useEffect(() => {
    let rafId: number;
    const handleResize = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        setBreakpoint(getBreakpoint(window.innerWidth));
      });
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(rafId);
    };
  }, []);

  return breakpoint;
}

export function useIsMobile(): boolean {
  const bp = useBreakpoint();
  return bp === "xs" || bp === "sm";
}
```

- [ ] **Step 2: Run type check**

Run: `npm run check`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add client/src/hooks/use-breakpoint.ts
git commit -m "feat: add useBreakpoint and useIsMobile hooks"
```

---

### Task 2: Add Responsive Sizing Tokens

**Files:**
- Modify: `client/src/index.css`
- Modify: `tailwind.config.ts`

- [ ] **Step 1: Add responsive CSS custom properties**

In `client/src/index.css`, add responsive sizing tokens in the `@layer base` section:

```css
@layer base {
  :root {
    --page-px: 1.5rem;
    --card-px: 1rem;
    --card-gap: 1rem;
    --section-gap: 1.5rem;
  }

  @media (min-width: 1024px) {
    :root {
      --page-px: 2rem;
      --card-gap: 1rem;
      --section-gap: 1.5rem;
    }
  }

  @media (max-width: 767px) {
    :root {
      --page-px: 0.75rem;
      --card-px: 0.75rem;
      --card-gap: 0.5rem;
      --section-gap: 0.75rem;
    }
  }
}
```

- [ ] **Step 2: Register tokens in Tailwind config**

In `tailwind.config.ts`, extend the theme spacing:

```typescript
// Inside theme.extend
spacing: {
  "page": "var(--page-px)",
  "card-gap": "var(--card-gap)",
  "section-gap": "var(--section-gap)",
},
padding: {
  "card": "var(--card-px)",
},
```

- [ ] **Step 3: Run type check and build**

Run: `npm run check && npm run build`
Expected: PASS — tokens are defined but not yet consumed.

- [ ] **Step 4: Commit**

```bash
git add client/src/index.css tailwind.config.ts
git commit -m "feat: add responsive sizing tokens as CSS custom properties"
```

---

### Task 3: Create PageContainer Component

**Files:**
- Create: `client/src/components/page-container.tsx`

- [ ] **Step 1: Write the shared page container**

Create `client/src/components/page-container.tsx`:

```tsx
import { cn } from "@/lib/utils";

interface PageContainerProps {
  children: React.ReactNode;
  className?: string;
}

export function PageContainer({ children, className }: PageContainerProps) {
  return (
    <div className={cn("px-page py-4 space-y-section-gap", className)}>
      {children}
    </div>
  );
}

interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
}

export function PageHeader({ title, description, icon, actions }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-3">
        {icon}
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">{title}</h1>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
    </div>
  );
}
```

- [ ] **Step 2: Run type check**

Run: `npm run check`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add client/src/components/page-container.tsx
git commit -m "feat: add PageContainer and PageHeader components for consistent layout"
```

---

### Task 4: Make Sidebar Responsive

**Files:**
- Modify: `client/src/components/layout.tsx`

This is the highest-impact change. The sidebar needs three behaviors:
- **lg+**: Expanded (224px), collapsible via Ctrl+L (current behavior)
- **md**: Auto-collapsed to icon-only (56px)
- **sm/xs**: Hidden entirely, hamburger button opens Sheet drawer

- [ ] **Step 1: Add responsive sidebar logic**

In `client/src/components/layout.tsx`:

Add imports:
```tsx
import { useBreakpoint, useIsMobile } from "@/hooks/use-breakpoint";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Menu } from "lucide-react";
```

Update the Layout component to use breakpoint-aware collapse:

```tsx
export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { data: status } = useScanStatus();
  const { data: settings } = useAppSettings();
  const breakpoint = useBreakpoint();
  const isMobile = breakpoint === "xs" || breakpoint === "sm";
  const [mobileOpen, setMobileOpen] = useState(false);

  // On md, default to collapsed. On lg+, default to expanded.
  // Manual toggle overrides the default.
  const [manualCollapse, setManualCollapse] = useState<boolean | null>(null);
  const collapsed = manualCollapse ?? (breakpoint === "md");

  const counts = (status?.entityCounts || {}) as Record<string, number>;
  const isScanning = status?.scanning;
  const appName = settings?.appName || "Agent CC";

  // Reset manual override when breakpoint changes significantly
  useEffect(() => {
    setManualCollapse(null);
  }, [isMobile]);

  // Keyboard shortcut for collapse (desktop only)
  useEffect(() => {
    if (isMobile) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "l") {
        e.preventDefault();
        setManualCollapse(c => !(c ?? collapsed));
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isMobile, collapsed]);

  // Close mobile drawer on navigation
  useEffect(() => {
    setMobileOpen(false);
  }, [location]);

  // Extract sidebar content into a function so it can be rendered
  // in both the fixed sidebar (desktop) and the Sheet drawer (mobile)
  const sidebarContent = (/* ... existing sidebar JSX ... */);

  if (isMobile) {
    return (
      <div className="flex flex-col h-screen overflow-hidden">
        {/* Mobile header with hamburger */}
        <header className="flex items-center h-14 px-4 border-b bg-sidebar">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <button className="p-2 -ml-2 text-muted-foreground hover:text-foreground">
                <Menu className="h-5 w-5" />
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0 bg-sidebar">
              {sidebarContent}
            </SheetContent>
          </Sheet>
          <span className="font-semibold text-sm ml-2">{appName}</span>
        </header>
        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className="page-enter">{children}</div>
        </main>
        <TerminalPanel />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className={cn(
        "border-r flex flex-col transition-all duration-200 relative bg-sidebar",
        collapsed ? "w-14" : "w-56"
      )}>
        {sidebarContent}
      </aside>
      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className="page-enter">{children}</div>
        </div>
        <TerminalPanel />
      </main>
    </div>
  );
}
```

The key pattern: extract the sidebar nav items, brand, search, footer into a `sidebarContent` variable that renders in both the fixed `<aside>` (desktop) and the `<SheetContent>` (mobile). On mobile, the nav always renders expanded (not icon-only) inside the drawer.

- [ ] **Step 2: Verify at each breakpoint**

Run: `npm run dev`
Test by resizing browser:
- 1280px+: sidebar expanded, collapsible
- 768-1023px: sidebar auto-collapsed to icons
- <768px: sidebar hidden, hamburger visible, drawer works

- [ ] **Step 3: Run type check**

Run: `npm run check`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add client/src/components/layout.tsx
git commit -m "feat: responsive sidebar — auto-collapse on md, drawer on mobile"
```

---

### Task 5: Apply Responsive Patterns to Dashboard

**Files:**
- Modify: `client/src/pages/dashboard.tsx`

- [ ] **Step 1: Add responsive grid classes to Dashboard**

The Dashboard currently has 0 responsive utility classes. Add:
- Status bar: wrap metrics on small screens (`flex-wrap`)
- Session cards grid: `grid-cols-1 md:grid-cols-2 xl:grid-cols-3`
- Stats row: `grid-cols-2 md:grid-cols-4`
- Use `PageContainer` wrapper for consistent padding

Wrap the page content:
```tsx
import { PageContainer } from "@/components/page-container";

// In render:
<PageContainer>
  {/* existing dashboard content */}
</PageContainer>
```

Add responsive grid to session cards area. Find the existing grid/flex container for active sessions and update to responsive columns.

- [ ] **Step 2: Verify**

Run: `npm run dev`
Resize to each breakpoint — dashboard should reflow gracefully.

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/dashboard.tsx
git commit -m "feat: responsive Dashboard — grid reflow at breakpoints"
```

---

### Task 6: Apply Responsive Patterns to Projects (Board) Page

**Files:**
- Modify: `client/src/pages/board.tsx`

- [ ] **Step 1: Add responsive layout to board**

The board has 2 zones (Projects + Kanban). On mobile:
- Stack vertically: Projects on top, Kanban below
- Kanban columns: single column view with tab/select to switch columns
- Projects: horizontal scroll or collapsible accordion

Desktop layout stays the same. Add responsive classes:

```tsx
// Zone container: side-by-side on lg+, stacked on md and below
<div className="flex flex-col lg:flex-row gap-card-gap h-full">
  {/* Projects zone */}
  <div className="lg:w-1/4 lg:min-w-[200px]">
    {/* ... */}
  </div>
  {/* Kanban zone */}
  <div className="flex-1 overflow-x-auto">
    <div className="flex gap-2 min-w-[600px] lg:min-w-0">
      {/* columns */}
    </div>
  </div>
</div>
```

On `sm/xs`, the kanban columns get a `min-w-[600px]` so they scroll horizontally within the container. This is the simplest approach — swipe-based column switching is a nice-to-have for later.

- [ ] **Step 2: Verify and commit**

```bash
git add client/src/pages/board.tsx
git commit -m "feat: responsive Board — stacked zones on mobile, horizontal scroll for columns"
```

---

### Task 7: Apply Responsive Patterns to Library Page

**Files:**
- Modify: `client/src/pages/library.tsx`
- Modify: `client/src/components/library/*.tsx` (section components)

- [ ] **Step 1: Add responsive layout to Library**

- Tab list: scrollable on mobile (`overflow-x-auto`)
- Card grids in each section: `grid-cols-1 md:grid-cols-2 xl:grid-cols-3`
- Use `PageContainer` wrapper

- [ ] **Step 2: Verify and commit**

```bash
git add client/src/pages/library.tsx client/src/components/library/
git commit -m "feat: responsive Library — scrollable tabs, responsive card grids"
```

---

### Task 8: Apply Responsive Patterns to Sessions Page

**Files:**
- Modify: `client/src/pages/sessions.tsx`

- [ ] **Step 1: Add responsive layout**

- Session list: already likely single-column, verify it works on mobile
- Tab bar (Messages, Prompts): scrollable if needed
- Session detail panels: full-width on mobile, side panel on desktop
- Use `PageContainer` wrapper

- [ ] **Step 2: Verify and commit**

```bash
git add client/src/pages/sessions.tsx
git commit -m "feat: responsive Sessions — mobile-friendly layout"
```

---

### Task 9: Apply Responsive Patterns to Analytics Page

**Files:**
- Modify: `client/src/pages/stats.tsx`

- [ ] **Step 1: Add responsive layout**

The stats page already has the most responsive classes (7). Enhance:
- Tab list: scrollable on mobile
- Charts: responsive width (`w-full`)
- Metric grids: `grid-cols-2 md:grid-cols-4`
- Tables: card-based on mobile (optional — can defer complex table transforms)
- Use `PageContainer` wrapper

- [ ] **Step 2: Verify and commit**

```bash
git add client/src/pages/stats.tsx
git commit -m "feat: responsive Analytics — scrollable tabs, responsive grids"
```

---

### Task 10: Apply Responsive Patterns to Settings Page

**Files:**
- Modify: `client/src/pages/settings.tsx`

- [ ] **Step 1: Add responsive layout**

- Tab list: vertical on mobile (stacked), horizontal on desktop
- Form fields: full-width on mobile
- JSON editor: full-width with reduced height on mobile
- Use `PageContainer` wrapper

- [ ] **Step 2: Verify and commit**

```bash
git add client/src/pages/settings.tsx
git commit -m "feat: responsive Settings — mobile-friendly forms and tabs"
```

---

### Task 11: Apply Responsive Patterns to Remaining Pages

**Files:**
- Modify: `client/src/pages/project-detail.tsx`
- Modify: `client/src/pages/markdown-edit.tsx`
- Modify: Any other pages that need responsive treatment

- [ ] **Step 1: Add responsive layout to project detail**

- Tab content: full-width on mobile
- Entity lists: single column on mobile
- Use `PageContainer` wrapper

- [ ] **Step 2: Add responsive layout to markdown editor**

- Editor: full-width, reduced toolbar on mobile
- Preview panel: below editor on mobile (not side-by-side)

- [ ] **Step 3: Verify and commit**

```bash
git add client/src/pages/project-detail.tsx client/src/pages/markdown-edit.tsx
git commit -m "feat: responsive remaining pages — project detail, markdown editor"
```

---

### Task 12: Zoom Resilience Pass

**Files:**
- Modify: `client/src/index.css` (if needed)

- [ ] **Step 1: Test zoom levels**

Run: `npm run dev`
Test at zoom levels: 75%, 100%, 125%, 150%, 200%

At each zoom level, check:
- Sidebar doesn't overflow or clip
- Cards maintain proportions
- Text remains readable
- No horizontal scrollbars on main content (board is an exception)
- Modals/dialogs don't overflow viewport

- [ ] **Step 2: Fix any zoom issues found**

Common fixes:
- Replace fixed px widths with rem or responsive classes
- Add `max-w-full` to images or embedded content
- Ensure modals use `max-h-[90vh]` and scroll internally

- [ ] **Step 3: Commit fixes**

```bash
git add -A
git commit -m "fix: zoom resilience fixes across all pages"
```

---

### Task 13: Update Documentation and Final Verification

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Document the responsive system in CLAUDE.md**

Add a section describing:
- Breakpoint tiers (xs/sm/md/lg/xl) and their behavior
- Sidebar behavior at each tier
- `useBreakpoint` and `useIsMobile` hooks
- `PageContainer` and `PageHeader` components
- Sizing tokens (`--page-px`, `--card-px`, `--card-gap`, `--section-gap`)
- Standard grid patterns (`grid-cols-1 md:grid-cols-2 xl:grid-cols-3`)

- [ ] **Step 2: Run full checks**

```bash
npm run check && npm test
npx vitest run tests/new-user-safety.test.ts --reporter=dot
```

- [ ] **Step 3: Manual smoke test at each breakpoint**

Test at: 375px (phone), 768px (tablet), 1024px (laptop), 1440px (desktop)
- All pages render without horizontal overflow
- Sidebar behavior is correct
- Cards reflow into appropriate column count
- No clipped or overlapping elements

- [ ] **Step 4: Commit and deploy**

```bash
git add -A
git commit -m "docs: document responsive foundation system"
scripts/deploy.sh
```
