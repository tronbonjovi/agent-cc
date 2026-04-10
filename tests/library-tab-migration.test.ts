// tests/library-tab-migration.test.ts
// Tests for library polish: skills, plugins, and MCPs tabs use sub-tabs
// (Installed | Saved | Marketplace) instead of vertical TierHeading sections.
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const SKILLS_TAB = path.resolve(__dirname, "../client/src/components/library/skills-tab.tsx");
const PLUGINS_TAB = path.resolve(__dirname, "../client/src/components/library/plugins-tab.tsx");
const MCPS_TAB = path.resolve(__dirname, "../client/src/components/library/mcps-tab.tsx");

function readSrc(p: string): string {
  return fs.readFileSync(p, "utf-8");
}

const tabFiles = [
  { name: "Skills", path: SKILLS_TAB },
  { name: "Plugins", path: PLUGINS_TAB },
  { name: "MCP Servers", path: MCPS_TAB },
];

// ── Sub-tab pattern replaces vertical TierHeading sections ──────────────────

describe("Library sub-tabs — replace vertical sections with sub-tabs", () => {
  for (const tab of tabFiles) {
    describe(`${tab.name} tab`, () => {
      const src = readSrc(tab.path);

      it("no longer defines or uses TierHeading component", () => {
        expect(src).not.toMatch(/function TierHeading/);
        expect(src).not.toMatch(/<TierHeading/);
      });

      it("has sub-tab state for installed/saved/marketplace", () => {
        // Should have useState with a type that includes these tabs
        expect(src).toMatch(/useState.*installed|"installed"/);
      });

      it("renders sub-tab buttons for Installed, Saved, Marketplace", () => {
        expect(src).toMatch(/Installed/);
        expect(src).toMatch(/Saved/);
        expect(src).toMatch(/Marketplace/);
      });

      it("uses horizontal tab bar with border-b pattern (matching agents tab)", () => {
        // Same pattern as agents-tab: flex + border-b + border-b-2 buttons
        expect(src).toMatch(/border-b border-border/);
        expect(src).toMatch(/border-b-2/);
      });

      it("conditionally renders content based on active sub-tab", () => {
        // Should check which tab is active before rendering
        expect(src).toMatch(/===\s*"installed"/);
        expect(src).toMatch(/===\s*"saved"/);
        expect(src).toMatch(/===\s*"marketplace"/);
      });

      it("defaults to installed sub-tab", () => {
        // The useState default should be "installed"
        expect(src).toMatch(/useState<.*>\("installed"\)|useState\("installed"\)/);
      });
    });
  }
});
