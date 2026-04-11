// tests/costs-tab-wiring.test.ts
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const statsPath = path.resolve(__dirname, "../client/src/pages/stats.tsx");
const costsTabPath = path.resolve(__dirname, "../client/src/components/analytics/costs/CostsTab.tsx");

describe("CostsTab component", () => {
  it("exports CostsTab as default", async () => {
    const mod = await import("../client/src/components/analytics/costs/CostsTab");
    expect(typeof mod.default).toBe("function");
  });

  it("imports all 5 section components", async () => {
    const source = fs.readFileSync(costsTabPath, "utf-8");
    expect(source).toContain("TokenAnatomy");
    expect(source).toContain("ModelIntelligence");
    expect(source).toContain("CacheEfficiency");
    expect(source).toContain("SystemPromptOverhead");
    expect(source).toContain("SessionProjectValue");
  });

  it("renders all 5 section components in JSX", async () => {
    const source = fs.readFileSync(costsTabPath, "utf-8");
    expect(source).toContain("<TokenAnatomy");
    expect(source).toContain("<ModelIntelligence");
    expect(source).toContain("<CacheEfficiency");
    expect(source).toContain("<SystemPromptOverhead");
    expect(source).toContain("<SessionProjectValue");
  });

  it("includes Historical Lookup section", async () => {
    const source = fs.readFileSync(costsTabPath, "utf-8");
    expect(source).toContain("Historical");
    expect(source).toContain("useCostAnalytics");
  });

  it("Historical Lookup is collapsed by default", async () => {
    const source = fs.readFileSync(costsTabPath, "utf-8");
    // State should default to false (collapsed)
    expect(source).toMatch(/useState\s*\(\s*false\s*\)/);
  });

  it("Historical Lookup toggles on click", async () => {
    const source = fs.readFileSync(costsTabPath, "utf-8");
    // Should have a click handler that toggles the expanded state
    expect(source).toContain("setExpanded");
  });

  it("uses space-y-6 for section spacing", async () => {
    const source = fs.readFileSync(costsTabPath, "utf-8");
    expect(source).toContain("space-y-6");
  });
});

describe("Old CostsTab removed from stats.tsx", () => {
  it("does not contain the old inline CostsTab function", () => {
    const source = fs.readFileSync(statsPath, "utf-8");
    // The old function definition should be gone
    expect(source).not.toMatch(/^function CostsTab\(\)/m);
  });

  it("imports CostsTab from the costs directory", () => {
    const source = fs.readFileSync(statsPath, "utf-8");
    expect(source).toMatch(/import.*CostsTab.*from.*components\/analytics\/costs/);
  });

  it("still renders CostsTab in the costs TabsContent", () => {
    const source = fs.readFileSync(statsPath, "utf-8");
    expect(source).toContain("<CostsTab");
  });

  it("does not break other tabs (UsageTab, ActivityTab still exist)", () => {
    const source = fs.readFileSync(statsPath, "utf-8");
    expect(source).toContain("function UsageTab");
    expect(source).toContain("function ActivityTab");
    expect(source).toContain("NerveCenterTopology");
  });

  it("retains formatTokens and formatUsd (used by other components)", () => {
    const source = fs.readFileSync(statsPath, "utf-8");
    expect(source).toContain("function formatTokens");
    expect(source).toContain("function formatUsd");
  });
});
