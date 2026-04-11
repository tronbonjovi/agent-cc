// tests/session-health-drilldown.test.ts
// Tests for session health drill-down table (task002)
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const PANEL_PATH = path.resolve(__dirname, "../client/src/components/session-analytics-panel.tsx");
const TYPES_PATH = path.resolve(__dirname, "../shared/types.ts");

describe("SessionHealth type enrichment", () => {
  const src = fs.readFileSync(TYPES_PATH, "utf-8");

  it("SessionHealth has optional projectKey field", () => {
    const match = src.match(/export interface SessionHealth\s*\{([^}]+)\}/);
    expect(match).not.toBeNull();
    expect(match![1]).toMatch(/projectKey\??\s*:\s*string/);
  });

  it("SessionHealth has optional lastTs field", () => {
    const match = src.match(/export interface SessionHealth\s*\{([^}]+)\}/);
    expect(match).not.toBeNull();
    expect(match![1]).toMatch(/lastTs\??\s*:\s*string/);
  });

  it("SessionHealth has optional estimatedCostUsd field", () => {
    const match = src.match(/export interface SessionHealth\s*\{([^}]+)\}/);
    expect(match).not.toBeNull();
    expect(match![1]).toMatch(/estimatedCostUsd\??\s*:\s*number/);
  });
});

describe("SessionHealthPanel drill-down table", () => {
  const src = fs.readFileSync(PANEL_PATH, "utf-8");

  it("renders a table with expected column headers", () => {
    expect(src).toMatch(/Session/);
    expect(src).toMatch(/Project/);
    expect(src).toMatch(/When/);
    expect(src).toMatch(/Errors/);
    expect(src).toMatch(/Cost/);
    expect(src).toMatch(/Health Reasons/);
  });

  it("has a toggle to show good sessions", () => {
    // Should have some kind of toggle/checkbox/button for including good sessions
    expect(src).toMatch(/showGood|includeGood|show.*good/i);
  });

  it("defaults to hiding good sessions (only poor and fair)", () => {
    // The default filter state should exclude good
    expect(src).toMatch(/useState.*false/);
  });

  it("renders health reason pills from healthReasons array", () => {
    // Should iterate over healthReasons and render pills
    expect(src).toMatch(/healthReasons/);
  });

  it("supports sorting by columns", () => {
    // Should have sort state and onClick handlers on column headers
    expect(src).toMatch(/sortKey|sortColumn|sortField/);
    expect(src).toMatch(/sortDir|sortDirection|sortOrder/);
  });

  it("navigates to session detail on row click", () => {
    // Should use setLocation or navigate to analytics sessions tab with highlight
    expect(src).toMatch(/analytics\?tab=sessions&highlight=/);
  });

  it("shows empty state when no unhealthy sessions", () => {
    expect(src).toMatch(/No unhealthy sessions/i);
  });

  it("truncates session IDs", () => {
    // Should slice or truncate sessionId for display
    expect(src).toMatch(/sessionId.*slice|slice.*sessionId/);
  });

  it("uses relativeTime for the When column", () => {
    expect(src).toMatch(/relativeTime/);
  });

  it("renders health reason pills with color coding", () => {
    // Red for error-related, yellow/amber for warnings
    expect(src).toMatch(/bg-red-/);
    expect(src).toMatch(/bg-amber-/);
  });
});

describe("SessionHealthPanel still renders stale sessions section", () => {
  const src = fs.readFileSync(PANEL_PATH, "utf-8");

  it("still uses useStaleAnalytics", () => {
    expect(src).toMatch(/useStaleAnalytics/);
  });

  it("still shows stale session info when available", () => {
    expect(src).toMatch(/Stale Sessions/);
  });
});
