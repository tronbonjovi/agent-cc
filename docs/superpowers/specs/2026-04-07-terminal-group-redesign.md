# Terminal Panel Redesign — Group-Based Architecture

**Date:** 2026-04-07
**Status:** Phase 1 spec
**Scope:** Replace flat tab model with VS Code-style terminal groups, explorer sidebar, and instance manager

## Problem

The current terminal panel uses a flat `tabs[]` array with a single `splitTabId` pointer. This causes:

- Phantom PTY sessions when split mode renders mirror instances
- Title changes cross-pollinating to wrong tabs after refresh
- Invalid split state after closing tabs (activeTabId === splitTabId)
- Split button moves an existing tab instead of creating a new terminal
- No visual grouping of related terminals

VS Code uses a fundamentally different model: terminal groups. Each group contains 1+ instances shown side by side. The explorer sidebar selects between groups, not individual terminals.

## Architecture

### Three-Layer Design

| Layer | Class/Hook | Owns | Lifetime |
|---|---|---|---|
| **Store** | `useTerminalGroupStore` (zustand) | Group structure, active group, instance metadata | App lifetime |
| **Manager** | `TerminalInstanceManager` (singleton TS class) | xterm.js Terminal, WebSocket, FitAddon, reconnect logic | Per-instance (create → dispose) |
| **Component** | `TerminalInstance` (React) | A `<div>` container — mount point only | Mount/unmount with group switches |

Data flow is one-directional:
- Store → Manager: create/dispose instances
- Manager → Store: activity events (for unread indicators)
- React → Manager: attach/detach DOM containers

The manager does NOT import the store. The store does NOT hold xterm.js objects.

### Data Model

```typescript
// Zustand store state
interface TerminalGroupState {
  groups: TerminalGroup[];
  activeGroupId: string | null;
  focusedInstanceId: string | null;
}

interface TerminalGroup {
  id: string;
  instances: TerminalInstanceInfo[];
}

interface TerminalInstanceInfo {
  id: string;
  name: string;        // default: shell type ("bash"), user-renamable
  shellType: string;   // reported by server on PTY creation
}
```

```typescript
// TerminalInstanceManager (singleton, plain TypeScript)
class TerminalInstanceManager {
  private instances: Map<string, ManagedTerminal>;

  create(id: string): void;           // instantiate xterm Terminal + WebSocket
  attach(id: string, el: HTMLElement): void;  // terminal.open(el), fitAddon.fit()
  detach(id: string): void;           // remove from DOM, keep Terminal + WS alive
  dispose(id: string): void;          // terminal.dispose(), ws.close(), kill PTY
  
  onActivity: (callback: (id: string) => void) => void;  // output on any instance
}

interface ManagedTerminal {
  id: string;
  terminal: Terminal;         // xterm.js Terminal object
  ws: WebSocket | null;       // connection to server PTY
  fitAddon: FitAddon;
  connectionState: TerminalConnectionState;
}
```

### Why the Manager Exists

When the user switches groups, inactive groups unmount. Without the manager, xterm.js terminals and WebSockets would be destroyed — losing scroll position, buffered output, and requiring reconnection on every switch.

The manager keeps all terminals alive regardless of mount state. xterm.js supports writing to a Terminal that isn't attached to the DOM — it buffers internally. Background terminals continue receiving output via their WebSocket. Switching back = instant attach, no reconnect, scroll position preserved.

The existing reconnect/grace-period/backoff logic from `terminal-instance.tsx` moves into the manager. The React component drops from ~300 lines to ~20.

## Components

### TerminalPanel
Top-level layout. Composes toolbar, content area, and explorer sidebar. Keeps existing drag-to-resize height behavior and collapse toggle.

### TerminalToolbar
Action buttons in the top bar:
- **Split (⫏)** — creates a new terminal instance inside the active group
- **New (+)** — creates a new group with one terminal, switches to it
- **Collapse (▾)** — collapses the panel

### TerminalExplorer
Right sidebar listing all groups. Visual design:
- Tree connectors (┌├└) for groups with multiple instances
- Status dots per instance (green=connected, yellow=reconnecting, red=expired)
- Close button (✕) per instance
- Active group highlighted with blue left border + brighter text
- Unread activity indicator for non-active groups with new output
- Full height of the panel (entries at top, empty space below)

Interactions:
- Click group → switch active group
- Click specific instance in a split group → switch to group AND focus that pane
- ✕ on instance → kill that terminal; if last in group, remove group
- Right-click context menu → Rename, Split, Kill

### TerminalGroupView
Renders the active group's instances side by side using `allotment` for resizable split panes. Each pane contains a `TerminalInstance` component.

### TerminalInstance
Minimal React component — just a container div. On mount: `manager.attach(id, ref)`. On unmount: `manager.detach(id)`. No xterm.js, no WebSocket, no reconnect logic.

## Key Interaction Flows

### Creating a new terminal (+ button)
1. Store: `createGroup()` → generates group ID and instance ID, adds to `groups[]`
2. Store calls `manager.create(instanceId)` → manager creates xterm Terminal + WebSocket
3. Store sets new group as `activeGroupId`
4. React renders `TerminalGroupView` → `TerminalInstance` mounts → calls `manager.attach()`

### Splitting (⫏ button)
1. Store: `splitActiveGroup()` → adds new `TerminalInstanceInfo` to active group's `instances[]`
2. Store calls `manager.create(newInstanceId)`
3. `TerminalGroupView` re-renders with allotment panes — new `TerminalInstance` mounts and attaches
4. Explorer updates to show tree connectors for the group

### Switching groups (click in explorer)
1. Store: sets `activeGroupId` to clicked group
2. Previous group's `TerminalInstance` components unmount → each calls `manager.detach(id)` (terminals stay alive)
3. New group's components mount → each calls `manager.attach(id, container)` (instant, preserved state)

### Killing an instance (✕ or context menu)
1. Store: `removeInstance(groupId, instanceId)` → removes from group's `instances[]`
2. Store calls `manager.dispose(instanceId)` → terminal disposed, WebSocket closed, PTY killed
3. If group is now empty → store removes the group, activates nearest remaining group

## Naming

- Default label = shell type (e.g. "bash") — server reports this in the WebSocket `created` message
- Shell title escape sequences (`onTitleChange`) do NOT update the label
- User renames via right-click context menu → "Rename" → inline text edit in explorer
- Renamed labels persist across refresh (stored in group state)

## Persistence

The zustand store serializes to the server via the existing `PATCH /api/terminal/panel` endpoint. The `TerminalPanelState` shared type changes:

```typescript
// Before (shared/types.ts)
interface TerminalPanelState {
  height: number;
  collapsed: boolean;
  tabs: TerminalTab[];
  activeTabId: string | null;
  splitTabId: string | null;
}

// After
interface TerminalPanelState {
  height: number;
  collapsed: boolean;
  groups: TerminalGroupData[];
  activeGroupId: string | null;
}

interface TerminalGroupData {
  id: string;
  instances: { id: string; name: string }[];
}
```

Server-side PTY management (WebSocket routing, reconnect, grace period) stays unchanged. The manager connects to the same `/ws/terminal` endpoint with the same `?id=` parameter.

## What Gets Removed

- `terminal-panel.tsx` — rewritten (flat tabs → groups + explorer)
- `terminal-instance.tsx` — gutted to ~20-line mount point
- Flat `tabs[]` / `splitTabId` state model
- `onTitleChange` / `handleTitleChange` (shell titles no longer rename)
- `userRenamedTabIdsRef` tracking
- `normalizeSplit()` (group model doesn't need it)
- Old tab bar UI

## New Files

| File | Purpose |
|---|---|
| `client/src/stores/terminal-group-store.ts` | Zustand store for group state |
| `client/src/lib/terminal-instance-manager.ts` | Singleton class owning xterm.js + WebSocket lifecycles |
| `client/src/components/terminal-explorer.tsx` | Explorer sidebar component |
| `client/src/components/terminal-group-view.tsx` | Allotment-based split pane renderer |
| `client/src/components/terminal-toolbar.tsx` | Action buttons |

## New Dependencies

- `zustand` — terminal group store
- `allotment` — resizable split panes within groups

## Server-Side Changes

One small addition: the WebSocket `created` message should include `shellType` so the client can use it as the default instance name. The server already resolves the shell path at `server/terminal.ts:137` (`process.env.SHELL || fallback`). Extract the basename (e.g. `/bin/bash` → `bash`, `powershell.exe` → `powershell`):

```typescript
// server/terminal.ts — in the "created" message
const shellType = path.basename(shell).replace(/\.exe$/i, "");
ws.send(JSON.stringify({ type: "created", shellType }));
```

No other server changes needed.

## Out of Scope (Phase 2+)

- Drag-and-drop reordering of groups in explorer
- Right-click → Move to Group (moving instances between groups)
- Terminal profiles / shell selection dropdown
- Configurable explorer sidebar position (left/right)
- Detach-from-group (pop out a terminal instance)
