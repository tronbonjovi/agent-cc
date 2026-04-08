import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import { readMessageTimeline } from "../server/scanner/utils";

// Helper to create a JSONL string from records
function toJSONL(records: unknown[]): string {
  return records.map((r) => JSON.stringify(r)).join("\n");
}

// We mock fs to control what readMessageTimeline reads
vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof import("fs")>("fs");
  return {
    ...actual,
    default: {
      ...actual,
      statSync: vi.fn(),
      openSync: vi.fn(),
      readSync: vi.fn(),
      closeSync: vi.fn(),
    },
    statSync: vi.fn(),
    openSync: vi.fn(),
    readSync: vi.fn(),
    closeSync: vi.fn(),
  };
});

function setupMockFile(content: string) {
  const buf = Buffer.from(content, "utf-8");
  (fs.statSync as any).mockReturnValue({ size: buf.length });
  (fs.openSync as any).mockReturnValue(42);
  (fs.readSync as any).mockImplementation(
    (fd: number, target: Buffer, offset: number, length: number, position: number) => {
      const slice = buf.slice(0, Math.min(length, buf.length));
      slice.copy(target, offset);
      return slice.length;
    },
  );
  (fs.closeSync as any).mockReturnValue(undefined);
}

describe("readMessageTimeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("extracts text from standard text content blocks", () => {
    const jsonl = toJSONL([
      {
        type: "user",
        timestamp: "2025-01-01T00:00:00Z",
        message: { role: "user", content: [{ type: "text", text: "Hello world" }] },
      },
    ]);
    setupMockFile(jsonl);
    const result = readMessageTimeline("/fake/path");
    expect(result).toHaveLength(1);
    expect(result[0].contentPreview).toBe("Hello world");
  });

  it("shows tool names for assistant messages with only tool_use blocks", () => {
    const jsonl = toJSONL([
      {
        type: "assistant",
        timestamp: "2025-01-01T00:00:00Z",
        message: {
          role: "assistant",
          content: [
            { type: "tool_use", id: "t1", name: "Read", input: { file_path: "/foo" } },
            { type: "tool_use", id: "t2", name: "Edit", input: {} },
            { type: "tool_use", id: "t3", name: "Bash", input: { command: "ls" } },
          ],
        },
      },
    ]);
    setupMockFile(jsonl);
    const result = readMessageTimeline("/fake/path");
    expect(result).toHaveLength(1);
    expect(result[0].contentPreview).toBe("Used: Read, Edit, Bash");
  });

  it("shows text portion for mixed text + tool_use messages", () => {
    const jsonl = toJSONL([
      {
        type: "assistant",
        timestamp: "2025-01-01T00:00:00Z",
        message: {
          role: "assistant",
          content: [
            { type: "text", text: "Let me read that file." },
            { type: "tool_use", id: "t1", name: "Read", input: {} },
          ],
        },
      },
    ]);
    setupMockFile(jsonl);
    const result = readMessageTimeline("/fake/path");
    expect(result).toHaveLength(1);
    expect(result[0].contentPreview).toBe("Let me read that file.");
  });

  it("extracts text from tool_result blocks", () => {
    const jsonl = toJSONL([
      {
        type: "user",
        timestamp: "2025-01-01T00:00:00Z",
        message: {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "t1",
              content: [{ type: "text", text: "file contents here" }],
            },
          ],
        },
      },
    ]);
    setupMockFile(jsonl);
    const result = readMessageTimeline("/fake/path");
    expect(result).toHaveLength(1);
    expect(result[0].contentPreview).toBe("[tool result] file contents here");
  });

  it("shows [tool result] for tool_result blocks with no text", () => {
    const jsonl = toJSONL([
      {
        type: "user",
        timestamp: "2025-01-01T00:00:00Z",
        message: {
          role: "user",
          content: [
            { type: "tool_result", tool_use_id: "t1", content: [] },
          ],
        },
      },
    ]);
    setupMockFile(jsonl);
    const result = readMessageTimeline("/fake/path");
    expect(result).toHaveLength(1);
    expect(result[0].contentPreview).toBe("[tool result]");
  });

  it("strips <system-reminder> tags from user messages", () => {
    const jsonl = toJSONL([
      {
        type: "user",
        timestamp: "2025-01-01T00:00:00Z",
        message: {
          role: "user",
          content: [
            {
              type: "text",
              text: "<system-reminder>Some internal stuff</system-reminder>What is the weather?",
            },
          ],
        },
      },
    ]);
    setupMockFile(jsonl);
    const result = readMessageTimeline("/fake/path");
    expect(result).toHaveLength(1);
    expect(result[0].contentPreview).toBe("What is the weather?");
    expect(result[0].contentPreview).not.toContain("system-reminder");
  });

  it("strips <command-name> and <command-message> tags from user messages", () => {
    const jsonl = toJSONL([
      {
        type: "user",
        timestamp: "2025-01-01T00:00:00Z",
        message: {
          role: "user",
          content: [
            {
              type: "text",
              text: "<command-name>brainstorm</command-name><command-message>some params</command-message>My actual question",
            },
          ],
        },
      },
    ]);
    setupMockFile(jsonl);
    const result = readMessageTimeline("/fake/path");
    expect(result).toHaveLength(1);
    expect(result[0].contentPreview).toBe("My actual question");
    expect(result[0].contentPreview).not.toContain("command-name");
    expect(result[0].contentPreview).not.toContain("command-message");
  });

  it("preserves normal user text without XML tags", () => {
    const jsonl = toJSONL([
      {
        type: "user",
        timestamp: "2025-01-01T00:00:00Z",
        message: {
          role: "user",
          content: [{ type: "text", text: "Just a normal message with no tags" }],
        },
      },
    ]);
    setupMockFile(jsonl);
    const result = readMessageTimeline("/fake/path");
    expect(result).toHaveLength(1);
    expect(result[0].contentPreview).toBe("Just a normal message with no tags");
  });

  it("handles string content directly", () => {
    const jsonl = toJSONL([
      {
        type: "user",
        timestamp: "2025-01-01T00:00:00Z",
        message: { role: "user", content: "Direct string content" },
      },
    ]);
    setupMockFile(jsonl);
    const result = readMessageTimeline("/fake/path");
    expect(result).toHaveLength(1);
    expect(result[0].contentPreview).toBe("Direct string content");
  });

  it("handles null/undefined content gracefully", () => {
    const jsonl = toJSONL([
      {
        type: "user",
        timestamp: "2025-01-01T00:00:00Z",
        message: { role: "user", content: null },
      },
      {
        type: "assistant",
        timestamp: "2025-01-01T00:00:01Z",
        message: { role: "assistant" },
      },
    ]);
    setupMockFile(jsonl);
    const result = readMessageTimeline("/fake/path");
    expect(result).toHaveLength(2);
    expect(result[0].contentPreview).toBe("");
    expect(result[1].contentPreview).toBe("");
  });

  it("handles empty content array", () => {
    const jsonl = toJSONL([
      {
        type: "assistant",
        timestamp: "2025-01-01T00:00:00Z",
        message: { role: "assistant", content: [] },
      },
    ]);
    setupMockFile(jsonl);
    const result = readMessageTimeline("/fake/path");
    expect(result).toHaveLength(1);
    expect(result[0].contentPreview).toBe("");
  });

  it("deduplicates tool names in preview", () => {
    const jsonl = toJSONL([
      {
        type: "assistant",
        timestamp: "2025-01-01T00:00:00Z",
        message: {
          role: "assistant",
          content: [
            { type: "tool_use", id: "t1", name: "Read", input: {} },
            { type: "tool_use", id: "t2", name: "Read", input: {} },
            { type: "tool_use", id: "t3", name: "Bash", input: {} },
          ],
        },
      },
    ]);
    setupMockFile(jsonl);
    const result = readMessageTimeline("/fake/path");
    expect(result[0].contentPreview).toBe("Used: Read, Bash");
  });

  it("strips system-reminder with multiline content", () => {
    const jsonl = toJSONL([
      {
        type: "user",
        timestamp: "2025-01-01T00:00:00Z",
        message: {
          role: "user",
          content: [
            {
              type: "text",
              text: "<system-reminder>\nMultiple\nlines\nof\nstuff\n</system-reminder>Actual user text",
            },
          ],
        },
      },
    ]);
    setupMockFile(jsonl);
    const result = readMessageTimeline("/fake/path");
    expect(result[0].contentPreview).toBe("Actual user text");
  });

  it("strips XML tags from string content on user messages", () => {
    const jsonl = toJSONL([
      {
        type: "user",
        timestamp: "2025-01-01T00:00:00Z",
        message: {
          role: "user",
          content: "<system-reminder>hidden</system-reminder>Visible text",
        },
      },
    ]);
    setupMockFile(jsonl);
    const result = readMessageTimeline("/fake/path");
    expect(result[0].contentPreview).toBe("Visible text");
  });

  it("does NOT strip XML tags from assistant messages", () => {
    const jsonl = toJSONL([
      {
        type: "assistant",
        timestamp: "2025-01-01T00:00:00Z",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "Here is some <example>xml</example> in my response" }],
        },
      },
    ]);
    setupMockFile(jsonl);
    const result = readMessageTimeline("/fake/path");
    expect(result[0].contentPreview).toBe("Here is some <example>xml</example> in my response");
  });
});
