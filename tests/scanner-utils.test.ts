import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { entityId, normPath, decodeProjectKey, encodeProjectKey, extractText, readHead, readTailTs } from "../server/scanner/utils";

describe("entityId", () => {
  it("returns a 16-char hex string", () => {
    const id = entityId("C:/Users/alice/project");
    expect(id).toMatch(/^[a-f0-9]{16}$/);
  });

  it("is deterministic", () => {
    expect(entityId("foo/bar")).toBe(entityId("foo/bar"));
  });

  it("normalizes backslashes", () => {
    expect(entityId("C:\\Users\\alice")).toBe(entityId("C:/Users/alice"));
  });

  it("is case-insensitive", () => {
    expect(entityId("C:/Users/Alice")).toBe(entityId("c:/users/alice"));
  });

  it("produces different IDs for different paths", () => {
    expect(entityId("project-a")).not.toBe(entityId("project-b"));
  });
});

describe("normPath", () => {
  it("joins path segments with forward slashes", () => {
    const result = normPath("C:", "Users", "alice");
    expect(result).not.toContain("\\");
    expect(result).toContain("Users");
    expect(result).toContain("alice");
  });

  it("handles single argument", () => {
    const result = normPath("foo/bar");
    expect(result).toBe("foo/bar");
  });
});

describe("encodeProjectKey", () => {
  it("encodes Unix path (slashes become dashes)", () => {
    expect(encodeProjectKey("/home/tron")).toBe("-home-tron");
  });

  it("encodes Windows path (drive letter uses double-dash)", () => {
    expect(encodeProjectKey("C:/Users/alice")).toBe("C--Users-alice");
  });

  it("encodes path with hyphenated directory names", () => {
    expect(encodeProjectKey("/home/tron/dev/projects/claude-command-center"))
      .toBe("-home-tron-dev-projects-claude-command-center");
  });

  it("normalizes backslashes before encoding", () => {
    expect(encodeProjectKey("C:\\Users\\alice\\my-project"))
      .toBe("C--Users-alice-my-project");
  });

  it("round-trips with decodeProjectKey for paths without hyphens", () => {
    const path = "/home/tron/dev/projects/myapp";
    expect(decodeProjectKey(encodeProjectKey(path))).toBe(path);
  });

  it("matches real Claude project directory names", () => {
    // This is the actual key Claude creates for this project
    expect(encodeProjectKey("/home/tron/dev/projects/claude-command-center"))
      .toBe("-home-tron-dev-projects-claude-command-center");
  });

  it("strips trailing slashes", () => {
    expect(encodeProjectKey("/home/tron/")).toBe("-home-tron");
    expect(encodeProjectKey("C:/Users/alice/")).toBe("C--Users-alice");
  });

  it("collapses repeated separators", () => {
    expect(encodeProjectKey("/home//tron///dev")).toBe("-home-tron-dev");
  });

  it("uppercases Windows drive letter for consistent matching", () => {
    expect(encodeProjectKey("c:/Users/alice")).toBe("C--Users-alice");
    expect(encodeProjectKey("C:/Users/alice")).toBe("C--Users-alice");
  });

  it("produces identical keys for equivalent paths", () => {
    // All of these refer to the same Windows directory
    const key1 = encodeProjectKey("C:\\work\\proj");
    const key2 = encodeProjectKey("c:\\work\\proj\\");
    const key3 = encodeProjectKey("C:/work/proj/");
    expect(key1).toBe(key2);
    expect(key2).toBe(key3);
  });

  it("handles root paths correctly", () => {
    expect(encodeProjectKey("/")).toBe("-");
    expect(encodeProjectKey("C:/")).toBe("C--");
    expect(encodeProjectKey("c:/")).toBe("C--");
  });

  it("handles empty string gracefully", () => {
    expect(encodeProjectKey("")).toBe("");
  });

  it("handles bare Windows drive letter", () => {
    expect(encodeProjectKey("C:")).toBe("C--");
  });
});

describe("decodeProjectKey", () => {
  it("decodes Windows path (double-dash = drive colon)", () => {
    expect(decodeProjectKey("C--Users-alice")).toBe("C:/Users/alice");
  });

  it("decodes Unix path (leading dash = leading /)", () => {
    expect(decodeProjectKey("-Users-hi")).toBe("/Users/hi");
  });

  it("handles multi-segment Windows paths", () => {
    expect(decodeProjectKey("C--Users-alice-projects-myapp")).toBe("C:/Users/alice/projects/myapp");
  });

  it("handles simple Unix path", () => {
    expect(decodeProjectKey("-home-user")).toBe("/home/user");
  });

  it("is lossy for hyphenated names (documents known limitation)", () => {
    // decodeProjectKey cannot distinguish hyphens from slashes
    // This is WHY we use encodeProjectKey for matching instead
    const key = "-home-tron-dev-projects-claude-command-center";
    const decoded = decodeProjectKey(key);
    expect(decoded).toBe("/home/tron/dev/projects/claude/command/center"); // WRONG but expected
    expect(decoded).not.toBe("/home/tron/dev/projects/claude-command-center"); // the real path
  });
});

describe("extractText", () => {
  it("returns string content directly", () => {
    expect(extractText("hello world")).toBe("hello world");
  });

  it("extracts text from content block array", () => {
    const blocks = [
      { type: "text", text: "hello" },
      { type: "tool_use", id: "123" },
      { type: "text", text: "world" },
    ];
    expect(extractText(blocks)).toBe("hello world");
  });

  it("returns empty string for non-text arrays", () => {
    expect(extractText([{ type: "image", url: "foo.png" }])).toBe("");
  });

  it("returns empty string for null/undefined", () => {
    expect(extractText(null)).toBe("");
    expect(extractText(undefined)).toBe("");
  });

  it("returns empty string for numbers", () => {
    expect(extractText(42)).toBe("");
  });

  it("handles missing text property", () => {
    expect(extractText([{ type: "text" }])).toBe("");
  });

  it("handles empty array", () => {
    expect(extractText([])).toBe("");
  });
});

describe("readHead / readTailTs", () => {
  const tmpDir = path.join(os.tmpdir(), "cc-test-" + Date.now());
  const testFile = path.join(tmpDir, "test.jsonl");

  beforeAll(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
    const lines = [
      JSON.stringify({ type: "system", timestamp: "2024-01-01T00:00:00Z", slug: "test" }),
      JSON.stringify({ type: "user", timestamp: "2024-01-01T00:01:00Z", message: { role: "user", content: "hello" } }),
      JSON.stringify({ type: "assistant", timestamp: "2024-01-01T00:02:00Z", message: { role: "assistant", content: "hi" } }),
    ];
    fs.writeFileSync(testFile, lines.join("\n") + "\n");
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("readHead returns parsed JSON records", () => {
    const records = readHead(testFile, 10);
    expect(records.length).toBe(3);
    expect(records[0].type).toBe("system");
    expect(records[1].type).toBe("user");
  });

  it("readHead respects limit", () => {
    const records = readHead(testFile, 2);
    expect(records.length).toBe(2);
  });

  it("readHead returns empty for non-existent file", () => {
    expect(readHead("/nonexistent/file.jsonl")).toEqual([]);
  });

  it("readTailTs returns last timestamp", () => {
    const ts = readTailTs(testFile);
    expect(ts).toBe("2024-01-01T00:02:00Z");
  });

  it("readTailTs returns null for empty file", () => {
    const emptyFile = path.join(tmpDir, "empty.jsonl");
    fs.writeFileSync(emptyFile, "");
    expect(readTailTs(emptyFile)).toBeNull();
  });

  it("readTailTs returns null for non-existent file", () => {
    expect(readTailTs("/nonexistent/file.jsonl")).toBeNull();
  });
});
