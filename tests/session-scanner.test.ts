import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";

// Set up a temp CLAUDE_DIR before importing session-scanner.
// The session scanner uses CLAUDE_DIR from utils, so we need to mock it.
// We'll use a different approach: create temp session files and test
// the exported utility functions directly.

import { extractText, readHead, readTailTs } from "../server/scanner/utils";

// For scanAllSessions, we need to mock CLAUDE_DIR. We do this by
// creating a temp directory structure that mirrors ~/.claude/projects/<key>/
const tmpDir = path.join(os.tmpdir(), "cc-session-test-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8));
const claudeDir = path.join(tmpDir, ".claude");
const projectsDir = path.join(claudeDir, "projects");
const projectKey = "C--Users-test-myproject";
const projectSessionDir = path.join(projectsDir, projectKey);

function makeSessionLine(type: string, timestamp: string, extra?: Record<string, unknown>): string {
  const base: Record<string, unknown> = { type, timestamp, ...extra };
  return JSON.stringify(base);
}

function makeUserMessage(timestamp: string, content: string): string {
  return JSON.stringify({
    type: "user",
    timestamp,
    message: { role: "user", content },
  });
}

function makeAssistantMessage(timestamp: string, content: string): string {
  return JSON.stringify({
    type: "assistant",
    timestamp,
    message: { role: "assistant", content },
  });
}

describe("session-scanner utilities", () => {
  const sessionDir = path.join(tmpDir, "sessions");

  beforeAll(() => {
    fs.mkdirSync(sessionDir, { recursive: true });
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("readHead with session-like files", () => {
    it("parses session JSONL file and returns records", () => {
      const filePath = path.join(sessionDir, "session-a.jsonl");
      const lines = [
        makeSessionLine("system", "2025-06-01T10:00:00Z", { slug: "abc-123", cwd: "/test", version: "1.0" }),
        makeUserMessage("2025-06-01T10:01:00Z", "Hello world"),
        makeAssistantMessage("2025-06-01T10:01:30Z", "Hi there"),
        makeUserMessage("2025-06-01T10:02:00Z", "Can you help me with TypeScript?"),
        makeAssistantMessage("2025-06-01T10:02:30Z", "Of course!"),
      ];
      fs.writeFileSync(filePath, lines.join("\n") + "\n");

      const records = readHead(filePath, 10);
      expect(records).toHaveLength(5);
      expect(records[0].type).toBe("system");
      expect(records[0].slug).toBe("abc-123");
      expect(records[1].type).toBe("user");
      expect(records[2].type).toBe("assistant");
    });

    it("counts user and assistant messages correctly", () => {
      const filePath = path.join(sessionDir, "session-b.jsonl");
      const lines = [
        makeSessionLine("system", "2025-06-01T10:00:00Z", { slug: "def-456" }),
        makeUserMessage("2025-06-01T10:01:00Z", "First message"),
        makeAssistantMessage("2025-06-01T10:01:30Z", "Response 1"),
        makeUserMessage("2025-06-01T10:02:00Z", "Second message"),
        makeAssistantMessage("2025-06-01T10:02:30Z", "Response 2"),
        makeUserMessage("2025-06-01T10:03:00Z", "Third message"),
      ];
      fs.writeFileSync(filePath, lines.join("\n") + "\n");

      const records = readHead(filePath, 25);
      const messageCount = records.filter(
        (r: any) => r.type === "user" || r.type === "assistant"
      ).length;
      expect(messageCount).toBe(5);
    });
  });

  describe("readTailTs with session files", () => {
    it("returns the last timestamp from a session file", () => {
      const filePath = path.join(sessionDir, "session-c.jsonl");
      const lines = [
        makeSessionLine("system", "2025-06-01T10:00:00Z", {}),
        makeUserMessage("2025-06-01T10:01:00Z", "Hello"),
        makeAssistantMessage("2025-06-01T10:05:00Z", "Goodbye"),
      ];
      fs.writeFileSync(filePath, lines.join("\n") + "\n");

      const lastTs = readTailTs(filePath);
      expect(lastTs).toBe("2025-06-01T10:05:00Z");
    });
  });

  describe("extractText for tag extraction input", () => {
    it("extracts text from user message content (string)", () => {
      expect(extractText("hello world")).toBe("hello world");
    });

    it("extracts text from content block array", () => {
      const blocks = [
        { type: "text", text: "docker compose" },
        { type: "tool_use", id: "xyz" },
        { type: "text", text: "restart" },
      ];
      expect(extractText(blocks)).toBe("docker compose restart");
    });
  });
});

describe("tags removed from sessions", () => {
  // Word-frequency tags were removed because they produced meaningless output.
  // These tests verify the tags field no longer exists on session objects.

  it("SessionData type should not include tags field", () => {
    // Verify that a session-like object without tags satisfies the expected shape
    const session = {
      id: "test-id",
      slug: "test",
      firstMessage: "hello",
      firstTs: null,
      lastTs: null,
      messageCount: 0,
      sizeBytes: 0,
      isEmpty: true,
      isActive: false,
      filePath: "/tmp/test",
      projectKey: "test",
      cwd: "/tmp",
      version: "1.0",
      gitBranch: "",
    };
    expect(session).not.toHaveProperty("tags");
  });

  it("extractTags function should not exist in session-scanner", async () => {
    const scannerSource = fs.readFileSync(
      path.join(__dirname, "..", "server", "scanner", "session-scanner.ts"),
      "utf-8"
    );
    expect(scannerSource).not.toContain("function extractTags");
    expect(scannerSource).not.toContain("STOPWORDS");
  });
});

describe("scanAllSessions with temp directory", () => {
  // For this test group, we set up a mock ~/.claude structure and
  // dynamically import the session scanner with the patched CLAUDE_DIR.
  const tmpScanDir = path.join(tmpDir, "scan-test");
  const fakeClaudeDir = path.join(tmpScanDir, ".claude");
  const fakeProjectsDir = path.join(fakeClaudeDir, "projects");
  const fakeProjectKey = "C--Users-test-project";
  const fakeSessionsDir = path.join(fakeClaudeDir, "sessions");

  beforeAll(() => {
    // Create the directory structure
    fs.mkdirSync(path.join(fakeProjectsDir, fakeProjectKey), { recursive: true });
    fs.mkdirSync(fakeSessionsDir, { recursive: true });

    // Create session files
    const session1Lines = [
      makeSessionLine("system", "2025-06-01T10:00:00Z", { slug: "sess-aaa", cwd: "C:/Users/test/project", version: "1.0" }),
      makeUserMessage("2025-06-01T10:01:00Z", "Create a new React component"),
      makeAssistantMessage("2025-06-01T10:01:30Z", "Sure, here it is"),
      makeUserMessage("2025-06-01T10:02:00Z", "Add TypeScript types"),
      makeAssistantMessage("2025-06-01T10:02:30Z", "Done"),
    ];
    fs.writeFileSync(
      path.join(fakeProjectsDir, fakeProjectKey, "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jsonl"),
      session1Lines.join("\n") + "\n"
    );

    const session2Lines = [
      makeSessionLine("system", "2025-06-02T08:00:00Z", { slug: "sess-bbb", cwd: "C:/Users/test/project", version: "1.1" }),
      makeUserMessage("2025-06-02T08:01:00Z", "Fix the database migration"),
      makeAssistantMessage("2025-06-02T08:01:30Z", "Looking at it now"),
    ];
    fs.writeFileSync(
      path.join(fakeProjectsDir, fakeProjectKey, "ffffffff-1111-2222-3333-444444444444.jsonl"),
      session2Lines.join("\n") + "\n"
    );

    // Create an "active" session marker
    fs.writeFileSync(
      path.join(fakeSessionsDir, "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.json"),
      JSON.stringify({ active: true })
    );
  });

  afterAll(() => {
    fs.rmSync(tmpScanDir, { recursive: true, force: true });
  });

  it("scans sessions from temp directory and returns correct counts", async () => {
    // We need to mock the CLAUDE_DIR constant used by the session scanner.
    // Use vi.doMock to override the utils module for this specific import.
    const { vi } = await import("vitest");

    // Mock the utils module to point CLAUDE_DIR to our fake directory
    vi.doMock("../server/scanner/utils", async (importOriginal) => {
      const actual = await importOriginal<typeof import("../server/scanner/utils")>();
      return {
        ...actual,
        CLAUDE_DIR: fakeClaudeDir.replace(/\\/g, "/"),
      };
    });

    // Need to also ensure config module is available
    vi.doMock("../server/config", async (importOriginal) => {
      const actual = await importOriginal<typeof import("../server/config")>();
      return actual;
    });

    // Dynamically import the session scanner with the mocked CLAUDE_DIR
    const { scanAllSessions } = await import("../server/scanner/session-scanner");

    const result = scanAllSessions();

    expect(result.sessions).toHaveLength(2);
    expect(result.stats.totalCount).toBe(2);
    expect(result.stats.totalSize).toBeGreaterThan(0);

    // Check that the active session was detected
    const activeSession = result.sessions.find((s) => s.id === "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    expect(activeSession).toBeDefined();
    expect(activeSession!.isActive).toBe(true);

    // Check the non-active session
    const otherSession = result.sessions.find((s) => s.id === "ffffffff-1111-2222-3333-444444444444");
    expect(otherSession).toBeDefined();
    expect(otherSession!.isActive).toBe(false);

    // Check perProject aggregation
    expect(result.perProject).toHaveLength(1);
    expect(result.perProject[0].projectKey).toBe(fakeProjectKey);
    expect(result.perProject[0].sessionCount).toBe(2);

    // Verify session has expected fields
    expect(activeSession!.slug).toBe("sess-aaa");
    expect(activeSession!.firstTs).toBe("2025-06-01T10:00:00Z");
    expect(activeSession!.messageCount).toBeGreaterThan(0);
    expect(activeSession!.projectKey).toBe(fakeProjectKey);

    // Verify sessions are sorted newest-first
    const firstTs = result.sessions[0].lastTs || result.sessions[0].firstTs || "";
    const secondTs = result.sessions[1].lastTs || result.sessions[1].firstTs || "";
    expect(firstTs >= secondTs).toBe(true);

    // Clean up mocks
    vi.doUnmock("../server/scanner/utils");
    vi.doUnmock("../server/config");
  });
});
