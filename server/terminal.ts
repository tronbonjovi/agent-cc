import os from "os";
import fs from "fs";
import path from "path";
import { spawn as ptySpawn, type IPty } from "node-pty";
import { WebSocketServer, type WebSocket } from "ws";
import type { Server, IncomingMessage } from "http";

const MAX_TERMINALS = 10;
const MIN_COLS = 1;
const MAX_COLS = 500;
const MIN_ROWS = 1;
const MAX_ROWS = 200;

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

interface ActiveTerminal {
  pty: IPty;
  ws: WebSocket;
  /** Unique token to prevent stale cleanup handlers from killing a replacement */
  token: string;
}

export class TerminalManager {
  private terminals = new Map<string, ActiveTerminal>();

  getActiveCount(): number {
    return this.terminals.size;
  }

  create(id: string, ws: WebSocket, cols: number, rows: number, cwd?: string): void {
    // Enforce terminal limit
    if (this.terminals.size >= MAX_TERMINALS) {
      ws.close(1013, "Terminal limit reached");
      return;
    }

    // Kill existing terminal with same ID before creating new one
    const existing = this.terminals.get(id);
    if (existing) {
      existing.pty.kill();
      this.terminals.delete(id);
    }

    const shell = process.env.SHELL || (process.platform === "win32" ? "powershell.exe" : "bash");
    const safeCols = clampInt(String(cols), 80, MIN_COLS, MAX_COLS);
    const safeRows = clampInt(String(rows), 24, MIN_ROWS, MAX_ROWS);

    const pty = ptySpawn(shell, [], {
      name: "xterm-256color",
      cols: safeCols,
      rows: safeRows,
      cwd: validateCwd(cwd),
      env: buildSanitizedEnv(),
    });

    const token = crypto.randomUUID();

    pty.onData((data) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: "output", data }));
      }
    });

    pty.onExit(({ exitCode }) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: "exit", exitCode }));
      }
      // Only delete if this is still our terminal (not replaced by a new one)
      const current = this.terminals.get(id);
      if (current && current.token === token) {
        this.terminals.delete(id);
      }
    });

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "input") {
          pty.write(msg.data);
        } else if (msg.type === "resize") {
          const newCols = clampInt(String(msg.cols), 80, MIN_COLS, MAX_COLS);
          const newRows = clampInt(String(msg.rows), 24, MIN_ROWS, MAX_ROWS);
          pty.resize(newCols, newRows);
        }
      } catch {
        // ignore malformed messages
      }
    });

    ws.on("close", () => {
      // Only kill if this is still our terminal
      const current = this.terminals.get(id);
      if (current && current.token === token) {
        current.pty.kill();
        this.terminals.delete(id);
      }
    });

    this.terminals.set(id, { pty, ws, token });
  }

  kill(id: string): void {
    const terminal = this.terminals.get(id);
    if (terminal) {
      terminal.pty.kill();
      this.terminals.delete(id);
    }
  }

  shutdown(): void {
    this.terminals.forEach((terminal) => {
      terminal.pty.kill();
    });
    this.terminals.clear();
  }
}

export function attachTerminalWebSocket(
  server: Server,
  allowedOrigins: Set<string>,
): TerminalManager {
  const manager = new TerminalManager();

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
    const cols = clampInt(url.searchParams.get("cols"), 80, MIN_COLS, MAX_COLS);
    const rows = clampInt(url.searchParams.get("rows"), 24, MIN_ROWS, MAX_ROWS);
    const cwd = url.searchParams.get("cwd") || undefined;

    if (!id) {
      ws.close(1008, "Missing terminal id");
      return;
    }

    manager.create(id, ws, cols, rows, cwd);
  });

  return manager;
}
