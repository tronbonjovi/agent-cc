# Spec 3: Responsive Foundation

## Summary

Establish a cohesive responsive design system across Agent CC so the app looks intentional at any viewport size — desktop, laptop, tablet, mobile, and everything in between (window resizing, split screens, zoom levels). This is done as its own focused pass to ensure consistency across all pages rather than spreading responsive work across other specs.

## Problem

The current app is desktop-first with almost no responsive breakpoints. Tailwind's responsive utilities are barely used (2-7 per page). The sidebar is always visible at fixed widths, content assumes wide viewports, and there are no mobile considerations. When the user resizes windows, uses split screens, or zooms in/out, the layout doesn't adapt gracefully.

## Goals

1. **Cohesive breakpoints** — a single breakpoint system applied consistently across all pages
2. **Sidebar behavior** — smart collapse/hide at different viewports
3. **Content scaling** — cards, tables, grids adapt rather than overflow or squish
4. **Zoom resilience** — proportions hold when zooming in/out
5. **Mobile usable** — not a mobile-first redesign, but the app should be functional on a phone/tablet
6. **Standardization** — patterns that reduce planning overhead for future features

## Breakpoint System

Using Tailwind's default breakpoints, define behavior at each tier:

| Breakpoint | Width | Sidebar | Content Layout | Target Devices |
|------------|-------|---------|----------------|----------------|
| `xs` | < 640px | Hidden (hamburger menu) | Single column, stacked | Phone |
| `sm` | 640-767px | Hidden (hamburger menu) | Single column, wider | Large phone, small tablet |
| `md` | 768-1023px | Collapsed (icons only, 56px) | Adapted grid (fewer columns) | Tablet, narrow window |
| `lg` | 1024-1279px | Expanded (224px) | Full layout | Laptop, split screen |
| `xl` | 1280px+ | Expanded (224px) | Full layout with extra space | Desktop, wide monitor |

### Sidebar Behavior

- **xl/lg:** Expanded sidebar (224px), collapsible via Ctrl+L
- **md:** Auto-collapsed to icon-only (56px), expandable on hover or click
- **sm/xs:** Sidebar hidden entirely. Hamburger icon in top-left corner opens a slide-over drawer. Drawer overlays content (doesn't push it).

The existing sidebar collapse mechanism (useState + Ctrl+L) can be extended with a media query hook that sets the default state per breakpoint.

### Content Adaptation Patterns

**Cards/Grids:**
- `xl`: 4 columns
- `lg`: 3 columns
- `md`: 2 columns
- `sm/xs`: 1 column (full width, stacked)

**Tables:**
- `lg+`: Full table with all columns
- `md`: Reduce to essential columns, hide secondary data
- `sm/xs`: Convert to card-based list (each row becomes a card)

**Board/Kanban:**
- `lg+`: All 4 columns visible side-by-side
- `md`: Horizontal scroll with snap, 2-3 columns visible
- `sm/xs`: Single column view — tab/swipe to switch between Queue/In Progress/Review/Done

**Dashboard:**
- `lg+`: Multi-column layout for session cards and stats
- `md`: 2-column grid
- `sm/xs`: Single column, stats row wraps

## Sizing Tokens

Define a consistent spacing/sizing scale using CSS custom properties or Tailwind's theme extension. This creates a vocabulary that all pages share:

```
--page-padding: responsive (32px lg+, 16px md, 12px sm/xs)
--card-padding: responsive (16px lg+, 12px md, 10px sm/xs)  
--card-gap: responsive (16px lg+, 12px md, 8px sm/xs)
--section-gap: responsive (24px lg+, 16px md, 12px sm/xs)
```

These can be implemented via Tailwind's `@apply` or responsive utility classes. The key is that every page uses the same tokens rather than hardcoding their own padding/gap values.

## Component-Level Patterns

### Responsive Hook

A `useBreakpoint()` hook that returns the current breakpoint tier. Useful for components that need to switch rendering modes (like table → card list):

```typescript
const breakpoint = useBreakpoint(); // "xs" | "sm" | "md" | "lg" | "xl"
const isMobile = breakpoint === "xs" || breakpoint === "sm";
```

### Sidebar Responsive Wrapper

Extend the Layout component's sidebar logic:
- Read initial collapsed state from viewport width
- Listen for resize events (debounced)
- On mobile, render sidebar as a slide-over sheet (using existing shadcn Sheet component)
- Hamburger button visible only on sm/xs

### Page Container

A shared `<PageContainer>` component (or utility class) that applies consistent page padding and max-width:

```tsx
<PageContainer>
  <PageHeader title="Dashboard" />
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-card">
    {/* cards */}
  </div>
</PageContainer>
```

This reduces per-page responsive boilerplate and ensures consistency.

## Implementation Strategy

1. **Foundation first** — sizing tokens, breakpoint hook, responsive sidebar
2. **Page container** — shared wrapper with consistent padding/spacing
3. **Page-by-page pass** — apply responsive patterns to each page:
   - Dashboard
   - Projects (Board)
   - Library (after Spec 2, or the existing entity pages if Spec 2 isn't done)
   - Sessions
   - Analytics
   - Settings
4. **Component pass** — cards, tables, modals adapt per breakpoint

Each page gets the same treatment: apply grid responsive classes, test at each breakpoint, verify zoom behavior.

## Testing Approach

- Visual regression at each breakpoint (manual or screenshot-based)
- Verify sidebar behavior at each breakpoint
- Test zoom levels: 75%, 100%, 125%, 150%, 200%
- Test common split-screen scenarios (half-width on 1920px = 960px = `md` breakpoint)

## Out of Scope

- Page-specific feature changes (that's Specs 1, 2, 4)
- Touch gestures beyond basic tap
- Offline/PWA support
- Performance optimization for mobile networks

## Dependencies

- **Should run after Spec 1** — so the nav structure is finalized
- **Can run before or after Spec 2** — Library pages get the responsive pass regardless of whether they're consolidated yet
- **Independent of Spec 4** — Analytics gets responsive treatment with its current layout; if Spec 4 changes the layout later, it applies the same responsive patterns
