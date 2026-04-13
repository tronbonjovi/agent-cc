// tests/messages-tab.test.ts
//
// Tests for the Messages tab container component
// (messages-redesign task005).
//
// Matches the project convention: file-text guardrails for the React tree
// plus pure helper imports. The MessagesTab itself is structurally verified;
// URL param read/write helpers are exercised via direct imports.

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const SRC = path.resolve(
  __dirname,
  "../client/src/components/analytics/messages/MessagesTab.tsx",
);

// ---------------------------------------------------------------------------
// File-structure guardrails
// ---------------------------------------------------------------------------

describe("MessagesTab — source structure", () => {
  it("file exists at the expected path", () => {
    expect(fs.existsSync(SRC)).toBe(true);
  });

  const src = fs.existsSync(SRC) ? fs.readFileSync(SRC, "utf-8") : "";

  it("exports a MessagesTab component", () => {
    expect(src).toMatch(/export\s+function\s+MessagesTab/);
  });

  it("renders the SessionSidebar (left panel)", () => {
    expect(src).toMatch(/<SessionSidebar/);
  });

  it("renders the FilterBar (top of main panel)", () => {
    expect(src).toMatch(/<FilterBar/);
  });

  it("renders the ConversationViewer (main panel body)", () => {
    expect(src).toMatch(/<ConversationViewer/);
  });

  it("imports SessionSidebar, FilterBar, ConversationViewer from sibling files", () => {
    expect(src).toMatch(/from\s+["']\.\/SessionSidebar["']/);
    expect(src).toMatch(/from\s+["']\.\/FilterBar["']/);
    expect(src).toMatch(/from\s+["']\.\/ConversationViewer["']/);
  });

  it("uses DEFAULT_FILTERS as the initial filter state", () => {
    expect(src).toMatch(/DEFAULT_FILTERS/);
  });

  it("manages selected session id via React state", () => {
    expect(src).toMatch(/useState/);
    expect(src).toMatch(/selectedId|sessionId/);
  });

  it("syncs the selected session into the URL ?id= param", () => {
    // The contract requires URL param sync. We share the helper convention
    // with SessionSidebar which uses readSelectedSessionFromUrl /
    // writeSelectedSessionToUrl, but MessagesTab is also free to use
    // URLSearchParams directly. Either signal proves the wiring exists.
    expect(src).toMatch(/URLSearchParams|readSelectedSessionFromUrl|writeSelectedSessionToUrl/);
  });

  it("does not use bounce/scale animations (safety rule)", () => {
    expect(src).not.toMatch(/animate-bounce/);
    expect(src).not.toMatch(/hover:scale-/);
    expect(src).not.toMatch(/active:scale-/);
  });

  it("does not use text gradients (safety rule)", () => {
    expect(src).not.toMatch(/bg-gradient-to-/);
    expect(src).not.toMatch(/text-transparent/);
  });
});

// ---------------------------------------------------------------------------
// Wiring verification
// ---------------------------------------------------------------------------

describe("MessagesTab — wired into stats.tsx", () => {
  const STATS = path.resolve(__dirname, "../client/src/pages/stats.tsx");
  const src = fs.readFileSync(STATS, "utf-8");

  it("imports MessagesTab from the messages component directory", () => {
    expect(src).toMatch(/import.*MessagesTab.*from.*analytics\/messages/);
  });

  it("renders <MessagesTab /> inside the messages tab content", () => {
    expect(src).toMatch(/<MessagesTab/);
  });

  it("no longer imports MessagesPanel from the legacy message-history page", () => {
    expect(src).not.toMatch(/from\s+["']@\/pages\/message-history["']/);
    expect(src).not.toMatch(/MessagesPanel/);
  });
});

// ---------------------------------------------------------------------------
// URL param sync — pure helper tests
// ---------------------------------------------------------------------------
//
// The contract calls for ?tab=messages&id=<sessionId>. We delegate to the
// SessionSidebar URL helpers (readSelectedSessionFromUrl /
// writeSelectedSessionToUrl) so the Messages tab and Sessions tab share
// one source of truth on the param shape.

describe("MessagesTab — URL param sync helpers (delegated)", () => {
  it("reads ?id= the same way SessionSidebar does", async () => {
    const { readSelectedSessionFromUrl } = await import(
      "../client/src/components/analytics/messages/SessionSidebar"
    );
    expect(readSelectedSessionFromUrl("?id=abc123")).toBe("abc123");
    expect(readSelectedSessionFromUrl("?tab=messages&id=xyz")).toBe("xyz");
  });

  it("writes ?id= the same way SessionSidebar does, preserving ?tab=", async () => {
    const { writeSelectedSessionToUrl } = await import(
      "../client/src/components/analytics/messages/SessionSidebar"
    );
    const next = writeSelectedSessionToUrl("?tab=messages", "abc123");
    const params = new URLSearchParams(next);
    expect(params.get("id")).toBe("abc123");
    expect(params.get("tab")).toBe("messages");
  });
});

// ---------------------------------------------------------------------------
// Message history removal guardrails
// ---------------------------------------------------------------------------

describe("legacy message-history.tsx removed", () => {
  it("client/src/pages/message-history.tsx no longer exists", () => {
    const legacy = path.resolve(
      __dirname,
      "../client/src/pages/message-history.tsx",
    );
    expect(fs.existsSync(legacy)).toBe(false);
  });

  it("PromptsPanel was relocated to its own file", () => {
    // The Library page used to import PromptsPanel from message-history.tsx.
    // After messages-redesign-task005 it moved to its own module. During
    // codebase-cleanup-task007 it was relocated from pages/ to
    // components/library/ to match intent.
    const promptsPath = path.resolve(
      __dirname,
      "../client/src/components/library/prompts-panel.tsx",
    );
    expect(fs.existsSync(promptsPath)).toBe(true);
    const src = fs.readFileSync(promptsPath, "utf-8");
    expect(src).toMatch(/export\s+function\s+PromptsPanel/);
  });
});
