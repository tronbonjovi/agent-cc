// tests/analytics-remove-outgoing.test.ts
// Tests for removing outgoing components from analytics
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const STATS_PATH = path.resolve(__dirname, "../client/src/pages/stats.tsx");
const SESSIONS_PATH = path.resolve(__dirname, "../client/src/pages/sessions.tsx");

describe("analytics — remove outgoing: stats.tsx", () => {
  const src = fs.readFileSync(STATS_PATH, "utf-8");

  it("does NOT have DiscoverTab defined inline", () => {
    expect(src).not.toMatch(/function\s+DiscoverTab/);
  });

  it("does NOT have GraphPage lazy import", () => {
    expect(src).not.toMatch(/lazy\(.*graph/i);
    expect(src).not.toMatch(/GraphPage/);
  });

  it("does NOT reference a graph tab", () => {
    expect(src).not.toMatch(/value="graph"/);
  });

  it("does NOT import Suspense or lazy if unused", () => {
    // If no lazy imports remain, Suspense and lazy should be removed
    // (unless used elsewhere in the file)
    if (!src.includes("lazy(")) {
      expect(src).not.toMatch(/import.*\blazy\b.*from "react"/);
    }
  });
});

// Note (codebase-cleanup-task002): session-analytics-panel.tsx was deleted
// entirely. The negative assertions previously checked here are satisfied
// by construction since the module no longer exists.

describe("analytics — remove outgoing: sessions.tsx", () => {
  const src = fs.readFileSync(SESSIONS_PATH, "utf-8");

  it("does NOT have a Prompts tab", () => {
    expect(src).not.toMatch(/activeTab.*===.*["']prompts["']/);
    expect(src).not.toMatch(/setActiveTab\(["']prompts["']\)/);
  });
});

describe("analytics — discover-tab.tsx extraction", () => {
  const discoverPath = path.resolve(__dirname, "../client/src/components/discover-tab.tsx");

  it("discover-tab.tsx exists as standalone component", () => {
    expect(fs.existsSync(discoverPath)).toBe(true);
  });

  it("exports DiscoverTab", () => {
    const src = fs.readFileSync(discoverPath, "utf-8");
    expect(src).toMatch(/export.*function\s+DiscoverTab|export\s+default\s+function\s+DiscoverTab/);
  });
});

describe("analytics — graph.tsx removal", () => {
  const graphPath = path.resolve(__dirname, "../client/src/pages/graph.tsx");

  it("graph.tsx no longer exists", () => {
    expect(fs.existsSync(graphPath)).toBe(false);
  });
});
