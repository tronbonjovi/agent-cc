// tests/user-bubble.test.ts
//
// Tests for the UserBubble message bubble (messages-redesign task003 wave 1).

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const SRC = path.resolve(
  __dirname,
  "../client/src/components/analytics/messages/bubbles/UserBubble.tsx",
);

describe("UserBubble", () => {
  it("file exists at the expected path", () => {
    expect(fs.existsSync(SRC)).toBe(true);
  });

  const src = fs.existsSync(SRC) ? fs.readFileSync(SRC, "utf-8") : "";

  it("exports a UserBubble component", () => {
    expect(src).toMatch(/export\s+function\s+UserBubble/);
  });

  it("imports UserTextMessage type from shared/session-types", () => {
    expect(src).toMatch(/UserTextMessage/);
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
    // UserTextMessage.text is the body — contract is clear the raw string
    // must be passed to the markdown renderer.
    expect(src).toMatch(/\.text/);
  });

  it("uses relativeTime from @/lib/utils for timestamp formatting", () => {
    expect(src).toMatch(/relativeTime/);
    expect(src).toMatch(/@\/lib\/utils/);
  });

  it("applies user-colored subtle background", () => {
    // Matches the convention set by SessionSidebar: bg-primary/5 or similar.
    // We accept any primary-tinted subtle background class.
    expect(src).toMatch(/bg-primary\/|bg-blue|bg-sky|bg-muted/);
  });

  it("is left-aligned (not right-aligned like a chat app)", () => {
    // Explicitly document the decision: messages tab is a transcript view,
    // not a chat UI, so user messages are left-aligned like every other
    // bubble. The test guards against a future refactor flipping this.
    expect(src).not.toMatch(/self-end|justify-end|ml-auto/);
  });

  it("has no local state — pure component", () => {
    expect(src).not.toMatch(/\buseState\b/);
    expect(src).not.toMatch(/\buseEffect\b/);
  });

  it("tags the rendered element with data-message-type for timeline wiring", () => {
    expect(src).toMatch(/data-message-type=["']user_text["']/);
  });
});
