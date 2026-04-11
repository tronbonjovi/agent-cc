// tests/costs-deepening.test.ts
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const costsTabPath = path.resolve(__dirname, "../client/src/components/analytics/costs/CostsTab.tsx");
const systemPromptOverheadPath = path.resolve(__dirname, "../client/src/components/analytics/costs/SystemPromptOverhead.tsx");

// ---- Task 001: Collapsible sections ----

describe("CollapsibleSection wrapper", () => {
  it("defines a CollapsibleSection component", () => {
    const source = fs.readFileSync(costsTabPath, "utf-8");
    expect(source).toContain("function CollapsibleSection");
  });

  it("wraps Token Anatomy in a CollapsibleSection", () => {
    const source = fs.readFileSync(costsTabPath, "utf-8");
    expect(source).toMatch(/CollapsibleSection.*title.*Token Anatomy/s);
  });

  it("wraps Model Intelligence in a CollapsibleSection", () => {
    const source = fs.readFileSync(costsTabPath, "utf-8");
    expect(source).toMatch(/CollapsibleSection.*title.*Model Intelligence/s);
  });

  it("wraps Cache Efficiency in a CollapsibleSection", () => {
    const source = fs.readFileSync(costsTabPath, "utf-8");
    expect(source).toMatch(/CollapsibleSection.*title.*Cache Efficiency/s);
  });

  it("wraps Context Overhead in a CollapsibleSection", () => {
    const source = fs.readFileSync(costsTabPath, "utf-8");
    expect(source).toMatch(/CollapsibleSection.*title.*Context Overhead/s);
  });

  it("wraps Session & Project Value in a CollapsibleSection", () => {
    const source = fs.readFileSync(costsTabPath, "utf-8");
    expect(source).toMatch(/CollapsibleSection.*title.*Session.*Project.*Value/s);
  });

  it("all 5 section titles render as clickable buttons", () => {
    const source = fs.readFileSync(costsTabPath, "utf-8");
    // CollapsibleSection renders a <button> with the title
    expect(source).toMatch(/CollapsibleSection/);
    expect(source).toMatch(/<button[\s\S]*?onClick[\s\S]*?{title}/);
  });

  it("clicking a section title hides its content (open state toggles)", () => {
    const source = fs.readFileSync(costsTabPath, "utf-8");
    // The CollapsibleSection uses setOpen to toggle and conditionally renders children
    expect(source).toMatch(/setOpen\s*\(\s*prev\s*=>\s*!prev\s*\)/);
    expect(source).toMatch(/\{open\s*&&/);
  });

  it("clicking again restores the content (useState toggle pattern)", () => {
    const source = fs.readFileSync(costsTabPath, "utf-8");
    // The toggle pattern (prev => !prev) means clicking again restores
    expect(source).toMatch(/const\s*\[open,\s*setOpen\]\s*=\s*useState/);
    expect(source).toMatch(/setOpen\s*\(\s*prev\s*=>\s*!prev\s*\)/);
  });

  it("HistoricalLookup keeps its own collapse behavior", () => {
    const source = fs.readFileSync(costsTabPath, "utf-8");
    // HistoricalLookup should NOT be wrapped in CollapsibleSection
    expect(source).toContain("<HistoricalLookup");
    // It should still have its own expanded state
    expect(source).toContain("setExpanded");
  });
});

// ---- Task 001: Child components have card wrappers removed ----

describe("Child components card wrappers removed", () => {
  it("TokenAnatomy does not have its own card wrapper", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../client/src/components/analytics/costs/TokenAnatomy.tsx"),
      "utf-8"
    );
    // Should not have the outer rounded-xl border bg-card wrapper in the main return
    // but may still have it in loading/error states
    const mainReturn = source.slice(source.lastIndexOf("return ("));
    expect(mainReturn).not.toMatch(/<div className="rounded-xl border bg-card p-4/);
  });

  it("ModelIntelligence does not have its own card wrapper", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../client/src/components/analytics/costs/ModelIntelligence.tsx"),
      "utf-8"
    );
    const mainReturn = source.slice(source.lastIndexOf("return ("));
    expect(mainReturn).not.toMatch(/<div className="rounded-xl border bg-card p-4/);
  });

  it("CacheEfficiency does not have its own card wrapper", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../client/src/components/analytics/costs/CacheEfficiency.tsx"),
      "utf-8"
    );
    const mainReturn = source.slice(source.lastIndexOf("return ("));
    expect(mainReturn).not.toMatch(/<div className="rounded-xl border bg-card p-4/);
  });

  it("SystemPromptOverhead does not have its own card wrapper", () => {
    const source = fs.readFileSync(systemPromptOverheadPath, "utf-8");
    const mainReturn = source.slice(source.lastIndexOf("return ("));
    expect(mainReturn).not.toMatch(/<div className="rounded-xl border bg-card p-4/);
  });
});

// ---- Task 003: Context Overhead rename ----

describe("Context Overhead rename", () => {
  it('"Context Overhead" text appears in CostsTab CollapsibleSection', () => {
    const costsSource = fs.readFileSync(costsTabPath, "utf-8");
    expect(costsSource).toContain("Context Overhead");
  });

  it('"System Prompt Overhead" does NOT appear in SystemPromptOverhead component', () => {
    const source = fs.readFileSync(systemPromptOverheadPath, "utf-8");
    expect(source).not.toContain("System Prompt Overhead");
  });

  it('"System Prompt Overhead" does NOT appear in CostsTab', () => {
    const costsSource = fs.readFileSync(costsTabPath, "utf-8");
    expect(costsSource).not.toContain("System Prompt Overhead");
  });

  it('"Context Overhead" appears in CostsTab CollapsibleSection title', () => {
    const source = fs.readFileSync(costsTabPath, "utf-8");
    expect(source).toContain('title="Context Overhead"');
  });

  it('explanatory text mentions "plugin/skill definitions"', () => {
    const source = fs.readFileSync(systemPromptOverheadPath, "utf-8");
    expect(source).toContain("plugin/skill definitions");
  });

  it('explanatory text mentions "memory files"', () => {
    const source = fs.readFileSync(systemPromptOverheadPath, "utf-8");
    expect(source).toContain("memory files");
  });
});

// ---- Task 004: Fix most expensive sessions navigation ----

const sessionProjectValuePath = path.resolve(
  __dirname,
  "../client/src/components/analytics/costs/SessionProjectValue.tsx",
);

describe("SessionProjectValue navigation", () => {
  const source = fs.readFileSync(sessionProjectValuePath, "utf-8");

  it("navigateToSession routes to /analytics?tab=sessions&id=", () => {
    expect(source).toContain("setLocation(`/analytics?tab=sessions&id=${sessionId}`)");
  });

  it("does NOT route to /?tab=sessions (old dashboard path)", () => {
    expect(source).not.toContain("setLocation(`/?tab=sessions");
  });

  it("both expensive and efficient session lists use navigateToSession", () => {
    const onClickMatches = source.match(/onClick=\{.*navigateToSession/g);
    expect(onClickMatches).not.toBeNull();
    expect(onClickMatches!.length).toBeGreaterThanOrEqual(2);
  });
});
