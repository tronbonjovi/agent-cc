// tests/tool-call-block.test.ts
//
// Structural tests for ToolCallBlock (messages-redesign task003 wave 2).
// Matches the wave 1 pattern: fs.readFileSync + regex assertions — no
// jsdom, no React Testing Library. Verifies the bubble uses the tool
// renderer registry, is collapsible, tags the root with data-message-type,
// and avoids banned animation classes.

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const SRC = path.resolve(
  __dirname,
  "../client/src/components/analytics/messages/bubbles/ToolCallBlock.tsx",
);

describe("ToolCallBlock", () => {
  it("file exists at the expected path", () => {
    expect(fs.existsSync(SRC)).toBe(true);
  });

  const src = fs.existsSync(SRC) ? fs.readFileSync(SRC, "utf-8") : "";

  it("exports a ToolCallBlock component", () => {
    expect(src).toMatch(/export\s+function\s+ToolCallBlock/);
  });

  it("imports ToolCallMessage type from shared/session-types", () => {
    expect(src).toMatch(/ToolCallMessage/);
    expect(src).toMatch(/@shared\/session-types/);
  });

  it("uses the tool renderer registry via getToolRenderer", () => {
    // The whole point of the registry is: no switch on tool name inside
    // this component. Look up the renderer and render its pieces.
    expect(src).toMatch(/getToolRenderer/);
    expect(src).toMatch(/tool-renderers/);
  });

  it("does not switch on known tool names in this file", () => {
    // Guardrail against regression — all per-tool logic lives in the
    // renderer modules, not here.
    expect(src).not.toMatch(/case\s+["']Bash["']/);
    expect(src).not.toMatch(/case\s+["']Read["']/);
    expect(src).not.toMatch(/case\s+["']Grep["']/);
  });

  it("uses useState for the expand toggle", () => {
    expect(src).toMatch(/\buseState\b/);
  });

  it("renders the renderer's icon and Summary component", () => {
    expect(src).toMatch(/renderer\.icon|Icon\s*=/);
    expect(src).toMatch(/renderer\.Summary|Summary\s*=/);
  });

  it("uses the renderer's borderClass for the left accent", () => {
    expect(src).toMatch(/borderClass/);
    expect(src).toMatch(/border-l-2/);
  });

  it("renders the tool name in the header", () => {
    expect(src).toMatch(/message\.name/);
  });

  it("shows the full input as JSON when expanded", () => {
    // Universal escape hatch — raw JSON dump on expand.
    expect(src).toMatch(/JSON\.stringify\(message\.input/);
  });

  it("renders output as whitespace-pre-wrap preformatted text in the expand view", () => {
    expect(src).toMatch(/whitespace-pre-wrap/);
  });

  it("tags the rendered element with data-message-type='tool_call'", () => {
    expect(src).toMatch(/data-message-type=["']tool_call["']/);
  });

  it("tags the rendered element with data-tool-name for test/DOM lookups", () => {
    expect(src).toMatch(/data-tool-name/);
  });

  it("does NOT use bounce or scale animations", () => {
    expect(src).not.toMatch(/animate-bounce/);
    expect(src).not.toMatch(/\bscale-\d/);
  });

  it("only uses the allowed transition utilities", () => {
    // Matches the wave 1 convention: transition-colors/transform/opacity only.
    const transitions = src.match(/\btransition-\w+/g) ?? [];
    for (const t of transitions) {
      expect(["transition-colors", "transition-transform", "transition-opacity"]).toContain(t);
    }
  });
});

describe("tool renderer registry", () => {
  const REG_DIR = path.resolve(
    __dirname,
    "../client/src/components/analytics/messages/bubbles/tool-renderers",
  );
  const INDEX = path.join(REG_DIR, "index.ts");
  const TYPES = path.join(REG_DIR, "types.ts");

  it("types.ts exists and defines ToolRenderer", () => {
    expect(fs.existsSync(TYPES)).toBe(true);
    const src = fs.readFileSync(TYPES, "utf-8");
    expect(src).toMatch(/interface\s+ToolRenderer\b/);
    expect(src).toMatch(/icon/);
    expect(src).toMatch(/borderClass/);
    expect(src).toMatch(/Summary/);
  });

  it("index.ts exists and registers Bash/Read/Grep/Edit/Write/Agent", () => {
    expect(fs.existsSync(INDEX)).toBe(true);
    const src = fs.readFileSync(INDEX, "utf-8");
    for (const name of ["Bash", "Read", "Grep", "Edit", "Write", "Agent"]) {
      expect(src).toMatch(new RegExp(`["']${name}["']`));
    }
  });

  it("index.ts exports getToolRenderer with a fallback path", () => {
    const src = fs.readFileSync(INDEX, "utf-8");
    expect(src).toMatch(/export\s+function\s+getToolRenderer/);
    expect(src).toMatch(/FALLBACK_RENDERER|fallbackRenderer/);
  });

  it("each per-tool renderer file exists", () => {
    const expected = ["bash", "read", "grep", "edit", "write", "agent", "fallback"];
    for (const name of expected) {
      const p = path.join(REG_DIR, `${name}.tsx`);
      expect(fs.existsSync(p)).toBe(true);
    }
  });

  it("each per-tool renderer exports a named renderer constant", () => {
    const cases: Array<[string, string]> = [
      ["bash", "bashRenderer"],
      ["read", "readRenderer"],
      ["grep", "grepRenderer"],
      ["edit", "editRenderer"],
      ["write", "writeRenderer"],
      ["agent", "agentRenderer"],
      ["fallback", "fallbackRenderer"],
    ];
    for (const [file, exportName] of cases) {
      const src = fs.readFileSync(path.join(REG_DIR, `${file}.tsx`), "utf-8");
      expect(src).toMatch(new RegExp(`export\\s+const\\s+${exportName}`));
      expect(src).toMatch(/ToolRenderer/);
    }
  });

  it("each renderer file avoids banned animation classes", () => {
    const expected = ["bash", "read", "grep", "edit", "write", "agent", "fallback"];
    for (const name of expected) {
      const src = fs.readFileSync(path.join(REG_DIR, `${name}.tsx`), "utf-8");
      expect(src).not.toMatch(/animate-bounce/);
      expect(src).not.toMatch(/\bscale-\d/);
    }
  });
});
