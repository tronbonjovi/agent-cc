// tests/sessions-tabs.test.ts
// Tests for sessions page tab restructure: Sessions / Messages / Prompts
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const SESSIONS_PATH = path.resolve(__dirname, "../client/src/pages/sessions.tsx");

describe("sessions page tab structure", () => {
  const src = fs.readFileSync(SESSIONS_PATH, "utf-8");

  it("has three tabs: sessions, messages, prompts", () => {
    // The activeTab state should include all three tab types
    expect(src).toMatch(/"sessions"\s*\|\s*"messages"\s*\|\s*"prompts"/);
  });

  it("defaults to sessions tab", () => {
    // The initial state should be "sessions"
    expect(src).toMatch(/useState<.*"sessions".*"messages".*"prompts".*>\("sessions"\)/s);
  });

  it("does not have an analytics tab button", () => {
    // Analytics tab has been removed from this page
    expect(src).not.toMatch(/setActiveTab\(["']analytics["']\)/);
  });

  it("has a Messages tab button", () => {
    expect(src).toMatch(/setActiveTab\(["']messages["']\)/);
  });

  it("has a Prompts tab button", () => {
    expect(src).toMatch(/setActiveTab\(["']prompts["']\)/);
  });

  it("imports MessageHistory components from message-history page", () => {
    expect(src).toMatch(/import.*from.*["']@\/pages\/message-history["']/);
  });

  it("renders MessagesPanel when messages tab is active", () => {
    expect(src).toMatch(/activeTab\s*===\s*["']messages["']/);
    expect(src).toMatch(/<MessagesTabContent/);
  });

  it("renders PromptsPanel when prompts tab is active", () => {
    expect(src).toMatch(/activeTab\s*===\s*["']prompts["']/);
    expect(src).toMatch(/<PromptsTabContent/);
  });

  it("does not render AnalyticsPanel", () => {
    expect(src).not.toMatch(/<AnalyticsPanel\s*\/?\s*>/);
  });
});
