# Terminal Reliability — Design Spec

## Goal

Make the embedded terminal survive page refreshes and brief disconnects so it can be used for daily work. Currently, refreshing the browser kills all running processes and loses all output history.

## Scope

- **Phase 1:** Survive refresh — server keeps sessions alive, client reconnects automatically
- **Phase 2:** Terminal state machine — clean lifecycle states on the client (replacing ad-hoc state tracking)
- **Out of scope:** Claude CLI awareness (Phase 3 from handoff doc — separate session)

## User-Facing Behavior

After these changes:

- **Page refresh:** Terminal reconnects in ~1 second, output history is preserved, running processes continue
- **Network blip:** Automatic reconnection with retries, no user action needed
- **5+ minute disconnect:** Session expires, terminal shows "[Session expired]", click to start fresh
- **Server restart:** All sessions lost (expected), terminals start fresh automatically
- **Status visibility:** Terminal tab shows connection state — a dot or indicator for connected/reconnecting/expired

---

## Server Changes (`server/terminal.ts`)

### Ring Buffer

Each terminal session gets a ring buffer that captures output before forwarding it to the WebSocket. This is what enables "replay" on reconnect — the server sends you everything you missed.

- **Capacity:** 50,000 chunks (each chunk is one burst of terminal output, configurable via constant)
- **Implementation:** Simple circular array — when full, oldest lines are overwritten
- **Lifecycle:** Created when the terminal session starts, destroyed when the session is cleaned up

### Session Survival on Disconnect

The `ActiveTerminal` interface changes from tracking a single WebSocket to supporting detach/reattach:

```
Terminal session lifecycle:
  created → connected → disconnected (WS drops) → grace period (5min timer)
    ↓                      ↓                           ↓
  connected ←── reattach ──┘                    expired → cleanup
```

- When WebSocket closes, the terminal process is **not** killed. Instead, a 5-minute grace timer starts.
- During the grace period, the terminal process keeps running and output keeps flowing into the ring buffer.
- If a new WebSocket connects with the same terminal ID, it reattaches: the grace timer is cancelled, the buffer is replayed, and new output flows to the new WebSocket.
- If the grace timer expires, the terminal process is killed and cleaned up.

### Reattach Protocol

New WebSocket message types:

| Message | Direction | Purpose |
|---------|-----------|---------|
| `attach` | client → server | "I want to reconnect to terminal X" (sent instead of creating new) |
| `attached` | server → client | "Reattach successful, here's terminal info" with `{ cols, rows, bufferedLines }` |
| `created` | server → client | "New terminal created" (no existing session found) |
| `buffer-replay` | server → client | Batch of buffered output lines replayed on reconnect |
| `buffer-replay-done` | server → client | Signals replay is complete, live output follows |
| `expired` | server → client | "Session expired, no terminal to reattach to" |

**Connection flow:**

1. Client opens WebSocket with terminal ID + `mode=attach`
2. Server checks if a session exists for that ID:
   - **Exists + alive:** Cancel grace timer, swap WebSocket, replay buffer, send `attached`
   - **Exists + expired:** Clean up, send `expired`
   - **Doesn't exist:** Create new session, send `created`
3. Client receives response and updates UI state accordingly

### TerminalManager API Changes

```typescript
interface ManagedTerminal {
  pty: IPty;
  ws: WebSocket | null;          // null when detached
  token: string;
  buffer: RingBuffer;
  graceTimer: NodeJS.Timeout | null;
  state: "connected" | "detached" | "dead";
  cols: number;
  rows: number;
  cwd: string;
}
```

Methods:
- `create(id, ws, cols, rows, cwd)` — spawn new PTY (unchanged API, new internals)
- `attach(id, ws)` — reattach WebSocket to existing session
- `detach(id)` — called on WS close, starts grace timer
- `kill(id)` — force kill (unchanged)
- `getInfo(id)` — returns session state for the client
- `shutdown()` — kill all (unchanged)

---

## Client Changes

### State Machine (`terminal-instance.tsx`)

Replace the implicit connection state with an explicit state machine per terminal instance:

```
States:
  initializing → connecting → connected → disconnected → reconnecting → connected
                                                       → expired → idle
                                          → expired → idle
```

| State | What's happening | UI indicator |
|-------|-----------------|--------------|
| `initializing` | Component mounted, setting up xterm | -- |
| `connecting` | WebSocket opening | Subtle "Connecting..." |
| `connected` | Live connection, normal operation | Green dot on tab |
| `disconnected` | WS dropped, about to retry | Yellow dot on tab |
| `reconnecting` | Actively attempting to reattach | Yellow dot, "Reconnecting..." in terminal |
| `expired` | Server confirmed session is gone | Red dot, "[Session expired]" in terminal |
| `idle` | No session (tab exists but no PTY) | Gray dot, click to start |

### Reconnection Logic (`terminal-instance.tsx`)

When the WebSocket closes unexpectedly (not from user closing the tab):

1. Set state to `disconnected`
2. Wait 1 second, then attempt reconnect
3. Open new WebSocket with `mode=attach`
4. If server responds `attached`: set state to `connected`, buffer replays automatically
5. If server responds `expired` or `created`: set state accordingly
6. On failure: retry with exponential backoff (1s, 2s, 4s, 8s, 16s, 30s max)
7. After 5 minutes of failed retries, give up and set state to `expired`

### Terminal Panel (`terminal-panel.tsx`)

- Tab indicators show connection state (colored dot next to tab name)
- Expired terminals show a "Restart" action instead of just being dead
- The `useReducer` state model stays for panel-level concerns (tabs, split, height, collapse) — the state machine is per-instance, not per-panel

### Cleanup on Tab Close

When user explicitly closes a tab:
1. Send a `kill` message over WebSocket (if connected)
2. Remove tab from panel state
3. Server kills PTY immediately (no grace period)

---

## Ring Buffer Implementation

New file: `server/ring-buffer.ts`

```typescript
class RingBuffer {
  private buffer: string[];
  private head: number;
  private count: number;
  private capacity: number;

  constructor(capacity: number);
  push(data: string): void;       // add output chunk
  getAll(): string[];              // return all stored chunks in order
  clear(): void;
}
```

- Stores raw output chunks (not parsed lines — terminal output includes escape codes, partial lines, etc.)
- `push()` is called on every PTY data event
- `getAll()` returns chunks in chronological order for replay
- Memory-bounded: 50K chunks max, oldest discarded when full

---

## Wire Protocol Summary

All messages are JSON over WebSocket.

**Client → Server:**
- `{ type: "input", data: string }` — keystroke/paste (unchanged)
- `{ type: "resize", cols: number, rows: number }` — terminal resize (unchanged)
- `{ type: "kill" }` — explicit close request (new)

**Server → Client:**
- `{ type: "output", data: string }` — terminal output (unchanged)
- `{ type: "exit", exitCode: number }` — process exited (unchanged)
- `{ type: "attached", cols: number, rows: number }` — reattach successful (new)
- `{ type: "created" }` — new session created (new)
- `{ type: "buffer-replay", data: string }` — replayed output chunk (new)
- `{ type: "buffer-replay-done" }` — replay complete (new)
- `{ type: "expired" }` — session no longer exists (new)

**Connection URL change:**
- Current: `/ws/terminal?id=X&cols=N&rows=N&cwd=PATH`
- New: `/ws/terminal?id=X&cols=N&rows=N&cwd=PATH&mode=attach`
- `mode=attach` tells server to try reattaching first; if no session exists, create new
- Omitting `mode` or `mode=create` forces new session (backwards compatible)

---

## Testing Strategy

- **Ring buffer:** Unit tests for capacity, ordering, overflow, clear
- **Session survival:** Test that PTY stays alive after WS disconnect, test grace timer expiry
- **Reattach flow:** Test attach to existing session, attach to expired session, attach to nonexistent session
- **Client reconnection:** Test state transitions through the state machine
- **Integration:** Test full refresh cycle — connect, disconnect, reconnect, verify output continuity

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `server/ring-buffer.ts` | Create | Ring buffer implementation |
| `server/terminal.ts` | Modify | Session survival, attach/detach, grace timer, buffer integration |
| `client/src/components/terminal-instance.tsx` | Modify | State machine, reconnection logic, attach protocol |
| `client/src/components/terminal-panel.tsx` | Modify | Tab state indicators, expired/restart UI |
| `shared/types.ts` | Modify | Add terminal state types if needed |
| `tests/ring-buffer.test.ts` | Create | Ring buffer unit tests |
| `tests/terminal.test.ts` | Modify | Session survival and reattach tests |

---

## Constants

| Constant | Value | Location |
|----------|-------|----------|
| `RING_BUFFER_CAPACITY` | 50,000 | `server/ring-buffer.ts` |
| `GRACE_PERIOD_MS` | 300,000 (5 min) | `server/terminal.ts` |
| `RECONNECT_INITIAL_MS` | 1,000 | `terminal-instance.tsx` |
| `RECONNECT_MAX_MS` | 30,000 | `terminal-instance.tsx` |
| `RECONNECT_TIMEOUT_MS` | 300,000 (5 min) | `terminal-instance.tsx` |
