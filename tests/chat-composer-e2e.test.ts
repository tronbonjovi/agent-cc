/**
 * Chat composer controls — integration E2E (chat-composer-controls task008).
 *
 * Final lock-in test for the chat-composer-controls milestone. Proves the
 * pieces shipped in tasks 001/003/004/005/006/007 integrate end-to-end at
 * the observable boundaries: CLI argv, spawn cwd, structural surface, and
 * global-defaults CRUD.
 *
 * This file is the RUNNER-LEVEL half of the suite. It mocks `child_process`
 * so `runClaudeStreaming` is real and we can inspect `spawn.mock.calls` to
 * pin exact CLI flag emission + spawn options.
 *
 * The ROUTE-LEVEL half lives in `chat-composer-e2e-route.test.ts`. Split
 * because `vi.mock('child_process')` (here) collides with
 * `vi.mock('../server/scanner/claude-runner')` (the route test's only path
 * to prevent the real runner from spawning a real subprocess) — same split
 * pattern as chat-model-dropdown.test.ts / -route.test.ts and
 * chat-popover-controls.test.ts / -route.test.ts.
 *
 * Four dimensions verified here:
 *
 *   A. Model flag passthrough — opts.model → `--model <id>` on the argv.
 *   B. Effort + systemPrompt passthrough — `--effort <level>` and
 *      `--append-system-prompt <text>`. Thinking + webSearch accepted by
 *      the runner but NOT flagged (no matching CLI option today).
 *   C. Project context — opts.cwd → spawn's second-arg `cwd`; absent when
 *      unset ("General").
 *   D. Global-defaults CRUD roundtrip — PUT then GET through the real
 *      settings router, plus validation 400s on malformed payloads.
 *   E. Structural surface — every new file/interface the milestone
 *      introduced exists on disk and still exports what its callers expect.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import express from "express";
import request from "supertest";
import { EventEmitter } from "events";

// ---------------------------------------------------------------------------
// Mocks — must precede the runner import
// ---------------------------------------------------------------------------
//
// Only child_process is mocked. The real runner drives through this mock so
// the argv + spawn-options payloads are observable. The settings router
// (imported lower) does not touch child_process, so the CRUD roundtrip is
// unaffected.

vi.mock("child_process", () => {
  return { spawn: vi.fn() };
});

import { spawn } from "child_process";
import { runClaudeStreaming } from "../server/scanner/claude-runner";
import settingsRouter from "../server/routes/settings";
import { getDB, defaultChatDefaults } from "../server/db";

const spawnMock = spawn as unknown as ReturnType<typeof vi.fn>;

const ROOT = path.resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// Fake child helpers — identical shape to the sibling runner tests so the
// async-generator drain pattern behaves consistently.
// ---------------------------------------------------------------------------

function makeFakeChild() {
  const child: any = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = { write: vi.fn(), end: vi.fn() };
  child.kill = vi.fn(() => {
    setImmediate(() => child.emit("close", null));
  });
  return child;
}

async function drain(iter: AsyncGenerator<unknown>, child: any) {
  const consume = (async () => {
    try {
      for await (const _c of iter) {
        /* drain */
      }
    } catch {
      /* ignore */
    }
  })();
  await Promise.resolve();
  queueMicrotask(() => child.emit("close", 0));
  await consume;
}

// ---------------------------------------------------------------------------
// A. Model flag passthrough — opts.model → `--model <id>`
// ---------------------------------------------------------------------------

describe("M-chat-composer-controls E2E — A. model flag", () => {
  beforeEach(() => {
    spawnMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("adds --model <id> when opts.model = claude-sonnet-4-6", async () => {
    const child = makeFakeChild();
    spawnMock.mockReturnValue(child);

    const iter = runClaudeStreaming({
      prompt: "hi",
      model: "claude-sonnet-4-6",
    });
    await drain(iter, child);

    expect(spawnMock).toHaveBeenCalled();
    const [, args] = spawnMock.mock.calls[0];
    const a = args as string[];
    expect(a).toContain("--model");
    expect(a[a.indexOf("--model") + 1]).toBe("claude-sonnet-4-6");
  });

  it("adds --model <id> when opts.model = claude-opus-4-6", async () => {
    const child = makeFakeChild();
    spawnMock.mockReturnValue(child);

    const iter = runClaudeStreaming({
      prompt: "hi",
      model: "claude-opus-4-6",
    });
    await drain(iter, child);

    const [, args] = spawnMock.mock.calls[0];
    const a = args as string[];
    expect(a).toContain("--model");
    expect(a[a.indexOf("--model") + 1]).toBe("claude-opus-4-6");
  });

  it("omits --model entirely when opts.model is not provided", async () => {
    const child = makeFakeChild();
    spawnMock.mockReturnValue(child);

    const iter = runClaudeStreaming({ prompt: "hi" });
    await drain(iter, child);

    const [, args] = spawnMock.mock.calls[0];
    expect(args).not.toContain("--model");
  });
});

// ---------------------------------------------------------------------------
// B. Settings passthrough — --effort, --append-system-prompt
//    Non-flags: thinking + webSearch accepted but NOT emitted as CLI args.
// ---------------------------------------------------------------------------
//
// `claude --help` (verified 2026-04-16) lists `--effort <level>` (low, medium,
// high, xhigh, max) and `--append-system-prompt <text>`. It does NOT list
// any `--thinking` or `--web-search` flag. Those booleans stay on the
// runner's options type so the route can forward them verbatim, but they
// must not turn into invented CLI flags — task005's regression guard.

describe("M-chat-composer-controls E2E — B. settings flag passthrough", () => {
  beforeEach(() => {
    spawnMock.mockReset();
  });

  it("adds --effort <level> when opts.effort = high", async () => {
    const child = makeFakeChild();
    spawnMock.mockReturnValue(child);

    const iter = runClaudeStreaming({ prompt: "hi", effort: "high" });
    await drain(iter, child);

    const [, args] = spawnMock.mock.calls[0];
    const a = args as string[];
    expect(a).toContain("--effort");
    expect(a[a.indexOf("--effort") + 1]).toBe("high");
  });

  it("adds --append-system-prompt <text> when opts.systemPrompt is set", async () => {
    const child = makeFakeChild();
    spawnMock.mockReturnValue(child);

    const iter = runClaudeStreaming({
      prompt: "hi",
      systemPrompt: "You are a code reviewer",
    });
    await drain(iter, child);

    const [, args] = spawnMock.mock.calls[0];
    const a = args as string[];
    expect(a).toContain("--append-system-prompt");
    expect(a[a.indexOf("--append-system-prompt") + 1]).toBe(
      "You are a code reviewer",
    );
    // Pinned explicitly: the flag is --append-system-prompt (task005 wired
    // *append* deliberately so the CLI's default prompt + core tools stay
    // in place). `--system-prompt` would replace the CLI prompt entirely.
    expect(a).not.toContain("--system-prompt");
  });

  it("coexists: effort + systemPrompt + model on a single call", async () => {
    const child = makeFakeChild();
    spawnMock.mockReturnValue(child);

    const iter = runClaudeStreaming({
      prompt: "hi",
      model: "claude-opus-4-6",
      effort: "low",
      systemPrompt: "Terse.",
    });
    await drain(iter, child);

    const [, args] = spawnMock.mock.calls[0];
    const a = args as string[];
    expect(a).toContain("--model");
    expect(a[a.indexOf("--model") + 1]).toBe("claude-opus-4-6");
    expect(a).toContain("--effort");
    expect(a[a.indexOf("--effort") + 1]).toBe("low");
    expect(a).toContain("--append-system-prompt");
    expect(a[a.indexOf("--append-system-prompt") + 1]).toBe("Terse.");
  });

  it("accepts opts.thinking = true but does NOT emit any thinking flag", async () => {
    // The runner's StreamingClaudeOptions.thinking is accepted for
    // forward-compat with the settings store; the route forwards it
    // verbatim; the runner drops it on the floor at the CLI boundary. When
    // the capability/provider system wires thinking up (M11), this test
    // will need to be updated alongside the runner — until then it's a
    // regression pin against accidental flag invention.
    const child = makeFakeChild();
    spawnMock.mockReturnValue(child);

    const iter = runClaudeStreaming({ prompt: "hi", thinking: true });
    await drain(iter, child);

    const [, args] = spawnMock.mock.calls[0];
    const a = args as string[];
    expect(a).not.toContain("--thinking");
    expect(a).not.toContain("--extended-thinking");
    // Also guard against any arg that *starts with* thinking — a future
    // refactor that invents `--thinking-on` would still fail the explicit
    // pin above, but this catches creative naming.
    expect(a.some((x) => x.includes("thinking"))).toBe(false);
  });

  it("accepts opts.webSearch = true but does NOT emit any web-search flag", async () => {
    const child = makeFakeChild();
    spawnMock.mockReturnValue(child);

    const iter = runClaudeStreaming({ prompt: "hi", webSearch: true });
    await drain(iter, child);

    const [, args] = spawnMock.mock.calls[0];
    const a = args as string[];
    expect(a).not.toContain("--web-search");
    expect(a).not.toContain("--websearch");
    expect(a.some((x) => x.toLowerCase().includes("search"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// C. Project context — opts.cwd → spawn's options.cwd
// ---------------------------------------------------------------------------

describe("M-chat-composer-controls E2E — C. project context (spawn cwd)", () => {
  beforeEach(() => {
    spawnMock.mockReset();
  });

  it("passes opts.cwd into spawn's options when a project is selected", async () => {
    const child = makeFakeChild();
    spawnMock.mockReturnValue(child);

    const iter = runClaudeStreaming({
      prompt: "hi",
      cwd: "/home/tron/dev/projects/agent-cc",
    });
    await drain(iter, child);

    expect(spawnMock).toHaveBeenCalled();
    const [, , opts] = spawnMock.mock.calls[0] as [
      string,
      string[],
      { cwd?: string },
    ];
    expect(opts.cwd).toBe("/home/tron/dev/projects/agent-cc");
  });

  it("omits cwd from spawn's options when opts.cwd is undefined ('General')", async () => {
    const child = makeFakeChild();
    spawnMock.mockReturnValue(child);

    const iter = runClaudeStreaming({ prompt: "hi" });
    await drain(iter, child);

    const [, , opts] = spawnMock.mock.calls[0] as [
      string,
      string[],
      { cwd?: string },
    ];
    // The runner deliberately does not set cwd: undefined — it omits the
    // key entirely so Node's spawn inherits the parent's cwd. Pin both:
    // value check AND shape check so a future "cwd: cwd ?? undefined"
    // refactor can't silently drift.
    expect(opts.cwd).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(opts, "cwd")).toBe(false);
  });

  it("omits cwd when opts.cwd is an empty string", async () => {
    // Defense-in-depth: the route's string guard turns "" into undefined,
    // but the runner also short-circuits empty strings. Pin both halves.
    const child = makeFakeChild();
    spawnMock.mockReturnValue(child);

    const iter = runClaudeStreaming({ prompt: "hi", cwd: "" });
    await drain(iter, child);

    const [, , opts] = spawnMock.mock.calls[0] as [
      string,
      string[],
      { cwd?: string },
    ];
    expect(opts.cwd).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// D. Global defaults CRUD roundtrip — /api/settings/chat-defaults
// ---------------------------------------------------------------------------
//
// The settings router reads/writes `db.chatDefaults` directly. No mocks —
// this exercises the real zod validator + the real DB shape. We reset
// chatDefaults in beforeEach so tests don't pollute each other.

function buildSettingsApp() {
  const app = express();
  app.use(express.json());
  app.use(settingsRouter);
  return app;
}

describe("M-chat-composer-controls E2E — D. chat-defaults roundtrip", () => {
  beforeEach(() => {
    // Reset to the shipping default so PUT tests start from a known state.
    const db = getDB();
    db.chatDefaults = { ...defaultChatDefaults };
  });

  it("PUT then GET roundtrips the full defaults shape", async () => {
    const app = buildSettingsApp();

    const payload = {
      providerId: "claude-code",
      model: "claude-opus-4-6",
      effort: "high",
    };

    const putRes = await request(app)
      .put("/api/settings/chat-defaults")
      .send(payload);
    expect(putRes.status).toBe(200);
    expect(putRes.body).toEqual(payload);

    const getRes = await request(app).get("/api/settings/chat-defaults");
    expect(getRes.status).toBe(200);
    expect(getRes.body).toEqual(payload);
  });

  it("PUT rejects a payload missing the required model field", async () => {
    const app = buildSettingsApp();
    const res = await request(app)
      .put("/api/settings/chat-defaults")
      .send({ providerId: "claude-code" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/model/);
  });

  it("PUT rejects a payload missing the required providerId field", async () => {
    const app = buildSettingsApp();
    const res = await request(app)
      .put("/api/settings/chat-defaults")
      .send({ model: "claude-sonnet-4-6" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/providerId/);
  });

  it("PUT rejects temperature out of range (>2)", async () => {
    const app = buildSettingsApp();
    const res = await request(app)
      .put("/api/settings/chat-defaults")
      .send({
        providerId: "claude-code",
        model: "claude-sonnet-4-6",
        temperature: 5,
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/temperature/);
  });

  it("PUT rejects negative temperature", async () => {
    const app = buildSettingsApp();
    const res = await request(app)
      .put("/api/settings/chat-defaults")
      .send({
        providerId: "claude-code",
        model: "claude-sonnet-4-6",
        temperature: -0.5,
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/temperature/);
  });

  it("GET returns the shipping default when nothing has been persisted yet", async () => {
    const app = buildSettingsApp();
    const res = await request(app).get("/api/settings/chat-defaults");
    expect(res.status).toBe(200);
    expect(res.body.providerId).toBe("claude-code");
    expect(res.body.model).toBe("claude-sonnet-4-6");
    expect(res.body.effort).toBe("medium");
  });
});

// ---------------------------------------------------------------------------
// E. Structural surface — files + exports introduced by the milestone exist
// ---------------------------------------------------------------------------
//
// Vitest excludes `client/` (see reference_vitest_client_excluded), so we
// verify client files exist and contain their load-bearing exports via
// source-text pins. The shared/server files are also covered here so the
// E2E is a single "is the milestone wired together" pin point.

describe("M-chat-composer-controls E2E — E. structural surface", () => {
  it("shared/types.ts declares ProviderConfig, ProviderCapabilities, ChatSettings, ChatGlobalDefaults", () => {
    const src = fs.readFileSync(path.join(ROOT, "shared/types.ts"), "utf-8");
    expect(src).toMatch(/\binterface\s+ChatSettings\b/);
    expect(src).toMatch(/\bChatGlobalDefaults\b/);
    expect(src).toMatch(/\binterface\s+ProviderConfig\b/);
    expect(src).toMatch(/\binterface\s+ProviderCapabilities\b/);
  });

  it("client/src/components/chat/model-dropdown.tsx exists and exports ModelDropdown", () => {
    const p = path.join(ROOT, "client/src/components/chat/model-dropdown.tsx");
    expect(fs.existsSync(p)).toBe(true);
    const src = fs.readFileSync(p, "utf-8");
    expect(src).toMatch(/export\s+(function|const)\s+ModelDropdown\b/);
  });

  it("client/src/components/chat/settings-popover.tsx exists", () => {
    const p = path.join(
      ROOT,
      "client/src/components/chat/settings-popover.tsx",
    );
    expect(fs.existsSync(p)).toBe(true);
  });

  it("client/src/stores/chat-settings-store.ts exists and exports useChatSettingsStore", () => {
    const p = path.join(ROOT, "client/src/stores/chat-settings-store.ts");
    expect(fs.existsSync(p)).toBe(true);
    const src = fs.readFileSync(p, "utf-8");
    expect(src).toMatch(/export\s+(const|function)\s+useChatSettingsStore\b/);
  });

  it("client/src/stores/builtin-providers.ts exists and exports BUILTIN_PROVIDERS + catalog helpers", () => {
    const p = path.join(ROOT, "client/src/stores/builtin-providers.ts");
    expect(fs.existsSync(p)).toBe(true);
    const src = fs.readFileSync(p, "utf-8");
    expect(src).toMatch(/\bBUILTIN_PROVIDERS\b/);
    expect(src).toMatch(/\bMODEL_CATALOGS\b/);
    expect(src).toMatch(/\bresolveProvider\b/);
    expect(src).toMatch(/\bdefaultModelFor\b/);
    expect(src).toMatch(/\bisModelInCatalog\b/);
  });

  it("server/scanner/claude-runner.ts wires --model, --effort, --append-system-prompt, and cwd", () => {
    const p = path.join(ROOT, "server/scanner/claude-runner.ts");
    const src = fs.readFileSync(p, "utf-8");
    // Each flag literal and the cwd pass-through appear in the runner
    // source. Structural pin so a future refactor that inlines the arg
    // builder elsewhere can't silently strip a wire.
    expect(src).toMatch(/['"]--model['"]/);
    expect(src).toMatch(/['"]--effort['"]/);
    expect(src).toMatch(/['"]--append-system-prompt['"]/);
    expect(src).toMatch(/\bspawnOpts\.cwd\b/);
  });
});
