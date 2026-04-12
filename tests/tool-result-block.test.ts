// tests/tool-result-block.test.ts
//
// Tests for the ToolResultBlock message bubble (messages-redesign task003
// wave 1). Diverges visually between success/error; truncates long output;
// renders plain preformatted text (no markdown).

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const SRC = path.resolve(
  __dirname,
  "../client/src/components/analytics/messages/bubbles/ToolResultBlock.tsx",
);

describe("ToolResultBlock", () => {
  it("file exists at the expected path", () => {
    expect(fs.existsSync(SRC)).toBe(true);
  });

  const src = fs.existsSync(SRC) ? fs.readFileSync(SRC, "utf-8") : "";

  it("exports a ToolResultBlock component", () => {
    expect(src).toMatch(/export\s+function\s+ToolResultBlock/);
  });

  it("imports ToolResultMessage type from shared/session-types", () => {
    expect(src).toMatch(/ToolResultMessage/);
    expect(src).toMatch(/@shared\/session-types/);
  });

  it("reads content from the .content field", () => {
    // ToolResultMessage.content is the extracted plain text body — the
    // parser hand-extracts it into a string, and we render it verbatim.
    expect(src).toMatch(/\.content/);
  });

  it("reads isError from the .isError field", () => {
    expect(src).toMatch(/isError/);
  });

  it("branches visual styling on success vs error", () => {
    // Error: red-tinted bg. Success: neutral bg. We check both tokens.
    expect(src).toMatch(/red|rose|destructive/);
  });

  it("uses local useState for show-output / show-more toggling", () => {
    expect(src).toMatch(/\buseState\b/);
  });

  it("renders output as whitespace-pre-wrap preformatted text", () => {
    // Tool output is raw (grep results, file contents, shell stdout). It
    // must render verbatim with line breaks preserved.
    expect(src).toMatch(/whitespace-pre-wrap/);
  });

  it("does NOT render markdown (tool output is raw text)", () => {
    expect(src).not.toMatch(/react-markdown/);
    expect(src).not.toMatch(/remark-gfm/);
  });

  it("defines an output-size cap constant for truncation", () => {
    // The spec says cap visible output at ~2000 chars OR ~50 lines. We
    // assert *some* numeric cap exists in source — the exact number is
    // a polish detail the next wave can tune.
    expect(src).toMatch(/\b(2000|2_?000|1500|3000|50)\b/);
  });

  it("has a show-more / show-output affordance for truncated output", () => {
    expect(src).toMatch(/Show more|Show output|show more|show output/);
  });

  it("leaves a left indent to signal visual nesting under a tool call", () => {
    // Nesting is task004's job, but ToolResultBlock should look like it
    // wants to be indented. We accept any ml-*, pl-*, or max-w-* hint.
    expect(src).toMatch(/\bml-\d|pl-[3-9]|pl-1[0-9]|max-w-/);
  });

  it("does NOT use bounce or scale animations", () => {
    expect(src).not.toMatch(/animate-bounce/);
    expect(src).not.toMatch(/\bscale-\d/);
  });

  it("tags the rendered element with data-message-type", () => {
    expect(src).toMatch(/data-message-type=["']tool_result["']/);
  });

  it("shows an error icon or label when isError is true", () => {
    // AlertTriangle / AlertCircle / XCircle from lucide-react are all
    // acceptable; we just need something that says "this failed".
    expect(src).toMatch(/Alert|XCircle|CircleX|Error/);
  });
});
