# Dashboard Cleanup & Session Rename — Design Spec

## Summary

Four changes to improve readability and reduce clutter across the Dashboard and Sessions pages.

## 1. Session Rename

**Goal:** Let users give sessions meaningful names instead of random slugs.

- Add a "rename" button (pencil icon) to active session cards on the Dashboard, next to the existing pin and copy-resume buttons.
- Clicking it turns the session title into a text input. Enter saves, Escape cancels.
- Custom names are stored in the database alongside existing session data (new `sessionNames` map keyed by session ID).
- New API endpoint: `PATCH /api/sessions/:id/name` with `{ name: string }` body. Empty string clears the name.
- A shared helper function determines what name to display: custom name first, then slug, then first message summary, then truncated session ID. This helper is used everywhere a session name appears — Dashboard, Sessions page, SessionHealthPanel, analytics sections.

## 2. Dashboard Active Sessions Cleanup

**Goal:** Make the active sessions section easier to scan.

- **Session names:** Max ~40 characters, truncated with ellipsis.
- **"Latest" and "Started" lines:** Already truncated (12 and 8 words). No change needed.
- **Location/project key:** Currently shows encoded paths with dashes (e.g., `-home-tron-dev-projects-agent-cc`). Convert to readable paths with slashes (e.g., `~/dev/projects/agent-cc`).
- **Model tag:** Show friendly versioned names — "Opus 4.6", "Sonnet 4.6", "Haiku 4.5" — not API IDs or shorthand like "Opus". Update the `shortModel()` utility function. It should parse the version from the model ID string (e.g., `claude-opus-4-6` → "Opus 4.6", `claude-haiku-4-5-20251001` → "Haiku 4.5") so it handles future versions automatically.
- **Health threshold colors on metrics:** The messages count, data size, and cost estimate values get colored based on the health thresholds configured in Settings:
  - Below yellow threshold: muted green
  - Between yellow and red: muted amber
  - At or above red: muted red
  - Colors are soft/muted, not bright neon.
- **Rename button:** Pencil icon added to the action buttons row (pin, copy-resume, rename).

## 3. Dashboard Layout Changes

**Goal:** Standardize the page layout and remove unused sections.

- **Fixed height with scroll:** Both "Active Sessions" and "Recent Activity" sections get a fixed max height (~600px) with vertical scrollbar when content overflows. Recent Activity already has this; Active Sessions needs it added.
- **Remove sections:**
  - Entity stat cards row (project, mcp, skill, plugin, markdown counts)
  - Quick Actions + Session Stats + System cards row
  - Recent Changes section
- **Keep:** Status bar, Active Sessions, Recent Activity, keyboard shortcuts hint.

## 4. Sessions Analytics — Tabbed Panels

**Goal:** Replace vertical scroll through 12 sections with individual tabs.

Convert the analytics panel from a single scrollable page into tabbed navigation. Each section becomes its own tab. Only the selected tab's content is visible.

**10 tabs** (in order):
1. Nerve Center
2. Usage Analytics
3. File Heatmap
4. Session Health
5. Projects
6. Weekly Digest
7. Prompts
8. Workflows
9. Bash KB
10. Decisions

**Removed sections:** Ask a Question, Smart Context Loader (these felt out of place and relied on AI integration that isn't a current focus).

**Tab bar behavior:**
- Horizontally scrollable if tabs overflow the container width.
- Active tab state stored in URL query parameter so page refresh preserves the selected tab.
- Default to first tab (Nerve Center) when no tab is selected.

## Files Changed

- `client/src/pages/dashboard.tsx` — Active sessions cleanup, layout changes, rename button
- `client/src/pages/sessions.tsx` — Analytics tabbed panels, remove Ask a Question and Context Loader sections
- `client/src/lib/utils.ts` — Update `shortModel()` for versioned names
- `server/db.ts` — Add `sessionNames` to DB schema
- `server/routes/sessions.ts` — Add rename endpoint
- `shared/types.ts` — Add `sessionNames` type if needed
- `client/src/hooks/use-sessions.ts` — Add rename mutation hook
- `client/src/components/session-health-panel.tsx` — Use shared display name helper

## Not In Scope

- Sessions page top bar changes (Delete All button, etc.) — separate discussion
- Analytics data accuracy validation — separate task
- AI integration evaluation — separate discussion
- SessionHealthPanel empty state (showing "no active sessions" instead of hiding) — small follow-up
