// tests/layout.test.ts
//
// Tests for the layout shell refactor that introduces a 3-column grid
// (sidebar / center+terminal / chat panel slot) — chat-skeleton task001.
//
// Follows the repo convention: client/ is excluded from vitest, so React
// components can't be rendered here. Store logic is tested via direct
// imports, and layout structure is verified through source-text
// guardrails. See tests/dashboard-layout.test.ts and tests/filter-bar.test.ts
// for the same pattern.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "..");
const LAYOUT_PATH = path.resolve(ROOT, "client/src/components/layout.tsx");
const STORE_PATH = path.resolve(ROOT, "client/src/stores/layout-store.ts");
const TERMINAL_PANEL_PATH = path.resolve(ROOT, "client/src/components/terminal-panel.tsx");
const TERMINAL_GROUP_VIEW_PATH = path.resolve(ROOT, "client/src/components/terminal-group-view.tsx");

// ---------------------------------------------------------------------------
// layout-store — pure Zustand, safe to import in node env
// ---------------------------------------------------------------------------

// In-memory localStorage shim — the store module imports zustand/middleware
// persist, which touches globalThis.localStorage at construction time.
class MemoryStorage {
  private store = new Map<string, string>();
  get length() {
    return this.store.size;
  }
  clear() {
    this.store.clear();
  }
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.store.set(key, String(value));
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  key(i: number) {
    return Array.from(this.store.keys())[i] ?? null;
  }
}

const LAYOUT_KEY = "agent-cc:layout";

let useLayoutStore: typeof import("../client/src/stores/layout-store").useLayoutStore;

beforeEach(async () => {
  // Install fresh in-memory localStorage before (re)importing the store.
  (globalThis as any).localStorage = new MemoryStorage();
  // zustand stores are module-scoped singletons; reset the module graph so
  // the persist middleware re-reads the fresh localStorage on import.
  vi.resetModules();
  const mod = await import("../client/src/stores/layout-store");
  useLayoutStore = mod.useLayoutStore;
  // Reset state to defaults to isolate tests.
  useLayoutStore.setState({ chatPanelWidth: 400, chatPanelCollapsed: false });
  // Clear any auto-persisted snapshot from the import so tests start clean.
  localStorage.removeItem(LAYOUT_KEY);
});

afterEach(() => {
  delete (globalThis as any).localStorage;
});

describe("useLayoutStore", () => {
  it("has correct initial state", () => {
    const state = useLayoutStore.getState();
    expect(state.chatPanelWidth).toBe(400);
    expect(state.chatPanelCollapsed).toBe(false);
    expect(typeof state.setChatPanelWidth).toBe("function");
    expect(typeof state.toggleChatPanel).toBe("function");
  });

  it("setChatPanelWidth updates width and persists to localStorage under agent-cc:layout", () => {
    useLayoutStore.getState().setChatPanelWidth(500);
    expect(useLayoutStore.getState().chatPanelWidth).toBe(500);
    const raw = localStorage.getItem(LAYOUT_KEY);
    expect(raw).toBeTruthy();
    expect(raw).toContain("500");
  });

  it("toggleChatPanel flips collapsed state and persists to localStorage", () => {
    useLayoutStore.getState().toggleChatPanel();
    expect(useLayoutStore.getState().chatPanelCollapsed).toBe(true);
    const raw = localStorage.getItem(LAYOUT_KEY);
    expect(raw).toBeTruthy();
    // zustand persist serializes state under a `state` key.
    const parsed = JSON.parse(raw!);
    const persisted = parsed.state ?? parsed;
    expect(persisted.chatPanelCollapsed).toBe(true);

    useLayoutStore.getState().toggleChatPanel();
    expect(useLayoutStore.getState().chatPanelCollapsed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// layout.tsx — source-text guardrails for the 3-column refactor
// ---------------------------------------------------------------------------

describe("layout.tsx — 3-column shell structure", () => {
  const src = fs.readFileSync(LAYOUT_PATH, "utf-8");

  it("imports from react-resizable-panels", () => {
    // v4.x of the library renames the top-level container from
    // PanelGroup → Group and the divider from PanelResizeHandle →
    // Separator. The repo aliases these back to PanelGroup /
    // PanelResizeHandle on import so the rest of the code reads the
    // same regardless of library version.
    expect(src).toMatch(/from ["']react-resizable-panels["']/);
    expect(src).toMatch(/Panel\b/);
  });

  it("uses a horizontal top-level panel group (3-column layout)", () => {
    // Accept either v2/v3 `direction="horizontal"` or v4 `orientation="horizontal"`.
    expect(src).toMatch(/(direction|orientation)=["']horizontal["']/);
  });

  it("nests a vertical panel group for the center column (main + terminal)", () => {
    expect(src).toMatch(/(direction|orientation)=["']vertical["']/);
  });

  it("renders the chat panel slot with data-testid", () => {
    expect(src).toContain('data-testid="chat-panel-slot"');
  });

  it("still renders the TerminalPanel component", () => {
    expect(src).toContain("TerminalPanel");
    expect(src).toContain("<TerminalPanel");
  });

  it("terminal lives inside the nested vertical panel group, not at layout root", () => {
    // The terminal must appear AFTER the vertical PanelGroup is opened,
    // so its subtree contains <TerminalPanel /> — meaning the terminal
    // no longer spans across the chat panel column.
    const verticalOpen = src.search(/(direction|orientation)=["']vertical["']/);
    const terminalIdx = src.indexOf("<TerminalPanel");
    expect(verticalOpen).toBeGreaterThan(-1);
    expect(terminalIdx).toBeGreaterThan(verticalOpen);
  });

  it("reads chatPanelCollapsed and chatPanelWidth from useLayoutStore", () => {
    expect(src).toContain("useLayoutStore");
    expect(src).toMatch(/chatPanelCollapsed/);
    expect(src).toMatch(/chatPanelWidth/);
  });

  it("collapses the chat panel when chatPanelCollapsed is true", () => {
    // Accept either: conditional rendering of the slot, OR a collapsed
    // sizing path (e.g. defaultSize={0} when collapsed, or a ternary).
    const hasConditional =
      /chatPanelCollapsed\s*\?/.test(src) ||
      /!chatPanelCollapsed\s*&&/.test(src) ||
      /chatPanelCollapsed\s*&&/.test(src);
    expect(hasConditional).toBe(true);
  });

  // Task008 — the outer vertical Panel wrapping <TerminalPanel /> is the
  // single source of truth for terminal height. It must read from and
  // write back to useTerminalGroupStore.
  it("imports useTerminalGroupStore for terminal height wiring", () => {
    expect(src).toContain("useTerminalGroupStore");
    expect(src).toMatch(/from\s+["']@\/stores\/terminal-group-store["']/);
  });

  it("reads terminal height from the store and writes it back via onResize", () => {
    expect(src).toMatch(/s\)\s*=>\s*s\.height/);
    expect(src).toMatch(/s\)\s*=>\s*s\.setHeight/);
    // onResize handler on the terminal Panel uses the same inPixels
    // pattern the chat panel uses, with a referential-guard to prevent
    // feedback loops.
    expect(src).toMatch(/onResize=\{\(panelSize\)/);
    expect(src).toMatch(/panelSize\.inPixels/);
    expect(src).toMatch(/setTerminalHeight/);
  });
});

describe("layout-store.ts — source guardrails", () => {
  const storeSrc = fs.readFileSync(STORE_PATH, "utf-8");

  it("uses zustand", () => {
    expect(storeSrc).toContain("zustand");
  });

  it("persists under the agent-cc:layout localStorage key", () => {
    expect(storeSrc).toContain("agent-cc:layout");
  });
});

// ---------------------------------------------------------------------------
// Task008 — terminal panel consolidation on react-resizable-panels
// ---------------------------------------------------------------------------

describe("terminal-panel.tsx — no bespoke drag handle (task008)", () => {
  const src = fs.readFileSync(TERMINAL_PANEL_PATH, "utf-8");

  it("does not render its own onMouseDown drag handle", () => {
    // Regression guard for the dual-handle desync task008 fixed.
    // The outer vertical <Panel> in layout.tsx owns resize now.
    expect(src).not.toMatch(/onMouseDown=\{handleMouseDown\}/);
    expect(src).not.toMatch(/handleMouseDown/);
  });

  it("does not style itself with a pixel height", () => {
    // The component must fill its parent Panel, not impose a height.
    expect(src).not.toMatch(/style=\{\{\s*height\s*\}\}/);
  });

  it("still subscribes to height for server persistence", () => {
    // height stays in the deps array for the PATCH /api/terminal/panel
    // effect — the outer Panel writes back into the store, and this
    // subscription makes the PATCH re-fire.
    expect(src).toMatch(/useTerminalGroupStore\(\(s\)\s*=>\s*s\.height\)/);
  });
});

describe("terminal-group-view.tsx — uses react-resizable-panels (task008)", () => {
  const src = fs.readFileSync(TERMINAL_GROUP_VIEW_PATH, "utf-8");

  it("does not import allotment", () => {
    expect(src).not.toMatch(/from ["']allotment["']/);
    expect(src).not.toMatch(/allotment\/dist\/style\.css/);
    expect(src).not.toContain("Allotment");
  });

  it("imports Group / Panel / Separator from react-resizable-panels", () => {
    expect(src).toMatch(/from ["']react-resizable-panels["']/);
    // Alias pattern must match layout.tsx for consistency.
    expect(src).toMatch(/Group as PanelGroup/);
    expect(src).toMatch(/Separator as PanelResizeHandle/);
  });
});

describe("package.json — allotment removed (task008)", () => {
  const pkgSrc = fs.readFileSync(path.resolve(ROOT, "package.json"), "utf-8");

  it("does not list allotment as a dependency", () => {
    const pkg = JSON.parse(pkgSrc);
    expect(pkg.dependencies?.allotment).toBeUndefined();
    expect(pkg.devDependencies?.allotment).toBeUndefined();
  });
});
