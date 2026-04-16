/**
 * Tests for chat conversation continuity — chat-ux-cleanup task002.
 *
 * The chat currently spawns a fresh Claude CLI session for every message, even
 * within the same conversation tab, because the captured session ID is never
 * passed back on subsequent prompts. These tests pin down the runner-side fix:
 *
 *   1. StreamingClaudeOptions accepts an optional `sessionId` field
 *   2. When `sessionId` is provided, `--resume <id>` appears in the CLI args
 *   3. When `sessionId` is omitted, `--resume` is absent
 *   4. Chat sessions still do NOT add --no-session-persistence even when
 *      resuming (CLAUDE.md: chat sessions intentionally write JSONL).
 *
 * Route-level tests that verify the chat handler looks up the stored session
 * ID live in `chat-continuity-route.test.ts` — separate file because this one
 * uses `vi.mock('child_process')` which would conflict with the route test's
 * `vi.mock('../server/scanner/claude-runner')`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "events";

vi.mock("child_process", () => {
  return { spawn: vi.fn() };
});

import { spawn } from "child_process";
import { runClaudeStreaming } from "../server/scanner/claude-runner";

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

const spawnMock = spawn as unknown as ReturnType<typeof vi.fn>;

describe("runClaudeStreaming sessionId passthrough", () => {
  beforeEach(() => {
    spawnMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("includes --resume <id> when sessionId is provided", async () => {
    const child = makeFakeChild();
    spawnMock.mockReturnValue(child);

    const iter = runClaudeStreaming({
      prompt: "hello",
      sessionId: "abc-123-uuid",
    });
    const consume = (async () => {
      try {
        for await (const _c of iter) { /* no-op */ }
      } catch { /* ignore */ }
    })();
    await Promise.resolve();
    queueMicrotask(() => child.emit("close", 0));
    await consume;

    expect(spawnMock).toHaveBeenCalled();
    const [cmd, args] = spawnMock.mock.calls[0];
    expect(cmd).toBe("claude");
    expect(args).toContain("--resume");
    // The value must appear immediately after --resume (argv ordering matters).
    const idx = (args as string[]).indexOf("--resume");
    expect((args as string[])[idx + 1]).toBe("abc-123-uuid");
  });

  it("omits --resume when sessionId is not provided", async () => {
    const child = makeFakeChild();
    spawnMock.mockReturnValue(child);

    const iter = runClaudeStreaming({ prompt: "hello" });
    const consume = (async () => {
      try {
        for await (const _c of iter) { /* no-op */ }
      } catch { /* ignore */ }
    })();
    await Promise.resolve();
    queueMicrotask(() => child.emit("close", 0));
    await consume;

    expect(spawnMock).toHaveBeenCalled();
    const [, args] = spawnMock.mock.calls[0];
    expect(args).not.toContain("--resume");
  });

  it("still DOES NOT add --no-session-persistence when resuming", async () => {
    // Regression guard: chat sessions must always write JSONL (no
    // --no-session-persistence) regardless of resume state, per CLAUDE.md.
    const child = makeFakeChild();
    spawnMock.mockReturnValue(child);

    const iter = runClaudeStreaming({
      prompt: "hello",
      sessionId: "resume-me",
    });
    const consume = (async () => {
      try {
        for await (const _c of iter) { /* no-op */ }
      } catch { /* ignore */ }
    })();
    await Promise.resolve();
    queueMicrotask(() => child.emit("close", 0));
    await consume;

    expect(spawnMock).toHaveBeenCalled();
    const [, args] = spawnMock.mock.calls[0];
    expect(args).not.toContain("--no-session-persistence");
  });
});
