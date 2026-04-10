# Library Cleanup Design

## Status

Spec ready for implementation planning. Decisions captured from user notes (April 10, 2026). No brainstorm needed.

## Overview

Post-redesign cleanup of the Library page. The redesign itself was successful — this addresses remaining rough edges in the file editor tab.

## File Editor Tab Cleanup

### Problem

The "All" section in the file editor tab is too long. It contains good data across several modules, but the layout needs work. The file listing section doesn't belong here, and the tab name doesn't reflect what it actually shows.

### Design

1. **Rename tab** from "All" (or current name) to **"Info"**
2. **Remove file listings** from this tab — files belong in the dedicated files tab
3. **Reorganize modules** — the informational/insight modules have good data but need a cleaner layout
4. **Remove neon styling** — no glowing/neon visual effects. Use solid colors consistent with the rest of the app.

### Investigation Needed

- Audit which modules exist in the current "All" section
- Determine logical grouping and layout for the info modules
- This is a layout/organization task, not a data task — the content is good, just poorly arranged
