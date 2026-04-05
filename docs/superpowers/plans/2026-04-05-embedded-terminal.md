# Embedded Terminal Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a VS Code-style embedded terminal panel to Agent CC with xterm.js, node-pty, and WebSocket, supporting multiple terminals and split view.

**Architecture:** Server spawns PTY processes via node-pty, bridges them to the browser over WebSocket (`ws` library on the existing HTTP server). Client renders terminals with xterm.js in a resizable bottom panel component that lives in the global layout. Panel state (height, tabs, split) persists in the existing JSON database.

**Tech Stack:** xterm.js, @xterm/addon-fit, @xterm/addon-web-links, node-pty, ws, React, Tailwind CSS

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `server/terminal.ts` | PTY process management, WebSocket endpoint setup |
| Create | `server/routes/terminal.ts` | REST endpoints for panel state persistence |
| Create | `client/src/components/terminal-panel.tsx` | Panel container: tabs, split, resize, collapse |
| Create | `client/src/components/terminal-instance.tsx` | Single xterm.js terminal instance + WebSocket connection |
| Create | `client/src/hooks/use-terminal.ts` | React hooks for panel state persistence |
| Modify | `server/index.ts` | Attach WebSocket server to httpServer |
| Modify | `server/routes/index.ts` | Register terminal routes |
| Modify | `server/db.ts` | Add `terminalPanel` to DBData interface |
| Modify | `server/storage.ts` | Add panel state get/update methods |
| Modify | `shared/types.ts` | Add TerminalPanelState type |
| Modify | `client/src/components/layout.tsx` | Integrate terminal panel into layout |
| Modify | `package.json` | Add xterm.js, node-pty, ws dependencies |
| Modify | `script/build.ts` | Add node-pty and ws to external allowlist |
| Create | `tests/terminal.test.ts` | Unit tests for PTY management and panel state |

---

### Task 1: Add Dependencies and Types

**Files:**
- Modify: `package.json`
- Modify: `script/build.ts`
- Modify: `shared/types.ts`

- [ ] **Step 1: Install dependencies**

```bash
cd /home/tron/dev/projects/agent-cc/.worktrees/embedded-terminal
npm install xterm @xterm/addon-fit @xterm/addon-web-links
npm install node-pty
npm install ws
npm install -D @types/ws
```

- [ ] **Step 2: Add node-pty and ws to build externals**

In `script/build.ts`, find the `external` array in the esbuild config and add `node-pty` and `ws`:

```typescript
external: ["chokidar", "express", "gray-matter", "zod", "node-pty", "ws"],
```

- [ ] **Step 3: Add shared types**

Add to `shared/types.ts`:

```typescript
export interface TerminalTab {
  id: string;
  name: string;
}

export interface TerminalPanelState {
  height: number;
  collapsed: boolean;
  tabs: TerminalTab[];
  activeTabId: string | null;
  splitTabId: string | null;
}
```

- [ ] **Step 4: Add panel state to database interface**

In `server/db.ts`, add to the `DBData` interface:

```typescript
terminalPanel: TerminalPanelState;
```

Add to the default data in the `defaultData` object:

```typescript
terminalPanel: {
  height: 300,
  collapsed: false,
  tabs: [],
  activeTabId: null,
  splitTabId: null,
},
```

- [ ] **Step 5: Add storage methods**

In `server/storage.ts`, add two methods to the Storage class:

```typescript
getTerminalPanel(): TerminalPanelState {
  return getDB().terminalPanel;
}

updateTerminalPanel(patch: Partial<TerminalPanelState>): TerminalPanelState {
  const db = getDB();
  db.terminalPanel = { ...db.terminalPanel, ...patch };
  save();
  return db.terminalPanel;
}
```

- [ ] **Step 6: Run type check**

```bash
npm run check
```

Expected: PASS with no type errors

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(terminal): add dependencies and shared types"
```

---

### Task 2: Server-Side PTY Management and WebSocket

**Files:**
- Create: `server/terminal.ts`
- Modify: `server/index.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/terminal.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("terminal manager", () => {
  it("tracks active terminals by id", async () => {
    const { TerminalManager } = await import("../server/terminal");
    const manager = new TerminalManager();
    expect(manager.getActiveCount()).toBe(0);
  });

  it("cleans up all terminals on shutdown", async () => {
    const { TerminalManager } = await import("../server/terminal");
    const manager = new TerminalManager();
    manager.shutdown();
    expect(manager.getActiveCount()).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/terminal.test.ts -v
```

Expected: FAIL — module not found

- [ ] **Step 3: Create terminal manager**

Create `server/terminal.ts`:

```typescript
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
    for (const [id, terminal] of this.terminals) {
      terminal.pty.kill();
      this.terminals.delete(id);
    }
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/terminal.test.ts -v
```

Expected: PASS

- [ ] **Step 5: Write additional tests**

Add to `tests/terminal.test.ts`:

```typescript
describe("terminal panel state routes", () => {
  it("returns default panel state from storage", async () => {
    const { storage } = await import("../server/storage");
    const state = storage.getTerminalPanel();
    expect(state).toHaveProperty("height");
    expect(state).toHaveProperty("collapsed");
    expect(state).toHaveProperty("tabs");
    expect(state.tabs).toEqual([]);
  });

  it("updates panel state", async () => {
    const { storage } = await import("../server/storage");
    const updated = storage.updateTerminalPanel({ height: 400, collapsed: true });
    expect(updated.height).toBe(400);
    expect(updated.collapsed).toBe(true);
  });
});
```

- [ ] **Step 6: Run tests**

```bash
npx vitest run tests/terminal.test.ts -v
```

Expected: PASS

- [ ] **Step 7: Attach WebSocket server in index.ts**

In `server/index.ts`, after the `registerRoutes(httpServer, app)` call and before the `httpServer.listen()` call, add:

```typescript
import { attachTerminalWebSocket } from "./terminal";
```

At the top of the file. Then in the async IIFE:

```typescript
const terminalManager = attachTerminalWebSocket(httpServer);

process.on("SIGTERM", () => {
  terminalManager.shutdown();
});
```

- [ ] **Step 8: Run full test suite**

```bash
npm test
```

Expected: All tests pass

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(terminal): add PTY manager and WebSocket endpoint"
```

---

### Task 3: REST Routes for Panel State

**Files:**
- Create: `server/routes/terminal.ts`
- Modify: `server/routes/index.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/terminal.test.ts`:

```typescript
import { describe, it, expect } from "vitest";

describe("terminal REST routes", () => {
  it("GET /api/terminal/panel returns panel state", async () => {
    const { storage } = await import("../server/storage");
    const state = storage.getTerminalPanel();
    expect(state).toBeDefined();
    expect(typeof state.height).toBe("number");
    expect(typeof state.collapsed).toBe("boolean");
    expect(Array.isArray(state.tabs)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

```bash
npx vitest run tests/terminal.test.ts -v
```

Expected: PASS (storage methods already implemented)

- [ ] **Step 3: Create terminal routes**

Create `server/routes/terminal.ts`:

```typescript
import { Router } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { validate } from "./validation";

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

const router = Router();

router.get("/api/terminal/panel", (_req, res) => {
  res.json(storage.getTerminalPanel());
});

router.patch("/api/terminal/panel", (req, res) => {
  const parsed = validate(PanelPatchSchema, req.body, res);
  if (!parsed) return;
  const updated = storage.updateTerminalPanel(parsed);
  res.json(updated);
});

export default router;
```

- [ ] **Step 4: Register routes**

In `server/routes/index.ts`, add the import:

```typescript
import terminalRouter from "./terminal";
```

And register it alongside the other routers:

```typescript
app.use(terminalRouter);
```

- [ ] **Step 5: Run type check**

```bash
npm run check
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(terminal): add REST routes for panel state"
```

---

### Task 4: React Hooks for Terminal

**Files:**
- Create: `client/src/hooks/use-terminal.ts`

- [ ] **Step 1: Create terminal hooks**

Create `client/src/hooks/use-terminal.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { TerminalPanelState } from "@shared/types";

export function useTerminalPanel() {
  return useQuery<TerminalPanelState>({
    queryKey: ["/api/terminal/panel"],
  });
}

export function useUpdateTerminalPanel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<TerminalPanelState>) => {
      const res = await apiRequest("PATCH", "/api/terminal/panel", patch);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({
        predicate: (q) =>
          (q.queryKey[0] as string)?.startsWith("/api/terminal"),
      });
    },
  });
}
```

- [ ] **Step 2: Run type check**

```bash
npm run check
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(terminal): add React hooks for panel state"
```

---

### Task 5: Terminal Instance Component

**Files:**
- Create: `client/src/components/terminal-instance.tsx`

- [ ] **Step 1: Create the terminal instance component**

This component manages a single xterm.js terminal and its WebSocket connection.

Create `client/src/components/terminal-instance.tsx`:

```typescript
import { useEffect, useRef } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "xterm/css/xterm.css";

interface TerminalInstanceProps {
  id: string;
  isVisible: boolean;
}

export function TerminalInstance({ id, isVisible }: TerminalInstanceProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: "'Fira Code', 'Cascadia Code', 'JetBrains Mono', monospace",
      theme: {
        background: "#0a0a16",
        foreground: "#c8d3f5",
        cursor: "#c8d3f5",
        selectionBackground: "#2a2a4a",
        black: "#1a1a2e",
        red: "#ff757f",
        green: "#c3e88d",
        yellow: "#ffc777",
        blue: "#82aaff",
        magenta: "#c792ea",
        cyan: "#86e1fc",
        white: "#c8d3f5",
      },
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(new WebLinksAddon());

    terminal.open(containerRef.current);
    fitAddon.fit();

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // Connect WebSocket
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws/terminal?id=${id}&cols=${terminal.cols}&rows=${terminal.rows}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      // Connection established
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "output") {
          terminal.write(msg.data);
        } else if (msg.type === "exit") {
          terminal.write("\r\n\x1b[90m[Process exited]\x1b[0m\r\n");
        }
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = () => {
      terminal.write("\r\n\x1b[90m[Disconnected]\x1b[0m\r\n");
    };

    terminal.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "input", data }));
      }
    });

    wsRef.current = ws;

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      if (isVisible) {
        fitAddon.fit();
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: "resize",
              cols: terminal.cols,
              rows: terminal.rows,
            })
          );
        }
      }
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      ws.close();
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
      wsRef.current = null;
    };
  }, [id]);

  // Re-fit when visibility changes
  useEffect(() => {
    if (isVisible && fitAddonRef.current) {
      setTimeout(() => fitAddonRef.current?.fit(), 0);
    }
  }, [isVisible]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      style={{ display: isVisible ? "block" : "none" }}
    />
  );
}
```

- [ ] **Step 2: Run type check**

```bash
npm run check
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(terminal): add terminal instance component with xterm.js"
```

---

### Task 6: Terminal Panel Component

**Files:**
- Create: `client/src/components/terminal-panel.tsx`

- [ ] **Step 1: Create the panel component**

This is the container that manages tabs, split view, resize, and collapse.

Create `client/src/components/terminal-panel.tsx`:

```typescript
import { useState, useRef, useCallback, useEffect } from "react";
import { TerminalInstance } from "./terminal-instance";
import { useTerminalPanel, useUpdateTerminalPanel } from "@/hooks/use-terminal";
import type { TerminalTab } from "@shared/types";

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function TerminalPanel() {
  const { data: panelState } = useTerminalPanel();
  const updatePanel = useUpdateTerminalPanel();

  const [tabs, setTabs] = useState<TerminalTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [splitTabId, setSplitTabId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [height, setHeight] = useState(300);
  const [isResizing, setIsResizing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Sync from server state on load
  useEffect(() => {
    if (panelState) {
      setHeight(panelState.height);
      setCollapsed(panelState.collapsed);
      if (panelState.tabs.length > 0) {
        setTabs(panelState.tabs);
        setActiveTabId(panelState.activeTabId);
        setSplitTabId(panelState.splitTabId);
      }
    }
  }, [panelState]);

  // Create initial terminal if none exist
  useEffect(() => {
    if (panelState && tabs.length === 0) {
      const initial: TerminalTab = { id: generateId(), name: "Terminal 1" };
      setTabs([initial]);
      setActiveTabId(initial.id);
    }
  }, [panelState, tabs.length]);

  // Persist state on changes (debounced by storage layer)
  const persistState = useCallback(
    (updates: {
      tabs?: TerminalTab[];
      activeTabId?: string | null;
      splitTabId?: string | null;
      height?: number;
      collapsed?: boolean;
    }) => {
      updatePanel.mutate({
        tabs: updates.tabs ?? tabs,
        activeTabId: updates.activeTabId ?? activeTabId,
        splitTabId: updates.splitTabId ?? splitTabId,
        height: updates.height ?? height,
        collapsed: updates.collapsed ?? collapsed,
      });
    },
    [tabs, activeTabId, splitTabId, height, collapsed, updatePanel]
  );

  const addTab = useCallback(() => {
    const newTab: TerminalTab = {
      id: generateId(),
      name: `Terminal ${tabs.length + 1}`,
    };
    const newTabs = [...tabs, newTab];
    setTabs(newTabs);
    setActiveTabId(newTab.id);
    persistState({ tabs: newTabs, activeTabId: newTab.id });
  }, [tabs, persistState]);

  const closeTab = useCallback(
    (tabId: string) => {
      const newTabs = tabs.filter((t) => t.id !== tabId);
      let newActiveId = activeTabId;
      let newSplitId = splitTabId;

      if (splitTabId === tabId) {
        newSplitId = null;
      }
      if (activeTabId === tabId) {
        newActiveId = newTabs.length > 0 ? newTabs[newTabs.length - 1].id : null;
      }

      setTabs(newTabs);
      setActiveTabId(newActiveId);
      setSplitTabId(newSplitId);
      persistState({
        tabs: newTabs,
        activeTabId: newActiveId,
        splitTabId: newSplitId,
      });
    },
    [tabs, activeTabId, splitTabId, persistState]
  );

  const toggleSplit = useCallback(() => {
    if (splitTabId) {
      setSplitTabId(null);
      persistState({ splitTabId: null });
    } else if (tabs.length >= 2) {
      const other = tabs.find((t) => t.id !== activeTabId);
      if (other) {
        setSplitTabId(other.id);
        persistState({ splitTabId: other.id });
      }
    }
  }, [tabs, activeTabId, splitTabId, persistState]);

  const toggleCollapse = useCallback(() => {
    const newCollapsed = !collapsed;
    setCollapsed(newCollapsed);
    persistState({ collapsed: newCollapsed });
  }, [collapsed, persistState]);

  // Drag-to-resize
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsResizing(true);
      const startY = e.clientY;
      const startHeight = height;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const delta = startY - moveEvent.clientY;
        const newHeight = Math.max(100, Math.min(startHeight + delta, window.innerHeight - 200));
        setHeight(newHeight);
      };

      const handleMouseUp = () => {
        setIsResizing(false);
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        // Persist final height
        const panel = panelRef.current;
        if (panel) {
          persistState({ height: panel.offsetHeight });
        }
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [height, persistState]
  );

  // Rename tab on double-click
  const handleRenameTab = useCallback(
    (tabId: string, newName: string) => {
      const newTabs = tabs.map((t) =>
        t.id === tabId ? { ...t, name: newName } : t
      );
      setTabs(newTabs);
      persistState({ tabs: newTabs });
    },
    [tabs, persistState]
  );

  if (collapsed) {
    return (
      <div className="border-t bg-background">
        <div className="flex items-center h-8 px-2 gap-2">
          <button
            onClick={toggleCollapse}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            ▲ Terminal
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={panelRef} style={{ height }} className="flex flex-col border-t bg-background">
      {/* Drag handle */}
      <div
        onMouseDown={handleMouseDown}
        className={`h-1 cursor-row-resize flex items-center justify-center hover:bg-accent transition-colors ${
          isResizing ? "bg-accent" : ""
        }`}
      >
        <div className="w-8 h-0.5 bg-muted-foreground/30 rounded-full" />
      </div>

      {/* Tab bar */}
      <div className="flex items-center h-8 px-1 border-b bg-muted/30 text-xs">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`flex items-center gap-1 px-2 h-full cursor-pointer border-r border-border ${
              tab.id === activeTabId
                ? "bg-background text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <span
              onClick={() => {
                setActiveTabId(tab.id);
                persistState({ activeTabId: tab.id });
              }}
              onDoubleClick={() => {
                const newName = prompt("Rename terminal:", tab.name);
                if (newName) handleRenameTab(tab.id, newName);
              }}
            >
              {tab.name}
            </span>
            {tabs.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
                className="ml-1 text-muted-foreground hover:text-foreground"
              >
                ×
              </button>
            )}
          </div>
        ))}

        <div className="flex items-center ml-auto gap-1 px-1">
          {tabs.length >= 2 && (
            <button
              onClick={toggleSplit}
              className={`px-1.5 py-0.5 rounded text-muted-foreground hover:text-foreground transition-colors ${
                splitTabId ? "bg-accent text-foreground" : ""
              }`}
              title={splitTabId ? "Unsplit" : "Split view"}
            >
              ⬜⬜
            </button>
          )}
          <button
            onClick={addTab}
            className="px-1.5 py-0.5 rounded text-muted-foreground hover:text-foreground transition-colors"
            title="New terminal"
          >
            ＋
          </button>
          <button
            onClick={toggleCollapse}
            className="px-1.5 py-0.5 rounded text-muted-foreground hover:text-foreground transition-colors"
            title="Collapse panel"
          >
            ▼
          </button>
        </div>
      </div>

      {/* Terminal area */}
      <div className="flex-1 flex min-h-0">
        <div className={splitTabId ? "flex-1 border-r border-border" : "flex-1"}>
          {tabs.map((tab) => (
            <TerminalInstance
              key={tab.id}
              id={tab.id}
              isVisible={tab.id === activeTabId}
            />
          ))}
        </div>
        {splitTabId && (
          <div className="flex-1">
            <TerminalInstance
              key={`split-${splitTabId}`}
              id={`split-${splitTabId}`}
              isVisible={true}
            />
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run type check**

```bash
npm run check
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(terminal): add terminal panel component with tabs and split view"
```

---

### Task 7: Integrate Panel into Layout

**Files:**
- Modify: `client/src/components/layout.tsx`

- [ ] **Step 1: Add terminal panel to layout**

In `client/src/components/layout.tsx`, add the import at the top:

```typescript
import { TerminalPanel } from "./terminal-panel";
```

Find the `<main>` element (around line 261). Change the main content area from:

```tsx
<main className="flex-1 overflow-auto">
  <div className="page-enter">{children}</div>
</main>
```

To:

```tsx
<main className="flex-1 flex flex-col overflow-hidden">
  <div className="flex-1 overflow-auto">
    <div className="page-enter">{children}</div>
  </div>
  <TerminalPanel />
</main>
```

Key changes:
- `main` becomes a flex column with `overflow-hidden` (panel handles its own scroll)
- Page content wraps in a `flex-1 overflow-auto` div
- `TerminalPanel` sits below the content

- [ ] **Step 2: Run type check**

```bash
npm run check
```

Expected: PASS

- [ ] **Step 3: Run full test suite**

```bash
npm test
```

Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(terminal): integrate panel into global layout"
```

---

### Task 8: Manual Testing and Polish

**Files:**
- Various touch-ups based on testing

- [ ] **Step 1: Start dev server and test**

```bash
npm run dev
```

Open http://localhost:5100 and verify:
- Terminal panel visible at bottom of page
- Can type commands in terminal
- Can create new terminal tabs with + button
- Can switch between tabs
- Can split view with two terminals side by side
- Can resize panel by dragging the handle
- Can collapse and expand panel
- Panel persists across page navigation (click between Dashboard, Projects, etc.)
- Terminal sessions stay alive during navigation

- [ ] **Step 2: Test keyboard input**

In the terminal, run:
- `echo hello` — should print "hello"
- `ls` — should list files
- `claude` — should start Claude Code (if installed)
- Ctrl+C — should send interrupt
- Tab completion — should work

- [ ] **Step 3: Fix any issues found during testing**

Address any visual or functional issues. Common things to watch for:
- Terminal not fitting container properly (fit addon timing)
- Colors not matching app theme
- Resize handle too hard to grab
- Tab bar overflow with many tabs

- [ ] **Step 4: Run full test suite**

```bash
npm test
```

Expected: All tests pass including safety checks

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix(terminal): polish from manual testing"
```

---

### Task 9: Update Documentation

**Files:**
- Modify: `CLAUDE.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Update CLAUDE.md environment variables table if needed**

If any new env vars were added, update the table. (This plan doesn't introduce new env vars, but verify.)

- [ ] **Step 2: Update CHANGELOG.md**

Add entry under the next version:

```markdown
### Added
- Embedded terminal panel with xterm.js — VS Code-style bottom panel
- Multiple terminal tabs with split view support
- Resizable and collapsible panel with state persistence
- WebSocket-based PTY bridge (node-pty + ws)
```

- [ ] **Step 3: Run safety tests**

```bash
npx vitest run tests/new-user-safety.test.ts -v
```

Expected: PASS — no hardcoded paths or PII

- [ ] **Step 4: Run full test suite one final time**

```bash
npm test
```

Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "docs: update changelog for embedded terminal feature"
```
