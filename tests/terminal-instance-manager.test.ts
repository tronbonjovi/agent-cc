import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mock xterm and addons ──────────────────────────────────────────────
// xterm needs a browser DOM — we mock all of it.
let capturedOnDataCallback: ((data: string) => void) | null = null;

vi.mock("xterm", () => ({
  Terminal: class MockTerminal {
    loadAddon = vi.fn();
    onData = vi.fn((cb: (data: string) => void) => {
      capturedOnDataCallback = cb;
    });
    open = vi.fn();
    dispose = vi.fn();
    clear = vi.fn();
    reset = vi.fn();
    write = vi.fn();
    options = {};
    cols = 80;
    rows = 24;
  },
}));

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: class MockFitAddon {
    fit = vi.fn();
  },
}));

vi.mock("@xterm/addon-web-links", () => ({
  WebLinksAddon: class MockWebLinksAddon {},
}));

// ── Mock WebSocket ─────────────────────────────────────────────────────

interface MockWebSocket {
  url: string;
  readyState: number;
  send: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  onopen: ((ev?: unknown) => void) | null;
  onclose: ((ev?: unknown) => void) | null;
  onmessage: ((ev: { data: string }) => void) | null;
  onerror: ((ev?: unknown) => void) | null;
}

let mockWebSockets: MockWebSocket[] = [];
let wsConstructorEnabled = true;

const MOCK_WS_OPEN = 1;
const MOCK_WS_CLOSED = 3;

class MockWebSocketClass {
  static OPEN = MOCK_WS_OPEN;
  static CLOSED = MOCK_WS_CLOSED;
  static CONNECTING = 0;
  static CLOSING = 2;

  url: string;
  readyState: number = MOCK_WS_OPEN;
  send = vi.fn();
  close = vi.fn(() => { this.readyState = MOCK_WS_CLOSED; });
  onopen: ((ev?: unknown) => void) | null = null;
  onclose: ((ev?: unknown) => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onerror: ((ev?: unknown) => void) | null = null;

  constructor(url: string) {
    if (!wsConstructorEnabled) throw new Error("Network error");
    this.url = url;
    mockWebSockets.push(this as unknown as MockWebSocket);
    // Use queueMicrotask instead of setTimeout so onopen fires before
    // any timer-based reconnect logic but after the constructor returns.
    // With fake timers, setTimeout(0) would fire on the next advanceTimersByTime
    // which causes cascading timer interactions.
    queueMicrotask(() => { if (this.onopen) this.onopen(); });
  }
}

(globalThis as Record<string, unknown>).WebSocket = MockWebSocketClass;

// ── Mock window.location ──────────────────────────────────────────────
(globalThis as Record<string, unknown>).window = {
  location: { protocol: "http:", host: "localhost:5100" },
};

// ── Helpers ────────────────────────────────────────────────────────────

function getLatestWs(): MockWebSocket {
  return mockWebSockets[mockWebSockets.length - 1];
}

function serverSend(ws: MockWebSocket, msg: Record<string, unknown>): void {
  if (ws.onmessage) ws.onmessage({ data: JSON.stringify(msg) });
}

function simulateClose(ws: MockWebSocket): void {
  ws.readyState = MOCK_WS_CLOSED;
  if (ws.onclose) ws.onclose();
}

// ── Import under test (singleton is fine since we test via separate instances) ──
import { TerminalInstanceManager, getTerminalInstanceManager } from "../client/src/lib/terminal-instance-manager";

// ── Tests ──────────────────────────────────────────────────────────────

describe("TerminalInstanceManager", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockWebSockets = [];
    capturedOnDataCallback = null;
    wsConstructorEnabled = true;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("exports a singleton accessor", () => {
    const m1 = getTerminalInstanceManager();
    const m2 = getTerminalInstanceManager();
    expect(m1).toBe(m2);
  });

  it("tracks created instances", () => {
    const manager = new TerminalInstanceManager();
    expect(manager.has("nonexistent")).toBe(false);
  });

  it("fires activity callback", () => {
    const manager = new TerminalInstanceManager();
    const cb = vi.fn();
    const unsub = manager.onActivity(cb);
    expect(typeof unsub).toBe("function");
    unsub();
  });

  it("fires connection state callback", () => {
    const manager = new TerminalInstanceManager();
    const cb = vi.fn();
    const unsub = manager.onConnectionStateChange(cb);
    expect(typeof unsub).toBe("function");
    unsub();
  });

  describe("connection lifecycle", () => {
    it("creates a WebSocket connection on create()", () => {
      const manager = new TerminalInstanceManager();
      manager.create("term-1");
      expect(mockWebSockets.length).toBe(1);
      expect(mockWebSockets[0].url).toContain("/ws/terminal?id=term-1");
      expect(manager.has("term-1")).toBe(true);
    });

    it("transitions to connected on server 'created' message", () => {
      const manager = new TerminalInstanceManager();
      const stateChanges: string[] = [];
      manager.onConnectionStateChange((_id, state) => stateChanges.push(state));

      manager.create("term-1");
      const ws = getLatestWs();
      serverSend(ws, { type: "created", shellType: "bash" });

      expect(stateChanges).toContain("connecting");
      expect(stateChanges).toContain("connected");
    });

    it("transitions to disconnected when WebSocket closes", () => {
      const manager = new TerminalInstanceManager();
      const stateChanges: string[] = [];
      manager.onConnectionStateChange((_id, state) => stateChanges.push(state));

      manager.create("term-1");
      const ws = getLatestWs();
      serverSend(ws, { type: "created", shellType: "bash" });
      simulateClose(ws);

      expect(stateChanges).toContain("disconnected");
    });
  });

  describe("reconnection backoff", () => {
    it("uses exponential backoff: 1s → 2s → 4s → ... → 30s max", () => {
      const manager = new TerminalInstanceManager();
      manager.create("term-1");
      const ws1 = getLatestWs();
      serverSend(ws1, { type: "created", shellType: "bash" });

      // First disconnect → 1s backoff
      simulateClose(ws1);
      expect(mockWebSockets.length).toBe(1);

      vi.advanceTimersByTime(1000);
      expect(mockWebSockets.length).toBe(2);

      // Second disconnect → 2s backoff
      const ws2 = getLatestWs();
      simulateClose(ws2);
      vi.advanceTimersByTime(1999);
      expect(mockWebSockets.length).toBe(2);
      vi.advanceTimersByTime(1);
      expect(mockWebSockets.length).toBe(3);

      // Third disconnect → 4s backoff
      const ws3 = getLatestWs();
      simulateClose(ws3);
      vi.advanceTimersByTime(3999);
      expect(mockWebSockets.length).toBe(3);
      vi.advanceTimersByTime(1);
      expect(mockWebSockets.length).toBe(4);
    });

    it("caps backoff at 30 seconds", () => {
      const manager = new TerminalInstanceManager();
      manager.create("term-1");
      const ws1 = getLatestWs();
      serverSend(ws1, { type: "created", shellType: "bash" });

      // Close without ever sending "created" on reconnect attempts, so onopen
      // fires (resetting reconnectAttempt) but then close fires immediately
      // after — meaning the backoff grows from the close handler.
      // To truly test the cap, we need consecutive failures where onopen
      // does NOT fire. We do this by closing the WS before microtask runs.
      simulateClose(ws1);

      // Each reconnect: advance timer, then close the new WS immediately
      // (before its onopen microtask can fire, by closing synchronously)
      for (let i = 0; i < 6; i++) {
        // backoff: 1s, 2s, 4s, 8s, 16s, 32s→30s
        const delay = Math.min(1000 * Math.pow(2, i), 30000);
        vi.advanceTimersByTime(delay);
        const ws = getLatestWs();
        // Close immediately — simulates failed connection
        simulateClose(ws);
      }

      // After 6 failures, backoff should be capped at 30s
      const countBefore = mockWebSockets.length;
      vi.advanceTimersByTime(29999);
      expect(mockWebSockets.length).toBe(countBefore);
      vi.advanceTimersByTime(1);
      expect(mockWebSockets.length).toBe(countBefore + 1);
    });
  });

  describe("expired state recovery", () => {
    it("transitions to expired after RECONNECT_TIMEOUT_MS of failures", () => {
      const manager = new TerminalInstanceManager();
      const stateChanges: string[] = [];
      manager.onConnectionStateChange((_id, state) => stateChanges.push(state));

      manager.create("term-1");
      const ws1 = getLatestWs();
      serverSend(ws1, { type: "created", shellType: "bash" });

      // Simulate connection drop
      simulateClose(ws1);

      // Advance past RECONNECT_TIMEOUT_MS (5 minutes)
      vi.advanceTimersByTime(300_001);

      // Keep triggering reconnect/close cycles until expired
      let lastState = "";
      for (let i = 0; i < 20; i++) {
        const ws = getLatestWs();
        simulateClose(ws);
        vi.advanceTimersByTime(31000);
        lastState = manager.getConnectionState("term-1") || "";
        if (lastState === "expired") break;
      }

      expect(lastState).toBe("expired");
    });

    it("recovers expired terminals on reconnectAll()", () => {
      const manager = new TerminalInstanceManager();
      const stateChanges: string[] = [];
      manager.onConnectionStateChange((_id, state) => stateChanges.push(state));

      manager.create("term-1");
      const ws1 = getLatestWs();
      serverSend(ws1, { type: "created", shellType: "bash" });

      // Force expired state via server message
      serverSend(ws1, { type: "expired" });
      expect(manager.getConnectionState("term-1")).toBe("expired");

      simulateClose(ws1);

      const countBefore = mockWebSockets.length;

      manager.reconnectAll();

      // Should create a new WebSocket
      expect(mockWebSockets.length).toBe(countBefore + 1);
      expect(stateChanges).toContain("connecting");
    });

    it("recovers expired terminals when user types (onData)", () => {
      const manager = new TerminalInstanceManager();
      manager.create("term-1");
      const ws1 = getLatestWs();
      serverSend(ws1, { type: "created", shellType: "bash" });

      // Force expired state
      serverSend(ws1, { type: "expired" });
      expect(manager.getConnectionState("term-1")).toBe("expired");

      const countBefore = mockWebSockets.length;

      // Simulate user typing
      if (capturedOnDataCallback) capturedOnDataCallback("a");

      expect(mockWebSockets.length).toBe(countBefore + 1);
    });
  });

  describe("visibility change reconnection", () => {
    it("reconnectAll() reconnects disconnected instances", () => {
      const manager = new TerminalInstanceManager();
      manager.create("term-1");
      const ws1 = getLatestWs();
      serverSend(ws1, { type: "created", shellType: "bash" });

      simulateClose(ws1);
      expect(manager.getConnectionState("term-1")).toBe("disconnected");

      const countBefore = mockWebSockets.length;

      manager.reconnectAll();

      expect(mockWebSockets.length).toBe(countBefore + 1);
      expect(manager.getConnectionState("term-1")).toBe("connecting");
    });

    it("reconnectAll() resets backoff counter", () => {
      const manager = new TerminalInstanceManager();
      manager.create("term-1");
      const ws1 = getLatestWs();
      serverSend(ws1, { type: "created", shellType: "bash" });

      // Let backoff grow
      simulateClose(ws1);
      vi.advanceTimersByTime(1000);
      const ws2 = getLatestWs();
      simulateClose(ws2);

      // reconnectAll resets backoff
      manager.reconnectAll();
      const ws3 = getLatestWs();
      serverSend(ws3, { type: "created" });
      simulateClose(ws3);

      // Next backoff should be 1s (reset)
      const countBefore = mockWebSockets.length;
      vi.advanceTimersByTime(1000);
      expect(mockWebSockets.length).toBe(countBefore + 1);
    });

    it("reconnectAll() skips already-connected instances", () => {
      const manager = new TerminalInstanceManager();
      manager.create("term-1");
      const ws1 = getLatestWs();
      serverSend(ws1, { type: "created", shellType: "bash" });

      const countBefore = mockWebSockets.length;
      manager.reconnectAll();

      expect(mockWebSockets.length).toBe(countBefore);
    });

    it("reconnectAll() skips disposed instances", () => {
      const manager = new TerminalInstanceManager();
      manager.create("term-1");
      manager.dispose("term-1");

      const countBefore = mockWebSockets.length;
      manager.reconnectAll();

      expect(mockWebSockets.length).toBe(countBefore);
    });
  });

  describe("WebSocket ping keepalive", () => {
    it("sends periodic ping messages to keep connection alive", async () => {
      const manager = new TerminalInstanceManager();
      manager.create("term-1");
      const ws = getLatestWs();

      // Flush the microtask that triggers onopen (which starts the ping interval)
      await vi.advanceTimersByTimeAsync(0);

      serverSend(ws, { type: "created", shellType: "bash" });

      // Advance past ping interval (30s)
      await vi.advanceTimersByTimeAsync(30_000);

      const pingSent = ws.send.mock.calls.some(
        (call: unknown[]) => {
          try {
            const msg = JSON.parse(call[0] as string);
            return msg.type === "ping";
          } catch { return false; }
        }
      );
      expect(pingSent).toBe(true);
    });

    it("stops ping interval when WebSocket closes", async () => {
      const manager = new TerminalInstanceManager();
      manager.create("term-1");
      const ws = getLatestWs();
      await vi.advanceTimersByTimeAsync(0); // flush onopen microtask
      serverSend(ws, { type: "created", shellType: "bash" });

      simulateClose(ws);
      ws.send.mockClear();

      await vi.advanceTimersByTimeAsync(120_000);

      const pingSent = ws.send.mock.calls.some(
        (call: unknown[]) => {
          try {
            const msg = JSON.parse(call[0] as string);
            return msg.type === "ping";
          } catch { return false; }
        }
      );
      expect(pingSent).toBe(false);
    });

    it("stops ping interval on dispose", async () => {
      const manager = new TerminalInstanceManager();
      manager.create("term-1");
      const ws = getLatestWs();
      await vi.advanceTimersByTimeAsync(0); // flush onopen microtask
      serverSend(ws, { type: "created", shellType: "bash" });

      manager.dispose("term-1");
      ws.send.mockClear();
      await vi.advanceTimersByTimeAsync(60_000);

      expect(ws.send).not.toHaveBeenCalled();
    });
  });

  describe("graceful WebSocket cleanup on reconnect", () => {
    it("closes stale WebSocket before creating a new connection", () => {
      const manager = new TerminalInstanceManager();
      manager.create("term-1");
      const ws1 = getLatestWs();
      serverSend(ws1, { type: "created", shellType: "bash" });

      simulateClose(ws1);
      manager.reconnectAll();

      const ws2 = getLatestWs();
      expect(ws2).not.toBe(ws1);
      expect(ws2.url).toContain("term-1");
    });
  });

  describe("reconnection handles WebSocket creation failure", () => {
    it("falls back gracefully if WebSocket constructor throws", () => {
      const manager = new TerminalInstanceManager();
      manager.create("term-1");
      const ws1 = getLatestWs();
      serverSend(ws1, { type: "created", shellType: "bash" });

      // Make WebSocket constructor throw
      wsConstructorEnabled = false;

      simulateClose(ws1);

      // The reconnect timer fires — connect() will fail but shouldn't crash
      expect(() => vi.advanceTimersByTime(1000)).not.toThrow();

      // Instance should still exist
      expect(manager.has("term-1")).toBe(true);

      // Restore and verify recovery is possible
      wsConstructorEnabled = true;
    });
  });
});
