import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { deepSearch } from "../server/scanner/deep-search";
import type { SessionData, SessionSummary } from "../shared/types";

const tmpDir = path.join(os.tmpdir(), "cc-deep-search-test-" + Date.now());

function makeSession(id: string, filePath: string, overrides: Partial<SessionData> = {}): SessionData {
  return {
    id,
    slug: id,
    firstMessage: "test",
    firstTs: "2024-01-01T00:00:00Z",
    lastTs: "2024-01-01T00:05:00Z",
    messageCount: 2,
    sizeBytes: 100,
    isEmpty: false,
    isActive: false,
    filePath,
    projectKey: "test-project",
    cwd: "/tmp/test-project",
    version: "1.0",
    gitBranch: "main",
    ...overrides,
  } as SessionData;
}

function writeJsonl(filename: string, lines: object[]): string {
  const filePath = path.join(tmpDir, filename);
  fs.writeFileSync(filePath, lines.map(l => JSON.stringify(l)).join("\n") + "\n");
  return filePath;
}

beforeAll(() => {
  fs.mkdirSync(tmpDir, { recursive: true });
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("deepSearch", () => {
  it("finds matches across sessions", async () => {
    const file1 = writeJsonl("session1.jsonl", [
      { type: "user", timestamp: "2024-01-01T00:00:00Z", message: { role: "user", content: "How do I fix the auth bug?" } },
      { type: "assistant", timestamp: "2024-01-01T00:01:00Z", message: { role: "assistant", content: [{ type: "text", text: "The auth bug is caused by expired tokens." }] } },
    ]);
    const file2 = writeJsonl("session2.jsonl", [
      { type: "user", timestamp: "2024-01-02T00:00:00Z", message: { role: "user", content: "Tell me about the auth flow" } },
    ]);

    const sessions = [
      makeSession("s1", file1),
      makeSession("s2", file2),
    ];

    const result = await deepSearch({ query: "auth", sessions });
    expect(result.results.length).toBe(2);
    expect(result.totalMatches).toBeGreaterThanOrEqual(2);
  });

  it("returns empty results for no matches", async () => {
    const file = writeJsonl("no-match.jsonl", [
      { type: "user", timestamp: "2024-01-01T00:00:00Z", message: { role: "user", content: "Hello world" } },
    ]);

    const sessions = [makeSession("no-match", file)];
    const result = await deepSearch({ query: "zzz_nonexistent_zzz", sessions });
    expect(result.results.length).toBe(0);
    expect(result.totalMatches).toBe(0);
  });

  it("filters by field=user (only user messages)", async () => {
    const file = writeJsonl("field-user.jsonl", [
      { type: "user", timestamp: "2024-01-01T00:00:00Z", message: { role: "user", content: "Fix the database" } },
      { type: "assistant", timestamp: "2024-01-01T00:01:00Z", message: { role: "assistant", content: [{ type: "text", text: "The database issue is..." }] } },
    ]);

    const sessions = [makeSession("field-user", file)];
    const result = await deepSearch({ query: "database", sessions, field: "user" });
    expect(result.results.length).toBe(1);
    // All matches should be from user role
    for (const r of result.results) {
      for (const m of r.matches) {
        expect(m.role).toBe("user");
      }
    }
  });

  it("filters by field=assistant (only assistant messages)", async () => {
    const file = writeJsonl("field-assistant.jsonl", [
      { type: "user", timestamp: "2024-01-01T00:00:00Z", message: { role: "user", content: "Fix the routing" } },
      { type: "assistant", timestamp: "2024-01-01T00:01:00Z", message: { role: "assistant", content: [{ type: "text", text: "The routing issue is..." }] } },
    ]);

    const sessions = [makeSession("field-assistant", file)];
    const result = await deepSearch({ query: "routing", sessions, field: "assistant" });
    expect(result.results.length).toBe(1);
    for (const r of result.results) {
      for (const m of r.matches) {
        expect(m.role).toBe("assistant");
      }
    }
  });

  it("performs case-insensitive search", async () => {
    const file = writeJsonl("case-insensitive.jsonl", [
      { type: "user", timestamp: "2024-01-01T00:00:00Z", message: { role: "user", content: "UPPERCASE keyword here" } },
    ]);

    const sessions = [makeSession("case-test", file)];
    const result = await deepSearch({ query: "uppercase", sessions });
    expect(result.results.length).toBe(1);
  });

  it("respects limit parameter", async () => {
    // Create 5 sessions each matching the query
    const sessions: SessionData[] = [];
    for (let i = 0; i < 5; i++) {
      const file = writeJsonl(`limit-${i}.jsonl`, [
        { type: "user", timestamp: "2024-01-01T00:00:00Z", message: { role: "user", content: "limit test query match" } },
      ]);
      sessions.push(makeSession(`limit-${i}`, file));
    }

    const result = await deepSearch({ query: "limit test", sessions, limit: 2 });
    expect(result.results.length).toBe(2);
    // totalMatches should still reflect all matches found
    expect(result.totalMatches).toBeGreaterThanOrEqual(5);
  });

  it("reports search stats (totalSessions, searchedSessions, durationMs)", async () => {
    const file = writeJsonl("stats.jsonl", [
      { type: "user", timestamp: "2024-01-01T00:00:00Z", message: { role: "user", content: "stats test" } },
    ]);

    const emptySession = makeSession("empty-stats", file, { isEmpty: true });
    const activeSession = makeSession("active-stats", file);

    const result = await deepSearch({ query: "stats", sessions: [emptySession, activeSession] });
    expect(result.totalSessions).toBe(2);
    // Empty sessions are filtered out
    expect(result.searchedSessions).toBe(1);
    expect(typeof result.durationMs).toBe("number");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("handles malformed JSONL gracefully (mix of valid and invalid lines)", async () => {
    const filePath = path.join(tmpDir, "malformed.jsonl");
    const lines = [
      JSON.stringify({ type: "user", timestamp: "2024-01-01T00:00:00Z", message: { role: "user", content: "valid line with searchterm" } }),
      "this is not valid JSON {{{",
      "",
      JSON.stringify({ type: "assistant", timestamp: "2024-01-01T00:01:00Z", message: { role: "assistant", content: [{ type: "text", text: "another valid searchterm" }] } }),
    ];
    fs.writeFileSync(filePath, lines.join("\n") + "\n");

    const sessions = [makeSession("malformed", filePath)];
    const result = await deepSearch({ query: "searchterm", sessions });
    // Should find matches in the valid lines and skip the invalid ones
    expect(result.results.length).toBe(1);
    expect(result.results[0].matchCount).toBe(2);
  });

  it("handles empty sessions (isEmpty=true filtered out)", async () => {
    const file = writeJsonl("empty-session.jsonl", [
      { type: "user", timestamp: "2024-01-01T00:00:00Z", message: { role: "user", content: "should not be searched" } },
    ]);

    const sessions = [makeSession("empty-only", file, { isEmpty: true })];
    const result = await deepSearch({ query: "should", sessions });
    expect(result.results.length).toBe(0);
    expect(result.searchedSessions).toBe(0);
  });

  it("searches summary text when summaries are provided", async () => {
    const file = writeJsonl("summary-search.jsonl", [
      { type: "user", timestamp: "2024-01-01T00:00:00Z", message: { role: "user", content: "unrelated message" } },
    ]);

    const sessions = [makeSession("summary-session", file)];
    const summaries: Record<string, SessionSummary> = {
      "summary-session": {
        sessionId: "summary-session",
        summary: "This session was about refactoring the authentication module",
        topics: ["auth", "refactoring"],
        toolsUsed: [],
        outcome: "completed",
        filesModified: [],
        generatedAt: "2024-01-02T00:00:00Z",
        model: "claude-3",
      },
    };

    const result = await deepSearch({ query: "authentication module", sessions, summaries });
    expect(result.results.length).toBe(1);
    // The match should come from the summary
    const summaryMatch = result.results[0].matches.find(m => m.text.includes("[Summary]"));
    expect(summaryMatch).toBeDefined();
  });

  it("filters by project parameter", async () => {
    const file1 = writeJsonl("proj-a.jsonl", [
      { type: "user", timestamp: "2024-01-01T00:00:00Z", message: { role: "user", content: "keyword match" } },
    ]);
    const file2 = writeJsonl("proj-b.jsonl", [
      { type: "user", timestamp: "2024-01-01T00:00:00Z", message: { role: "user", content: "keyword match" } },
    ]);

    const sessions = [
      makeSession("p1", file1, { projectKey: "my-app", cwd: "/projects/my-app" }),
      makeSession("p2", file2, { projectKey: "other-app", cwd: "/projects/other-app" }),
    ];

    const result = await deepSearch({ query: "keyword", sessions, project: "my-app" });
    expect(result.results.length).toBe(1);
    expect(result.results[0].sessionId).toBe("p1");
  });

  it("handles assistant content as string", async () => {
    const file = writeJsonl("assistant-string.jsonl", [
      { type: "assistant", timestamp: "2024-01-01T00:01:00Z", message: { role: "assistant", content: "plain string response with target" } },
    ]);

    const sessions = [makeSession("str-content", file)];
    const result = await deepSearch({ query: "target", sessions });
    expect(result.results.length).toBe(1);
  });
});
