// tests/library-responsive.test.ts
// Tests for responsive library page: PageContainer adoption, responsive tab bar,
// entity card grid breakpoints, three-tier responsive layout, file editor mobile support.
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const LIBRARY_PAGE = path.resolve(__dirname, "../client/src/pages/library.tsx");
const SKILLS_TAB = path.resolve(__dirname, "../client/src/components/library/skills-tab.tsx");
const PLUGINS_TAB = path.resolve(__dirname, "../client/src/components/library/plugins-tab.tsx");
const MCPS_TAB = path.resolve(__dirname, "../client/src/components/library/mcps-tab.tsx");
const AGENTS_TAB = path.resolve(__dirname, "../client/src/components/library/agents-tab.tsx");
const FILE_EDITOR_TAB = path.resolve(__dirname, "../client/src/components/library/file-editor-tab.tsx");
const ENTITY_CARD = path.resolve(__dirname, "../client/src/components/library/entity-card.tsx");

function readSrc(p: string): string {
  return fs.readFileSync(p, "utf-8");
}

// ── Library page uses PageContainer ──────────────────────────────────────────

describe("Library page — PageContainer adoption", () => {
  const src = readSrc(LIBRARY_PAGE);

  it("imports PageContainer", () => {
    expect(src).toMatch(/import\s*\{?\s*PageContainer\s*\}?\s*from/);
  });

  it("renders PageContainer as the page wrapper", () => {
    expect(src).toMatch(/<PageContainer/);
  });

  it("passes title prop to PageContainer", () => {
    expect(src).toMatch(/title=.*Library/);
  });

  it("no longer uses hardcoded p-6 padding", () => {
    // Should use PageContainer's responsive padding instead
    expect(src).not.toMatch(/className="flex flex-col gap-4 p-6"/);
  });
});

// ── Tab bar responsive behavior ──────────────────────────────────────────────

describe("Library page — responsive tab bar", () => {
  const src = readSrc(LIBRARY_PAGE);

  it("tab container supports horizontal scrolling for overflow", () => {
    expect(src).toMatch(/overflow-x-auto|overflow-auto|scrollbar/);
  });

  it("tab bar uses flex-wrap or scroll for small screens", () => {
    // At sm/xs the tabs should wrap or scroll — look for responsive classes
    expect(src).toMatch(/flex-wrap|overflow-x-auto|sm:flex-nowrap|whitespace-nowrap/);
  });

  it("tab buttons have minimum touch target size", () => {
    // Buttons should have adequate padding for mobile touch
    expect(src).toMatch(/px-[234]|py-[23]/);
  });

  it("imports useBreakpoint or uses responsive CSS", () => {
    // Should use breakpoint hook or Tailwind responsive classes
    expect(src).toMatch(/useBreakpoint|sm:|md:|lg:/);
  });
});

// ── Entity card grid — 4→3→2→1 column progression ──────────────────────────

describe("Entity card grid — responsive columns", () => {
  const tabFiles = [
    { name: "Skills", path: SKILLS_TAB },
    { name: "Plugins", path: PLUGINS_TAB },
    { name: "MCP Servers", path: MCPS_TAB },
  ];

  for (const tab of tabFiles) {
    describe(`${tab.name} tab`, () => {
      const src = readSrc(tab.path);

      it("uses responsive grid with 4 columns at xl", () => {
        expect(src).toMatch(/xl:grid-cols-4/);
      });

      it("uses 3 columns at lg", () => {
        expect(src).toMatch(/lg:grid-cols-3/);
      });

      it("uses 2 columns at md", () => {
        expect(src).toMatch(/md:grid-cols-2/);
      });

      it("defaults to 1 column at sm/xs", () => {
        expect(src).toMatch(/grid-cols-1/);
      });

      it("uses responsive gap token", () => {
        expect(src).toMatch(/gap-card|var\(--card-gap\)/);
      });
    });
  }
});

// ── Sub-tab layout adapts without overflow ──────────────────────────────────

describe("Sub-tab sections — responsive adaptation", () => {
  const tabFiles = [
    { name: "Skills", path: SKILLS_TAB },
    { name: "Plugins", path: PLUGINS_TAB },
    { name: "MCP Servers", path: MCPS_TAB },
  ];

  for (const tab of tabFiles) {
    describe(`${tab.name} tab`, () => {
      const src = readSrc(tab.path);

      it("empty states are full-width", () => {
        // Empty state containers should not be constrained to grid columns
        expect(src).toMatch(/items-center justify-center/);
      });

      it("uses sub-tabs instead of TierHeading sections", () => {
        // Sub-tabs replaced vertical TierHeading sections
        expect(src).not.toMatch(/function TierHeading/);
        expect(src).toMatch(/border-b border-border/);
      });
    });
  }
});

// ── Info tab (formerly File Editor) — responsive layout ─────────────────────

describe("Info tab — responsive layout", () => {
  const src = readSrc(FILE_EDITOR_TAB);

  it("uses responsive grid for insight modules", () => {
    // Should use grid-cols-1 md:grid-cols-2 or similar
    expect(src).toMatch(/grid-cols-1|md:grid-cols-2/);
  });

  it("contains insight modules", () => {
    expect(src).toMatch(/MemoryBudgetMeter/);
    expect(src).toMatch(/FileDependencyGraph/);
    expect(src).toMatch(/ContextSummaryPanel/);
  });
});

// ── Entity card itself is responsive ─────────────────────────────────────────

describe("EntityCard — responsive internals", () => {
  const src = readSrc(ENTITY_CARD);

  it("card uses responsive padding token", () => {
    expect(src).toMatch(/p-card|p-2|p-3|var\(--card-padding\)/);
  });

  it("card content does not overflow (truncate or wrap)", () => {
    expect(src).toMatch(/truncate|line-clamp|overflow/);
  });
});
