// tests/sessions-highlight.test.ts
// Tests for session highlight feature and SessionHealthPanel removal
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const SESSIONS_PATH = path.resolve(__dirname, "../client/src/pages/sessions.tsx");

describe("sessions highlight param support", () => {
  const sessionsSrc = fs.readFileSync(SESSIONS_PATH, "utf-8");

  it("reads the highlight query parameter from URL", () => {
    expect(sessionsSrc).toMatch(/urlParams\.get\(["']highlight["']\)/);
  });

  it("sets expanded state from highlight param", () => {
    expect(sessionsSrc).toMatch(/highlight/);
    expect(sessionsSrc).toMatch(/setExpanded/);
  });

  it("uses data-session-id attribute on session cards for scroll targeting", () => {
    expect(sessionsSrc).toMatch(/data-session-id/);
  });

  it("calls scrollIntoView on the highlighted session", () => {
    expect(sessionsSrc).toMatch(/scrollIntoView/);
  });

  it("applies a visual highlight class to the highlighted session", () => {
    expect(sessionsSrc).toMatch(/session-highlight/);
  });
});

describe("SessionHealthPanel removed from sessions page", () => {
  const sessionsSrc = fs.readFileSync(SESSIONS_PATH, "utf-8");

  it("does not import SessionHealthPanel", () => {
    expect(sessionsSrc).not.toMatch(/import.*SessionHealthPanel/);
  });

  it("does not render SessionHealthPanel", () => {
    expect(sessionsSrc).not.toMatch(/<SessionHealthPanel/);
  });
});
