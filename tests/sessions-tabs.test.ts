// tests/sessions-tabs.test.ts
// Tests for sessions page tab structure: Sessions / Messages
// (Prompts tab removed — moved to Library in analytics-restructure-task003)
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const SESSIONS_PATH = path.resolve(__dirname, "../client/src/pages/sessions.tsx");

describe("sessions page tab structure", () => {
  const src = fs.readFileSync(SESSIONS_PATH, "utf-8");

  it("has two tabs: sessions, messages", () => {
    // The activeTab state should include both tab types
    expect(src).toMatch(/"sessions"\s*\|\s*"messages"/);
  });

  it("defaults to sessions tab", () => {
    // The initial state should be "sessions"
    expect(src).toMatch(/useState<.*"sessions".*"messages".*>\("sessions"\)/s);
  });

  it("does not have an analytics tab button", () => {
    // Analytics tab has been removed from this page
    expect(src).not.toMatch(/setActiveTab\(["']analytics["']\)/);
  });

  it("has a Messages tab button", () => {
    expect(src).toMatch(/setActiveTab\(["']messages["']\)/);
  });

  it("does not have a Prompts tab button (moved to Library)", () => {
    expect(src).not.toMatch(/setActiveTab\(["']prompts["']\)/);
  });

  it("imports the messages tab content component", () => {
    // Cleanup note (messages-redesign-task005): the legacy
    // @/pages/message-history module was deleted; this dead-route page
    // now imports the new MessagesTab from the analytics directory but
    // keeps the local alias name (MessagesTabContent) for clarity.
    expect(src).toMatch(/import.*MessagesTab.*from.*analytics\/messages\/MessagesTab/);
  });

  it("renders MessagesTab content when messages tab is active", () => {
    expect(src).toMatch(/activeTab\s*===\s*["']messages["']/);
    expect(src).toMatch(/<MessagesTabContent/);
  });

  it("does not render AnalyticsPanel", () => {
    expect(src).not.toMatch(/<AnalyticsPanel\s*\/?\s*>/);
  });
});
