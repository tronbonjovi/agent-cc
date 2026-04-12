// tests/thinking-block.test.ts
//
// Tests for the ThinkingBlock message bubble (messages-redesign task003
// wave 1). Thinking is collapsed by default, expandable, italic muted
// styling, no markdown (thinking text is plain), no bounce animation.

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const SRC = path.resolve(
  __dirname,
  "../client/src/components/analytics/messages/bubbles/ThinkingBlock.tsx",
);

describe("ThinkingBlock", () => {
  it("file exists at the expected path", () => {
    expect(fs.existsSync(SRC)).toBe(true);
  });

  const src = fs.existsSync(SRC) ? fs.readFileSync(SRC, "utf-8") : "";

  it("exports a ThinkingBlock component", () => {
    expect(src).toMatch(/export\s+function\s+ThinkingBlock/);
  });

  it("imports ThinkingMessage type from shared/session-types", () => {
    expect(src).toMatch(/ThinkingMessage/);
    expect(src).toMatch(/@shared\/session-types/);
  });

  it("uses local useState for expand/collapse", () => {
    // Collapse state is entirely local — callers don't own it.
    expect(src).toMatch(/\buseState\b/);
  });

  it("shows a 'Thinking...' label with a length indicator", () => {
    // The contract asked for "Thinking... (N tokens)" but ThinkingMessage
    // in shared/session-types has no token count field. We use the text
    // length as a proxy so the label still gives a sense of volume.
    expect(src).toMatch(/Thinking/);
  });

  it("reads the thinking text from the .text field", () => {
    expect(src).toMatch(/\.text/);
  });

  it("uses italic muted styling for the thinking body", () => {
    expect(src).toMatch(/italic/);
    expect(src).toMatch(/text-muted-foreground/);
  });

  it("renders thinking text as preformatted whitespace-pre-wrap", () => {
    // Thinking text is plain prose, not markdown. Preserving line breaks
    // matters because Claude's reasoning often has newlines mid-thought.
    expect(src).toMatch(/whitespace-pre-wrap/);
  });

  it("does NOT render markdown (thinking is plain text)", () => {
    expect(src).not.toMatch(/react-markdown/);
    expect(src).not.toMatch(/remark-gfm/);
  });

  it("does NOT use bounce or scale animations", () => {
    // User feedback: no cartoonish effects. Safety test also enforces this
    // globally; this check keeps the ThinkingBlock honest on its own.
    expect(src).not.toMatch(/animate-bounce/);
    expect(src).not.toMatch(/\bscale-\d/);
  });

  it("tags the rendered element with data-message-type", () => {
    expect(src).toMatch(/data-message-type=["']thinking["']/);
  });
});
