// tests/bubbles-dispatcher.test.ts
//
// Structural tests for the central Messages-tab dispatcher
// (messages-redesign task003 wave 2). The dispatcher lives in
// `bubbles/dispatcher.ts` (with a barrel re-export in `bubbles/index.ts`)
// and routes a TimelineMessage to its matching bubble component.
// Wave 1's fs.readFileSync + regex pattern applies here too — no jsdom.

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const DISPATCHER = path.resolve(
  __dirname,
  "../client/src/components/analytics/messages/bubbles/dispatcher.ts",
);
const BARREL = path.resolve(
  __dirname,
  "../client/src/components/analytics/messages/bubbles/index.ts",
);

describe("bubbles dispatcher", () => {
  it("dispatcher.ts file exists", () => {
    expect(fs.existsSync(DISPATCHER)).toBe(true);
  });

  const src = fs.existsSync(DISPATCHER) ? fs.readFileSync(DISPATCHER, "utf-8") : "";

  it("exports renderMessage function", () => {
    expect(src).toMatch(/export\s+function\s+renderMessage/);
  });

  it("imports TimelineMessage type from shared/session-types", () => {
    expect(src).toMatch(/TimelineMessage/);
    expect(src).toMatch(/@shared\/session-types/);
  });

  it("imports every wave-1 and wave-2 bubble component", () => {
    const components = [
      "UserBubble",
      "AssistantBlock",
      "ThinkingBlock",
      "ToolCallBlock",
      "ToolResultBlock",
      "SystemEventBlock",
    ];
    for (const c of components) {
      expect(src).toMatch(new RegExp(`import\\s*{\\s*${c}\\s*}\\s*from\\s*["']\\./${c}["']`));
    }
  });

  it("switches on message.type and covers all TimelineMessage variants", () => {
    expect(src).toMatch(/switch\s*\(\s*message\.type\s*\)/);
    const variants = [
      "user_text",
      "assistant_text",
      "thinking",
      "tool_call",
      "tool_result",
      "system_event",
      "skill_invocation",
    ];
    for (const v of variants) {
      expect(src).toMatch(new RegExp(`case\\s+["']${v}["']`));
    }
  });

  it("enforces exhaustiveness via a never guard on the default branch", () => {
    expect(src).toMatch(/:\s*never\s*=\s*message|const\s+_exhaustive\s*:\s*never/);
  });

  it("forwards previousModel to AssistantBlock", () => {
    // The model-change badge is AssistantBlock's only conditional prop;
    // the dispatcher must thread it through.
    expect(src).toMatch(/previousModel/);
  });

  it("does NOT import from ./index to avoid a barrel cycle", () => {
    // SidechainGroup imports renderMessage directly from this file;
    // the dispatcher must not loop back through the barrel.
    expect(src).not.toMatch(/from\s+["']\.\/index["']/);
  });
});

describe("bubbles barrel", () => {
  it("index.ts exists", () => {
    expect(fs.existsSync(BARREL)).toBe(true);
  });

  const src = fs.existsSync(BARREL) ? fs.readFileSync(BARREL, "utf-8") : "";

  it("re-exports renderMessage from ./dispatcher", () => {
    expect(src).toMatch(/export\s*{\s*renderMessage\s*}\s*from\s*["']\.\/dispatcher["']/);
  });

  it("re-exports every bubble and SidechainGroup", () => {
    const components = [
      "UserBubble",
      "AssistantBlock",
      "ThinkingBlock",
      "ToolCallBlock",
      "ToolResultBlock",
      "SystemEventBlock",
      "SidechainGroup",
    ];
    for (const c of components) {
      expect(src).toMatch(new RegExp(`export\\s*{\\s*${c}\\s*}`));
    }
  });
});
