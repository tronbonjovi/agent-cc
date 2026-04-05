import os from "os";
import { spawn as ptySpawn, type IPty } from "node-pty";
import { WebSocketServer, type WebSocket } from "ws";
import type { Server } from "http";

interface ActiveTerminal {
  pty: IPty;
  ws: WebSocket;
}

export class TerminalManager {
  private terminals = new Map<string, ActiveTerminal>();

  getActiveCount(): number {
    return this.terminals.size;
  }

  create(id: string, ws: WebSocket, cols: number, rows: number, cwd?: string): void {
    const shell = process.env.SHELL || (process.platform === "win32" ? "powershell.exe" : "bash");

    const pty = ptySpawn(shell, [], {
      name: "xterm-256color",
      cols,
      rows,
      cwd: cwd || os.homedir(),
      env: { ...process.env } as Record<string, string>,
    });

    pty.onData((data) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: "output", data }));
      }
    });

    pty.onExit(({ exitCode }) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: "exit", exitCode }));
      }
      this.terminals.delete(id);
    });

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "input") {
          pty.write(msg.data);
        } else if (msg.type === "resize") {
          pty.resize(msg.cols, msg.rows);
        }
      } catch {
        // ignore malformed messages
      }
    });

    ws.on("close", () => {
      pty.kill();
      this.terminals.delete(id);
    });

    this.terminals.set(id, { pty, ws });
  }

  kill(id: string): void {
    const terminal = this.terminals.get(id);
    if (terminal) {
      terminal.pty.kill();
      this.terminals.delete(id);
    }
  }

  shutdown(): void {
    this.terminals.forEach((terminal, id) => {
      terminal.pty.kill();
    });
    this.terminals.clear();
  }
}

export function attachTerminalWebSocket(server: Server): TerminalManager {
  const manager = new TerminalManager();
  const wss = new WebSocketServer({ server, path: "/ws/terminal" });

  wss.on("connection", (ws, req) => {
    const url = new URL(req.url || "/", "http://localhost");
    const id = url.searchParams.get("id");
    const cols = parseInt(url.searchParams.get("cols") || "80", 10);
    const rows = parseInt(url.searchParams.get("rows") || "24", 10);
    const cwd = url.searchParams.get("cwd") || undefined;

    if (!id) {
      ws.close(1008, "Missing terminal id");
      return;
    }

    manager.create(id, ws, cols, rows, cwd);
  });

  return manager;
}
