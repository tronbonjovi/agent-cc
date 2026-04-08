import os from "os";
import fs from "fs";
import path from "path";
import { spawn as ptySpawn, type IPty } from "node-pty";
import { WebSocketServer, type WebSocket } from "ws";
import type { Server, IncomingMessage } from "http";
import { RingBuffer } from "./ring-buffer";

const MAX_TERMINALS = 10;
const MIN_COLS = 1;
const MAX_COLS = 500;
const MIN_ROWS = 1;
const MAX_ROWS = 200;
const RING_BUFFER_CAPACITY = 50_000;

export const GRACE_PERIOD_MS = 300_000; // 5 minutes

// Environment variables safe to pass to spawned terminals
const SAFE_ENV_KEYS = new Set([
  "HOME", "PATH", "SHELL", "TERM", "LANG", "LC_ALL", "LC_CTYPE",
  "USER", "LOGNAME", "EDITOR", "VISUAL", "PAGER", "XDG_RUNTIME_DIR",
  "XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_CACHE_HOME", "DISPLAY",
  "WAYLAND_DISPLAY", "SSH_AUTH_SOCK", "SSH_AGENT_PID", "GPG_AGENT_INFO",
  "COLORTERM", "TERM_PROGRAM", "TMPDIR", "TZ",
]);

function buildSanitizedEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  SAFE_ENV_KEYS.forEach((key) => {
    if (process.env[key]) {
      env[key] = process.env[key] as string;
    }
  });
  return env;
}

function clampInt(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = parseInt(value || String(fallback), 10);
  if (isNaN(parsed)) return fallback;
  return Math.max(min, Math.min(parsed, max));
}

function validateCwd(cwd: string | undefined): string {
  if (!cwd) return os.homedir();

  // Resolve to absolute and normalize
  const resolved = path.resolve(cwd);

  // Must be under the user's home directory
  const home = os.homedir();
  if (!resolved.startsWith(home + path.sep) && resolved !== home) {
    return home;
  }

  // Must exist
  try {
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
      return home;
    }
  } catch {
    return home;
  }

  return resolved;
}

interface ManagedTerminal {
  pty: IPty;
  ws: WebSocket | null;
  token: string;
  buffer: RingBuffer;
  graceTimer: ReturnType<typeof setTimeout> | null;
  state: "connected" | "detached" | "dead";
  cols: number;
  rows: number;
  cwd: string;
  /** When true, live PTY output is queued instead of sent — used during buffer replay */
  replaying: boolean;
  replayQueue: string[];
}

export class TerminalManager {
  private terminals = new Map<string, ManagedTerminal>();

  getActiveCount(): number {
    return this.terminals.size;
  }

  getSessionState(id: string): "connected" | "detached" | "dead" | undefined {
    const terminal = this.terminals.get(id);
    return terminal?.state;
  }

  /**
   * Wire up WebSocket message and close handlers for the given terminal.
   * Extracted so both create() and attach() use the same logic.
   */
  /**
   * Wire up WebSocket message and close handlers for the given terminal.
   * Also starts server-side ping interval to detect dead connections.
   * Extracted so both create() and attach() use the same logic.
   */
  private wireWs(id: string, terminal: ManagedTerminal, ws: WebSocket): void {
    // Server-side ping every 30s — detects dead connections that haven't
    // sent a TCP FIN (e.g. client crash, network disconnect).
    const pingInterval = setInterval(() => {
      if (ws.readyState === ws.OPEN) {
        ws.ping();
      } else {
        clearInterval(pingInterval);
      }
    }, 30_000);

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "input") {
          terminal.pty.write(msg.data);
        } else if (msg.type === "resize") {
          const newCols = clampInt(String(msg.cols), 80, MIN_COLS, MAX_COLS);
          const newRows = clampInt(String(msg.rows), 24, MIN_ROWS, MAX_ROWS);
          terminal.pty.resize(newCols, newRows);
          terminal.cols = newCols;
          terminal.rows = newRows;
        } else if (msg.type === "kill") {
          this.kill(id);
        } else if (msg.type === "ping") {
          // Respond to client-side application-level pings
          if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ type: "pong" }));
          }
        }
      } catch {
        // ignore malformed messages
      }
    });

    ws.on("close", () => {
      clearInterval(pingInterval);
      // Only detach if this WS is still the active one (prevents stale
      // close handlers from tearing down a replacement connection)
      if (terminal.ws === ws) {
        this.detach(id);
      }
    });
  }

  create(id: string, ws: WebSocket, cols: number, rows: number, cwd?: string): void {
    // Enforce terminal limit
    if (this.terminals.size >= MAX_TERMINALS) {
      ws.close(1013, "Terminal limit reached");
      return;
    }

    // Kill existing terminal with same ID before creating new one
    this.kill(id);

    const shell = process.env.SHELL || (process.platform === "win32" ? "powershell.exe" : "/bin/sh");
    const safeCols = clampInt(String(cols), 80, MIN_COLS, MAX_COLS);
    const safeRows = clampInt(String(rows), 24, MIN_ROWS, MAX_ROWS);
    const safeCwd = validateCwd(cwd);

    const pty = ptySpawn(shell, [], {
      name: "xterm-256color",
      cols: safeCols,
      rows: safeRows,
      cwd: safeCwd,
      env: buildSanitizedEnv(),
    });

    const token = crypto.randomUUID();
    const buffer = new RingBuffer(RING_BUFFER_CAPACITY);

    const terminal: ManagedTerminal = {
      pty,
      ws,
      token,
      buffer,
      graceTimer: null,
      state: "connected",
      cols: safeCols,
      rows: safeRows,
      cwd: safeCwd,
      replaying: false,
      replayQueue: [],
    };

    pty.onData((data) => {
      buffer.push(data);
      if (terminal.replaying) {
        // Queue live output during replay to prevent duplication/reordering
        terminal.replayQueue.push(data);
      } else if (terminal.ws && terminal.ws.readyState === terminal.ws.OPEN) {
        terminal.ws.send(JSON.stringify({ type: "output", data }));
      }
    });

    pty.onExit(({ exitCode }) => {
      if (terminal.ws && terminal.ws.readyState === terminal.ws.OPEN) {
        terminal.ws.send(JSON.stringify({ type: "exit", exitCode }));
      }
      // Only delete if this is still our terminal (not replaced by a new one)
      const current = this.terminals.get(id);
      if (current && current.token === token) {
        if (current.graceTimer) clearTimeout(current.graceTimer);
        current.state = "dead";
        this.terminals.delete(id);
      }
    });

    this.wireWs(id, terminal, ws);
    this.terminals.set(id, terminal);

    const shellType = path.basename(shell).replace(/\.exe$/i, "");
    ws.send(JSON.stringify({ type: "created", shellType }));
  }

  detach(id: string): void {
    const terminal = this.terminals.get(id);
    if (!terminal || terminal.state === "dead") return;

    terminal.ws = null;
    terminal.state = "detached";

    // Start grace timer — if no one reattaches, kill the PTY
    terminal.graceTimer = setTimeout(() => {
      terminal.pty.kill();
      terminal.state = "dead";
      this.terminals.delete(id);
    }, GRACE_PERIOD_MS);
  }

  attach(id: string, ws: WebSocket): { success: boolean; cols: number; rows: number } {
    const terminal = this.terminals.get(id);
    if (!terminal || terminal.state === "dead") {
      return { success: false, cols: 0, rows: 0 };
    }

    // Cancel grace timer
    if (terminal.graceTimer) {
      clearTimeout(terminal.graceTimer);
      terminal.graceTimer = null;
    }

    // Close old WS if still open (its close handler won't detach
    // because the guard checks terminal.ws === ws)
    if (terminal.ws && terminal.ws.readyState === terminal.ws.OPEN) {
      terminal.ws.close();
    }

    // Freeze live output during replay to prevent duplication/reordering.
    // The onData handler queues output while this flag is set.
    terminal.replaying = true;
    terminal.replayQueue = [];
    const replayChunks = terminal.buffer.getAll();

    terminal.ws = ws;
    terminal.state = "connected";

    // Wire up new WS handlers
    this.wireWs(id, terminal, ws);

    // Send attached message BEFORE replay so client can clear terminal first
    ws.send(JSON.stringify({ type: "attached", cols: terminal.cols, rows: terminal.rows }));

    // Replay buffered output
    for (const chunk of replayChunks) {
      ws.send(JSON.stringify({ type: "buffer-replay", data: chunk }));
    }
    ws.send(JSON.stringify({ type: "buffer-replay-done" }));

    // Resume live output and flush anything that arrived during replay
    terminal.replaying = false;
    for (const data of terminal.replayQueue) {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: "output", data }));
      }
    }
    terminal.replayQueue = [];

    return { success: true, cols: terminal.cols, rows: terminal.rows };
  }

  kill(id: string): void {
    const terminal = this.terminals.get(id);
    if (terminal) {
      if (terminal.graceTimer) clearTimeout(terminal.graceTimer);
      terminal.pty.kill();
      terminal.state = "dead";
      if (terminal.ws && terminal.ws.readyState === terminal.ws.OPEN) {
        terminal.ws.close();
      }
      this.terminals.delete(id);
    }
  }

  shutdown(): void {
    this.terminals.forEach((terminal) => {
      if (terminal.graceTimer) clearTimeout(terminal.graceTimer);
      terminal.pty.kill();
    });
    this.terminals.clear();
  }
}

/** Singleton manager — accessible by terminal routes for HTTP kill endpoint */
let _manager: TerminalManager | null = null;
export function getTerminalManager(): TerminalManager | null {
  return _manager;
}

export function attachTerminalWebSocket(
  server: Server,
  allowedOrigins: Set<string>,
): TerminalManager {
  const manager = new TerminalManager();
  _manager = manager;

  const wss = new WebSocketServer({
    server,
    path: "/ws/terminal",
    verifyClient: (info: { origin: string; req: IncomingMessage }, cb: (res: boolean, code?: number, msg?: string) => void) => {
      const origin = info.origin || info.req.headers.origin || "";
      // Allow connections with no origin (same-origin browser, curl, CLI tools)
      if (!origin) {
        cb(true);
        return;
      }
      if (allowedOrigins.has(origin)) {
        cb(true);
      } else {
        cb(false, 403, "Origin not allowed");
      }
    },
  });

  wss.on("connection", (ws, req) => {
    const url = new URL(req.url || "/", "http://localhost");
    const id = url.searchParams.get("id");
    const mode = url.searchParams.get("mode");
    const cols = clampInt(url.searchParams.get("cols"), 80, MIN_COLS, MAX_COLS);
    const rows = clampInt(url.searchParams.get("rows"), 24, MIN_ROWS, MAX_ROWS);
    const cwd = url.searchParams.get("cwd") || undefined;

    if (!id) {
      ws.close(1008, "Missing terminal id");
      return;
    }

    if (mode === "attach") {
      const state = manager.getSessionState(id);
      if (state === "connected" || state === "detached") {
        const result = manager.attach(id, ws);
        if (!result.success) {
          ws.send(JSON.stringify({ type: "expired" }));
        }
        // On success, attach() already sent "attached" + replay
      } else {
        // Session doesn't exist or is dead — create a new one
        manager.create(id, ws, cols, rows, cwd);
      }
    } else {
      // Default: create new terminal
      manager.create(id, ws, cols, rows, cwd);
    }
  });

  return manager;
}
