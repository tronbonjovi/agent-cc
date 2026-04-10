// tests/library-tabs-migration.test.ts
// Tests for migrating entity pages into Library tab panel components
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const LIBRARY_PATH = path.resolve(__dirname, "../client/src/pages/library.tsx");
const SKILLS_TAB_PATH = path.resolve(__dirname, "../client/src/components/library/skills-tab.tsx");
const PLUGINS_TAB_PATH = path.resolve(__dirname, "../client/src/components/library/plugins-tab.tsx");
const MCPS_TAB_PATH = path.resolve(__dirname, "../client/src/components/library/mcps-tab.tsx");
const AGENTS_TAB_PATH = path.resolve(__dirname, "../client/src/components/library/agents-tab.tsx");

const SKILLS_PAGE_PATH = path.resolve(__dirname, "../client/src/pages/skills.tsx");
const PLUGINS_PAGE_PATH = path.resolve(__dirname, "../client/src/pages/plugins.tsx");
const MCPS_PAGE_PATH = path.resolve(__dirname, "../client/src/pages/mcps.tsx");
const AGENTS_PAGE_PATH = path.resolve(__dirname, "../client/src/pages/agents.tsx");

describe("tab panel components exist", () => {
  it("skills-tab.tsx exists", () => {
    expect(fs.existsSync(SKILLS_TAB_PATH)).toBe(true);
  });

  it("plugins-tab.tsx exists", () => {
    expect(fs.existsSync(PLUGINS_TAB_PATH)).toBe(true);
  });

  it("mcps-tab.tsx exists", () => {
    expect(fs.existsSync(MCPS_TAB_PATH)).toBe(true);
  });

  it("agents-tab.tsx exists", () => {
    expect(fs.existsSync(AGENTS_TAB_PATH)).toBe(true);
  });
});

describe("skills tab component", () => {
  const src = fs.readFileSync(SKILLS_TAB_PATH, "utf-8");

  it("exports a SkillsTab component", () => {
    expect(src).toMatch(/export\s+(default\s+)?function\s+SkillsTab/);
  });

  it("uses the useEntities hook for skills", () => {
    expect(src).toMatch(/useEntities.*skill/);
  });

  it("uses the useRescan hook", () => {
    expect(src).toMatch(/useRescan/);
  });

  it("renders skill cards with names", () => {
    expect(src).toMatch(/skill\.name/);
  });

  it("includes search functionality", () => {
    expect(src).toMatch(/search/i);
    expect(src).toMatch(/<Input/);
  });

  it("does not include page-level h1 heading", () => {
    // Tab components should not have their own page title
    expect(src).not.toMatch(/<h1[^>]*>Skills<\/h1>/);
  });

  it("does not wrap in p-6 page padding", () => {
    // Should not have the outermost page wrapper padding
    expect(src).not.toMatch(/className="p-6 space-y-6">/);
  });

  it("includes expandable content preview", () => {
    expect(src).toMatch(/formatPreview/);
  });

  it("includes copy command functionality", () => {
    expect(src).toMatch(/handleCopy|navigator\.clipboard/);
  });
});

describe("plugins tab component", () => {
  const src = fs.readFileSync(PLUGINS_TAB_PATH, "utf-8");

  it("exports a PluginsTab component", () => {
    expect(src).toMatch(/export\s+(default\s+)?function\s+PluginsTab/);
  });

  it("uses the useEntities hook for plugins", () => {
    expect(src).toMatch(/useEntities.*plugin/);
  });

  it("renders marketplace section", () => {
    expect(src).toMatch(/[Mm]arketplace/);
  });

  it("renders blocked plugins section", () => {
    expect(src).toMatch(/[Bb]locked/);
  });

  it("groups active plugins by category", () => {
    expect(src).toMatch(/category/);
    expect(src).toMatch(/CATEGORY_COLORS|CATEGORY_LABELS/);
  });

  it("does not include page-level h1 heading", () => {
    expect(src).not.toMatch(/<h1[^>]*>Plugins<\/h1>/);
  });

  it("includes health indicator for marketplaces", () => {
    expect(src).toMatch(/HealthIndicator/);
  });
});

describe("mcps tab component", () => {
  const src = fs.readFileSync(MCPS_TAB_PATH, "utf-8");

  it("exports a McpsTab component", () => {
    expect(src).toMatch(/export\s+(default\s+)?function\s+McpsTab/);
  });

  it("uses the useEntities hook for mcps", () => {
    expect(src).toMatch(/useEntities.*mcp/);
  });

  it("includes search functionality", () => {
    expect(src).toMatch(/search/i);
    expect(src).toMatch(/<Input/);
  });

  it("renders transport badges (stdio/sse)", () => {
    expect(src).toMatch(/transport/);
  });

  it("includes health indicators", () => {
    expect(src).toMatch(/HealthIndicator/);
  });

  it("supports group by category toggle", () => {
    expect(src).toMatch(/groupByCategory/);
  });

  it("does not include page-level h1 heading", () => {
    expect(src).not.toMatch(/<h1[^>]*>MCP Servers<\/h1>/);
  });

  it("includes expandable capabilities section", () => {
    expect(src).toMatch(/capabilities/i);
  });
});

describe("agents tab component", () => {
  const src = fs.readFileSync(AGENTS_TAB_PATH, "utf-8");

  it("exports an AgentsTab component", () => {
    expect(src).toMatch(/export\s+(default\s+)?function\s+AgentsTab/);
  });

  it("uses the useAgentDefinitions hook", () => {
    expect(src).toMatch(/useAgentDefinitions/);
  });

  it("uses the useAgentStats hook", () => {
    expect(src).toMatch(/useAgentStats/);
  });

  it("renders stat cards", () => {
    expect(src).toMatch(/statCards|Total Executions/);
  });

  it("has definitions, history, and stats sub-tabs", () => {
    expect(src).toMatch(/definitions/);
    expect(src).toMatch(/history/);
    expect(src).toMatch(/stats/);
  });

  it("does not include page-level h1 heading", () => {
    expect(src).not.toMatch(/<h1[^>]*>Agents<\/h1>/);
  });

  it("includes create agent functionality", () => {
    expect(src).toMatch(/[Cc]reate.*[Aa]gent|useCreateAgentDefinition/);
  });
});

describe("library page renders tab components", () => {
  const src = fs.readFileSync(LIBRARY_PATH, "utf-8");

  it("imports SkillsTab", () => {
    expect(src).toMatch(/import.*SkillsTab.*from/);
  });

  it("imports PluginsTab", () => {
    expect(src).toMatch(/import.*PluginsTab.*from/);
  });

  it("imports McpsTab", () => {
    expect(src).toMatch(/import.*McpsTab.*from/);
  });

  it("imports AgentsTab", () => {
    expect(src).toMatch(/import.*AgentsTab.*from/);
  });

  it("renders SkillsTab component", () => {
    expect(src).toMatch(/<SkillsTab/);
  });

  it("renders PluginsTab component", () => {
    expect(src).toMatch(/<PluginsTab/);
  });

  it("renders McpsTab component", () => {
    expect(src).toMatch(/<McpsTab/);
  });

  it("renders AgentsTab component", () => {
    expect(src).toMatch(/<AgentsTab/);
  });

  it("no longer has the placeholder 'Content coming soon' text", () => {
    expect(src).not.toMatch(/Content coming soon/);
  });

  it("still has the File Editor tab placeholder (separate task)", () => {
    // editor tab should still exist but can be placeholder
    expect(src).toMatch(/editor/);
  });
});

describe("original page files still exist", () => {
  it("skills.tsx still exists", () => {
    expect(fs.existsSync(SKILLS_PAGE_PATH)).toBe(true);
  });

  it("plugins.tsx still exists", () => {
    expect(fs.existsSync(PLUGINS_PAGE_PATH)).toBe(true);
  });

  it("mcps.tsx still exists", () => {
    expect(fs.existsSync(MCPS_PAGE_PATH)).toBe(true);
  });

  it("agents.tsx still exists", () => {
    expect(fs.existsSync(AGENTS_PAGE_PATH)).toBe(true);
  });
});
