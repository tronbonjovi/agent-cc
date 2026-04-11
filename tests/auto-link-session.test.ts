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
// Tests
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
    expect(result).toBe("sess-001");
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
    // Session starts within 10 minutes of task updated, and touches both files
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
    // file overlap: 2/2 * 0.3 = 0.3, timing: 0.2, total = 0.5
    expect(result).toBe("sess-002");
  });

  it("picks highest-scoring session when multiple match", () => {
    const task = makeTask();
    const sessions = new Map<string, ParsedSession>([
      // Weak match: only milestone name in branch (0.2)
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
    expect(result).toBe("sess-strong");
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

  it("matches milestone name in branch as weak signal (score 0.2) combined with file overlap", () => {
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
    // milestone: 0.2, file overlap: 1/1 * 0.3 = 0.3, total = 0.5
    expect(result).toBe("sess-ms");
  });
});
