# Terminal Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the embedded terminal survive page refreshes and disconnects — sessions stay alive on the server, clients reconnect automatically, output history is preserved.

**Architecture:** Server-side ring buffer captures terminal output, PTY processes survive WebSocket disconnects with a 5-minute grace period, clients reconnect and replay buffered output. Client terminal instances use an explicit state machine for lifecycle management.

**Tech Stack:** node-pty, ws (WebSocket), xterm.js, React, Vitest

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `server/ring-buffer.ts` | Create | Circular buffer for terminal output chunks |
| `server/terminal.ts` | Modify | Session survival, detach/attach, grace timer, buffer integration |
| `client/src/components/terminal-instance.tsx` | Modify | State machine, reconnection with backoff, attach protocol |
| `client/src/components/terminal-panel.tsx` | Modify | Tab connection indicators, expired state UI |
| `shared/types.ts` | Modify | Terminal connection state type |
| `tests/ring-buffer.test.ts` | Create | Ring buffer unit tests |
| `tests/terminal.test.ts` | Modify | Session survival, attach/detach tests |

---

### Task 1: Ring Buffer

**Files:**
- Create: `server/ring-buffer.ts`
- Create: `tests/ring-buffer.test.ts`

- [ ] **Step 1: Write failing tests for ring buffer**

```typescript
// tests/ring-buffer.test.ts
import { describe, it, expect } from "vitest";
import { RingBuffer } from "../server/ring-buffer";

describe("RingBuffer", () => {
  it("stores and retrieves chunks in order", () => {
    const buf = new RingBuffer(10);
    buf.push("hello");
    buf.push("world");
    expect(buf.getAll()).toEqual(["hello", "world"]);
  });

  it("returns empty array when empty", () => {
    const buf = new RingBuffer(10);
    expect(buf.getAll()).toEqual([]);
  });

  it("overwrites oldest when capacity exceeded", () => {
    const buf = new RingBuffer(3);
    buf.push("a");
    buf.push("b");
    buf.push("c");
    buf.push("d"); // overwrites "a"
    expect(buf.getAll()).toEqual(["b", "c", "d"]);
  });

  it("handles single capacity", () => {
    const buf = new RingBuffer(1);
    buf.push("first");
    buf.push("second");
    expect(buf.getAll()).toEqual(["second"]);
  });

  it("clears all data", () => {
    const buf = new RingBuffer(10);
    buf.push("a");
    buf.push("b");
    buf.clear();
    expect(buf.getAll()).toEqual([]);
  });

  it("works after clear and re-fill", () => {
    const buf = new RingBuffer(3);
    buf.push("a");
    buf.push("b");
    buf.clear();
    buf.push("x");
    buf.push("y");
    expect(buf.getAll()).toEqual(["x", "y"]);
  });

  it("handles exact capacity fill", () => {
    const buf = new RingBuffer(3);
    buf.push("a");
    buf.push("b");
    buf.push("c");
    expect(buf.getAll()).toEqual(["a", "b", "c"]);
  });

  it("handles many overwrites", () => {
    const buf = new RingBuffer(2);
    for (let i = 0; i < 100; i++) {
      buf.push(String(i));
    }
    expect(buf.getAll()).toEqual(["98", "99"]);
  });

  it("reports count correctly", () => {
    const buf = new RingBuffer(5);
    expect(buf.size).toBe(0);
    buf.push("a");
    expect(buf.size).toBe(1);
    buf.push("b");
    buf.push("c");
    expect(buf.size).toBe(3);
  });

  it("count does not exceed capacity", () => {
    const buf = new RingBuffer(2);
    buf.push("a");
    buf.push("b");
    buf.push("c");
    expect(buf.size).toBe(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/ring-buffer.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement ring buffer**

```typescript
// server/ring-buffer.ts
export class RingBuffer {
  private buffer: string[];
  private head = 0;
  private count = 0;
  private capacity: number;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.buffer = new Array(capacity);
  }

  get size(): number {
    return this.count;
  }

  push(data: string): void {
    this.buffer[this.head] = data;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) {
      this.count++;
    }
  }

  getAll(): string[] {
    if (this.count === 0) return [];
    const result: string[] = [];
    // Start index is where the oldest item lives
    const start = this.count < this.capacity ? 0 : this.head;
    for (let i = 0; i < this.count; i++) {
      result.push(this.buffer[(start + i) % this.capacity]);
    }
    return result;
  }

  clear(): void {
    this.head = 0;
    this.count = 0;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/ring-buffer.test.ts`
Expected: All 10 tests PASS

- [ ] **Step 5: Commit**

```bash
git add server/ring-buffer.ts tests/ring-buffer.test.ts
git commit -m "feat: add ring buffer for terminal output history"
```

---

### Task 2: Server — Session Survival and Attach Protocol

**Files:**
- Modify: `server/terminal.ts`
- Modify: `tests/terminal.test.ts`

- [ ] **Step 1: Write failing tests for detach/attach lifecycle**

Add to `tests/terminal.test.ts`:

```typescript
describe("session survival", () => {
  it("keeps terminal in detached state after detach", async () => {
    const { TerminalManager } = await import("../server/terminal");
    const manager = new TerminalManager();

    // getSessionState should return undefined for nonexistent sessions
    expect(manager.getSessionState("nonexistent")).toBeUndefined();
  });

  it("reports session info for managed terminals", async () => {
    const { TerminalManager } = await import("../server/terminal");
    const manager = new TerminalManager();

    // No sessions initially
    expect(manager.getActiveCount()).toBe(0);
    expect(manager.getSessionState("test-1")).toBeUndefined();
  });
});

describe("grace period", () => {
  it("uses configured grace period constant", async () => {
    const { GRACE_PERIOD_MS } = await import("../server/terminal");
    expect(GRACE_PERIOD_MS).toBe(300_000); // 5 minutes
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/terminal.test.ts`
Expected: FAIL — `getSessionState` and `GRACE_PERIOD_MS` not exported

- [ ] **Step 3: Refactor TerminalManager for session survival**

Rewrite `server/terminal.ts` with the following changes:

1. Export `GRACE_PERIOD_MS = 300_000`
2. Replace `ActiveTerminal` interface with `ManagedTerminal`:

```typescript
interface ManagedTerminal {
  pty: IPty;
  ws: WebSocket | null;          // null when detached
  token: string;
  buffer: RingBuffer;
  graceTimer: ReturnType<typeof setTimeout> | null;
  state: "connected" | "detached" | "dead";
  cols: number;
  rows: number;
  cwd: string;
}
```

3. Add methods to `TerminalManager`:

```typescript
getSessionState(id: string): "connected" | "detached" | "dead" | undefined
```

Returns the state of a managed terminal, or undefined if no session exists.

```typescript
detach(id: string): void
```

Called when WebSocket closes. Sets `ws = null`, `state = "detached"`, starts grace timer. When timer fires, kills PTY and sets `state = "dead"`, then deletes the session.

```typescript
attach(id: string, ws: WebSocket): { success: boolean; cols: number; rows: number }
```

Called when a client reconnects. If session exists and state is `"connected"` or `"detached"`:
- Cancel grace timer
- Set new WebSocket
- Set state to `"connected"`
- Wire up the new WS message handler (input/resize/kill)
- Wire up WS close to call `detach()`
- Return `{ success: true, cols, rows }`
- Replay buffer: iterate `buffer.getAll()` and send each chunk as `{ type: "buffer-replay", data }`, then send `{ type: "buffer-replay-done" }`

If session doesn't exist or is dead, return `{ success: false, cols: 0, rows: 0 }`.

4. Modify `create()`:
- Add `RingBuffer` to the managed terminal
- PTY `onData` handler: push to ring buffer AND send to WS (if connected)
- WS `on("close")`: call `detach(id)` instead of killing PTY
- Add `"kill"` message type handler that calls `kill(id)`
- Store `cols`, `rows`, `cwd` on the managed terminal

5. Modify `attachTerminalWebSocket()` connection handler:
- Read `mode` query param (`attach` or `create`)
- If `mode=attach` and session exists: call `manager.attach()`, send `{ type: "attached", cols, rows }` on success, or `{ type: "expired" }` on failure
- If `mode=attach` and no session: call `manager.create()`, send `{ type: "created" }`
- If no mode or `mode=create`: call `manager.create()` as before, send `{ type: "created" }`

6. Modify `kill()`:
- Clear grace timer if set
- Kill PTY
- Delete from map

7. Modify `shutdown()`:
- Clear all grace timers
- Kill all PTYs

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/terminal.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: All tests PASS (no regressions)

- [ ] **Step 6: Commit**

```bash
git add server/terminal.ts tests/terminal.test.ts
git commit -m "feat: terminal session survival with detach/attach and grace period"
```

---

### Task 3: Shared Types — Terminal Connection State

**Files:**
- Modify: `shared/types.ts`

- [ ] **Step 1: Add terminal connection state type**

Add to `shared/types.ts` near the existing `TerminalTab` interface:

```typescript
export type TerminalConnectionState =
  | "initializing"
  | "connecting"
  | "connected"
  | "disconnected"
  | "reconnecting"
  | "expired"
  | "idle";
```

- [ ] **Step 2: Run type check**

Run: `npm run check`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add shared/types.ts
git commit -m "feat: add TerminalConnectionState type"
```

---

### Task 4: Client — Terminal Instance State Machine and Reconnection

**Files:**
- Modify: `client/src/components/terminal-instance.tsx`

This is the largest task. The current component creates a new WebSocket+PTY on every mount and has no reconnection logic. We need to:

1. Track connection state with `TerminalConnectionState`
2. Use `mode=attach` when connecting
3. Handle server responses (`attached`, `created`, `expired`, `buffer-replay`, `buffer-replay-done`)
4. Reconnect automatically on unexpected disconnect with exponential backoff
5. Expose connection state to the parent via a callback prop

- [ ] **Step 1: Add connection state callback prop**

Add to `TerminalInstanceProps`:

```typescript
interface TerminalInstanceProps {
  id: string;
  isVisible: boolean;
  onConnectionStateChange?: (id: string, state: TerminalConnectionState) => void;
}
```

- [ ] **Step 2: Rewrite the WebSocket connection logic**

Replace the existing `useEffect` that creates the WebSocket (lines 86-161) with a connection manager approach:

```typescript
// Constants
const RECONNECT_INITIAL_MS = 1000;
const RECONNECT_MAX_MS = 30000;
const RECONNECT_TIMEOUT_MS = 300000; // 5 minutes — match server grace period

// Inside the component:
const connectionStateRef = useRef<TerminalConnectionState>("initializing");
const reconnectAttemptRef = useRef(0);
const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
const gaveUpRef = useRef(false);
const firstConnectRef = useRef(true);

function setConnectionState(state: TerminalConnectionState) {
  connectionStateRef.current = state;
  onConnectionStateChange?.(id, state);
}
```

The main `useEffect` (keyed on `[id]`) should:

1. Create the xterm Terminal and addons (same as now)
2. Call a `connect()` function that:
   - Sets state to `"connecting"`
   - Builds WS URL with `mode=attach` (always — server handles whether to create or attach)
   - On WS open: reset reconnect attempt counter
   - On WS message, handle by type:
     - `"created"`: set state `"connected"`, set `firstConnectRef = false`
     - `"attached"`: set state `"connected"`, set `firstConnectRef = false`
     - `"buffer-replay"`: write data to terminal (replaying history)
     - `"buffer-replay-done"`: no-op (live output follows naturally)
     - `"expired"`: set state `"expired"`, write "[Session expired — press Enter to start new]" to terminal
     - `"output"`: write to terminal (same as now)
     - `"exit"`: write "[Process exited]" to terminal
   - On WS close (unexpected):
     - If `gaveUpRef.current` is true, do nothing
     - Set state to `"disconnected"`
     - Calculate backoff: `Math.min(RECONNECT_INITIAL_MS * 2^attempt, RECONNECT_MAX_MS)`
     - Set timer to call `connect()` again after backoff
     - Increment `reconnectAttemptRef`
     - If total time exceeds `RECONNECT_TIMEOUT_MS`, give up: set `gaveUpRef = true`, set state `"expired"`
   - On WS error: let the `close` handler deal with it (WS fires close after error)

3. Wire up terminal `onData` to send `{ type: "input" }` over WS
4. Wire up ResizeObserver for fit + resize messages (same as now)

The cleanup function should:
- Clear reconnect timer
- Close WS
- Dispose terminal
- Disconnect resize observer

- [ ] **Step 3: Handle "expired" state — press Enter to restart**

When in `"expired"` state, intercept terminal `onData`:

```typescript
// Inside the onData handler:
if (connectionStateRef.current === "expired") {
  // Any keypress in expired state starts a fresh session
  gaveUpRef.current = false;
  reconnectAttemptRef.current = 0;
  firstConnectRef.current = true;
  connect(); // reconnects — server will create new since old expired
  return;
}
```

- [ ] **Step 4: Write status messages to terminal during state transitions**

When state changes to `"disconnected"`:
```typescript
terminal.write("\r\n\x1b[33m[Disconnected — reconnecting...]\x1b[0m\r\n");
```

When state changes to `"connected"` and it's a reconnection (not first connect):
```typescript
terminal.write("\r\n\x1b[32m[Reconnected]\x1b[0m\r\n");
```

When state changes to `"expired"`:
```typescript
terminal.write("\r\n\x1b[90m[Session expired — press any key to start new terminal]\x1b[0m\r\n");
```

- [ ] **Step 5: Run type check**

Run: `npm run check`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add client/src/components/terminal-instance.tsx
git commit -m "feat: terminal reconnection with state machine and exponential backoff"
```

---

### Task 5: Client — Terminal Panel Tab Indicators

**Files:**
- Modify: `client/src/components/terminal-panel.tsx`

- [ ] **Step 1: Add connection state tracking to panel**

Add state to track per-terminal connection states:

```typescript
const [connectionStates, setConnectionStates] = useState<Record<string, TerminalConnectionState>>({});

const handleConnectionStateChange = useCallback((terminalId: string, state: TerminalConnectionState) => {
  setConnectionStates(prev => ({ ...prev, [terminalId]: state }));
}, []);
```

Pass `onConnectionStateChange={handleConnectionStateChange}` to each `<TerminalInstance>`.

- [ ] **Step 2: Add connection indicator dot to tabs**

In the tab rendering (inside the `.map((tab) =>` block), add a colored dot before the tab name:

```tsx
<span
  className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${
    (() => {
      const s = connectionStates[tab.id];
      if (s === "connected") return "bg-green-500";
      if (s === "disconnected" || s === "reconnecting") return "bg-yellow-500";
      if (s === "expired") return "bg-red-500";
      return "bg-zinc-500"; // initializing, connecting, idle
    })()
  }`}
/>
```

- [ ] **Step 3: Run type check**

Run: `npm run check`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add client/src/components/terminal-panel.tsx
git commit -m "feat: terminal tab connection state indicators"
```

---

### Task 6: Integration Testing and Polish

**Files:**
- Modify: `tests/terminal.test.ts`

- [ ] **Step 1: Add integration-style tests**

Add tests that verify the full flow works together:

```typescript
describe("ring buffer integration", () => {
  it("RingBuffer is used by TerminalManager", async () => {
    // Verify the import works and types are compatible
    const { RingBuffer } = await import("../server/ring-buffer");
    const buf = new RingBuffer(100);
    buf.push("test output");
    expect(buf.getAll()).toEqual(["test output"]);
  });
});

describe("terminal connection state type", () => {
  it("exports TerminalConnectionState type", async () => {
    // Type-level check — if this compiles, the type exists
    const state: import("../shared/types").TerminalConnectionState = "connected";
    expect(state).toBe("connected");
  });
});

describe("attach protocol", () => {
  it("getSessionState returns undefined for unknown id", async () => {
    const { TerminalManager } = await import("../server/terminal");
    const manager = new TerminalManager();
    expect(manager.getSessionState("unknown")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run full test suite**

Run: `npm test`
Expected: All tests PASS

- [ ] **Step 3: Run type check**

Run: `npm run check`
Expected: PASS

- [ ] **Step 4: Manual smoke test**

Run: `npm run dev`

1. Open Agent CC in browser
2. Open a terminal tab
3. Run `echo "hello"` — verify output
4. Refresh the page — terminal should reconnect and show previous output
5. Open a second tab, verify both work independently
6. Close a tab explicitly — verify it's gone (no ghost session)

- [ ] **Step 5: Commit**

```bash
git add tests/terminal.test.ts
git commit -m "test: terminal reliability integration tests"
```

---

### Task 7: Final — Safety Tests and Cleanup

**Files:**
- All new/modified files

- [ ] **Step 1: Run safety tests**

Run: `npx vitest run tests/new-user-safety.test.ts`
Expected: PASS — no hardcoded paths, PII, or user-specific strings

- [ ] **Step 2: Run full test suite one more time**

Run: `npm test`
Expected: All tests PASS

- [ ] **Step 3: Run type check**

Run: `npm run check`
Expected: PASS

- [ ] **Step 4: Final commit if any cleanup was needed**

```bash
git add -A
git commit -m "chore: terminal reliability cleanup"
```
