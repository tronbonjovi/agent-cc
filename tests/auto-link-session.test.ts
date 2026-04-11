// tests/auto-link-session.test.ts
import { describe, it, expect } from "vitest";
import type { TaskItem } from "../shared/task-types";
import type { ParsedSession } from "../shared/session-types";
import { autoLinkSession } from "../server/board/session-enricher";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTask(overrides: Partial<TaskItem> = {}): TaskItem {
  return {
    id: "TASK-042",
    title: "Implement parser cache",
    type: "task",
    status: "in-progress",
    parent: "scanner-deepening",
    labels: ["touches:server/scanner/session-parser.ts", "touches:server/scanner/session-cache.ts"],
    created: "2026-04-10T08:00:00.000Z",
    updated: "2026-04-10T12:00:00.000Z",
    body: "",
    filePath: ".claude/roadmap/scanner-deepening/task-042.md",
    ...overrides,
  };
}

function makeAssistantMessage(textPreview: string): ParsedSession["assistantMessages"][0] {
  return {
    uuid: "msg-001",
    parentUuid: "",
    timestamp: "2026-04-10T12:10:00.000Z",
    requestId: "req-001",
    isSidechain: false,
    model: "claude-sonnet-4-5-20250514",
    stopReason: "end_turn",
    usage: {
      inputTokens: 100,
      outputTokens: 50,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      serviceTier: "default",
      inferenceGeo: "us",
      speed: "normal",
      serverToolUse: { webSearchRequests: 0, webFetchRequests: 0 },
    },
    toolCalls: [],
    hasThinking: false,
    textPreview,
  };
}

function makeUserMessage(textPreview: string): ParsedSession["userMessages"][0] {
  return {
    uuid: "umsg-001",
    parentUuid: "",
    timestamp: "2026-04-10T12:09:00.000Z",
    isSidechain: false,
    isMeta: false,
    permissionMode: null,
    toolResults: [],
    textPreview,
  };
}

function makeParsedForAutoLink(overrides: Partial<ParsedSession> & { meta?: Partial<ParsedSession["meta"]> } = {}): ParsedSession {
  const { meta: metaOverrides, ...rest } = overrides;
  return {
    meta: {
      sessionId: "sess-001",
      slug: "test-session",
      firstMessage: "Hello",
      firstTs: "2026-04-10T12:00:00.000Z",
      lastTs: "2026-04-10T12:30:00.000Z",
      sizeBytes: 2048,
      filePath: "/tmp/fake.jsonl",
      projectKey: "my-project",
      cwd: "/home/user/project",
      version: "1.0.0",
      gitBranch: "main",
      entrypoint: "cli",
      ...metaOverrides,
    },
    assistantMessages: [],
    userMessages: [],
    systemEvents: {
      turnDurations: [],
      hookSummaries: [],
      localCommands: [],
      bridgeEvents: [],
    },
    toolTimeline: [],
    fileSnapshots: [],
    lifecycle: [],
    conversationTree: [],
    counts: {
      totalRecords: 0,
      assistantMessages: 0,
      userMessages: 0,
      systemEvents: 0,
      toolCalls: 0,
      toolErrors: 0,
      fileSnapshots: 0,
      sidechainMessages: 0,
    },
    ...rest,
  };
}

// ---------------------------------------------------------------------------
// Tests — existing behavior (adapted for new return type)
// ---------------------------------------------------------------------------

describe("autoLinkSession", () => {
  it("matches by git branch containing task ID (score >= 0.5)", () => {
    const task = makeTask();
    const sessions = new Map<string, ParsedSession>([
      ["sess-001", makeParsedForAutoLink({
        meta: { sessionId: "sess-001", gitBranch: "TASK-042-implement-parser" },
      })],
    ]);

    const result = autoLinkSession(task, sessions);
    expect(result).not.toBeNull();
    expect(result!.sessionId).toBe("sess-001");
    expect(result!.score).toBeGreaterThanOrEqual(0.5);
    expect(result!.signals).toBeDefined();
    expect(result!.signals.find(s => s.name === "branch-task-id")?.matched).toBe(true);
  });

  it("returns null when no sessions match above threshold", () => {
    const task = makeTask({ labels: [] });
    const sessions = new Map<string, ParsedSession>([
      ["sess-001", makeParsedForAutoLink({
        meta: { sessionId: "sess-001", gitBranch: "unrelated-feature" },
      })],
    ]);

    const result = autoLinkSession(task, sessions);
    expect(result).toBeNull();
  });

  it("matches by file path overlap + timing when branch doesn't match", () => {
    const task = makeTask({
      updated: "2026-04-10T12:00:00.000Z",
    });
    const sessions = new Map<string, ParsedSession>([
      ["sess-002", makeParsedForAutoLink({
        meta: {
          sessionId: "sess-002",
          gitBranch: "unrelated-branch",
          firstTs: "2026-04-10T12:05:00.000Z",
          lastTs: "2026-04-10T12:30:00.000Z",
        },
        toolTimeline: [
          {
            callId: "call-1",
            name: "Edit",
            filePath: "server/scanner/session-parser.ts",
            command: null,
            pattern: null,
            timestamp: "2026-04-10T12:06:00.000Z",
            resultTimestamp: "2026-04-10T12:06:01.000Z",
            durationMs: 100,
            isError: false,
            isSidechain: false,
          },
          {
            callId: "call-2",
            name: "Edit",
            filePath: "server/scanner/session-cache.ts",
            command: null,
            pattern: null,
            timestamp: "2026-04-10T12:07:00.000Z",
            resultTimestamp: "2026-04-10T12:07:01.000Z",
            durationMs: 100,
            isError: false,
            isSidechain: false,
          },
        ],
      })],
    ]);

    const result = autoLinkSession(task, sessions);
    expect(result).not.toBeNull();
    expect(result!.sessionId).toBe("sess-002");
    // file overlap: 2/2 * 0.3 = 0.3, timing: 0.2, total = 0.5
    expect(result!.score).toBeGreaterThanOrEqual(0.5);
  });

  it("picks highest-scoring session when multiple match", () => {
    const task = makeTask();
    const sessions = new Map<string, ParsedSession>([
      // Weak match: only milestone name in branch (0.2) — but scanner-deepening > 4 chars
      ["sess-weak", makeParsedForAutoLink({
        meta: {
          sessionId: "sess-weak",
          gitBranch: "scanner-deepening/something-else",
          lastTs: "2026-04-10T13:00:00.000Z",
        },
      })],
      // Strong match: task ID in branch (0.5)
      ["sess-strong", makeParsedForAutoLink({
        meta: {
          sessionId: "sess-strong",
          gitBranch: "TASK-042-implement-parser",
          lastTs: "2026-04-10T12:30:00.000Z",
        },
      })],
    ]);

    const result = autoLinkSession(task, sessions);
    expect(result).not.toBeNull();
    expect(result!.sessionId).toBe("sess-strong");
  });

  it("returns null when task has no labels and no branch match", () => {
    const task = makeTask({ labels: [], parent: undefined, id: "TASK-099" });
    const sessions = new Map<string, ParsedSession>([
      ["sess-001", makeParsedForAutoLink({
        meta: { sessionId: "sess-001", gitBranch: "feature/add-tests" },
      })],
    ]);

    const result = autoLinkSession(task, sessions);
    expect(result).toBeNull();
  });

  it("matches milestone name in branch as weak signal combined with file overlap", () => {
    const task = makeTask({
      parent: "scanner-deepening",
      labels: ["touches:server/scanner/session-parser.ts"],
    });
    const sessions = new Map<string, ParsedSession>([
      ["sess-ms", makeParsedForAutoLink({
        meta: {
          sessionId: "sess-ms",
          gitBranch: "scanner-deepening/cache-layer",
          lastTs: "2026-04-10T12:30:00.000Z",
        },
        toolTimeline: [
          {
            callId: "call-1",
            name: "Edit",
            filePath: "server/scanner/session-parser.ts",
            command: null,
            pattern: null,
            timestamp: "2026-04-10T12:06:00.000Z",
            resultTimestamp: "2026-04-10T12:06:01.000Z",
            durationMs: 100,
            isError: false,
            isSidechain: false,
          },
        ],
      })],
    ]);

    const result = autoLinkSession(task, sessions);
    expect(result).not.toBeNull();
    expect(result!.sessionId).toBe("sess-ms");
    // milestone: 0.2, file overlap: 1/1 * 0.3 = 0.3, total = 0.5
    expect(result!.score).toBeGreaterThanOrEqual(0.5);
  });

  // ---------------------------------------------------------------------------
  // New signal tests
  // ---------------------------------------------------------------------------

  describe("signal: command invocation", () => {
    it("matches when session has /work-task command", () => {
      const task = makeTask();
      const sessions = new Map<string, ParsedSession>([
        ["sess-cmd", makeParsedForAutoLink({
          meta: {
            sessionId: "sess-cmd",
            gitBranch: "TASK-042-work",
          },
          systemEvents: {
            turnDurations: [],
            hookSummaries: [],
            localCommands: [{ timestamp: "2026-04-10T12:00:00.000Z", content: "/work-task TASK-042" }],
            bridgeEvents: [],
          },
        })],
      ]);

      const result = autoLinkSession(task, sessions);
      expect(result).not.toBeNull();
      // branch-task-id (0.5) + command-invocation (0.15)
      expect(result!.score).toBeGreaterThanOrEqual(0.65);
      expect(result!.signals.find(s => s.name === "command-invocation")?.matched).toBe(true);
    });

    it("matches when command content contains task ID", () => {
      const task = makeTask();
      const sessions = new Map<string, ParsedSession>([
        ["sess-cmd2", makeParsedForAutoLink({
          meta: {
            sessionId: "sess-cmd2",
            gitBranch: "TASK-042-feature",
          },
          systemEvents: {
            turnDurations: [],
            hookSummaries: [],
            localCommands: [{ timestamp: "2026-04-10T12:00:00.000Z", content: "working on task-042 now" }],
            bridgeEvents: [],
          },
        })],
      ]);

      const result = autoLinkSession(task, sessions);
      expect(result).not.toBeNull();
      expect(result!.signals.find(s => s.name === "command-invocation")?.matched).toBe(true);
    });
  });

  describe("signal: message content", () => {
    it("matches when assistant message mentions task ID", () => {
      const task = makeTask();
      const sessions = new Map<string, ParsedSession>([
        ["sess-msg", makeParsedForAutoLink({
          meta: {
            sessionId: "sess-msg",
            gitBranch: "TASK-042-impl",
          },
          assistantMessages: [makeAssistantMessage("Working on TASK-042 parser cache implementation")],
        })],
      ]);

      const result = autoLinkSession(task, sessions);
      expect(result).not.toBeNull();
      expect(result!.signals.find(s => s.name === "message-content")?.matched).toBe(true);
      // branch (0.5) + message (0.2)
      expect(result!.score).toBeGreaterThanOrEqual(0.7);
    });

    it("matches when user message mentions task title", () => {
      const task = makeTask({ title: "Implement parser cache" });
      const sessions = new Map<string, ParsedSession>([
        ["sess-umsg", makeParsedForAutoLink({
          meta: {
            sessionId: "sess-umsg",
            gitBranch: "TASK-042-work",
          },
          userMessages: [makeUserMessage("let's implement parser cache for sessions")],
        })],
      ]);

      const result = autoLinkSession(task, sessions);
      expect(result).not.toBeNull();
      expect(result!.signals.find(s => s.name === "message-content")?.matched).toBe(true);
    });

    it("does not match short title substrings (title <= 4 chars)", () => {
      const task = makeTask({ title: "Fix" });
      const sessions = new Map<string, ParsedSession>([
        ["sess-short", makeParsedForAutoLink({
          meta: {
            sessionId: "sess-short",
            gitBranch: "unrelated-branch",
          },
          userMessages: [makeUserMessage("need to fix the parser for this project")],
        })],
      ]);

      const result = autoLinkSession(task, sessions);
      // Title "Fix" is <= 4 chars so title match is skipped, only task ID match checked
      // No branch match, no task ID in messages — should be null
      expect(result).toBeNull();
    });
  });

  describe("signal: directory-level file matching", () => {
    it("matches session files under a directory touch path", () => {
      const task = makeTask({
        labels: ["touches:server/scanner"],
        updated: "2026-04-10T12:05:00.000Z",
      });
      const sessions = new Map<string, ParsedSession>([
        ["sess-dir", makeParsedForAutoLink({
          meta: {
            sessionId: "sess-dir",
            gitBranch: "unrelated-branch",
            firstTs: "2026-04-10T12:00:00.000Z",
            lastTs: "2026-04-10T13:00:00.000Z",
          },
          toolTimeline: [
            {
              callId: "call-1",
              name: "Edit",
              filePath: "server/scanner/some-new-file.ts",
              command: null,
              pattern: null,
              timestamp: "2026-04-10T12:06:00.000Z",
              resultTimestamp: "2026-04-10T12:06:01.000Z",
              durationMs: 100,
              isError: false,
              isSidechain: false,
            },
          ],
        })],
      ]);

      const result = autoLinkSession(task, sessions);
      expect(result).not.toBeNull();
      // file overlap (0.3) + timing (0.2) = 0.5
      expect(result!.signals.find(s => s.name === "file-overlap")?.matched).toBe(true);
    });

    it("normalizes trailing slashes on directory paths", () => {
      const task = makeTask({
        labels: ["touches:server/scanner/"],
        updated: "2026-04-10T12:05:00.000Z",
      });
      const sessions = new Map<string, ParsedSession>([
        ["sess-slash", makeParsedForAutoLink({
          meta: {
            sessionId: "sess-slash",
            gitBranch: "unrelated-branch",
            firstTs: "2026-04-10T12:00:00.000Z",
            lastTs: "2026-04-10T13:00:00.000Z",
          },
          toolTimeline: [
            {
              callId: "call-1",
              name: "Edit",
              filePath: "server/scanner/file.ts",
              command: null,
              pattern: null,
              timestamp: "2026-04-10T12:06:00.000Z",
              resultTimestamp: "2026-04-10T12:06:01.000Z",
              durationMs: 100,
              isError: false,
              isSidechain: false,
            },
          ],
        })],
      ]);

      const result = autoLinkSession(task, sessions);
      expect(result).not.toBeNull();
      expect(result!.signals.find(s => s.name === "file-overlap")?.matched).toBe(true);
    });
  });

  describe("signal: timing — session-duration-aware", () => {
    it("matches when task.updated falls within session window", () => {
      const task = makeTask({
        labels: ["touches:server/scanner/session-parser.ts"],
        updated: "2026-04-10T12:15:00.000Z", // during session
      });
      const sessions = new Map<string, ParsedSession>([
        ["sess-active", makeParsedForAutoLink({
          meta: {
            sessionId: "sess-active",
            gitBranch: "unrelated",
            firstTs: "2026-04-10T12:00:00.000Z",
            lastTs: "2026-04-10T13:00:00.000Z",
          },
          toolTimeline: [
            {
              callId: "call-1",
              name: "Edit",
              filePath: "server/scanner/session-parser.ts",
              command: null,
              pattern: null,
              timestamp: "2026-04-10T12:06:00.000Z",
              resultTimestamp: "2026-04-10T12:06:01.000Z",
              durationMs: 100,
              isError: false,
              isSidechain: false,
            },
          ],
        })],
      ]);

      const result = autoLinkSession(task, sessions);
      expect(result).not.toBeNull();
      expect(result!.signals.find(s => s.name === "timing")?.matched).toBe(true);
    });

    it("matches when session started shortly after task update", () => {
      const task = makeTask({
        labels: ["touches:server/scanner/session-parser.ts"],
        updated: "2026-04-10T12:00:00.000Z",
      });
      const sessions = new Map<string, ParsedSession>([
        ["sess-after", makeParsedForAutoLink({
          meta: {
            sessionId: "sess-after",
            gitBranch: "unrelated",
            firstTs: "2026-04-10T12:08:00.000Z", // 8 minutes after task update
            lastTs: "2026-04-10T12:30:00.000Z",
          },
          toolTimeline: [
            {
              callId: "call-1",
              name: "Edit",
              filePath: "server/scanner/session-parser.ts",
              command: null,
              pattern: null,
              timestamp: "2026-04-10T12:09:00.000Z",
              resultTimestamp: "2026-04-10T12:09:01.000Z",
              durationMs: 100,
              isError: false,
              isSidechain: false,
            },
          ],
        })],
      ]);

      const result = autoLinkSession(task, sessions);
      expect(result).not.toBeNull();
      expect(result!.signals.find(s => s.name === "timing")?.matched).toBe(true);
    });

    it("does NOT match when session started long after task update", () => {
      const task = makeTask({ labels: [], updated: "2026-04-10T10:00:00.000Z" });
      const sessions = new Map<string, ParsedSession>([
        ["sess-late", makeParsedForAutoLink({
          meta: {
            sessionId: "sess-late",
            gitBranch: "unrelated",
            firstTs: "2026-04-10T14:00:00.000Z", // 4 hours later
            lastTs: "2026-04-10T15:00:00.000Z",
          },
        })],
      ]);

      const result = autoLinkSession(task, sessions);
      expect(result).toBeNull();
    });
  });

  describe("signal: milestone minimum length safety", () => {
    it("ignores milestone names <= 4 chars", () => {
      const task = makeTask({ parent: "fix", labels: [] });
      const sessions = new Map<string, ParsedSession>([
        ["sess-short-ms", makeParsedForAutoLink({
          meta: {
            sessionId: "sess-short-ms",
            gitBranch: "fix/something",
          },
        })],
      ]);

      const result = autoLinkSession(task, sessions);
      // "fix" is only 3 chars, milestone signal skipped
      // No other signals match above threshold
      expect(result).toBeNull();
    });

    it("matches milestone names > 4 chars", () => {
      const task = makeTask({
        parent: "scanner-deepening",
        labels: ["touches:server/scanner/session-parser.ts"],
      });
      const sessions = new Map<string, ParsedSession>([
        ["sess-long-ms", makeParsedForAutoLink({
          meta: {
            sessionId: "sess-long-ms",
            gitBranch: "scanner-deepening/cache-impl",
          },
          toolTimeline: [
            {
              callId: "call-1",
              name: "Edit",
              filePath: "server/scanner/session-parser.ts",
              command: null,
              pattern: null,
              timestamp: "2026-04-10T12:06:00.000Z",
              resultTimestamp: "2026-04-10T12:06:01.000Z",
              durationMs: 100,
              isError: false,
              isSidechain: false,
            },
          ],
        })],
      ]);

      const result = autoLinkSession(task, sessions);
      expect(result).not.toBeNull();
      expect(result!.signals.find(s => s.name === "branch-milestone")?.matched).toBe(true);
    });
  });

  describe("score breakdown", () => {
    it("returns all 6 signals in the breakdown", () => {
      const task = makeTask();
      const sessions = new Map<string, ParsedSession>([
        ["sess-full", makeParsedForAutoLink({
          meta: {
            sessionId: "sess-full",
            gitBranch: "TASK-042-work",
          },
        })],
      ]);

      const result = autoLinkSession(task, sessions);
      expect(result).not.toBeNull();
      expect(result!.signals).toHaveLength(6);
      const names = result!.signals.map(s => s.name);
      expect(names).toContain("branch-task-id");
      expect(names).toContain("branch-milestone");
      expect(names).toContain("file-overlap");
      expect(names).toContain("timing");
      expect(names).toContain("command-invocation");
      expect(names).toContain("message-content");
    });

    it("each signal has name, weight, and matched fields", () => {
      const task = makeTask();
      const sessions = new Map<string, ParsedSession>([
        ["sess-sig", makeParsedForAutoLink({
          meta: { sessionId: "sess-sig", gitBranch: "TASK-042" },
        })],
      ]);

      const result = autoLinkSession(task, sessions);
      expect(result).not.toBeNull();
      for (const signal of result!.signals) {
        expect(signal).toHaveProperty("name");
        expect(signal).toHaveProperty("weight");
        expect(signal).toHaveProperty("matched");
        expect(typeof signal.name).toBe("string");
        expect(typeof signal.weight).toBe("number");
        expect(typeof signal.matched).toBe("boolean");
      }
    });
  });
});
