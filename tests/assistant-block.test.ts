// tests/assistant-block.test.ts
//
// Tests for the AssistantBlock message bubble (messages-redesign task003
// wave 1). Full-width, markdown rendering, code blocks styled as plain
// <pre> (no syntax highlighting), stop-reason and model badges.

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const SRC = path.resolve(
  __dirname,
  "../client/src/components/analytics/messages/bubbles/AssistantBlock.tsx",
);

describe("AssistantBlock", () => {
  it("file exists at the expected path", () => {
    expect(fs.existsSync(SRC)).toBe(true);
  });

  const src = fs.existsSync(SRC) ? fs.readFileSync(SRC, "utf-8") : "";

  it("exports an AssistantBlock component", () => {
    expect(src).toMatch(/export\s+function\s+AssistantBlock/);
  });

  it("imports AssistantTextMessage type from shared/session-types", () => {
    expect(src).toMatch(/AssistantTextMessage/);
    expect(src).toMatch(/@shared\/session-types/);
  });

  it("uses react-markdown for message body rendering", () => {
    expect(src).toMatch(/from ["']react-markdown["']/);
  });

  it("uses remark-gfm plugin for tables and tasklists", () => {
    expect(src).toMatch(/from ["']remark-gfm["']/);
    expect(src).toMatch(/remarkGfm/);
  });

  it("reads text from the .text field", () => {
    expect(src).toMatch(/\.text/);
  });

  it("reads stopReason from the message", () => {
    expect(src).toMatch(/stopReason/);
  });

  it("reads model from the message", () => {
    expect(src).toMatch(/\.model/);
  });

  it("accepts an optional previousModel prop for model-change detection", () => {
    expect(src).toMatch(/previousModel/);
  });

  it("shows an amber pill for non-end_turn stop reasons", () => {
    // Spec: compare stopReason against "end_turn" — if different, show
    // an amber pill. We check both the comparison and the amber styling.
    expect(src).toMatch(/end_turn/);
    expect(src).toMatch(/amber|yellow/);
  });

  it("styles code blocks with a monospace pre and subtle background (no syntax highlighter)", () => {
    // The components prop of react-markdown lets us override <code> and
    // <pre> rendering. We assert a custom components override exists and
    // that no syntax-highlighting library is imported.
    expect(src).toMatch(/components=/);
    expect(src).not.toMatch(/prismjs|prism-react-renderer|shiki|highlight\.js|rehype-highlight|react-syntax-highlighter/);
  });

  it("does NOT import any syntax highlighter", () => {
    // Belt-and-braces: no syntax highlighter. Task003 wave 1 is explicit
    // that highlighting is deferred to a future polish task.
    expect(src).not.toMatch(/prism/i);
    expect(src).not.toMatch(/shiki/i);
    expect(src).not.toMatch(/highlight\.js/i);
  });

  it("does NOT use bounce or scale animations", () => {
    expect(src).not.toMatch(/animate-bounce/);
    expect(src).not.toMatch(/\bscale-\d/);
  });

  it("tags the rendered element with data-message-type", () => {
    expect(src).toMatch(/data-message-type=["']assistant_text["']/);
  });
});
