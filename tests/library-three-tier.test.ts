// tests/library-three-tier.test.ts
// Tests for three-tier layout pattern (Installed / Library / Discover) in library tabs
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const SKILLS_TAB_PATH = path.resolve(__dirname, "../client/src/components/library/skills-tab.tsx");
const PLUGINS_TAB_PATH = path.resolve(__dirname, "../client/src/components/library/plugins-tab.tsx");
const MCPS_TAB_PATH = path.resolve(__dirname, "../client/src/components/library/mcps-tab.tsx");
const AGENTS_TAB_PATH = path.resolve(__dirname, "../client/src/components/library/agents-tab.tsx");
const ENTITY_CARD_PATH = path.resolve(__dirname, "../client/src/components/library/entity-card.tsx");

// ---- Helper: read source ----
function readSrc(p: string): string {
  return fs.readFileSync(p, "utf-8");
}

// ---- Shared: three-tier section tests ----

// Tabs that use the new Library/Discover naming
function describeTierSections(tabName: string, tabPath: string) {
  describe(`${tabName} tab — three-tier sections`, () => {
    const src = readSrc(tabPath);

    it("renders an Installed section heading", () => {
      expect(src).toMatch(/Installed/);
    });

    it("renders a Library section heading", () => {
      expect(src).toMatch(/Library/);
    });

    it("renders a Discover section heading", () => {
      expect(src).toMatch(/Discover/);
    });

    it("imports EntityCard from the shared component", () => {
      expect(src).toMatch(/EntityCard/);
      expect(src).toMatch(/entity-card/);
    });

    it("renders EntityCard components", () => {
      expect(src).toMatch(/<EntityCard/);
    });

    it("shows an empty message when a tier has no items", () => {
      expect(src).toMatch(/No (library|installed|items)/i);
    });
  });
}

// MCPs still use old Saved/Marketplace naming (not in scope for library config management)
function describeLegacyTierSections(tabName: string, tabPath: string) {
  describe(`${tabName} tab — three-tier sections`, () => {
    const src = readSrc(tabPath);

    it("renders an Installed section heading", () => {
      expect(src).toMatch(/Installed/);
    });

    it("renders a Saved section heading", () => {
      expect(src).toMatch(/Saved/);
    });

    it("renders a Marketplace section heading", () => {
      expect(src).toMatch(/Marketplace/);
    });

    it("imports EntityCard from the shared component", () => {
      expect(src).toMatch(/EntityCard/);
      expect(src).toMatch(/entity-card/);
    });

    it("renders EntityCard components", () => {
      expect(src).toMatch(/<EntityCard/);
    });

    it("shows an empty message when a tier has no items", () => {
      expect(src).toMatch(/No (saved|installed)/i);
    });
  });
}

describeTierSections("Skills", SKILLS_TAB_PATH);
describeTierSections("Plugins", PLUGINS_TAB_PATH);
describeLegacyTierSections("MCP Servers", MCPS_TAB_PATH);
describeTierSections("Agents", AGENTS_TAB_PATH);

// ---- Skills-specific tests ----

describe("Skills tab — EntityCard integration", () => {
  const src = readSrc(SKILLS_TAB_PATH);

  it("maps skill name to EntityCard", () => {
    expect(src).toMatch(/name=.*skill\.name|name=\{.*name/);
  });

  it("maps skill description to EntityCard", () => {
    expect(src).toMatch(/description=.*skill\.description|description=\{.*description/);
  });

  it("passes status prop to EntityCard", () => {
    expect(src).toMatch(/status=/);
  });

  it("preserves search functionality", () => {
    expect(src).toMatch(/search/i);
    expect(src).toMatch(/<Input/);
  });

  it("preserves expandable content preview", () => {
    expect(src).toMatch(/formatPreview/);
  });
});

// ---- Plugins-specific tests ----

describe("Plugins tab — EntityCard integration", () => {
  const src = readSrc(PLUGINS_TAB_PATH);

  it("passes status prop to EntityCard", () => {
    expect(src).toMatch(/status=/);
  });

  it("passes tags or category to EntityCard", () => {
    expect(src).toMatch(/tags=/);
  });

  it("preserves blocked plugins section", () => {
    expect(src).toMatch(/blocked/i);
  });
});

// ---- MCP Servers-specific tests ----

describe("MCP Servers tab — EntityCard integration", () => {
  const src = readSrc(MCPS_TAB_PATH);

  it("passes health prop to EntityCard", () => {
    expect(src).toMatch(/health=/);
  });

  it("passes status prop to EntityCard", () => {
    expect(src).toMatch(/status=/);
  });

  it("preserves search functionality", () => {
    expect(src).toMatch(/search/i);
    expect(src).toMatch(/<Input/);
  });
});

// ---- Agents-specific tests ----

describe("Agents tab — EntityCard integration", () => {
  const src = readSrc(AGENTS_TAB_PATH);

  it("passes name to EntityCard", () => {
    expect(src).toMatch(/name=/);
  });

  it("passes description to EntityCard", () => {
    expect(src).toMatch(/description=/);
  });

  it("preserves agent definitions sub-tab", () => {
    expect(src).toMatch(/DefinitionsTab|definitions/);
  });

  it("preserves agent history sub-tab", () => {
    expect(src).toMatch(/HistoryTab|history/);
  });

  it("preserves agent stats sub-tab", () => {
    expect(src).toMatch(/StatsTab|stats/);
  });
});

// ---- Marketplace placeholder tests ----

describe("Discover tab sections", () => {
  it("Skills tab has Discover panel", () => {
    const src = readSrc(SKILLS_TAB_PATH);
    expect(src).toMatch(/DiscoverPanel|discover/i);
  });

  it("Plugins tab has Discover panel", () => {
    const src = readSrc(PLUGINS_TAB_PATH);
    expect(src).toMatch(/DiscoverPanel|discover/i);
  });

  it("MCP Servers tab has marketplace section with mcp.so reference", () => {
    const src = readSrc(MCPS_TAB_PATH);
    expect(src).toMatch(/mcp\.so|[Mm]arketplace/);
  });

  it("Agents tab has Discover panel", () => {
    const src = readSrc(AGENTS_TAB_PATH);
    expect(src).toMatch(/DiscoverPanel|discover/i);
  });
});

// ---- EntityCard component still exports utilities ----

describe("EntityCard component — exports intact", () => {
  const src = readSrc(ENTITY_CARD_PATH);

  it("exports statusBadgeClass", () => {
    expect(src).toMatch(/export function statusBadgeClass/);
  });

  it("exports statusBadgeLabel", () => {
    expect(src).toMatch(/export function statusBadgeLabel/);
  });

  it("exports healthDotClass", () => {
    expect(src).toMatch(/export function healthDotClass/);
  });

  it("exports EntityCard component", () => {
    expect(src).toMatch(/export function EntityCard/);
  });
});
