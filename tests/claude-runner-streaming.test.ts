/**
 * Tests for runClaudeStreaming() — streaming variant of runClaude.
 * Uses vi.mock('child_process') to fake spawn and feed newline-delimited JSON.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "events";

// Mock child_process before importing the module under test
vi.mock("child_process", () => {
  return { spawn: vi.fn() };
});

import { spawn } from "child_process";
import { runClaudeStreaming, type StreamChunk } from "../server/scanner/claude-runner";

/** Create a fake ChildProcess that we can drive from tests. */
function makeFakeChild() {
  const child: any = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = { write: vi.fn(), end: vi.fn() };
  child.kill = vi.fn(() => {
    // simulate async close after kill
    setImmediate(() => child.emit("close", null));
  });
  return child;
}

const spawnMock = spawn as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  spawnMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("runClaudeStreaming", () => {
  it("yields parsed chunks for a simple prompt in order", async () => {
    const child = makeFakeChild();
    spawnMock.mockReturnValue(child);

    const iter = runClaudeStreaming({ prompt: "hi" });

    // Feed lines asynchronously
    queueMicrotask(() => {
      child.stdout.emit(
        "data",
        Buffer.from(
          JSON.stringify({ type: "system", subtype: "init" }) +
            "\n" +
            JSON.stringify({
              type: "assistant",
              message: { content: [{ type: "text", text: "hello" }] },
            }) +
            "\n",
        ),
      );
      child.stdout.emit(
        "data",
        Buffer.from(
          JSON.stringify({
            type: "assistant",
            message: {
              content: [{ type: "tool_use", name: "Read", input: {} }],
            },
          }) + "\n",
        ),
      );
      child.stdout.emit(
        "data",
        Buffer.from(
          JSON.stringify({
            type: "user",
            message: { content: [{ type: "tool_result", content: "ok" }] },
          }) + "\n",
        ),
      );
      child.stdout.emit(
        "data",
        Buffer.from(
          JSON.stringify({
            type: "assistant",
            message: { content: [{ type: "thinking", thinking: "..." }] },
          }) + "\n",
        ),
      );
      setImmediate(() => child.emit("close", 0));
    });

    const chunks: StreamChunk[] = [];
    for await (const c of iter) chunks.push(c);

    const types = chunks.map((c) => c.type);
    expect(types).toEqual([
      "system",
      "text",
      "tool_call",
      "tool_result",
      "thinking",
      "done",
    ]);
  });

  it("yields a `done` chunk on clean exit", async () => {
    const child = makeFakeChild();
    spawnMock.mockReturnValue(child);

    const iter = runClaudeStreaming({ prompt: "x" });

    queueMicrotask(() => {
      child.stdout.emit(
        "data",
        Buffer.from(JSON.stringify({ type: "system" }) + "\n"),
      );
      setImmediate(() => child.emit("close", 0));
    });

    const chunks: StreamChunk[] = [];
    for await (const c of iter) chunks.push(c);

    expect(chunks[chunks.length - 1]).toEqual({
      type: "done",
      raw: null,
    });
  });

  it("respects timeout when no chunks arrive", async () => {
    const child = makeFakeChild();
    spawnMock.mockReturnValue(child);

    const iter = runClaudeStreaming({ prompt: "x", timeoutMs: 50 });

    const start = Date.now();
    let err: unknown;
    try {
      for await (const _c of iter) {
        // no-op
      }
    } catch (e) {
      err = e;
    }
    const elapsed = Date.now() - start;

    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/timed out/i);
    expect(child.kill).toHaveBeenCalled();
    expect(elapsed).toBeLessThan(50 + 200);
  });

  it("honors external abort signal", async () => {
    const child = makeFakeChild();
    spawnMock.mockReturnValue(child);

    const controller = new AbortController();
    const iter = runClaudeStreaming({
      prompt: "x",
      signal: controller.signal,
      timeoutMs: 10_000,
    });

    // Abort shortly after starting
    setTimeout(() => controller.abort(), 10);

    let err: unknown;
    try {
      for await (const _c of iter) {
        // no-op
      }
    } catch (e) {
      err = e;
    }

    expect(child.kill).toHaveBeenCalled();
    expect(err).toBeInstanceOf(Error);
  });

  it("strips CLAUDECODE from the subprocess env", async () => {
    const child = makeFakeChild();
    spawnMock.mockReturnValue(child);

    // Ensure CLAUDECODE is set in the parent env
    const prev = process.env.CLAUDECODE;
    process.env.CLAUDECODE = "1";

    const iter = runClaudeStreaming({ prompt: "x" });
    // Start consuming so spawn actually fires
    const consume = (async () => {
      try {
        for await (const _c of iter) {
          // no-op
        }
      } catch {
        /* ignore */
      }
    })();

    // Let the generator reach spawn
    await Promise.resolve();
    queueMicrotask(() => child.emit("close", 0));
    await consume;

    expect(spawnMock).toHaveBeenCalled();
    const callArgs = spawnMock.mock.calls[0];
    const options = callArgs[2] as { env: Record<string, string | undefined> };
    expect(options.env).toBeDefined();
    expect(options.env.CLAUDECODE).toBeUndefined();

    // restore
    if (prev === undefined) delete process.env.CLAUDECODE;
    else process.env.CLAUDECODE = prev;
  });

  it("passes stream-json flags without --no-session-persistence", async () => {
    const child = makeFakeChild();
    spawnMock.mockReturnValue(child);

    const iter = runClaudeStreaming({ prompt: "hello" });
    const consume = (async () => {
      try {
        for await (const _c of iter) {
          // no-op
        }
      } catch {
        /* ignore */
      }
    })();
    await Promise.resolve();
    queueMicrotask(() => child.emit("close", 0));
    await consume;

    expect(spawnMock).toHaveBeenCalled();
    const [cmd, args] = spawnMock.mock.calls[0];
    expect(cmd).toBe("claude");
    expect(args).toContain("-p");
    expect(args).toContain("hello");
    // --no-session-persistence was removed so the CLI writes its own JSONL
    expect(args).not.toContain("--no-session-persistence");
    expect(args).toContain("--output-format");
    expect(args).toContain("stream-json");
    // Regression: `claude -p --output-format stream-json` exits 1 without
    // --verbose. Bug C shipped because this assertion was missing.
    expect(args).toContain("--verbose");
  });
});
