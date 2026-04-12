// tests/sidechain-group.test.ts
//
// Structural tests for SidechainGroup (messages-redesign task003 wave 2).
// SidechainGroup wraps a run of subagent messages into one collapsible
// block, labels it with agentType + description (or a generic fallback
// when no subagentContext is available), and recursively dispatches
// each child through `renderMessage`.
//
// Wave 1's fs.readFileSync + regex pattern applies.

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const SRC = path.resolve(
  __dirname,
  "../client/src/components/analytics/messages/bubbles/SidechainGroup.tsx",
);

describe("SidechainGroup", () => {
  it("file exists at the expected path", () => {
    expect(fs.existsSync(SRC)).toBe(true);
  });

  const src = fs.existsSync(SRC) ? fs.readFileSync(SRC, "utf-8") : "";

  it("exports a SidechainGroup component", () => {
    expect(src).toMatch(/export\s+function\s+SidechainGroup/);
  });

  it("accepts a children array of TimelineMessage", () => {
    expect(src).toMatch(/TimelineMessage/);
    expect(src).toMatch(/@shared\/session-types/);
    expect(src).toMatch(/children/);
  });

  it("accepts a subagentContext prop (nullable)", () => {
    expect(src).toMatch(/subagentContext/);
    expect(src).toMatch(/TimelineSubagentContext/);
  });

  it("uses useState for the expand/collapse toggle", () => {
    expect(src).toMatch(/\buseState\b/);
  });

  it("calls renderMessage on each child (recursive dispatch)", () => {
    expect(src).toMatch(/renderMessage/);
    // Imported from ./dispatcher (not ./index) to avoid a barrel cycle.
    expect(src).toMatch(/from\s+["']\.\/dispatcher["']/);
  });

  it("uses the shared subagent-colors palette for its border stripe", () => {
    // Hash-by-agentId so a subagent's color matches across Sessions detail.
    expect(src).toMatch(/colorClassForOwner/);
    expect(src).toMatch(/subagent-colors/);
    expect(src).toMatch(/border-l-2/);
  });

  it("shows agentType and description in the collapsed header when context is present", () => {
    expect(src).toMatch(/agentType/);
    expect(src).toMatch(/description/);
  });

  it("falls back to a generic 'Sidechain' label when subagentContext is missing", () => {
    expect(src).toMatch(/Sidechain/);
  });

  it("shows the child count in the header", () => {
    expect(src).toMatch(/messages\)/);
    expect(src).toMatch(/\.length|count/);
  });

  it("threads previousModel across assistant turns inside the group", () => {
    // Ensures AssistantBlock's model-change badge only fires on real
    // switches within the grouped run.
    expect(src).toMatch(/previousModel/);
  });

  it("tags the rendered element with data-message-type='sidechain_group'", () => {
    expect(src).toMatch(/data-message-type=["']sidechain_group["']/);
  });

  it("exposes the agentId via a data attribute for DOM lookups", () => {
    expect(src).toMatch(/data-agent-id/);
  });

  it("does NOT use bounce or scale animations", () => {
    expect(src).not.toMatch(/animate-bounce/);
    expect(src).not.toMatch(/\bscale-\d/);
  });

  it("only uses the allowed transition utilities", () => {
    const transitions = src.match(/\btransition-\w+/g) ?? [];
    for (const t of transitions) {
      expect(["transition-colors", "transition-transform", "transition-opacity"]).toContain(t);
    }
  });
});
