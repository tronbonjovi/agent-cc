# Terminal Group Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat terminal tab model with VS Code-style terminal groups, an explorer sidebar, and a singleton instance manager that owns xterm.js/WebSocket lifecycles independent of React.

**Architecture:** Three-layer design — zustand store for group state, singleton TerminalInstanceManager for xterm.js + WebSocket lifecycle, minimal React components as mount points. Explorer sidebar replaces flat tabs. Allotment provides resizable split panes within groups.

**Tech Stack:** React, TypeScript, zustand, allotment, xterm.js, WebSocket

**Spec:** `docs/superpowers/specs/2026-04-07-terminal-group-redesign.md`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `shared/types.ts` | Modify | Replace `TerminalTab`, `TerminalPanelState` with group-based types |
| `server/terminal.ts` | Modify | Add `shellType` to `created` WebSocket message |
| `server/routes/terminal.ts` | Modify | Update validation schema for new panel state shape |
| `server/db.ts` | Modify | Update default `terminalPanel` value |
| `client/src/stores/terminal-group-store.ts` | Create | Zustand store for group state + server persistence |
| `client/src/lib/terminal-instance-manager.ts` | Create | Singleton class owning xterm.js + WebSocket lifecycles |
| `client/src/components/terminal-instance.tsx` | Rewrite | Minimal mount-point component (~20 lines) |
| `client/src/components/terminal-group-view.tsx` | Create | Allotment-based split pane renderer |
| `client/src/components/terminal-explorer.tsx` | Create | Right sidebar with group tree, status dots, context menu |
| `client/src/components/terminal-toolbar.tsx` | Create | Split, New, Collapse action buttons |
| `client/src/components/terminal-panel.tsx` | Rewrite | Top-level layout composing toolbar + group view + explorer |
| `client/src/hooks/use-terminal.ts` | Delete | Replaced by zustand store (direct server persistence) |
| `tests/terminal-group-store.test.ts` | Create | Store logic tests |
| `tests/terminal-instance-manager.test.ts` | Create | Manager lifecycle tests |

---

### Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install zustand and allotment**

```bash
npm install zustand allotment
```

- [ ] **Step 2: Verify installation**

```bash
node -e "require('zustand'); console.log('zustand OK')"
node -e "require('allotment'); console.log('allotment OK')"
```

Expected: Both print OK.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add zustand and allotment dependencies"
```

---

### Task 2: Update Shared Types

**Files:**
- Modify: `shared/types.ts`
- Test: `npm run check`

- [ ] **Step 1: Write the new types**

In `shared/types.ts`, replace the terminal-related types. Find and replace this block:

```typescript
export interface TerminalTab {
  id: string;
  name: string;
}

export type TerminalConnectionState =
  | "initializing"
  | "connecting"
  | "connected"
  | "disconnected"
  | "reconnecting"
  | "expired"
  | "idle";

export interface TerminalPanelState {
  height: number;
  collapsed: boolean;
  tabs: TerminalTab[];
  activeTabId: string | null;
  splitTabId: string | null;
}
```

With:

```typescript
export interface TerminalInstanceData {
  id: string;
  name: string;
}

export interface TerminalGroupData {
  id: string;
  instances: TerminalInstanceData[];
}

export type TerminalConnectionState =
  | "initializing"
  | "connecting"
  | "connected"
  | "disconnected"
  | "reconnecting"
  | "expired"
  | "idle";

export interface TerminalPanelState {
  height: number;
  collapsed: boolean;
  groups: TerminalGroupData[];
  activeGroupId: string | null;
}
```

- [ ] **Step 2: Run type check to see what breaks**

```bash
npm run check 2>&1 | head -60
```

Expected: Errors in `terminal-panel.tsx`, `use-terminal.ts`, `server/routes/terminal.ts`, `server/db.ts` — all referencing old `tabs`/`splitTabId`/`TerminalTab` fields. This is expected — we fix these in subsequent tasks.

- [ ] **Step 3: Commit**

```bash
git add shared/types.ts
git commit -m "refactor: replace flat terminal types with group-based model"
```

---

### Task 3: Update Server — shellType + New Schema

**Files:**
- Modify: `server/terminal.ts:137,193`
- Modify: `server/routes/terminal.ts:7-18`
- Modify: `server/db.ts:85-91,124`

- [ ] **Step 1: Add shellType to created message**

In `server/terminal.ts`, at line 137 the shell is resolved. At line 193, the `created` message is sent. Add the `path` import (already imported at line 3) and change the created message:

Find:
```typescript
    ws.send(JSON.stringify({ type: "created" }));
```

Replace with:
```typescript
    const shellType = path.basename(shell).replace(/\.exe$/i, "");
    ws.send(JSON.stringify({ type: "created", shellType }));
```

- [ ] **Step 2: Update route validation schema**

In `server/routes/terminal.ts`, replace the schemas:

Find:
```typescript
const TerminalTabSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100),
});

const PanelPatchSchema = z.object({
  height: z.number().min(100).max(2000).optional(),
  collapsed: z.boolean().optional(),
  tabs: z.array(TerminalTabSchema).optional(),
  activeTabId: z.string().nullable().optional(),
  splitTabId: z.string().nullable().optional(),
});
```

Replace with:
```typescript
const TerminalInstanceDataSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100),
});

const TerminalGroupDataSchema = z.object({
  id: z.string().min(1),
  instances: z.array(TerminalInstanceDataSchema).min(1),
});

const PanelPatchSchema = z.object({
  height: z.number().min(100).max(2000).optional(),
  collapsed: z.boolean().optional(),
  groups: z.array(TerminalGroupDataSchema).optional(),
  activeGroupId: z.string().nullable().optional(),
});
```

- [ ] **Step 3: Update db.ts default**

In `server/db.ts`, find the `terminalPanel` default:

```typescript
    terminalPanel: {
      height: 300,
      collapsed: false,
      tabs: [],
      activeTabId: null,
      splitTabId: null,
    },
```

Replace with:
```typescript
    terminalPanel: {
      height: 300,
      collapsed: false,
      groups: [],
      activeGroupId: null,
    },
```

Also in the migration block (around line 124), find:
```typescript
    if (!data.terminalPanel) data.terminalPanel = defaultData().terminalPanel;
```

Add migration for old format right after it:
```typescript
    if (!data.terminalPanel) data.terminalPanel = defaultData().terminalPanel;
    // Migrate old flat-tab format to groups
    if ((data.terminalPanel as any).tabs && !(data.terminalPanel as any).groups) {
      data.terminalPanel = defaultData().terminalPanel;
    }
```

- [ ] **Step 4: Verify server compiles**

```bash
npx tsc --noEmit --project tsconfig.json 2>&1 | grep -v "client/" | head -20
```

Expected: No server-side errors (client errors are expected until we update the frontend).

- [ ] **Step 5: Commit**

```bash
git add server/terminal.ts server/routes/terminal.ts server/db.ts
git commit -m "refactor: server-side support for terminal group model + shellType"
```

---

### Task 4: Create TerminalInstanceManager

This is the core singleton class that owns all xterm.js Terminal objects and WebSocket connections. It moves the ~250 lines of lifecycle logic from the old `terminal-instance.tsx` into a plain TypeScript class.

**Files:**
- Create: `client/src/lib/terminal-instance-manager.ts`
- Test: `tests/terminal-instance-manager.test.ts`

- [ ] **Step 1: Write the test**

Create `tests/terminal-instance-manager.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// We can't test actual xterm.js/WebSocket in unit tests (needs DOM + server),
// but we can test the manager's state tracking and lifecycle logic.

describe("TerminalInstanceManager", () => {
  it("exports a singleton accessor", async () => {
    const { getTerminalInstanceManager } = await import(
      "../client/src/lib/terminal-instance-manager"
    );
    const m1 = getTerminalInstanceManager();
    const m2 = getTerminalInstanceManager();
    expect(m1).toBe(m2);
  });

  it("tracks created instances", async () => {
    const { getTerminalInstanceManager } = await import(
      "../client/src/lib/terminal-instance-manager"
    );
    const manager = getTerminalInstanceManager();
    // Manager should have a has() method to check if an instance exists
    expect(manager.has("nonexistent")).toBe(false);
  });

  it("fires activity callback", async () => {
    const { getTerminalInstanceManager } = await import(
      "../client/src/lib/terminal-instance-manager"
    );
    const manager = getTerminalInstanceManager();
    const cb = vi.fn();
    const unsub = manager.onActivity(cb);
    expect(typeof unsub).toBe("function");
    unsub();
  });

  it("fires connection state callback", async () => {
    const { getTerminalInstanceManager } = await import(
      "../client/src/lib/terminal-instance-manager"
    );
    const manager = getTerminalInstanceManager();
    const cb = vi.fn();
    const unsub = manager.onConnectionStateChange(cb);
    expect(typeof unsub).toBe("function");
    unsub();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/terminal-instance-manager.test.ts --reporter=verbose 2>&1 | tail -20
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the TerminalInstanceManager**

Create `client/src/lib/terminal-instance-manager.ts`:

```typescript
import { Terminal } from "xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import type { TerminalConnectionState } from "@shared/types";

const RECONNECT_INITIAL_MS = 1000;
const RECONNECT_MAX_MS = 30000;
const RECONNECT_TIMEOUT_MS = 300_000; // 5 minutes — match server grace period

/** Convert HSL string "220 14% 10%" to hex "#xxxxxx" */
function hslToHex(hsl: string): string {
  const [hDeg, sPct, lPct] = hsl.trim().split(/\s+/).map(parseFloat);
  const h = hDeg / 360;
  const s = sPct / 100;
  const l = lPct / 100;

  if (s === 0) {
    const v = Math.round(l * 255).toString(16).padStart(2, "0");
    return `#${v}${v}${v}`;
  }

  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const toHex = (c: number) =>
    Math.round(c * 255).toString(16).padStart(2, "0");
  return `#${toHex(hue2rgb(p, q, h + 1 / 3))}${toHex(hue2rgb(p, q, h))}${toHex(hue2rgb(p, q, h - 1 / 3))}`;
}

const DARK_ANSI = {
  black: "#1a1a1a", red: "#e06c75", green: "#98c379", yellow: "#e5c07b",
  blue: "#82aaff", magenta: "#c678dd", cyan: "#56b6c2", white: "#e0e0e0",
};
const LIGHT_ANSI = {
  black: "#383a42", red: "#e45649", green: "#50a14f", yellow: "#c18401",
  blue: "#4078f2", magenta: "#a626a4", cyan: "#0184bc", white: "#fafafa",
};

type ActivityCallback = (id: string) => void;
type ConnectionStateCallback = (id: string, state: TerminalConnectionState) => void;
type ShellTypeCallback = (id: string, shellType: string) => void;

interface ManagedTerminal {
  id: string;
  terminal: Terminal;
  fitAddon: FitAddon;
  ws: WebSocket | null;
  connectionState: TerminalConnectionState;
  reconnectAttempt: number;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  disconnectStartTime: number | null;
  gaveUp: boolean;
  firstConnect: boolean;
  disposed: boolean;
  container: HTMLElement | null;
  resizeObserver: ResizeObserver | null;
}

export class TerminalInstanceManager {
  private instances = new Map<string, ManagedTerminal>();
  private activityCallbacks = new Set<ActivityCallback>();
  private connectionStateCallbacks = new Set<ConnectionStateCallback>();
  private shellTypeCallbacks = new Set<ShellTypeCallback>();

  has(id: string): boolean {
    return this.instances.has(id);
  }

  getConnectionState(id: string): TerminalConnectionState | undefined {
    return this.instances.get(id)?.connectionState;
  }

  /** Create a new xterm.js Terminal + WebSocket connection. Does NOT attach to DOM. */
  create(id: string): void {
    // If already exists, dispose first
    if (this.instances.has(id)) {
      this.dispose(id);
    }

    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: "'Fira Code', 'Cascadia Code', 'JetBrains Mono', monospace",
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(new WebLinksAddon());

    const managed: ManagedTerminal = {
      id,
      terminal,
      fitAddon,
      ws: null,
      connectionState: "initializing",
      reconnectAttempt: 0,
      reconnectTimer: null,
      disconnectStartTime: null,
      gaveUp: false,
      firstConnect: true,
      disposed: false,
      container: null,
      resizeObserver: null,
    };

    this.instances.set(id, managed);

    // Wire up user input
    terminal.onData((data) => {
      if (managed.connectionState === "expired") {
        // Restart connection on keypress after expiry
        managed.gaveUp = false;
        managed.reconnectAttempt = 0;
        managed.firstConnect = true;
        this.connect(managed);
        return;
      }
      const ws = managed.ws;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "input", data }));
      }
    });

    // Start WebSocket connection
    this.connect(managed);
  }

  /** Attach terminal to a DOM element. Instant — no reconnect needed. */
  attach(id: string, container: HTMLElement): void {
    const managed = this.instances.get(id);
    if (!managed || managed.disposed) return;

    // Already attached to this container
    if (managed.container === container) {
      managed.fitAddon.fit();
      return;
    }

    // Detach from old container if any
    if (managed.container) {
      this.detach(id);
    }

    managed.container = container;
    managed.terminal.open(container);
    managed.fitAddon.fit();

    // ResizeObserver for auto-fit
    managed.resizeObserver = new ResizeObserver(() => {
      if (managed.container) {
        managed.fitAddon.fit();
        const ws = managed.ws;
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: "resize",
            cols: managed.terminal.cols,
            rows: managed.terminal.rows,
          }));
        }
      }
    });
    managed.resizeObserver.observe(container);
  }

  /** Detach terminal from DOM. Terminal + WebSocket stay alive. */
  detach(id: string): void {
    const managed = this.instances.get(id);
    if (!managed) return;

    if (managed.resizeObserver) {
      managed.resizeObserver.disconnect();
      managed.resizeObserver = null;
    }

    // xterm.js doesn't have a detach() — we just clear the container reference.
    // The Terminal object and its internal buffer remain intact.
    // When re-attached, terminal.open(newContainer) re-renders from the buffer.
    managed.container = null;
  }

  /** Fully dispose terminal — kill PTY, close WebSocket, destroy Terminal. */
  dispose(id: string): void {
    const managed = this.instances.get(id);
    if (!managed) return;

    managed.disposed = true;

    if (managed.reconnectTimer) {
      clearTimeout(managed.reconnectTimer);
      managed.reconnectTimer = null;
    }

    if (managed.resizeObserver) {
      managed.resizeObserver.disconnect();
      managed.resizeObserver = null;
    }

    // Kill server-side PTY
    const ws = managed.ws;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "kill" }));
      ws.close();
    } else {
      // WS is down — use HTTP fallback
      fetch(`/api/terminal/sessions/${encodeURIComponent(id)}`, {
        method: "DELETE",
      }).catch(() => {});
    }

    managed.terminal.dispose();
    this.instances.delete(id);
  }

  /** Subscribe to output activity on any instance. Returns unsubscribe function. */
  onActivity(cb: ActivityCallback): () => void {
    this.activityCallbacks.add(cb);
    return () => this.activityCallbacks.delete(cb);
  }

  /** Subscribe to connection state changes. Returns unsubscribe function. */
  onConnectionStateChange(cb: ConnectionStateCallback): () => void {
    this.connectionStateCallbacks.add(cb);
    return () => this.connectionStateCallbacks.delete(cb);
  }

  /** Subscribe to shell type reports from server. Returns unsubscribe function. */
  onShellType(cb: ShellTypeCallback): () => void {
    this.shellTypeCallbacks.add(cb);
    return () => this.shellTypeCallbacks.delete(cb);
  }

  /** Update xterm theme on all terminals (call when app theme changes). */
  updateTheme(variant: "dark" | "light", colors: { background: string; foreground: string; accent: string }): void {
    const bg = hslToHex(colors.background);
    const fg = hslToHex(colors.foreground);
    const sel = hslToHex(colors.accent);
    const ansi = variant === "dark" ? DARK_ANSI : LIGHT_ANSI;
    const theme = { background: bg, foreground: fg, cursor: fg, selectionBackground: sel, ...ansi };

    for (const managed of this.instances.values()) {
      managed.terminal.options.theme = theme;
    }
  }

  /** Dispose all instances (app shutdown). */
  disposeAll(): void {
    for (const id of [...this.instances.keys()]) {
      this.dispose(id);
    }
  }

  // --- Private ---

  private setConnectionState(managed: ManagedTerminal, state: TerminalConnectionState): void {
    managed.connectionState = state;
    for (const cb of this.connectionStateCallbacks) {
      cb(managed.id, state);
    }
  }

  private fireActivity(id: string): void {
    for (const cb of this.activityCallbacks) {
      cb(id);
    }
  }

  private fireShellType(id: string, shellType: string): void {
    for (const cb of this.shellTypeCallbacks) {
      cb(id, shellType);
    }
  }

  private connect(managed: ManagedTerminal): void {
    if (managed.disposed) return;
    this.setConnectionState(managed, "connecting");

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const cols = managed.terminal.cols || 80;
    const rows = managed.terminal.rows || 24;
    const wsUrl = `${protocol}//${window.location.host}/ws/terminal?id=${managed.id}&cols=${cols}&rows=${rows}&mode=attach`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      managed.reconnectAttempt = 0;
      managed.disconnectStartTime = null;
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        switch (msg.type) {
          case "created":
            this.setConnectionState(managed, "connected");
            managed.firstConnect = false;
            if (msg.shellType) {
              this.fireShellType(managed.id, msg.shellType);
            }
            break;
          case "attached":
            managed.terminal.clear();
            managed.terminal.reset();
            this.setConnectionState(managed, "connected");
            if (!managed.firstConnect) {
              managed.terminal.write("\x1b[32m[Reconnected]\x1b[0m\r\n");
            }
            managed.firstConnect = false;
            break;
          case "buffer-replay":
            managed.terminal.write(msg.data);
            break;
          case "buffer-replay-done":
            break;
          case "expired":
            this.setConnectionState(managed, "expired");
            managed.terminal.write(
              "\r\n\x1b[90m[Session expired \u2014 press any key to start new terminal]\x1b[0m\r\n"
            );
            break;
          case "output":
            managed.terminal.write(msg.data);
            // Fire activity for background detection (store decides if tab is visible)
            this.fireActivity(managed.id);
            break;
          case "exit":
            managed.terminal.write("\r\n\x1b[90m[Process exited]\x1b[0m\r\n");
            break;
        }
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = () => {
      if (managed.disposed) return;
      if (managed.gaveUp) return;
      if (managed.connectionState === "expired") return;

      this.setConnectionState(managed, "disconnected");
      managed.terminal.write(
        "\r\n\x1b[33m[Disconnected \u2014 reconnecting...]\x1b[0m\r\n"
      );

      if (managed.disconnectStartTime === null) {
        managed.disconnectStartTime = Date.now();
      }

      if (Date.now() - managed.disconnectStartTime >= RECONNECT_TIMEOUT_MS) {
        managed.gaveUp = true;
        this.setConnectionState(managed, "expired");
        managed.terminal.write(
          "\r\n\x1b[90m[Session expired \u2014 press any key to start new terminal]\x1b[0m\r\n"
        );
        return;
      }

      const backoff = Math.min(
        RECONNECT_INITIAL_MS * Math.pow(2, managed.reconnectAttempt),
        RECONNECT_MAX_MS
      );
      managed.reconnectAttempt += 1;

      managed.reconnectTimer = setTimeout(() => {
        managed.reconnectTimer = null;
        this.connect(managed);
      }, backoff);
    };

    ws.onerror = () => {
      // Let close handler deal with it
    };

    managed.ws = ws;
  }
}

// Singleton
let _instance: TerminalInstanceManager | null = null;

export function getTerminalInstanceManager(): TerminalInstanceManager {
  if (!_instance) {
    _instance = new TerminalInstanceManager();
  }
  return _instance;
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/terminal-instance-manager.test.ts --reporter=verbose 2>&1 | tail -20
```

Expected: All 4 tests pass. (The tests verify the singleton accessor, `has()`, and callback subscription — they don't need a real DOM or WebSocket.)

- [ ] **Step 6: Commit**

```bash
git add client/src/lib/terminal-instance-manager.ts tests/terminal-instance-manager.test.ts
git commit -m "feat: TerminalInstanceManager — singleton owning xterm.js + WebSocket lifecycles"
```

---

### Task 5: Create Zustand Store

**Files:**
- Create: `client/src/stores/terminal-group-store.ts`
- Test: `tests/terminal-group-store.test.ts`

- [ ] **Step 1: Write the tests**

Create `tests/terminal-group-store.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";

// Reset store between tests
let useTerminalGroupStore: any;

beforeEach(async () => {
  // Dynamic import to get fresh module — zustand stores are singletons
  const mod = await import("../client/src/stores/terminal-group-store");
  useTerminalGroupStore = mod.useTerminalGroupStore;
  // Reset to initial state
  useTerminalGroupStore.setState({
    groups: [],
    activeGroupId: null,
    focusedInstanceId: null,
    height: 300,
    collapsed: false,
    unreadInstanceIds: new Set<string>(),
  });
});

describe("terminal group store", () => {
  it("starts with empty groups", () => {
    const state = useTerminalGroupStore.getState();
    expect(state.groups).toEqual([]);
    expect(state.activeGroupId).toBeNull();
  });

  it("createGroup adds a group and activates it", () => {
    const { createGroup } = useTerminalGroupStore.getState();
    createGroup("test-group", "test-instance", "bash");
    const state = useTerminalGroupStore.getState();
    expect(state.groups).toHaveLength(1);
    expect(state.groups[0].id).toBe("test-group");
    expect(state.groups[0].instances).toHaveLength(1);
    expect(state.groups[0].instances[0].id).toBe("test-instance");
    expect(state.groups[0].instances[0].name).toBe("bash");
    expect(state.activeGroupId).toBe("test-group");
  });

  it("splitGroup adds an instance to the active group", () => {
    const { createGroup, splitGroup } = useTerminalGroupStore.getState();
    createGroup("g1", "i1", "bash");
    splitGroup("g1", "i2", "bash");
    const state = useTerminalGroupStore.getState();
    expect(state.groups[0].instances).toHaveLength(2);
    expect(state.groups[0].instances[1].id).toBe("i2");
  });

  it("removeInstance removes instance from group", () => {
    const { createGroup, splitGroup, removeInstance } =
      useTerminalGroupStore.getState();
    createGroup("g1", "i1", "bash");
    splitGroup("g1", "i2", "bash");
    removeInstance("g1", "i2");
    const state = useTerminalGroupStore.getState();
    expect(state.groups[0].instances).toHaveLength(1);
    expect(state.groups[0].instances[0].id).toBe("i1");
  });

  it("removeInstance removes entire group when last instance is killed", () => {
    const { createGroup, removeInstance } = useTerminalGroupStore.getState();
    createGroup("g1", "i1", "bash");
    createGroup("g2", "i2", "bash");
    removeInstance("g1", "i1");
    const state = useTerminalGroupStore.getState();
    expect(state.groups).toHaveLength(1);
    expect(state.groups[0].id).toBe("g2");
    expect(state.activeGroupId).toBe("g2");
  });

  it("removeInstance activates nearest group when active group is removed", () => {
    const { createGroup, removeInstance } = useTerminalGroupStore.getState();
    createGroup("g1", "i1", "bash");
    createGroup("g2", "i2", "bash");
    createGroup("g3", "i3", "bash");
    // Active is g3 (last created). Remove it.
    removeInstance("g3", "i3");
    const state = useTerminalGroupStore.getState();
    expect(state.activeGroupId).toBe("g2");
  });

  it("setActiveGroup switches the active group", () => {
    const { createGroup, setActiveGroup } = useTerminalGroupStore.getState();
    createGroup("g1", "i1", "bash");
    createGroup("g2", "i2", "bash");
    setActiveGroup("g1");
    expect(useTerminalGroupStore.getState().activeGroupId).toBe("g1");
  });

  it("renameInstance updates the instance name", () => {
    const { createGroup, renameInstance } = useTerminalGroupStore.getState();
    createGroup("g1", "i1", "bash");
    renameInstance("i1", "dev server");
    const state = useTerminalGroupStore.getState();
    expect(state.groups[0].instances[0].name).toBe("dev server");
  });

  it("markUnread / clearUnread track activity", () => {
    const { createGroup, markUnread, clearUnread } =
      useTerminalGroupStore.getState();
    createGroup("g1", "i1", "bash");
    markUnread("i1");
    expect(useTerminalGroupStore.getState().unreadInstanceIds.has("i1")).toBe(true);
    clearUnread("i1");
    expect(useTerminalGroupStore.getState().unreadInstanceIds.has("i1")).toBe(false);
  });

  it("toSerializable produces correct shape for server persistence", () => {
    const { createGroup, splitGroup, toSerializable } =
      useTerminalGroupStore.getState();
    createGroup("g1", "i1", "bash");
    splitGroup("g1", "i2", "zsh");
    const data = toSerializable();
    expect(data).toEqual({
      height: 300,
      collapsed: false,
      groups: [
        {
          id: "g1",
          instances: [
            { id: "i1", name: "bash" },
            { id: "i2", name: "zsh" },
          ],
        },
      ],
      activeGroupId: "g1",
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/terminal-group-store.test.ts --reporter=verbose 2>&1 | tail -20
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create the stores directory and write the store**

```bash
mkdir -p client/src/stores
```

Create `client/src/stores/terminal-group-store.ts`:

```typescript
import { create } from "zustand";
import type { TerminalPanelState, TerminalGroupData, TerminalInstanceData } from "@shared/types";

interface TerminalInstanceInfo extends TerminalInstanceData {
  shellType: string;
}

interface TerminalGroup {
  id: string;
  instances: TerminalInstanceInfo[];
}

interface TerminalGroupState {
  groups: TerminalGroup[];
  activeGroupId: string | null;
  focusedInstanceId: string | null;
  height: number;
  collapsed: boolean;
  unreadInstanceIds: Set<string>;

  // Actions
  createGroup: (groupId: string, instanceId: string, shellName: string) => void;
  splitGroup: (groupId: string, instanceId: string, shellName: string) => void;
  removeInstance: (groupId: string, instanceId: string) => void;
  setActiveGroup: (groupId: string) => void;
  setFocusedInstance: (instanceId: string) => void;
  renameInstance: (instanceId: string, name: string) => void;
  setHeight: (height: number) => void;
  setCollapsed: (collapsed: boolean) => void;
  markUnread: (instanceId: string) => void;
  clearUnread: (instanceId: string) => void;
  loadFromServer: (data: TerminalPanelState) => void;
  toSerializable: () => TerminalPanelState;
}

export const useTerminalGroupStore = create<TerminalGroupState>((set, get) => ({
  groups: [],
  activeGroupId: null,
  focusedInstanceId: null,
  height: 300,
  collapsed: false,
  unreadInstanceIds: new Set(),

  createGroup: (groupId, instanceId, shellName) => {
    const instance: TerminalInstanceInfo = {
      id: instanceId,
      name: shellName,
      shellType: shellName,
    };
    set((s) => ({
      groups: [...s.groups, { id: groupId, instances: [instance] }],
      activeGroupId: groupId,
      focusedInstanceId: instanceId,
    }));
  },

  splitGroup: (groupId, instanceId, shellName) => {
    const instance: TerminalInstanceInfo = {
      id: instanceId,
      name: shellName,
      shellType: shellName,
    };
    set((s) => ({
      groups: s.groups.map((g) =>
        g.id === groupId
          ? { ...g, instances: [...g.instances, instance] }
          : g
      ),
      focusedInstanceId: instanceId,
    }));
  },

  removeInstance: (groupId, instanceId) => {
    set((s) => {
      const group = s.groups.find((g) => g.id === groupId);
      if (!group) return s;

      const remaining = group.instances.filter((i) => i.id !== instanceId);

      // Remove unread tracking
      const newUnread = new Set(s.unreadInstanceIds);
      newUnread.delete(instanceId);

      if (remaining.length === 0) {
        // Group is empty — remove it
        const newGroups = s.groups.filter((g) => g.id !== groupId);
        let newActiveId = s.activeGroupId;

        if (s.activeGroupId === groupId) {
          // Activate nearest group
          const oldIdx = s.groups.findIndex((g) => g.id === groupId);
          if (newGroups.length > 0) {
            const nearestIdx = Math.min(oldIdx, newGroups.length - 1);
            newActiveId = newGroups[nearestIdx].id;
          } else {
            newActiveId = null;
          }
        }

        return {
          groups: newGroups,
          activeGroupId: newActiveId,
          focusedInstanceId: newActiveId
            ? newGroups.find((g) => g.id === newActiveId)?.instances[0]?.id ?? null
            : null,
          unreadInstanceIds: newUnread,
        };
      }

      // Group still has instances
      return {
        groups: s.groups.map((g) =>
          g.id === groupId ? { ...g, instances: remaining } : g
        ),
        focusedInstanceId:
          s.focusedInstanceId === instanceId
            ? remaining[remaining.length - 1].id
            : s.focusedInstanceId,
        unreadInstanceIds: newUnread,
      };
    });
  },

  setActiveGroup: (groupId) => {
    set((s) => {
      const group = s.groups.find((g) => g.id === groupId);
      // Clear unread for all instances in the newly active group
      const newUnread = new Set(s.unreadInstanceIds);
      group?.instances.forEach((i) => newUnread.delete(i.id));
      return {
        activeGroupId: groupId,
        focusedInstanceId: group?.instances[0]?.id ?? null,
        unreadInstanceIds: newUnread,
      };
    });
  },

  setFocusedInstance: (instanceId) => {
    set({ focusedInstanceId: instanceId });
  },

  renameInstance: (instanceId, name) => {
    set((s) => ({
      groups: s.groups.map((g) => ({
        ...g,
        instances: g.instances.map((i) =>
          i.id === instanceId ? { ...i, name } : i
        ),
      })),
    }));
  },

  setHeight: (height) => set({ height }),
  setCollapsed: (collapsed) => set({ collapsed }),

  markUnread: (instanceId) => {
    set((s) => {
      const newUnread = new Set(s.unreadInstanceIds);
      newUnread.add(instanceId);
      return { unreadInstanceIds: newUnread };
    });
  },

  clearUnread: (instanceId) => {
    set((s) => {
      if (!s.unreadInstanceIds.has(instanceId)) return s;
      const newUnread = new Set(s.unreadInstanceIds);
      newUnread.delete(instanceId);
      return { unreadInstanceIds: newUnread };
    });
  },

  loadFromServer: (data) => {
    set({
      groups: data.groups.map((g) => ({
        id: g.id,
        instances: g.instances.map((i) => ({
          ...i,
          shellType: i.name, // Best guess — server doesn't persist shellType separately
        })),
      })),
      activeGroupId: data.activeGroupId,
      height: data.height,
      collapsed: data.collapsed,
    });
  },

  toSerializable: (): TerminalPanelState => {
    const s = get();
    return {
      height: s.height,
      collapsed: s.collapsed,
      groups: s.groups.map((g) => ({
        id: g.id,
        instances: g.instances.map((i) => ({ id: i.id, name: i.name })),
      })),
      activeGroupId: s.activeGroupId,
    };
  },
}));
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/terminal-group-store.test.ts --reporter=verbose 2>&1 | tail -30
```

Expected: All 10 tests pass.

- [ ] **Step 5: Commit**

```bash
git add client/src/stores/terminal-group-store.ts tests/terminal-group-store.test.ts
git commit -m "feat: zustand terminal group store with full CRUD + persistence"
```

---

### Task 6: Rewrite TerminalInstance Component

The old 320-line component becomes a ~20-line mount point.

**Files:**
- Rewrite: `client/src/components/terminal-instance.tsx`

- [ ] **Step 1: Rewrite the component**

Replace the entire contents of `client/src/components/terminal-instance.tsx`:

```typescript
import { useEffect, useRef } from "react";
import { getTerminalInstanceManager } from "@/lib/terminal-instance-manager";

interface TerminalInstanceProps {
  instanceId: string;
}

export function TerminalInstance({ instanceId }: TerminalInstanceProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const manager = getTerminalInstanceManager();
    manager.attach(instanceId, containerRef.current);

    return () => {
      manager.detach(instanceId);
    };
  }, [instanceId]);

  return <div ref={containerRef} className="h-full w-full" />;
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/terminal-instance.tsx
git commit -m "refactor: TerminalInstance is now a minimal mount point"
```

---

### Task 7: Create TerminalGroupView

**Files:**
- Create: `client/src/components/terminal-group-view.tsx`

- [ ] **Step 1: Write the component**

Create `client/src/components/terminal-group-view.tsx`:

```typescript
import { Allotment } from "allotment";
import { TerminalInstance } from "./terminal-instance";
import { useTerminalGroupStore } from "@/stores/terminal-group-store";
import "allotment/dist/style.css";

export function TerminalGroupView() {
  const activeGroupId = useTerminalGroupStore((s) => s.activeGroupId);
  const groups = useTerminalGroupStore((s) => s.groups);
  const setFocusedInstance = useTerminalGroupStore((s) => s.setFocusedInstance);

  const group = groups.find((g) => g.id === activeGroupId);

  if (!group || group.instances.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        No terminal open. Press + to create one.
      </div>
    );
  }

  if (group.instances.length === 1) {
    return (
      <div className="flex-1">
        <TerminalInstance instanceId={group.instances[0].id} />
      </div>
    );
  }

  return (
    <div className="flex-1">
      <Allotment>
        {group.instances.map((instance) => (
          <Allotment.Pane key={instance.id}>
            <div
              className="h-full w-full"
              onFocus={() => setFocusedInstance(instance.id)}
              onClick={() => setFocusedInstance(instance.id)}
            >
              <TerminalInstance instanceId={instance.id} />
            </div>
          </Allotment.Pane>
        ))}
      </Allotment>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/terminal-group-view.tsx
git commit -m "feat: TerminalGroupView — allotment-based resizable split panes"
```

---

### Task 8: Create TerminalToolbar

**Files:**
- Create: `client/src/components/terminal-toolbar.tsx`

- [ ] **Step 1: Write the component**

Create `client/src/components/terminal-toolbar.tsx`:

```typescript
import { useCallback } from "react";
import { Columns2, Plus, ChevronDown } from "lucide-react";
import { useTerminalGroupStore } from "@/stores/terminal-group-store";
import { getTerminalInstanceManager } from "@/lib/terminal-instance-manager";

export function TerminalToolbar() {
  const activeGroupId = useTerminalGroupStore((s) => s.activeGroupId);
  const createGroup = useTerminalGroupStore((s) => s.createGroup);
  const splitGroup = useTerminalGroupStore((s) => s.splitGroup);
  const setCollapsed = useTerminalGroupStore((s) => s.setCollapsed);

  const handleNew = useCallback(() => {
    const groupId = crypto.randomUUID();
    const instanceId = crypto.randomUUID();
    const manager = getTerminalInstanceManager();
    manager.create(instanceId);
    createGroup(groupId, instanceId, "bash");
  }, [createGroup]);

  const handleSplit = useCallback(() => {
    if (!activeGroupId) return;
    const instanceId = crypto.randomUUID();
    const manager = getTerminalInstanceManager();
    manager.create(instanceId);
    splitGroup(activeGroupId, instanceId, "bash");
  }, [activeGroupId, splitGroup]);

  const handleCollapse = useCallback(() => {
    setCollapsed(true);
  }, [setCollapsed]);

  return (
    <div className="flex items-center h-8 bg-muted/30 border-b px-2 justify-end gap-0.5">
      <button
        onClick={handleSplit}
        className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
        title="Split terminal"
        disabled={!activeGroupId}
      >
        <Columns2 className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={handleNew}
        className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
        title="New terminal"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={handleCollapse}
        className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
        title="Collapse panel"
      >
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/terminal-toolbar.tsx
git commit -m "feat: TerminalToolbar — split, new, collapse actions"
```

---

### Task 9: Create TerminalExplorer

**Files:**
- Create: `client/src/components/terminal-explorer.tsx`

- [ ] **Step 1: Write the component**

Create `client/src/components/terminal-explorer.tsx`:

```typescript
import { useCallback, useState, useRef, useEffect } from "react";
import { X } from "lucide-react";
import { useTerminalGroupStore } from "@/stores/terminal-group-store";
import { getTerminalInstanceManager } from "@/lib/terminal-instance-manager";
import type { TerminalConnectionState } from "@shared/types";

function StatusDot({ instanceId }: { instanceId: string }) {
  const [state, setState] = useState<TerminalConnectionState>("initializing");

  useEffect(() => {
    const manager = getTerminalInstanceManager();
    // Get current state
    const current = manager.getConnectionState(instanceId);
    if (current) setState(current);
    // Subscribe to changes
    const unsub = manager.onConnectionStateChange((id, s) => {
      if (id === instanceId) setState(s);
    });
    return unsub;
  }, [instanceId]);

  const color =
    state === "connected"
      ? "bg-green-500"
      : state === "disconnected" || state === "reconnecting"
        ? "bg-yellow-500"
        : state === "expired"
          ? "bg-red-500"
          : "bg-zinc-500";

  return <span className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${color}`} />;
}

function treeConnector(index: number, total: number): string {
  if (total <= 1) return "";
  if (index === 0) return "┌";
  if (index === total - 1) return "└";
  return "├";
}

interface InlineRenameProps {
  currentName: string;
  onConfirm: (name: string) => void;
  onCancel: () => void;
}

function InlineRename({ currentName, onConfirm, onCancel }: InlineRenameProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.select();
  }, []);

  return (
    <input
      ref={inputRef}
      className="bg-background border border-border rounded px-1 text-xs w-full outline-none"
      defaultValue={currentName}
      onBlur={(e) => {
        const v = e.target.value.trim();
        if (v) onConfirm(v);
        else onCancel();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          const v = (e.target as HTMLInputElement).value.trim();
          if (v) onConfirm(v);
          else onCancel();
        }
        if (e.key === "Escape") onCancel();
      }}
    />
  );
}

export function TerminalExplorer() {
  const groups = useTerminalGroupStore((s) => s.groups);
  const activeGroupId = useTerminalGroupStore((s) => s.activeGroupId);
  const unreadInstanceIds = useTerminalGroupStore((s) => s.unreadInstanceIds);
  const setActiveGroup = useTerminalGroupStore((s) => s.setActiveGroup);
  const setFocusedInstance = useTerminalGroupStore((s) => s.setFocusedInstance);
  const removeInstance = useTerminalGroupStore((s) => s.removeInstance);
  const renameInstance = useTerminalGroupStore((s) => s.renameInstance);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    groupId: string;
    instanceId: string;
  } | null>(null);

  const handleKill = useCallback(
    (groupId: string, instanceId: string) => {
      const manager = getTerminalInstanceManager();
      manager.dispose(instanceId);
      removeInstance(groupId, instanceId);
    },
    [removeInstance]
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, groupId: string, instanceId: string) => {
      e.preventDefault();
      setContextMenu({ x: e.clientX, y: e.clientY, groupId, instanceId });
    },
    []
  );

  // Close context menu on click elsewhere
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [contextMenu]);

  const handleInstanceClick = useCallback(
    (groupId: string, instanceId: string) => {
      setActiveGroup(groupId);
      setFocusedInstance(instanceId);
    },
    [setActiveGroup, setFocusedInstance]
  );

  return (
    <div className="w-[140px] bg-muted/30 border-l flex flex-col text-xs select-none">
      <div className="flex-1 overflow-y-auto">
        {groups.map((group) => {
          const isActive = group.id === activeGroupId;
          const hasUnread = group.instances.some((i) =>
            unreadInstanceIds.has(i.id)
          );

          return (
            <div
              key={group.id}
              className={`border-l-2 ${
                isActive
                  ? "border-blue-500 bg-background"
                  : hasUnread
                    ? "border-transparent bg-accent/20"
                    : "border-transparent"
              }`}
            >
              {group.instances.map((instance, idx) => (
                <div
                  key={instance.id}
                  className={`flex items-center gap-1.5 px-2 py-1 cursor-pointer hover:bg-accent/30 ${
                    isActive ? "text-foreground" : "text-muted-foreground"
                  }`}
                  onClick={() => handleInstanceClick(group.id, instance.id)}
                  onContextMenu={(e) =>
                    handleContextMenu(e, group.id, instance.id)
                  }
                >
                  <span className="text-muted-foreground/40 w-3 text-center text-[10px]">
                    {treeConnector(idx, group.instances.length)}
                  </span>
                  <StatusDot instanceId={instance.id} />
                  {renamingId === instance.id ? (
                    <InlineRename
                      currentName={instance.name}
                      onConfirm={(name) => {
                        renameInstance(instance.id, name);
                        setRenamingId(null);
                      }}
                      onCancel={() => setRenamingId(null)}
                    />
                  ) : (
                    <span className="truncate flex-1">{instance.name}</span>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleKill(group.id, instance.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 hover:text-foreground p-0.5"
                    // CSS trick: parent needs group class for this to work
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-popover border border-border rounded shadow-lg py-1 text-xs"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            className="w-full px-3 py-1.5 text-left hover:bg-accent/50"
            onClick={() => {
              setRenamingId(contextMenu.instanceId);
              setContextMenu(null);
            }}
          >
            Rename
          </button>
          <button
            className="w-full px-3 py-1.5 text-left hover:bg-accent/50"
            onClick={() => {
              const instanceId = crypto.randomUUID();
              const manager = getTerminalInstanceManager();
              manager.create(instanceId);
              useTerminalGroupStore
                .getState()
                .splitGroup(contextMenu.groupId, instanceId, "bash");
              setContextMenu(null);
            }}
          >
            Split
          </button>
          <button
            className="w-full px-3 py-1.5 text-left hover:bg-accent/50 text-destructive"
            onClick={() => {
              handleKill(contextMenu.groupId, contextMenu.instanceId);
              setContextMenu(null);
            }}
          >
            Kill
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Fix close button hover visibility**

The close button uses `opacity-0 group-hover:opacity-100` but the parent div needs the `group` class. Update the parent div's className — add `group` to the class list:

```typescript
                <div
                  key={instance.id}
                  className={`group flex items-center gap-1.5 px-2 py-1 cursor-pointer hover:bg-accent/30 ${
```

- [ ] **Step 3: Commit**

```bash
git add client/src/components/terminal-explorer.tsx
git commit -m "feat: TerminalExplorer — sidebar with groups, tree connectors, context menu"
```

---

### Task 10: Rewrite TerminalPanel

**Files:**
- Rewrite: `client/src/components/terminal-panel.tsx`
- Delete: `client/src/hooks/use-terminal.ts`

- [ ] **Step 1: Rewrite the panel**

Replace the entire contents of `client/src/components/terminal-panel.tsx`:

```typescript
import { useRef, useCallback, useEffect } from "react";
import { ChevronUp, Terminal } from "lucide-react";
import { useTerminalGroupStore } from "@/stores/terminal-group-store";
import { getTerminalInstanceManager } from "@/lib/terminal-instance-manager";
import { useTheme } from "@/hooks/use-theme";
import { TerminalToolbar } from "./terminal-toolbar";
import { TerminalGroupView } from "./terminal-group-view";
import { TerminalExplorer } from "./terminal-explorer";
import { apiRequest } from "@/lib/queryClient";
import type { TerminalPanelState } from "@shared/types";

export function TerminalPanel() {
  const collapsed = useTerminalGroupStore((s) => s.collapsed);
  const height = useTerminalGroupStore((s) => s.height);
  const groups = useTerminalGroupStore((s) => s.groups);
  const activeGroupId = useTerminalGroupStore((s) => s.activeGroupId);
  const setHeight = useTerminalGroupStore((s) => s.setHeight);
  const setCollapsed = useTerminalGroupStore((s) => s.setCollapsed);
  const loadFromServer = useTerminalGroupStore((s) => s.loadFromServer);
  const createGroup = useTerminalGroupStore((s) => s.createGroup);
  const toSerializable = useTerminalGroupStore((s) => s.toSerializable);
  const markUnread = useTerminalGroupStore((s) => s.markUnread);

  const isResizingRef = useRef(false);
  const initializedRef = useRef(false);
  const { resolvedTheme } = useTheme();

  // Load state from server on mount
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    fetch("/api/terminal/panel")
      .then((r) => r.json())
      .then((data: TerminalPanelState) => {
        if (data.groups && data.groups.length > 0) {
          loadFromServer(data);
          // Recreate manager instances for all persisted terminals
          const manager = getTerminalInstanceManager();
          for (const group of data.groups) {
            for (const inst of group.instances) {
              manager.create(inst.id);
            }
          }
        } else {
          // No saved state — create initial terminal
          const groupId = crypto.randomUUID();
          const instanceId = crypto.randomUUID();
          const manager = getTerminalInstanceManager();
          manager.create(instanceId);
          createGroup(groupId, instanceId, "bash");
        }
      })
      .catch(() => {
        // Server unavailable — create initial terminal
        const groupId = crypto.randomUUID();
        const instanceId = crypto.randomUUID();
        const manager = getTerminalInstanceManager();
        manager.create(instanceId);
        createGroup(groupId, instanceId, "bash");
      });
  }, [loadFromServer, createGroup]);

  // Persist state to server on changes
  useEffect(() => {
    if (!initializedRef.current || groups.length === 0) return;
    const data = toSerializable();
    apiRequest("PATCH", "/api/terminal/panel", data).catch(() => {});
  }, [groups, activeGroupId, height, collapsed, toSerializable]);

  // Subscribe manager to update shell types when server reports them
  useEffect(() => {
    const manager = getTerminalInstanceManager();
    const unsub = manager.onShellType((id, shellType) => {
      useTerminalGroupStore.getState().renameInstance(id, shellType);
    });
    return unsub;
  }, []);

  // Subscribe to activity events for unread tracking
  useEffect(() => {
    const manager = getTerminalInstanceManager();
    const unsub = manager.onActivity((id) => {
      const state = useTerminalGroupStore.getState();
      // Only mark unread if the instance is NOT in the active group
      const activeGroup = state.groups.find((g) => g.id === state.activeGroupId);
      const isInActiveGroup = activeGroup?.instances.some((i) => i.id === id);
      if (!isInActiveGroup) {
        markUnread(id);
      }
    });
    return unsub;
  }, [markUnread]);

  // Sync theme to manager
  useEffect(() => {
    const manager = getTerminalInstanceManager();
    manager.updateTheme(resolvedTheme.variant as "dark" | "light", {
      background: resolvedTheme.colors.background,
      foreground: resolvedTheme.colors.foreground,
      accent: resolvedTheme.colors.accent,
    });
  }, [resolvedTheme]);

  // Drag-to-resize
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isResizingRef.current = true;
      const startY = e.clientY;
      const startHeight = height;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const delta = startY - moveEvent.clientY;
        const newHeight = Math.max(
          100,
          Math.min(startHeight + delta, window.innerHeight - 200)
        );
        setHeight(newHeight);
      };

      const handleMouseUp = () => {
        isResizingRef.current = false;
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [height, setHeight]
  );

  if (collapsed) {
    return (
      <div className="border-t border-border bg-background">
        <div className="flex items-center h-8 px-2">
          <button
            onClick={() => setCollapsed(false)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-accent/50"
          >
            <ChevronUp className="h-3 w-3" />
            <Terminal className="h-3 w-3" />
            <span>Terminal</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ height }} className="flex flex-col border-t bg-background">
      {/* Drag handle */}
      <div
        onMouseDown={handleMouseDown}
        className="h-1.5 cursor-row-resize flex items-center justify-center hover:bg-accent/50 transition-colors group"
      >
        <div className="w-10 h-0.5 bg-muted-foreground/20 rounded-full group-hover:bg-muted-foreground/40 transition-colors" />
      </div>

      <TerminalToolbar />

      <div className="flex-1 flex min-h-0">
        <TerminalGroupView />
        <TerminalExplorer />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Delete the old hook file**

```bash
rm client/src/hooks/use-terminal.ts
```

- [ ] **Step 3: Remove any remaining imports of the old hook**

Search for and remove any imports of `use-terminal`:

```bash
grep -r "use-terminal" client/src/ --include="*.ts" --include="*.tsx"
```

If any files still import from `use-terminal`, remove those imports. The only consumer should have been `terminal-panel.tsx` which we just rewrote.

- [ ] **Step 4: Run type check**

```bash
npm run check 2>&1 | tail -20
```

Expected: Clean (no errors). If there are errors, they'll likely be from files importing old `TerminalTab` type — fix any remaining references.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: rewrite TerminalPanel with group-based architecture

Composes TerminalToolbar, TerminalGroupView, and TerminalExplorer.
Uses zustand store for state, TerminalInstanceManager for xterm.js
lifecycle. Removes old use-terminal.ts hook."
```

---

### Task 11: Run Full Tests + Safety Check

**Files:**
- Test: all

- [ ] **Step 1: Run type check**

```bash
npm run check
```

Expected: Clean — no TypeScript errors.

- [ ] **Step 2: Run all tests**

```bash
npm test 2>&1 | tail -20
```

Expected: All tests pass, including the new store and manager tests.

- [ ] **Step 3: Run safety tests specifically**

```bash
npx vitest run tests/new-user-safety.test.ts --reporter=verbose 2>&1 | tail -10
```

Expected: All safety tests pass (no hardcoded paths, no PII, etc.).

- [ ] **Step 4: Build for production**

```bash
npm run build 2>&1 | tail -10
```

Expected: Build succeeds.

- [ ] **Step 5: Commit any fixes needed**

If any tests failed, fix the issues and commit.

---

### Task 12: Remove Old Tailwind Animation + Cleanup

**Files:**
- Modify: `tailwind.config.ts`

- [ ] **Step 1: Remove terminal-tab-flash animation**

In `tailwind.config.ts`, remove the `terminal-tab-flash` keyframe and animation entries that were added for the old tab bar flash feature (no longer used — unread is now shown in the explorer):

Remove from keyframes:
```typescript
        "terminal-tab-flash": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.6" },
        },
```

Remove from animation:
```typescript
        "terminal-tab-flash": "terminal-tab-flash 1.5s ease-in-out infinite",
```

- [ ] **Step 2: Verify no references remain**

```bash
grep -r "terminal-tab-flash" client/src/ tailwind.config.ts
```

Expected: No matches.

- [ ] **Step 3: Commit**

```bash
git add tailwind.config.ts
git commit -m "chore: remove unused terminal-tab-flash animation"
```

---

### Task 13: Deploy and Verify

- [ ] **Step 1: Build**

```bash
npm run build
```

- [ ] **Step 2: Deploy**

```bash
scripts/deploy.sh
```

Or if deploy.sh needs sudo:

```bash
npm run build && sudo systemctl restart agent-cc
```

- [ ] **Step 3: Verify in browser**

Open Agent CC in the browser. Check:
- Terminal panel shows with explorer sidebar on the right
- Clicking + creates a new terminal group
- Clicking split (⫏) adds a second terminal pane side by side
- Explorer shows tree connectors for split groups
- Clicking a group in the explorer switches to it
- Right-click context menu works (rename, split, kill)
- Closing the last instance in a group removes the group
- Panel survives browser refresh (state persisted)
- Resizing split panes works (allotment divider)
- Panel height drag-to-resize still works

- [ ] **Step 4: Final commit if any fixes needed**
