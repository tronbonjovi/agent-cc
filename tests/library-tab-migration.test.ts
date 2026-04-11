// tests/library-tab-migration.test.ts
// Tests for library polish: skills, plugins, and MCPs tabs use sub-tabs
// (Installed | Library | Discover) instead of vertical TierHeading sections.
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const SKILLS_TAB = path.resolve(__dirname, "../client/src/components/library/skills-tab.tsx");
const PLUGINS_TAB = path.resolve(__dirname, "../client/src/components/library/plugins-tab.tsx");
const MCPS_TAB = path.resolve(__dirname, "../client/src/components/library/mcps-tab.tsx");

function readSrc(p: string): string {
  return fs.readFileSync(p, "utf-8");
}

// Tabs using new Library/Discover naming
const updatedTabs = [
  { name: "Skills", path: SKILLS_TAB },
  { name: "Plugins", path: PLUGINS_TAB },
];

// ── Sub-tab pattern replaces vertical TierHeading sections ──────────────────

describe("Library sub-tabs — replace vertical sections with sub-tabs", () => {
  for (const tab of updatedTabs) {
    describe(`${tab.name} tab`, () => {
      const src = readSrc(tab.path);

      it("no longer defines or uses TierHeading component", () => {
        expect(src).not.toMatch(/function TierHeading/);
        expect(src).not.toMatch(/<TierHeading/);
      });

      it("has sub-tab state for installed/library/discover", () => {
        expect(src).toMatch(/useState.*installed|"installed"/);
      });

      it("renders sub-tab buttons for Installed, Library, Discover", () => {
        expect(src).toMatch(/Installed/);
        expect(src).toMatch(/Library/);
        expect(src).toMatch(/Discover/);
      });

      it("uses horizontal tab bar with border-b pattern (matching agents tab)", () => {
        expect(src).toMatch(/border-b border-border/);
        expect(src).toMatch(/border-b-2/);
      });

      it("conditionally renders content based on active sub-tab", () => {
        expect(src).toMatch(/===\s*"installed"/);
        expect(src).toMatch(/===\s*"library"/);
        expect(src).toMatch(/===\s*"discover"/);
      });

      it("defaults to installed sub-tab", () => {
        expect(src).toMatch(/useState<.*>\("installed"\)|useState\("installed"\)/);
      });
    });
  }

  // MCPs still use old Saved/Marketplace naming (out of scope for library config management)
  describe("MCP Servers tab", () => {
    const src = readSrc(MCPS_TAB);

    it("no longer defines or uses TierHeading component", () => {
      expect(src).not.toMatch(/function TierHeading/);
      expect(src).not.toMatch(/<TierHeading/);
    });

    it("has sub-tab state for installed/saved/marketplace", () => {
      expect(src).toMatch(/useState.*installed|"installed"/);
    });

    it("renders sub-tab buttons for Installed, Saved, Marketplace", () => {
      expect(src).toMatch(/Installed/);
      expect(src).toMatch(/Saved/);
      expect(src).toMatch(/Marketplace/);
    });

    it("uses horizontal tab bar with border-b pattern", () => {
      expect(src).toMatch(/border-b border-border/);
      expect(src).toMatch(/border-b-2/);
    });

    it("conditionally renders content based on active sub-tab", () => {
      expect(src).toMatch(/===\s*"installed"/);
      expect(src).toMatch(/===\s*"saved"/);
      expect(src).toMatch(/===\s*"marketplace"/);
    });

    it("defaults to installed sub-tab", () => {
      expect(src).toMatch(/useState<.*>\("installed"\)|useState\("installed"\)/);
    });
  });
});
