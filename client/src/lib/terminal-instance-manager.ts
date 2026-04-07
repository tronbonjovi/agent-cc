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

  hasAny(): boolean {
    return this.instances.size > 0;
  }

  getConnectionState(id: string): TerminalConnectionState | undefined {
    return this.instances.get(id)?.connectionState;
  }

  /** Create a new xterm.js Terminal + WebSocket connection. Does NOT attach to DOM. */
  create(id: string): void {
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

    this.connect(managed);
  }

  /** Attach terminal to a DOM element. Instant — no reconnect needed. */
  attach(id: string, container: HTMLElement): void {
    const managed = this.instances.get(id);
    if (!managed || managed.disposed) return;

    if (managed.container === container) {
      managed.fitAddon.fit();
      return;
    }

    if (managed.container) {
      this.detach(id);
    }

    managed.container = container;
    managed.terminal.open(container);
    managed.fitAddon.fit();

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

    const ws = managed.ws;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "kill" }));
      ws.close();
    } else {
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

    Array.from(this.instances.values()).forEach((managed) => {
      managed.terminal.options.theme = theme;
    });
  }

  /** Dispose all instances (app shutdown). */
  disposeAll(): void {
    Array.from(this.instances.keys()).forEach((id) => {
      this.dispose(id);
    });
  }

  // --- Private ---

  private setConnectionState(managed: ManagedTerminal, state: TerminalConnectionState): void {
    managed.connectionState = state;
    Array.from(this.connectionStateCallbacks).forEach((cb) => {
      cb(managed.id, state);
    });
  }

  private fireActivity(id: string): void {
    Array.from(this.activityCallbacks).forEach((cb) => {
      cb(id);
    });
  }

  private fireShellType(id: string, shellType: string): void {
    Array.from(this.shellTypeCallbacks).forEach((cb) => {
      cb(id, shellType);
    });
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
              "\r\n\x1b[90m[Session expired — press any key to start new terminal]\x1b[0m\r\n"
            );
            break;
          case "output":
            managed.terminal.write(msg.data);
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
        "\r\n\x1b[33m[Disconnected — reconnecting...]\x1b[0m\r\n"
      );

      if (managed.disconnectStartTime === null) {
        managed.disconnectStartTime = Date.now();
      }

      if (Date.now() - managed.disconnectStartTime >= RECONNECT_TIMEOUT_MS) {
        managed.gaveUp = true;
        this.setConnectionState(managed, "expired");
        managed.terminal.write(
          "\r\n\x1b[90m[Session expired — press any key to start new terminal]\x1b[0m\r\n"
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
