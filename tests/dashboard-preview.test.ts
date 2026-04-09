import { describe, it, expect } from "vitest";

// Extract shortSummary logic for direct testing (mirrors dashboard.tsx implementation)
function shortSummary(msg: string | undefined, maxWords = 5): string {
  if (!msg) return "";
  const cleaned = msg.replace(/^---\n[\s\S]*?\n---\n*/, "").trim();
  if (!cleaned) return "";
  const words = cleaned.split(/\s+/).slice(0, maxWords);
  let result = words.join(" ");
  if (cleaned.split(/\s+/).length > maxWords) result += "...";
  return result;
}

describe("shortSummary", () => {
  it("strips YAML frontmatter and returns actual content", () => {
    const result = shortSummary("---\ntitle: foo\nstatus: bar\n---\nActual message content here");
    expect(result).toBe("Actual message content here");
  });

  it("passes through messages without frontmatter", () => {
    const result = shortSummary("Normal message without frontmatter");
    expect(result).toBe("Normal message without frontmatter");
  });

  it("returns empty string for frontmatter-only messages", () => {
    expect(shortSummary("---\ntitle: foo\n---\n")).toBe("");
    expect(shortSummary("---\ntitle: foo\n---")).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(shortSummary(undefined)).toBe("");
  });

  it("returns empty string for empty string", () => {
    expect(shortSummary("")).toBe("");
  });

  it("truncates long messages with ellipsis", () => {
    const result = shortSummary("one two three four five six seven");
    expect(result).toBe("one two three four five...");
  });

  it("does not strip mid-text horizontal rules", () => {
    const result = shortSummary("Hello world\n---\nMore text here after rule");
    // The --- is not at the start, so regex won't match
    expect(result).toContain("Hello");
  });
});
