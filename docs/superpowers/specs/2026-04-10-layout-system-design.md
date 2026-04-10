# Layout System Redesign

## Problem

The app layout wraps all page content in a scroll container (`overflow-y-auto` in `layout.tsx`). This means pages grow to their content height instead of being constrained to the viewport. Consequences:

- Pages like Board and Dashboard can't create fixed-height panels with independent scrolling
- The terminal panel at the bottom gets pushed offscreen when content is tall
- The Board's 3 panels (projects, kanban, completed) scroll together instead of independently
- The Dashboard's active sessions area gets compressed or misaligned instead of filling the available space

## Design: Fixed Shell + Page Viewport

### The Shell

The app has a fixed outer shell made of consistent pieces that never scroll or move:

- **Left:** Nav sidebar (already works correctly)
- **Bottom:** Terminal panel (anchored to bottom, grows upward when expanded)

Between the nav and the terminal is the **page viewport** — a fixed-size box that takes whatever space remains. Pages fill this box and manage their own internal layout and scrolling. Nothing a page does can push the nav or terminal out of position.

### The Change

In `layout.tsx`, the content wrapper changes from a scroll container to a fixed box:

- Current: `overflow-y-auto` — lets pages grow tall and scrolls them
- New: `overflow-hidden` with `h-full` on the page wrapper — gives pages a fixed box

The `page-enter` animation wrapper also needs `h-full` so the height constraint flows through to the actual page component.

### Page Types

With the fixed box in place, pages fall into two patterns:

**Scroll pages** (Library, Sessions, Analytics, Settings): The page is one scrollable area. It adds its own scroll behavior to its root element. Content scrolls within the fixed box — the nav and terminal stay put.

**Panel pages** (Board, Dashboard): The page does not scroll at its root. Instead, it subdivides the box into panels. Each panel is its own independent scroll container. A panel with 500 items scrolls freely without affecting any other panel on the page.

### Board Page

The Board already has the right 3-panel structure (projects | kanban columns | completed milestones). The layout fix makes the height constraint actually flow down to these panels. Each panel becomes independently scrollable:

- The completed milestones list (right) can be very long — you scroll through it without the projects list or kanban columns moving
- Each kanban column also scrolls independently within the center section
- The board header stays pinned at the top of the page viewport

The prior session's unstaged `h-full` additions to the sidebar wrappers in `board.tsx` were directionally correct — they just didn't work because the layout shell wasn't providing a real height. With the shell fix, those constraints will resolve properly.

### Dashboard Page

The dashboard is a simple layout inside its viewport box:

- **Status bar** at the top (system health indicators, session count, models, cost) — does not scroll
- **Active Sessions** fills most of the page width and is centered, providing symmetrical spacing and a comfortable reading experience for session cards. No cramped boxes, no left-alignment — the cards have room to breathe
- If active sessions overflow the viewport height, the sessions area scrolls independently (status bar stays pinned)
- Future module slots can be added around the sessions area later — this spec does not define them

The current `w-[70%] mx-auto` wrapper is close to the right idea (centered, most of the width) but needs to work within the new fixed viewport model instead of fighting the scroll wrapper.

### Page Headers

Each page has its own header (title + actions). This is not part of the shell — it's inside the page's viewport box. But because every page uses `PageContainer` or a similar pattern, headers appear in a visually consistent position across all pages.

For panel pages (Board), the header is part of the page component and stays pinned at the top of the viewport box. For scroll pages, the header scrolls with the content (it's at the top of the scroll area).

### Responsive Behavior

The shell model works the same at all breakpoints:

- **Desktop (lg+):** Nav sidebar expanded or collapsed, page viewport fills remaining width
- **Tablet (md):** Nav collapsed to icons, page viewport is wider
- **Mobile (sm/xs):** Nav becomes a hamburger drawer, page viewport is full width. Panel pages like Board collapse their side panels (projects becomes collapsible, completed milestones hidden or stacked below)

The existing responsive code in `layout.tsx` and `board.tsx` handles these breakpoints — this spec doesn't change responsive behavior, only the height/overflow model.

### Terminal Interaction

The terminal panel sits below the page viewport in the flex column. When the terminal is expanded (dragged taller), the page viewport shrinks. When collapsed, the viewport grows. This is already how flexbox works with the current layout — the terminal is `flex-shrink-0` with a dynamic height, and the page viewport is `flex-1`.

The key difference: today, expanding the terminal doesn't shrink the page content (because it scrolls). After this change, expanding the terminal genuinely reduces the page viewport height, which means panels inside the page also get shorter. This is correct behavior — the page always fills exactly the space between the header and the terminal floor.

## Files to Change

- `client/src/components/layout.tsx` — remove scroll wrapper, make page area a fixed box
- `client/src/components/page-container.tsx` — may need `h-full` and `overflow-y-auto` for scroll pages
- `client/src/pages/board.tsx` — verify height constraints flow through to all 3 panels
- `client/src/pages/dashboard.tsx` — ensure active sessions fills width, centered, scrolls within its box
- `client/src/pages/library.tsx` — add scroll behavior to page root
- `client/src/pages/sessions.tsx` — add scroll behavior to page root  
- `client/src/pages/stats.tsx` — add scroll behavior to page root
- `client/src/pages/settings.tsx` — add scroll behavior to page root

## Testing

- Every page must render within the viewport without pushing the terminal offscreen
- Board: each of the 3 panels scrolls independently when content overflows
- Dashboard: active sessions fills most of the width, centered, status bar stays pinned
- Library/Sessions: long lists scroll within the page viewport, nav and terminal stay fixed
- Terminal: expanding/collapsing the terminal resizes the page viewport correctly
- Responsive: all breakpoints still work (mobile hamburger, tablet collapsed nav, desktop expanded nav)
- Page transitions: the `page-enter` animation still works with the new height model

## Out of Scope

- Dashboard module grid / sidebar slots (future work)
- Marketplace search functionality
- Workflow-framework card automation
- Any visual design changes beyond layout/sizing
